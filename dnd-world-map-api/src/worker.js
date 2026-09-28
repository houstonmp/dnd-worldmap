/* ==========================================================================
   D&D World Map API (Cloudflare Worker)

   GET  /map      Public. The map for players: only places linked to a Public
                  Notion location, with a fixed set of fields. Nothing else leaves.
   GET  /editor   Edit key required. The full map plus every Location page.
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
};
const LOCATION_TAG = 'location';   // matched case-insensitively
const PUBLIC_VALUE = 'public';     // Visibility value that players can see

const MAX_BODY_BYTES = 5 * 1024 * 1024;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    try {
      const route = `${request.method} ${url.pathname.replace(/\/+$/, '') || '/'}`;
      switch (route) {
        case 'GET /map':
          return json(await playerMap(env), 200, cors);

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
            return json({ locations: synced.items, syncedAt: synced.syncedAt }, 200, { ...cors, 'Cache-Control': 'no-store' });
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
  return [];
}

function text(prop) {
  if (!prop) return '';
  if (prop.type === 'title' || prop.type === 'rich_text') return plainText(prop[prop.type]);
  return names(prop).join(', ');
}

// Turn a Campaign Database page into the slim record the map uses (or null if it's not a Location)
function toLocation(page) {
  const props = page.properties || {};
  const tags = names(props[PROPS.tags]).map(t => t.toLowerCase());
  if (!tags.includes(LOCATION_TAG)) return null;
  const titleProp = Object.values(props).find(p => p.type === 'title');
  const visibility = (names(props[PROPS.visibility])[0] || '').toLowerCase();
  return {
    id: cleanId(page.id),
    name: text(titleProp) || 'Untitled',
    url: page.url,
    public: visibility === PUBLIC_VALUE,
    pronunciation: text(props[PROPS.pronunciation]),
    aliases: text(props[PROPS.aliases]),
  };
}

// Read the whole Campaign Database and keep just the Location pages
async function syncLocations(env) {
  const ds = await dataSourceId(env);
  const items = [];
  let cursor = null;
  do {
    const page = await notion(env, `/data_sources/${ds}/query`, {
      method: 'POST',
      body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
    });
    for (const row of page.results) {
      if (row.object !== 'page') continue;
      const loc = toLocation(row);
      if (loc) items.push(loc);
    }
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);

  items.sort((a, b) => a.name.localeCompare(b.name));
  const previous = await env.MAP_KV.get('locations', 'json');
  const record = { syncedAt: new Date().toISOString(), items };
  // Skip the KV write when nothing changed (KV writes are the scarce resource on the free plan)
  if (!previous || JSON.stringify(previous.items) !== JSON.stringify(items)) {
    await env.MAP_KV.put('locations', JSON.stringify(record));
  }
  return record;
}

async function cachedLocations(env) {
  return (await env.MAP_KV.get('locations', 'json')) || syncLocations(env);
}

/* ---------------- Map storage ---------------- */

const emptyMap = () => ({ party: null, pins: [], islandLabels: [], fog: [] });

async function loadMap(env) {
  return (await env.MAP_KV.get('map', 'json')) || { version: 0, updatedAt: null, data: emptyMap() };
}

function cleanMapData(d) {
  const list = v => (Array.isArray(v) ? v : []);
  const party = d?.party && Number.isFinite(d.party.x) && Number.isFinite(d.party.y)
    ? { x: d.party.x, y: d.party.y } : null;
  return { party, pins: list(d?.pins), islandLabels: list(d?.islandLabels), fog: list(d?.fog) };
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

// Only places linked to a Public location, and only these fields, ever reach players
async function playerMap(env) {
  const [map, locations] = await Promise.all([loadMap(env), cachedLocations(env)]);
  const visible = new Map(locations.items.filter(l => l.public).map(l => [l.id, l]));

  const join = place => {
    const loc = visible.get(cleanId(place.notionId));
    if (!loc) return null;
    return {
      id: place.id,
      x: place.x,
      y: place.y,
      name: loc.name,
      url: loc.url,
      pronunciation: loc.pronunciation,
      aliases: loc.aliases,
    };
  };

  return {
    party: map.data.party,
    fog: map.data.fog,
    pins: map.data.pins
      .map(p => { const j = join(p); return j && { ...j, type: p.type, note: p.note || '' }; })
      .filter(Boolean),
    islandLabels: map.data.islandLabels.map(join).filter(Boolean),
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