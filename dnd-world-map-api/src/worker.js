/* ==========================================================================
   D&D World Map API (Cloudflare Worker)

   GET  /map      Public. The map for players: only places linked to a Public
                  Notion location, with a fixed set of fields. Nothing else leaves.
   GET  /editor   Edit key required. The full map plus every Location page.
   GET  /preview  Edit key required. The DM view: same shape as /map, but with every
                  place included regardless of visibility, plus DM page links.
   GET  /dm       Edit key required. DM-only data: session links, initiative tracker,
                  saved encounters. Stored separately from the map; never sent to players.
   PUT  /dm       Edit key required. Saves DM-only data. Rejects stale saves (409).
   GET  /bestiary/search?q=goblin   Edit key required. Searches Open5e (read only).
   GET  /bestiary/creature/<slug>   Edit key required. One full stat block (read only).
   GET  /bestiary/spells?q=fireball Edit key required. Searches Open5e spells (read only).
   GET  /bestiary/spell/<slug>      Edit key required. One full spell (read only).
   GET  /bestiary/spell-index?page=1 Edit key required. One page of the full Open5e spell list
                  (slim: name, level, school, classes, source), for the browsable Spellbook.
                  Open5e responses are cached at Cloudflare's edge; nothing is written to KV.
   PUT  /map      Edit key required. Saves the full map. Rejects stale saves (409).
   POST /sync     Edit key required. Re-reads the Campaign Database now.
   POST /webhook  Notion webhook. Verifies the signature, then re-syncs.
   Cron           Re-syncs on a schedule in case a webhook is missed.

   Secrets (wrangler secret put NAME):
     NOTION_TOKEN          Internal connection token from the Notion developer portal
     EDIT_KEY              Any long random string; the editor asks for it once
     NOTION_WEBHOOK_TOKEN  The verification_token from the webhook handshake
   Vars (wrangler.toml): NOTION_DATABASE_ID, ALLOWED_ORIGINS
   KV binding: MAP_KV
   ========================================================================== */

const NOTION_VERSION = '2025-09-03';

// Campaign Database property names. Change these if you rename columns in Notion.
const PROPS = {
  tags: 'Tags',
  visibility: 'Visibility',
  pronunciation: 'Pronunciation',
  aliases: 'Aliases',
  dmPage: '👨‍💻 DM Database',   // relation from a Campaign page to its DM Database page(s)
};
const LOCATION_TAG = 'location';   // matched case-insensitively
// Tags of pages the DM's bestiary can link to (DM only, never sent to players).
// Matching is forgiving: case, plurals, emoji and punctuation are ignored.
const CREATURE_TAGS = {
  Hostiles: ['hostile', 'hostiles', 'enemy', 'enemies'],
  NPC: ['npc', 'npcs', 'non player character', 'non player characters'],
  PC: ['pc', 'pcs', 'player character', 'player characters'],
};
const normTag = t => String(t).normalize('NFKD').toLowerCase().replace(/[^a-z\s-]/g, '').replace(/[-\s]+/g, ' ').trim();
const creatureTagOf = tagNames => tagNames.find(t => Object.values(CREATURE_TAGS).some(v => v.includes(normTag(t)))) || null;

const MAX_BODY_BYTES = 5 * 1024 * 1024;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    try {
      const route = `${request.method} ${url.pathname.replace(/\/+$/, '') || '/'}`;

      // Bestiary: read-only lookups from Open5e
      if (request.method === 'GET' && url.pathname.startsWith('/bestiary/')) {
        if (!(await isEditor(request, env))) return json({ error: 'Invalid edit key' }, 401, cors);
        const res = await bestiary(url);
        return json(res.body, res.status, { ...cors, 'Cache-Control': 'no-store' });
      }

      switch (route) {
        case 'GET /map':
          return json(await playerMap(env), 200, cors);

        case 'GET /preview':
          if (!(await isEditor(request, env))) return json({ error: 'Invalid edit key' }, 401, cors);
          return json(await playerMap(env, { includeAll: true }), 200, { ...cors, 'Cache-Control': 'no-store' });

        case 'GET /dm':
          if (!(await isEditor(request, env))) return json({ error: 'Invalid edit key' }, 401, cors);
          return json({ ...(await loadDm(env)), ...(await creaturePagesFor(env)) },
            200, { ...cors, 'Cache-Control': 'no-store' });

        case 'PUT /dm':
          if (!(await isEditor(request, env))) return json({ error: 'Invalid edit key' }, 401, cors);
          return await saveDm(request, env, cors);

        case 'GET /editor':
          if (!(await isEditor(request, env))) return json({ error: 'Invalid edit key' }, 401, cors);
          return json(await editorPayload(env), 200, { ...cors, 'Cache-Control': 'no-store' });

        case 'PUT /map':
          if (!(await isEditor(request, env))) return json({ error: 'Invalid edit key' }, 401, cors);
          return await saveMap(request, env, cors);

        case 'POST /sync': {
          if (!(await isEditor(request, env))) return json({ error: 'Invalid edit key' }, 401, cors);
          try {
            const synced = await syncLocations(env);
            return json({ locations: synced.items, creaturePages: synced.creatures, tagsSeen: synced.tagsSeen, syncedAt: synced.syncedAt }, 200, { ...cors, 'Cache-Control': 'no-store' });
          } catch (err) {
            console.error('Sync failed', err);
            return json({ error: err.message }, 502, cors);
          }
        }

        case 'POST /webhook':
          return await handleWebhook(request, env, ctx);

        default:
          return json({ error: 'Not found' }, 404, cors);
      }
    } catch (err) {
      console.error(err);
      return json({ error: 'Server error' }, 500, cors);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(syncLocations(env).catch(err => console.error('Scheduled sync failed', err)));
  },
};

/* ---------------- Responses, CORS, auth ---------------- */

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

function corsHeaders(request, env) {
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const origin = request.headers.get('Origin');
  const headers = { Vary: 'Origin' };
  if (origin && allowed.includes(origin)) {
    Object.assign(headers, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '86400',
    });
  }
  return headers;
}

const encoder = new TextEncoder();

// Compare two strings without leaking how much of them matched
async function safeEqual(a, b) {
  const [ha, hb] = await Promise.all([a, b].map(s => crypto.subtle.digest('SHA-256', encoder.encode(s))));
  return crypto.subtle.timingSafeEqual(ha, hb);
}

async function isEditor(request, env) {
  if (!env.EDIT_KEY) return false;
  const header = request.headers.get('Authorization') || '';
  const given = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  return given.length > 0 && safeEqual(given, env.EDIT_KEY);
}

/* ---------------- Notion ---------------- */

const cleanId = id => String(id || '').replace(/-/g, '').toLowerCase();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function notion(env, path, init = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://api.notion.com/v1${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${env.NOTION_TOKEN}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
    });
    // Respect rate limits and transient errors, but don't hang a request for long
    if ((res.status === 429 || res.status >= 500) && attempt < 2) {
      const wait = Math.min(Number(res.headers.get('Retry-After')) || 1, 10);
      await sleep(wait * 1000);
      continue;
    }
    if (!res.ok) {
      const body = await res.text();
      let message = body;
      try { message = JSON.parse(body).message || body; } catch { /* not JSON */ }
      throw new Error(`Notion ${res.status} on ${path.split('?')[0]}: ${message}`);
    }
    return res.json();
  }
}

// Since API version 2025-09-03, rows are queried through the database's data source
async function dataSourceId(env) {
  const cached = await env.MAP_KV.get('notion:dataSourceId');
  if (cached) return cached;
  const db = await notion(env, `/databases/${cleanId(env.NOTION_DATABASE_ID)}`);
  const id = db.data_sources?.[0]?.id;
  if (!id) throw new Error('This database has no data source the connection can see.');
  await env.MAP_KV.put('notion:dataSourceId', cleanId(id));
  return cleanId(id);
}

const plainText = rich => (rich || []).map(r => r.plain_text).join('').trim();

function names(prop) {
  if (!prop) return [];
  if (prop.type === 'select' || prop.type === 'status') return prop[prop.type] ? [prop[prop.type].name] : [];
  if (prop.type === 'multi_select') return prop.multi_select.map(o => o.name);
  // Visibility is a "show original" rollup from the DM Database: an array of select values
  if (prop.type === 'rollup' && prop.rollup.type === 'array') return prop.rollup.array.flatMap(names);
  return [];
}

function text(prop) {
  if (!prop) return '';
  if (prop.type === 'title' || prop.type === 'rich_text') return plainText(prop[prop.type]);
  return names(prop).join(', ');
}

const relationIds = prop => (prop?.type === 'relation' ? prop.relation.map(r => cleanId(r.id)) : []);

// Turn a Campaign Database page into the slim record the map uses.
// Returns { kind: 'location' | 'creature', record } or null for pages with none of those tags.
function toRecord(page) {
  const props = page.properties || {};
  const tagNames = names(props[PROPS.tags]);
  const tags = tagNames.map(t => t.toLowerCase());
  const creatureTag = creatureTagOf(tagNames);
  const kind = tags.includes(LOCATION_TAG) ? 'location' : creatureTag ? 'creature' : null;
  if (!kind) return { kind: null, tags: tagNames };
  const titleProp = Object.values(props).find(p => p.type === 'title');
  // Exactly one "Public" or "Private" from the rollup; anything else (no DM page linked,
  // several linked, another value) is reported as unknown rather than guessed
  const values = names(props[PROPS.visibility]).map(v => v.toLowerCase());
  const visibility = values.length === 1 && (values[0] === 'public' || values[0] === 'private') ? values[0] : 'unknown';
  return { kind, tags: tagNames, record: {
    id: cleanId(page.id),
    name: text(titleProp) || 'Untitled',
    url: page.url,
    visibility,                           // 'public' | 'private' | 'unknown' (editor only)
    public: visibility === 'public',      // players only ever get these
    dmPages: relationIds(props[PROPS.dmPage]),   // editor only: the paired DM Database page(s)
    pronunciation: text(props[PROPS.pronunciation]),
    aliases: text(props[PROPS.aliases]),
    ...(kind === 'creature' && { tag: creatureTag }),   // e.g. "Hostiles", "NPC", "PC"
  } };
}

// Read the whole Campaign Database and keep the Location pages (for the map)
// and the Hostiles / NPC / PC pages (for linking bestiary creatures; DM only)
async function syncLocations(env) {
  const ds = await dataSourceId(env);
  const items = [], creatures = [], tagsSeen = new Set();
  let cursor = null;
  do {
    const page = await notion(env, `/data_sources/${ds}/query`, {
      method: 'POST',
      body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
    });
    for (const row of page.results) {
      if (row.object !== 'page') continue;
      const found = toRecord(row);
      found.tags.forEach(t => tagsSeen.add(t));
      if (found.kind === 'location') items.push(found.record);
      if (found.kind === 'creature') creatures.push(found.record);
    }
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);

  items.sort((a, b) => a.name.localeCompare(b.name));
  creatures.sort((a, b) => a.name.localeCompare(b.name));
  const previous = await env.MAP_KV.get('locations', 'json');
  // tagsSeen lets the bestiary explain an empty list ("your tags are: …")
  const record = { syncedAt: new Date().toISOString(), items, creatures, tagsSeen: [...tagsSeen].sort() };
  // Skip the KV write when nothing changed (KV writes are the scarce resource on the free plan)
  if (!previous || JSON.stringify(previous.items) !== JSON.stringify(items) ||
      JSON.stringify(previous.creatures || []) !== JSON.stringify(creatures) ||
      JSON.stringify(previous.tagsSeen || []) !== JSON.stringify(record.tagsSeen)) {
    await env.MAP_KV.put('locations', JSON.stringify(record));
  }
  return record;
}

// Creature pages for the DM view. If the cached list predates creature pages, sync once.
async function creaturePagesFor(env) {
  let record = await env.MAP_KV.get('locations', 'json');
  if (!record || !Array.isArray(record.creatures)) {
    try { record = await syncLocations(env); } catch (err) { console.error('Creature page sync failed', err); }
  }
  return { creaturePages: record?.creatures || [], tagsSeen: record?.tagsSeen || [] };
}

async function cachedLocations(env) {
  return (await env.MAP_KV.get('locations', 'json')) || syncLocations(env);
}

/* ---------------- Map storage ---------------- */

const emptyMap = () => ({ party: null, pins: [], islandLabels: [], fog: [], settings: {} });

async function loadMap(env) {
  return (await env.MAP_KV.get('map', 'json')) || { version: 0, updatedAt: null, data: emptyMap() };
}

// Place types from the editor's Settings. Only these fields, in these ranges, are kept.
function cleanPlaceTypes(types) {
  if (!Array.isArray(types)) return undefined;
  const clampInt = (v, lo, hi, fallback) => Math.min(hi, Math.max(lo, Math.round(Number(v)) || fallback));
  const seen = new Set();
  const cleaned = types
    .filter(t => t && typeof t.key === 'string' && t.key && !seen.has(t.key) && seen.add(t.key))
    .slice(0, 50)
    .map(t => ({
      key: t.key.slice(0, 60),
      label: String(t.label || t.key).slice(0, 60),
      color: /^#[0-9a-f]{6}$/i.test(t.color) ? t.color : '#b8893a',
      dotSize: clampInt(t.dotSize, 4, 30, 8),
      fontSize: clampInt(t.fontSize, 10, 36, 14),
    }));
  return cleaned.length ? cleaned : undefined;
}

function cleanSettings(s) {
  const out = {};
  const placeTypes = cleanPlaceTypes(s?.placeTypes);
  if (placeTypes) out.placeTypes = placeTypes;
  if (typeof s?.defaultPlaceType === 'string') out.defaultPlaceType = s.defaultPlaceType.slice(0, 60);
  return out;
}

function cleanMapData(d) {
  const list = v => (Array.isArray(v) ? v : []);
  const party = d?.party && Number.isFinite(d.party.x) && Number.isFinite(d.party.y)
    ? { x: d.party.x, y: d.party.y } : null;
  return {
    party,
    pins: list(d?.pins),
    islandLabels: list(d?.islandLabels),
    fog: list(d?.fog),
    settings: cleanSettings(d?.settings),
  };
}

async function saveMap(request, env, cors) {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: 'Map is too large' }, 413, cors);
  let body;
  try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON' }, 400, cors); }

  const current = await loadMap(env);
  // Optimistic concurrency: refuse to overwrite a newer save from another tab or device
  if (body.baseVersion !== current.version) {
    return json({ error: 'Map changed since you loaded it', version: current.version }, 409, cors);
  }
  const next = { version: current.version + 1, updatedAt: new Date().toISOString(), data: cleanMapData(body.data) };
  await env.MAP_KV.put('map', JSON.stringify(next));
  return json({ version: next.version, updatedAt: next.updatedAt }, 200, { ...cors, 'Cache-Control': 'no-store' });
}

/* ---------------- DM data ----------------
   Session links, the initiative tracker and saved encounters. Kept in its own
   KV record so it can never mix with the map or reach players. */

const str = (v, max) => String(v ?? '').slice(0, max);
const num = v => (v === null || v === '' || v === undefined || !Number.isFinite(Number(v)) ? null : Math.round(Number(v)));
const isWebUrl = v => { try { return /^https?:$/.test(new URL(v).protocol); } catch { return false; } };

function cleanCombatant(c) {
  if (!c || typeof c !== 'object') return null;
  return {
    id: str(c.id, 60) || crypto.randomUUID(),
    name: str(c.name, 80),
    init: num(c.init),
    hp: num(c.hp),
    maxHp: num(c.maxHp),
    ac: num(c.ac),
    notes: str(c.notes, 4000),
    side: ['party', 'ally', 'hostile'].includes(c.side) ? c.side : 'hostile',   // for encounter math
    hidden: !!c.hidden,     // staged but not in the fight yet: skipped by turns, still counted in the math
    level: num(c.level),    // party members' character level
    cr: str(c.cr, 8),       // challenge rating copied from the bestiary when added
    ...cleanStatus(c),
    // Reserved for the bestiary: where a monster's stat block came from, e.g. { type: 'open5e', slug: 'goblin' }
    source: c.source && typeof c.source === 'object'
      ? { type: str(c.source.type, 30), slug: str(c.source.slug, 120) } : null,
  };
}
// Status that can outlast a turn: temp HP, exhaustion, conditions and lingering effects.
// Kept on initiative rows, and on Bestiary creatures whose state carries between fights.
const EFFECT_UNTIL = ['fight', 'rest', 'removed'];
function cleanStatus(o) {
  const ex = num(o?.exhaustion);
  return {
    tempHp: num(o?.tempHp) > 0 ? num(o.tempHp) : null,
    exhaustion: ex ? Math.min(6, Math.max(0, ex)) : 0,
    conditions: [...new Set((Array.isArray(o?.conditions) ? o.conditions : []).map(c => str(c, 30).trim()).filter(Boolean))].slice(0, 20),
    effects: (Array.isArray(o?.effects) ? o.effects : []).slice(0, 20)
      .map(e => ({ text: str(e?.text, 160).trim(), until: EFFECT_UNTIL.includes(e?.until) ? e.until : 'removed' })).filter(e => e.text),
  };
}

const cleanCombatants = list => (Array.isArray(list) ? list : []).slice(0, 60).map(cleanCombatant).filter(Boolean);

// A spell in the DM's spellbook
function cleanSpell(s) {
  if (!s || typeof s !== 'object' || !str(s.name, 100)) return null;
  const level = num(s.level);
  return {
    id: str(s.id, 60) || crypto.randomUUID(),
    name: str(s.name, 100),
    level: level === null ? 0 : Math.min(9, Math.max(0, level)),
    school: str(s.school, 40),
    castingTime: str(s.castingTime, 80),
    range: str(s.range, 80),
    components: str(s.components, 20),
    material: str(s.material, 400),
    duration: str(s.duration, 80),
    concentration: !!s.concentration,
    ritual: !!s.ritual,
    classes: str(s.classes, 200),
    desc: str(s.desc, 20000),
    higherLevel: str(s.higherLevel, 6000),
    book: str(s.book, 120),                // e.g. "Xanathar's Guide p. 152" for spells from your books
    notes: str(s.notes, 4000),
    source: s.source && typeof s.source === 'object' ? { type: str(s.source.type, 30), slug: str(s.source.slug, 120) } : null,
  };
}

// A creature in the DM's bestiary: the numbers the tracker uses (which override Open5e's),
// a link to a Hostiles / NPC / PC page, notes, and the Open5e stat block it came from (if any)
function cleanCreature(c) {
  if (!c || typeof c !== 'object' || !str(c.name, 80)) return null;
  let statblock = null;
  if (c.statblock && typeof c.statblock === 'object') {
    const raw = JSON.stringify(c.statblock);
    if (raw.length <= 60000) statblock = JSON.parse(raw);   // room for hand-entered actions and traits
  }
  return {
    id: str(c.id, 60) || crypto.randomUUID(),
    name: str(c.name, 80),                 // the name in use (worked out by the editor)
    nameOverride: str(c.nameOverride, 80), // your name; when empty, the Notion page name, then Open5e's
    cr: str(c.cr, 8),
    xp: num(c.xp),
    ac: num(c.ac),
    hp: num(c.hp),
    hitDice: str(c.hitDice, 40),
    initBonus: num(c.initBonus),
    notes: str(c.notes, 8000),
    notionId: /^[a-f0-9]{32}$/.test(String(c.notionId || '')) ? c.notionId : null,
    // Characters (PCs and party members)
    // Role in the party: "party" (PC), "sidekick" (DM-run, fights as an Ally), "oncall" (familiar/mount/summon,
    // joins initiative hidden). All three carry HP and status between fights. inParty mirrors role === "party".
    role: ['party', 'sidekick', 'oncall'].includes(c.role) ? c.role : (c.inParty ? 'party' : c.companion ? 'sidekick' : ''),
    inParty: c.role ? c.role === 'party' : !!c.inParty,
    currentHp: num(c.currentHp),           // HP carried between fights
    ...cleanStatus(c),
    level: num(c.level),
    className: str(c.className, 60),
    player: str(c.player, 60),
    passive: num(c.passive),               // passive Perception
    spellDc: num(c.spellDc),
    // Spellcasting: picked from the Spellbook (Open5e "o:<slug>" or your own "c:<id>")
    spellAbility: str(c.spellAbility, 3),
    spellAttack: num(c.spellAttack),
    spells: (Array.isArray(c.spells) ? c.spells : []).slice(0, 200)
      // "o:" Open5e, "c:" your own, "u:" not linked yet (kept so you can link it later)
      .filter(sp => sp && /^[ocu]:[\w-]{1,120}$/.test(String(sp.key || '')))
      // level stays empty for innate spells whose level isn't known (they're grouped by "at will" / "3/day")
      .map(sp => ({ key: sp.key, name: str(sp.name, 100), level: num(sp.level) === null ? null : Math.min(9, Math.max(0, num(sp.level))), prepared: !!sp.prepared, note: str(sp.note, 60) })),
    source: c.source && typeof c.source === 'object'
      ? { type: str(c.source.type, 30), slug: str(c.source.slug, 120) } : null,
    statblock,
  };
}

function cleanDm(d) {
  const links = (Array.isArray(d?.links) ? d.links : []).slice(0, 100)
    .filter(l => l && isWebUrl(l.url))
    .map(l => ({ id: str(l.id, 60) || crypto.randomUUID(), label: str(l.label, 80) || str(l.url, 80), url: str(l.url, 2000) }));
  const current = links.some(l => l.id === d?.currentLinkId) ? d.currentLinkId : null;
  const combatants = cleanCombatants(d?.tracker?.combatants);
  const size = num(d?.party?.size), level = num(d?.party?.level);
  return {
    links,
    currentLinkId: current,
    // Fallback party for encounter math when no Party members are in the tracker
    party: { size: Math.min(12, Math.max(1, size || 4)), level: Math.min(20, Math.max(1, level || 1)) },
    tracker: {
      round: Math.max(1, num(d?.tracker?.round) || 1),
      turn: Math.min(Math.max(0, num(d?.tracker?.turn) || 0), Math.max(0, combatants.length - 1)),
      combatants,
    },
    bestiary: (Array.isArray(d?.bestiary) ? d.bestiary : []).slice(0, 400).map(cleanCreature).filter(Boolean),
    // Spellbook: your spells (from Open5e or hand-entered from your books)
    spells: (Array.isArray(d?.spells) ? d.spells : []).slice(0, 1500).map(cleanSpell).filter(Boolean),
    // Other names for spells ("Melf's Acid Arrow" for Acid Arrow), keyed by "o:<slug>" or "c:<id>"
    spellAliases: Object.fromEntries(Object.entries(d?.spellAliases && typeof d.spellAliases === 'object' ? d.spellAliases : {})
      .filter(([k, v]) => /^[oc]:[\w-]{1,120}$/.test(k) && typeof v === 'string' && v.trim())
      .slice(0, 3000).map(([k, v]) => [k, str(v.trim(), 300)])),
    // Presets: reusable stat blocks you saved (searched alongside Open5e). Same shape, minus notes/links.
    presets: (Array.isArray(d?.presets) ? d.presets : []).slice(0, 400).map(cleanCreature).filter(Boolean)
      .map(({ notes, notionId, nameOverride, inParty, player, role, currentHp, tempHp, exhaustion, conditions, effects, ...preset }) => preset),
    encounters: (Array.isArray(d?.encounters) ? d.encounters : []).slice(0, 100)
      .filter(e => e && str(e.name, 80))
      .map(e => ({
        id: str(e.id, 60) || crypto.randomUUID(),
        name: str(e.name, 80),
        savedAt: str(e.savedAt, 40),
        combatants: cleanCombatants(e.combatants),
      })),
  };
}

async function loadDm(env) {
  return (await env.MAP_KV.get('dm', 'json')) || { version: 0, updatedAt: null, data: cleanDm({}) };
}

async function saveDm(request, env, cors) {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: 'Too large' }, 413, cors);
  let body;
  try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON' }, 400, cors); }
  const current = await loadDm(env);
  if (body.baseVersion !== current.version) {
    return json({ error: 'DM data changed since you loaded it', version: current.version }, 409, cors);
  }
  const next = { version: current.version + 1, updatedAt: new Date().toISOString(), data: cleanDm(body.data) };
  await env.MAP_KV.put('dm', JSON.stringify(next));
  // Send back exactly what was stored, so the browser's saved copy matches it field for field
  return json({ version: next.version, updatedAt: next.updatedAt, data: next.data }, 200, { ...cors, 'Cache-Control': 'no-store' });
}

/* ---------------- Bestiary (Open5e) ----------------
   Read only. Responses are trimmed to what the map uses and cached at
   Cloudflare's edge (cf.cacheTtl), so repeated lookups don't hit Open5e. */

const OPEN5E = 'https://api.open5e.com/v1/monsters/';
const OPEN5E_SPELLS = 'https://api.open5e.com/v1/spells/';

// 2014 DMG experience by challenge rating
const XP_BY_CR = {
  0: 10, 0.125: 25, 0.25: 50, 0.5: 100, 1: 200, 2: 450, 3: 700, 4: 1100, 5: 1800, 6: 2300, 7: 2900,
  8: 3900, 9: 5000, 10: 5900, 11: 7200, 12: 8400, 13: 10000, 14: 11500, 15: 13000, 16: 15000,
  17: 18000, 18: 20000, 19: 22000, 20: 25000, 21: 33000, 22: 41000, 23: 50000, 24: 62000,
  25: 75000, 26: 90000, 27: 105000, 28: 120000, 29: 135000, 30: 155000,
};

async function open5e(path, base = OPEN5E) {
  const res = await fetch(base + path, { cf: { cacheTtl: 86400, cacheEverything: true } });
  if (!res.ok) throw Object.assign(new Error(`Open5e returned ${res.status}`), { status: res.status });
  return res.json();
}

// Some Open5e sources use the strings "False"/"null" for empty fields
const clean = v => (v === null || v === undefined || v === false || v === 'False' || v === 'null' ? '' : String(v).trim());
const list = v => (Array.isArray(v) ? v.filter(x => x && x.name).map(x => ({ name: clean(x.name), desc: clean(x.desc) })) : []);
const signed = n => (n >= 0 ? `+${n}` : `${n}`);
const titleCase = s => s.charAt(0).toUpperCase() + s.slice(1);

function speedText(speed) {
  if (!speed || typeof speed !== 'object') return clean(speed);
  const parts = [];
  if (speed.walk !== undefined) parts.push(`${speed.walk} ft.`);
  for (const [k, v] of Object.entries(speed)) {
    if (k === 'walk' || k === 'hover' || typeof v !== 'number') continue;
    parts.push(`${k} ${v} ft.${k === 'fly' && speed.hover ? ' (hover)' : ''}`);
  }
  return parts.join(', ');
}

function summary(m) {
  return {
    slug: m.slug,
    name: clean(m.name),
    size: clean(m.size),
    type: clean(m.type),
    cr: clean(m.challenge_rating),
    xp: XP_BY_CR[m.cr] ?? null,
    ac: Number(m.armor_class) || null,
    hp: Number(m.hit_points) || null,
    source: clean(m.document__title),
  };
}

function statBlock(m) {
  const abil = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
  const short = { strength: 'Str', dexterity: 'Dex', constitution: 'Con', intelligence: 'Int', wisdom: 'Wis', charisma: 'Cha' };
  const saves = abil.filter(a => Number.isFinite(m[`${a}_save`]) && m[`${a}_save`] !== null)
    .map(a => `${short[a]} ${signed(m[`${a}_save`])}`).join(', ');
  const skills = m.skills && typeof m.skills === 'object'
    ? Object.entries(m.skills).filter(([k, v]) => Number.isFinite(v) && k !== 'any').map(([k, v]) => `${titleCase(k)} ${signed(v)}`).join(', ')
    : '';
  return {
    ...summary(m),
    subtype: clean(m.subtype),
    alignment: clean(m.alignment),
    acDesc: clean(m.armor_desc),
    hitDice: clean(m.hit_dice),
    speed: speedText(m.speed),
    abilities: Object.fromEntries(abil.map(a => [short[a].toLowerCase(), Number(m[a]) || 10])),
    saves,
    skills,
    vulnerabilities: clean(m.damage_vulnerabilities),
    resistances: clean(m.damage_resistances),
    immunities: clean(m.damage_immunities),
    conditionImmunities: clean(m.condition_immunities),
    senses: clean(m.senses),
    languages: clean(m.languages),
    traits: list(m.special_abilities),
    actions: list(m.actions),
    bonusActions: list(m.bonus_actions),
    reactions: list(m.reactions),
    legendaryDesc: clean(m.legendary_desc),
    legendaryActions: list(m.legendary_actions),
    // Exact Open5e spells this monster casts (from its spell_list links), for linking to the Spellbook
    spellSlugs: (Array.isArray(m.spell_list) ? m.spell_list : [])
      .map(u => String(u).replace(/\/+$/, '').split('/').pop()).filter(sl => /^[a-z0-9_-]{1,120}$/i.test(sl)),
  };
}

// ---- Spells ----
const yes = v => v === true || /^(yes|true)$/i.test(String(v || ''));
const levelNum = s => {
  const n = Number.isFinite(Number(s.level_int)) ? Number(s.level_int) : Number.isFinite(Number(s.spell_level)) ? Number(s.spell_level) : parseInt(s.level, 10);
  return Number.isFinite(n) ? Math.min(9, Math.max(0, n)) : (/cantrip/i.test(String(s.level || '')) ? 0 : null);
};
function spellSummary(s) {
  return {
    slug: s.slug,
    name: clean(s.name),
    level: levelNum(s),
    school: clean(s.school),
    castingTime: clean(s.casting_time),
    concentration: yes(s.requires_concentration) || yes(s.concentration),
    ritual: yes(s.can_be_cast_as_ritual) || yes(s.ritual),
    classes: clean(s.dnd_class),
    source: clean(s.document__title),
  };
}
function spellDetail(s) {
  return {
    ...spellSummary(s),
    range: clean(s.range),
    components: clean(s.components),
    material: clean(s.material),
    duration: clean(s.duration),
    desc: clean(s.desc),
    higherLevel: clean(s.higher_level),
  };
}

const normName = s => String(s || '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

// Levenshtein distance, for "did you mean" matches on misspelled names
function editDistance(a, b) {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

async function bestiary(url) {
  try {
    const [, , kind, slug] = url.pathname.split('/');   // /bestiary/<kind>/<slug>
    if (kind === 'search') {
      // Paged so a broad search ("dragon") never hides results; one small Open5e page per request
      const q = (url.searchParams.get('q') || '').trim().slice(0, 60);
      const page = Math.min(30, Math.max(1, Number(url.searchParams.get('page')) || 1));
      const term = normName(q);
      if (term.length < 2) return { status: 200, body: { results: [], page, hasMore: false } };
      const words = term.split(' ');
      const data = await open5e(`?search=${encodeURIComponent(q)}&limit=50&page=${page}`);

      // Open5e also matches descriptions; keep creatures whose name has every word, best first
      const rank = r => { const n = normName(r.name); return n === term ? 0 : n.startsWith(term) ? 1 : n.includes(term) ? 2 : 3; };
      let results = (data.results || []).map(summary).filter(r => words.every(w => normName(r.name).includes(w)));
      results.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));

      // Nothing at all? Try close spellings ("aarokocra" -> names starting "aar")
      let fuzzy = false;
      if (page === 1 && !results.length && !(data.results || []).length && term.length >= 4) {
        const near = await open5e(`?search=${encodeURIComponent(term.slice(0, 3))}&limit=50`);
        const closeness = r => Math.min(editDistance(term, normName(r.name)), ...normName(r.name).split(' ').map(w => editDistance(term, w)));
        results = (near.results || []).map(summary)
          .map(r => ({ r, d: closeness(r) }))
          .filter(x => x.d <= Math.max(2, Math.floor(term.length / 3)))
          .sort((a, b) => a.d - b.d || a.r.name.localeCompare(b.r.name))
          .slice(0, 12).map(x => x.r);
        fuzzy = results.length > 0;
      }
      return { status: 200, body: { results, page, hasMore: !fuzzy && !!data.next, fuzzy } };
    }
    if (kind === 'spells') {
      // Same paging and name matching as monster search
      const q = (url.searchParams.get('q') || '').trim().slice(0, 60);
      const page = Math.min(30, Math.max(1, Number(url.searchParams.get('page')) || 1));
      const term = normName(q);
      if (term.length < 2) return { status: 200, body: { results: [], page, hasMore: false } };
      const words = term.split(' ');
      const data = await open5e(`?search=${encodeURIComponent(q)}&limit=50&page=${page}`, OPEN5E_SPELLS);
      const rank = r => { const n = normName(r.name); return n === term ? 0 : n.startsWith(term) ? 1 : n.includes(term) ? 2 : 3; };
      let results = (data.results || []).map(spellSummary).filter(r => words.every(w => normName(r.name).includes(w)));
      results.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
      let fuzzy = false;
      if (page === 1 && !results.length && !(data.results || []).length && term.length >= 4) {
        const near = await open5e(`?search=${encodeURIComponent(term.slice(0, 3))}&limit=50`, OPEN5E_SPELLS);
        const closeness = r => Math.min(editDistance(term, normName(r.name)), ...normName(r.name).split(' ').map(w => editDistance(term, w)));
        results = (near.results || []).map(spellSummary).map(r => ({ r, d: closeness(r) }))
          .filter(x => x.d <= Math.max(2, Math.floor(term.length / 3)))
          .sort((a, b) => a.d - b.d || a.r.name.localeCompare(b.r.name)).slice(0, 12).map(x => x.r);
        fuzzy = results.length > 0;
      }
      return { status: 200, body: { results, page, hasMore: !fuzzy && !!data.next, fuzzy } };
    }
    if (kind === 'spell-index') {
      // The whole Open5e spell list, one small page per request (the browser walks the pages once and caches them)
      const page = Math.min(60, Math.max(1, Number(url.searchParams.get('page')) || 1));
      const data = await open5e(`?limit=100&page=${page}`, OPEN5E_SPELLS);
      return { status: 200, body: { results: (data.results || []).map(spellSummary), page, hasMore: !!data.next, count: data.count ?? null } };
    }
    if (kind === 'spell' && slug && /^[a-z0-9_-]+$/i.test(slug)) {
      return { status: 200, body: spellDetail(await open5e(`${encodeURIComponent(slug)}/`, OPEN5E_SPELLS)) };
    }
    if (kind === 'creature' && slug && /^[a-z0-9_-]+$/i.test(slug)) {
      return { status: 200, body: statBlock(await open5e(`${encodeURIComponent(slug)}/`)) };
    }
    return { status: 404, body: { error: 'Not found' } };
  } catch (err) {
    console.error('Bestiary lookup failed', err);
    return { status: err.status === 404 ? 404 : 502, body: { error: err.status === 404 ? 'Creature not found' : 'The bestiary is unavailable right now' } };
  }
}

/* ---------------- Views ---------------- */

async function editorPayload(env) {
  let locations, syncError = null;
  try {
    locations = await syncLocations(env);   // the editor always gets a fresh list
  } catch (err) {
    console.error('Sync failed, using cached locations', err);
    syncError = err.message;                // shown in the editor so failures aren't silent
    locations = (await env.MAP_KV.get('locations', 'json')) || { items: [], syncedAt: null };
  }
  const map = await loadMap(env);
  return { map, locations: locations.items, syncedAt: locations.syncedAt, syncError };
}

// Players: only places linked to a Public location, and only these fields, ever reach them.
// includeAll (the editor's preview) keeps every place: private, unknown and unlinked too.
async function playerMap(env, { includeAll = false } = {}) {
  const [map, locations] = await Promise.all([loadMap(env), cachedLocations(env)]);
  const visible = new Map(locations.items.filter(l => includeAll || l.public).map(l => [l.id, l]));

  const join = place => {
    const loc = visible.get(cleanId(place.notionId));
    if (!loc && !includeAll) return null;
    return {
      id: place.id,
      x: place.x,
      y: place.y,
      name: loc ? loc.name : place.workingName || (place.notionId ? 'Missing Notion page' : 'Unlinked location'),
      url: loc ? loc.url : null,
      pronunciation: loc ? loc.pronunciation : '',
      aliases: loc ? loc.aliases : '',
      // The DM view also gets each place's visibility and DM page links
      ...(includeAll && {
        visibility: loc ? loc.visibility : (place.notionId ? 'missing' : 'unlinked'),
        dmPages: loc ? loc.dmPages || [] : [],
      }),
    };
  };

  // Places within a pin: each one is checked against its own Notion visibility,
  // so a public city can list its public sewers while private places stay hidden
  const subLocations = ids => (Array.isArray(ids) ? ids : [])
    .map(id => visible.get(cleanId(id)))
    .filter(Boolean)
    .map(loc => ({
      id: loc.id, name: loc.name, url: loc.url, pronunciation: loc.pronunciation,
      ...(includeAll && { visibility: loc.visibility, dmPages: loc.dmPages || [] }),
    }));

  // Older island names are drifting pins now; convert any the editor hasn't re-saved yet
  const allPins = [...map.data.pins, ...map.data.islandLabels.map(l => ({ ...l, drifts: true }))];

  return {
    party: map.data.party,
    fog: map.data.fog,
    settings: cleanSettings(map.data.settings),   // place type looks only; nothing secret
    pins: allPins
      .map(p => {
        const j = join(p);
        return j && {
          ...j,
          type: p.type,
          note: p.note || '',
          drifts: !!p.drifts,
          subLocations: subLocations(p.subLocations),
        };
      })
      .filter(Boolean),
    islandLabels: [],
  };
}

/* ---------------- Webhook ---------------- */

async function verifySignature(raw, header, secret) {
  if (!header || !header.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(raw)));
  const expected = 'sha256=' + [...sig].map(b => b.toString(16).padStart(2, '0')).join('');
  return safeEqual(expected, header);
}

async function handleWebhook(request, env, ctx) {
  const raw = await request.text();
  let body;
  try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const signature = request.headers.get('X-Notion-Signature');

  // One-time handshake: Notion sends the verification token unsigned.
  // Copy it from the logs (wrangler tail) into the Notion portal and into NOTION_WEBHOOK_TOKEN.
  if (body.verification_token && !signature) {
    console.log('Notion webhook verification_token:', body.verification_token);
    return json({ ok: true });
  }

  if (!env.NOTION_WEBHOOK_TOKEN) return json({ error: 'Webhook not configured' }, 503);
  if (!(await verifySignature(raw, signature, env.NOTION_WEBHOOK_TOKEN))) return json({ error: 'Bad signature' }, 401);

  // Events carry IDs only, so re-read the database. Skip pages from other databases.
  if (/^(page|data_source|database)\./.test(body.type || '')) {
    const parentId = cleanId(body.data?.parent?.id);
    const ours = [cleanId(env.NOTION_DATABASE_ID), await env.MAP_KV.get('notion:dataSourceId')];
    if (!parentId || ours.includes(parentId)) {
      ctx.waitUntil(syncLocations(env).catch(err => console.error('Webhook sync failed', err)));
    }
  }
  return json({ ok: true });
}