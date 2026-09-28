/* ==========================================================================
   CONFIG: everything you'd normally tweak lives here.
   All images should share the same pixel size (width x height below).
   Leave a src as null to use a generated placeholder.
   Places, party and fog are stored by the map worker (edit with ?edit on the URL).
   Place names, links and visibility come from Notion.
   ========================================================================== */
const CONFIG = {
  width: 2560,                 // px width of your images
  height: 1440,                // px height of your images

  baseMap: 'assets/World1-1.png',

  islands: {
    src: 'assets/World1-sky-islands.png',   // transparent, tiles left-to-right
    loopSeconds: 180,          // seconds for one full crossing at 1x speed
    direction: 1,              // 1 = enters from the right, -1 = enters from the left
    opacity: 1,
  },

  clouds: {
    src: null,                 // e.g. 'assets/clouds.png' (transparent, tiles left-to-right)
    loopSeconds: 90,
    direction: 1,
    opacity: 0.55,
  },

  fog: {
    enabled: true,
    color: '#2b3238',          // base fog color (used when image is null)
    image: null,               // optional fog texture, e.g. 'assets/fog.png'
    opacity: 1,                // how players see it
    editorOpacity: 0.55,       // how you see it in edit mode, so the map shows through
    resolution: 0.5,           // fog detail vs. speed; 0.5 = half the map's pixel size
    brushSize: 160,            // starting brush size, in map pixels
    softness: 50,              // starting edge fade, in map pixels
  },

  party: {
    zoomIn: 1,                 // on load, zoom this far past the full-map view when centering on the party (0 = none)
  },

  api: 'https://dnd-world-map-api.houston-mp.workers.dev',   // the map worker
  placesFile: 'places.json',   // only read once: imported the first time the editor finds the worker empty

  startSpeed: 1,               // speed multiplier on load
  maxSpeed: 3,                 // top of the speed slider
  scrollWheelZoom: false,      // false plays nicer inside a Notion embed
};

/* ==========================================================================
   PLACE_TYPES: the kinds of pins you can pick in edit mode.
   Add, remove or reorder freely. The key (e.g. city) is what's saved in
   places.json, so rename a key only if you also update existing pins.
   dotSize and fontSize are in screen pixels.
   ========================================================================== */
const PLACE_TYPES = {
  continent: { label: 'Continent', color: '#3f6f8f', dotSize: 14, fontSize: 22 },
  empire:    { label: 'Empire',    color: '#8e2f3f', dotSize: 13, fontSize: 20 },
  city:      { label: 'City',      color: '#b8893a', dotSize: 10, fontSize: 16 },
  town:      { label: 'Town',      color: '#4f7a4a', dotSize: 8,  fontSize: 14 },
  hamlet:    { label: 'Hamlet',    color: '#9a9ea3', dotSize: 6,  fontSize: 13 },
};
const DEFAULT_PLACE_TYPE = 'town';   // used for new pins and for pins whose type was removed

/* ==========================================================================
   Placeholder art (only used when a src above is null)
   ========================================================================== */
const PLACEHOLDER_SPOTS = [
  { x: 420, y: 480 }, { x: 1150, y: 1080 }, { x: 1780, y: 420 }, { x: 2050, y: 1250 },
];

function seeded(seed) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

function makeCanvas(w = CONFIG.width, h = CONFIG.height) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

// Draws fn at x, x - width and x + width so shapes crossing an edge wrap seamlessly.
function drawWrapped(fn) {
  [-CONFIG.width, 0, CONFIG.width].forEach(fn);
}

function placeholderBase() {
  const [c, g] = makeCanvas();
  const grad = g.createRadialGradient(c.width / 2, c.height / 2, 100, c.width / 2, c.height / 2, c.width * 0.7);
  grad.addColorStop(0, '#2a5063');
  grad.addColorStop(1, '#16303d');
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(232, 236, 239, .08)';
  g.lineWidth = 2;
  for (let x = 0; x <= c.width; x += 200) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, c.height); g.stroke(); }
  for (let y = 0; y <= c.height; y += 200) { g.beginPath(); g.moveTo(0, y); g.lineTo(c.width, y); g.stroke(); }
  return c.toDataURL();
}

function blobPath(g, cx, cy, radius, rand) {
  const harmonics = [1, 2, 3, 5].map(n => ({ n, amp: rand() * 0.18, phase: rand() * Math.PI * 2 }));
  g.beginPath();
  for (let i = 0; i <= 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const r = radius * (1 + harmonics.reduce((s, h) => s + h.amp * Math.sin(h.n * a + h.phase), 0));
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.75;
    i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
  }
  g.closePath();
}

function placeholderIslands() {
  const [c, g] = makeCanvas();
  const rand = seeded(7);
  PLACEHOLDER_SPOTS.forEach(({ x, y }) => {
    const radius = 90 + rand() * 80;
    const seed = Math.floor(rand() * 1e6) + 1;
    drawWrapped(dx => {
      blobPath(g, x + dx, y, radius * 1.25, seeded(seed));
      g.fillStyle = 'rgba(120, 190, 200, .35)'; g.fill();
      blobPath(g, x + dx, y, radius, seeded(seed));
      g.fillStyle = '#d9c9a3'; g.fill();
      blobPath(g, x + dx, y, radius * 0.8, seeded(seed));
      g.fillStyle = '#4f6b4a'; g.fill();
    });
  });
  return c.toDataURL();
}

function placeholderClouds() {
  const [c, g] = makeCanvas();
  const rand = seeded(42);
  for (let i = 0; i < 14; i++) {
    const cx = rand() * c.width, cy = rand() * c.height;
    const puffs = Array.from({ length: 6 }, () => ({
      ox: (rand() - 0.5) * 260, oy: (rand() - 0.5) * 70, r: 60 + rand() * 90,
    }));
    drawWrapped(dx => puffs.forEach(p => {
      const grad = g.createRadialGradient(cx + dx + p.ox, cy + p.oy, 0, cx + dx + p.ox, cy + p.oy, p.r);
      grad.addColorStop(0, 'rgba(255,255,255,.75)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(cx + dx + p.ox - p.r, cy + p.oy - p.r, p.r * 2, p.r * 2);
    }));
  }
  return c.toDataURL();
}

/* ==========================================================================
   Custom Leaflet layers
   ========================================================================== */

// An image overlay that scrolls its image in a seamless loop, clipped to its bounds.
const ScrollingLayer = L.ImageOverlay.extend({
  _initImage() {
    const el = this._image = L.DomUtil.create('div', 'leaflet-image-layer scroll-layer');
    if (this._zoomAnimated) L.DomUtil.addClass(el, 'leaflet-zoom-animated');
    this._strip = L.DomUtil.create('div', 'scroll-strip', el);
    for (let i = 0; i < 2; i++) {
      const img = L.DomUtil.create('img', '', this._strip);
      img.src = this._url;
      img.alt = '';
      img.draggable = false;
    }
    el.onselectstart = L.Util.falseFn;
    el.onmousemove = L.Util.falseFn;
  },
  // progress: 0..1, how far through one full loop
  setProgress(progress) {
    if (this._strip) this._strip.style.transform = `translate3d(${-progress * 50}%, 0, 0)`;
  },
});

// Shows a <canvas> stretched over the map bounds (used for the fog).
const CanvasLayer = L.ImageOverlay.extend({
  _initImage() {
    const el = this._image = this._url;
    L.DomUtil.addClass(el, 'leaflet-image-layer');
    if (this._zoomAnimated) L.DomUtil.addClass(el, 'leaflet-zoom-animated');
    el.style.pointerEvents = 'none';
  },
});

/* ==========================================================================
   Helpers
   ========================================================================== */
const W = CONFIG.width, H = CONFIG.height;
const EDIT = new URLSearchParams(location.search).has('edit');
const EDIT_KEY_STORAGE = 'dnd-map:edit-key';
const UNSAVED_KEY = 'dnd-map:unsaved';

const wrap01 = v => ((v % 1) + 1) % 1;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clampLatLng = ll => L.latLng(clamp(ll.lat, 0, H), clamp(ll.lng, 0, W));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const placeType = key => PLACE_TYPES[key] || PLACE_TYPES[DEFAULT_PLACE_TYPE] || Object.values(PLACE_TYPES)[0];
const placeTypeKey = key => (PLACE_TYPES[key] ? key : DEFAULT_PLACE_TYPE);
const isFogTool = tool => tool === 'reveal' || tool === 'hide';

// Only allow real web links (blocks things like javascript: URLs)
function safeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

/* ==========================================================================
   Map setup
   ========================================================================== */
const bounds = [[0, 0], [H, W]];

const map = L.map('map', {
  crs: L.CRS.Simple,
  zoomSnap: 0.25,
  scrollWheelZoom: CONFIG.scrollWheelZoom,
  attributionControl: false,
  maxBoundsViscosity: 0.8,
});
const container = map.getContainer();

// Stack order: base map < pins < islands < island names < fog < clouds < party marker
[['pins', 405], ['islands', 410], ['labels', 415], ['fog', 430], ['clouds', 440], ['party', 450]].forEach(([name, z]) => {
  map.createPane(name).style.zIndex = z;
});

L.imageOverlay(CONFIG.baseMap || placeholderBase(), bounds).addTo(map);

const islands = new ScrollingLayer(CONFIG.islands.src || placeholderIslands(), bounds, {
  pane: 'islands', opacity: CONFIG.islands.opacity,
}).addTo(map);

const clouds = new ScrollingLayer(CONFIG.clouds.src || placeholderClouds(), bounds, {
  pane: 'clouds', opacity: CONFIG.clouds.opacity,
}).addTo(map);

const pinLayer = L.layerGroup().addTo(map);
const islandLabelLayer = L.layerGroup().addTo(map);
const partyLayer = L.layerGroup().addTo(map);   // always shown, so it's not in the layers menu

map.fitBounds(bounds);
const fitZoom = map.getZoom();
map.setMinZoom(map.getZoom() - 0.5);
map.setMaxBounds(L.latLngBounds(bounds).pad(0.15));

// Fog is deliberately left out of this menu so players can't turn it off
L.control.layers(null, {
  'Drifting isles': islands,
  'Island names': islandLabelLayer,
  'Places': pinLayer,
  'Clouds': clouds,
}, { collapsed: true }).addTo(map);

const state = {
  speed: CONFIG.startSpeed,
  paused: EDIT || window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  islands: 0,   // loop progress 0..1
  clouds: 0,
};

/* ==========================================================================
   Fog of war
   The fog is a canvas: a fog texture with a "revealed" mask cut out of it.
   Every reveal/hide is stored as an operation in places.json and replayed on load.
   Soft edges use a canvas shadow blur, which works in every major browser.
   ========================================================================== */
const Fog = (() => {
  const S = CONFIG.fog.resolution;
  const FW = Math.round(W * S), FH = Math.round(H * S);
  const OFF = 100000;   // shapes are drawn far off-canvas; only their blurred shadow lands on it

  const [display, dctx] = makeCanvas(FW, FH);
  const [texture, tctx] = makeCanvas(FW, FH);
  const [committed, cctx] = makeCanvas(FW, FH);   // mask for all saved operations
  const [work, wctx] = makeCanvas(FW, FH);        // committed + whatever is being drawn right now
  let maskPixels = null;

  function paintGeneratedTexture() {
    tctx.fillStyle = CONFIG.fog.color;
    tctx.fillRect(0, 0, FW, FH);
    const rand = seeded(99);
    for (let i = 0; i < 90; i++) {
      const x = rand() * FW, y = rand() * FH, r = (80 + rand() * 260) * S;
      const grad = tctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, rand() > 0.5 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.09)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      tctx.fillStyle = grad;
      tctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }

  function loadTexture() {
    paintGeneratedTexture();
    if (!CONFIG.fog.image) return;
    const img = new Image();
    img.onload = () => { tctx.clearRect(0, 0, FW, FH); tctx.drawImage(img, 0, 0, FW, FH); composite(); };
    img.onerror = () => console.warn(`Couldn't load fog image ${CONFIG.fog.image}; using plain fog.`);
    img.src = CONFIG.fog.image;
  }

  // Draw one operation onto a mask. For brush strokes, fromIndex lets live drawing add only new segments.
  function drawOp(ctx, op, fromIndex = 0) {
    if (op.shape === 'all') {
      if (op.mode === 'hide') ctx.clearRect(0, 0, FW, FH);
      else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, FW, FH); }
      return;
    }
    ctx.save();
    ctx.globalCompositeOperation = op.mode === 'hide' ? 'destination-out' : 'source-over';
    ctx.fillStyle = ctx.strokeStyle = '#000';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = (op.feather || 0) * S;
    ctx.shadowOffsetX = OFF;
    ctx.translate(-OFF, 0);
    ctx.scale(S, S);

    if (op.shape === 'brush') {
      const pts = op.points;
      ctx.lineWidth = op.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = fromIndex; i < pts.length; i++) {
        ctx.beginPath();
        if (i === 0) {
          ctx.arc(pts[0][0], pts[0][1], op.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.moveTo(pts[i - 1][0], pts[i - 1][1]);
          ctx.lineTo(pts[i][0], pts[i][1]);
          ctx.stroke();
        }
      }
    } else if (op.shape === 'rect') {
      ctx.fillRect(op.x, op.y, op.w, op.h);
    } else if (op.shape === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse(op.x + op.w / 2, op.y + op.h / 2, op.w / 2, op.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (op.shape === 'lasso') {
      ctx.beginPath();
      op.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function copyInto(ctx, source) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, FW, FH);
    ctx.drawImage(source, 0, 0);
  }

  function composite() {
    dctx.globalCompositeOperation = 'source-over';
    dctx.clearRect(0, 0, FW, FH);
    dctx.drawImage(texture, 0, 0);
    dctx.globalCompositeOperation = 'destination-out';
    dctx.drawImage(work, 0, 0);
    dctx.globalCompositeOperation = 'source-over';
  }

  loadTexture();

  return {
    canvas: display,

    // Replay every saved operation from scratch (load, undo, redo)
    rebuild(ops) {
      cctx.clearRect(0, 0, FW, FH);
      ops.forEach(op => drawOp(cctx, op));
      copyInto(wctx, committed);
      composite();
      maskPixels = null;
    },

    // Show an in-progress operation
    preview(op, fromIndex = 0) {
      if (op.shape === 'brush') drawOp(wctx, op, fromIndex);
      else { copyInto(wctx, committed); drawOp(wctx, op); }
      composite();
    },

    // Keep the in-progress operation
    keep() {
      copyInto(cctx, work);
      maskPixels = null;
    },

    // Throw the in-progress operation away
    cancel() {
      copyInto(wctx, committed);
      composite();
    },

    // Is this map pixel at least half revealed?
    isRevealed(x, y) {
      if (!maskPixels) maskPixels = cctx.getImageData(0, 0, FW, FH).data;
      const px = clamp(Math.floor(x * S), 0, FW - 1), py = clamp(Math.floor(y * S), 0, FH - 1);
      return maskPixels[(py * FW + px) * 4 + 3] > 127;
    },
  };
})();

let fogLayer = null;
if (CONFIG.fog.enabled) {
  Fog.rebuild([]);   // start fully fogged so nothing flashes before places.json loads
  fogLayer = new CanvasLayer(Fog.canvas, bounds, {
    pane: 'fog',
    opacity: EDIT ? CONFIG.fog.editorOpacity : CONFIG.fog.opacity,
  }).addTo(map);
}

/* ==========================================================================
   Data
   The worker stores the map. Players get a trimmed copy with only places linked
   to Public Notion locations; the editor gets everything plus the Location list.

   Saved shape (editor):
     party:        { x, y } or null
     pins:         [{ id, notionId, type, x, y, note, workingName }]
     islandLabels: [{ id, notionId, x, y, workingName }]
     fog:          [ ...operations ]
   notionId is the Campaign Database page ID. workingName is an editor-only
   placeholder for places that aren't linked yet; players never receive it.

   Player shape: places arrive already joined with Notion
     { id, x, y, name, url, pronunciation, aliases } (+ type, note for pins)
   ========================================================================== */
const emptyData = () => ({ party: null, pins: [], islandLabels: [], fog: [] });
const normalize = d => ({
  party: Number.isFinite(d?.party?.x) && Number.isFinite(d?.party?.y) ? { x: d.party.x, y: d.party.y } : null,
  pins: Array.isArray(d?.pins) ? d.pins : [],
  islandLabels: Array.isArray(d?.islandLabels) ? d.islandLabels : [],
  fog: Array.isArray(d?.fog) ? d.fog : [],
});

let data = emptyData();       // what's on screen
let saved = emptyData();      // editor: the last version the worker confirmed
let serverVersion = 0;        // editor: version of `saved` on the worker
let locations = new Map();    // editor: notionId -> { id, name, url, public, pronunciation, aliases }
let islandLabelEntries = [];
let notionError = null;       // editor: last Notion sync problem reported by the worker

const undoStack = { past: [], future: [] };
const HISTORY_LIMIT = 200;

// Every edit goes through change() so it can be undone
function change(mutate, options) {
  undoStack.past.push(JSON.stringify(data));
  if (undoStack.past.length > HISTORY_LIMIT) undoStack.past.shift();
  undoStack.future = [];
  mutate();
  commit(options);
}

function undo() {
  if (!undoStack.past.length) return;
  undoStack.future.push(JSON.stringify(data));
  data = JSON.parse(undoStack.past.pop());
  commit();
}

function redo() {
  if (!undoStack.future.length) return;
  undoStack.past.push(JSON.stringify(data));
  data = JSON.parse(undoStack.future.pop());
  commit();
}

// Redraw, and in the editor queue an autosave. rebuildFog is skipped when the fog canvas is already current.
function commit({ rebuildFog = true } = {}) {
  if (EDIT) saver.schedule();
  if (rebuildFog && CONFIG.fog.enabled) Fog.rebuild(data.fog);
  renderPlaces();
  editPanel?.update();
}

/* ---- Talking to the worker ---- */
function storageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function storageSet(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function getEditKey(ask = false) {
  let key = ask ? null : storageGet(EDIT_KEY_STORAGE);
  if (!key) {
    key = (prompt('Enter the map edit key') || '').trim();
    if (key) storageSet(EDIT_KEY_STORAGE, key);
  }
  return key || null;
}

async function api(path, { method = 'GET', body, auth = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) headers.Authorization = `Bearer ${getEditKey()}`;
  const res = await fetch(CONFIG.api.replace(/\/$/, '') + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(payload.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return payload;
}

// Editor requests: if the key is rejected, ask for it once and retry
async function editorApi(path, options = {}) {
  try {
    return await api(path, { ...options, auth: true });
  } catch (err) {
    if (err.status !== 401) throw err;
    storageSet(EDIT_KEY_STORAGE, null);
    if (!getEditKey(true)) throw err;
    return api(path, { ...options, auth: true });
  }
}

/* ---- Autosave ----
   Edits are saved as whole-map snapshots, but only after things settle:
   a save waits until 1.5s after the last edit (and never more than 10s after
   the first), so a burst of brush strokes or drags becomes one request.
   Forms only change data when you press Save, so typing never triggers saves.
   Unsaved changes are also kept in this browser until the worker confirms them. */
const saver = (() => {
  const DEBOUNCE_MS = 1500, MAX_WAIT_MS = 10000;
  let timer = null, firstEditAt = 0, inFlight = false, retryMs = 2000;
  let status = 'saved', message = '';

  const dirty = () => !same(data, saved);
  const set = (s, msg = '') => { status = s; message = msg; editPanel?.update(); };
  const backup = () => storageSet(UNSAVED_KEY, dirty() ? JSON.stringify({ baseVersion: serverVersion, data }) : null);

  function schedule() {
    backup();
    if (status === 'conflict') return;
    if (!dirty()) {
      clearTimeout(timer);
      timer = null;
      firstEditAt = 0;
      if (!inFlight) set('saved');
      return;
    }
    const now = Date.now();
    if (!firstEditAt) firstEditAt = now;
    clearTimeout(timer);
    timer = setTimeout(flush, Math.max(0, Math.min(DEBOUNCE_MS, firstEditAt + MAX_WAIT_MS - now)));
    if (!inFlight) set('pending');
  }

  async function flush() {
    clearTimeout(timer);
    timer = null;
    if (inFlight || status === 'conflict' || !dirty()) return;
    firstEditAt = 0;
    inFlight = true;
    const snapshot = structuredClone(data);
    set('saving');
    try {
      const res = await editorApi('/map', { method: 'PUT', body: { baseVersion: serverVersion, data: snapshot } });
      serverVersion = res.version;
      saved = snapshot;
      retryMs = 2000;
      backup();
      set(dirty() ? 'pending' : 'saved');
    } catch (err) {
      if (err.status === 409) {
        set('conflict', 'The map was saved from another tab or device. Reload to get the latest; your version is kept as a backup in this browser.');
      } else {
        set('error', `Couldn't save (${err.message}). Retrying in ${Math.round(retryMs / 1000)}s.`);
        timer = setTimeout(flush, retryMs);
        retryMs = Math.min(retryMs * 2, 60000);
      }
    } finally {
      inFlight = false;
      if (dirty() && status === 'pending') schedule();   // edits made while this save was in flight
    }
  }

  return {
    schedule,
    flush,
    dirty,
    get status() { return status; },
    get message() { return message; },
    fail(msg) { set('error', msg); },
  };
})();

/* ---- Loading ---- */
const nameKey = s => String(s || '').normalize('NFKD').replace(/[\u2018\u2019\u201C\u201D"']/g, '')
  .replace(/\s+/g, ' ').trim().toLowerCase();

// Older places.json entries stored names instead of Notion IDs. Link exact name matches;
// keep anything else as an unlinked place with its old name as the working name.
function migrateLegacy(d) {
  const byName = new Map([...locations.values()].map(l => [nameKey(l.name), l.id]));
  const fix = place => {
    const out = { ...place };
    if (!out.notionId && out.name) {
      const match = byName.get(nameKey(out.name));
      if (match) out.notionId = match;
      else out.workingName = out.workingName || out.name;
    }
    out.notionId = out.notionId || null;
    delete out.name;
    delete out.link;
    delete out.visibility;
    return out;
  };
  return { ...d, pins: d.pins.map(fix), islandLabels: d.islandLabels.map(fix) };
}

async function loadEditor() {
  const res = await editorApi('/editor');
  locations = new Map(res.locations.map(l => [l.id, l]));
  notionError = res.syncError || null;
  serverVersion = res.map.version;
  saved = normalize(res.map.data);
  data = migrateLegacy(structuredClone(saved));

  // First run: the worker is empty, so bring in the old places.json if there is one
  if (serverVersion === 0 && !data.pins.length && !data.islandLabels.length && !data.fog.length) {
    try {
      const file = await fetch(CONFIG.placesFile, { cache: 'no-store' });
      if (file.ok) data = migrateLegacy(normalize(await file.json()));
    } catch { /* nothing to import */ }
  }

  // Changes that never made it to the worker last time
  const raw = storageGet(UNSAVED_KEY);
  if (raw) {
    try {
      const backup = JSON.parse(raw);
      const draft = normalize(backup.data);
      if (same(draft, saved)) storageSet(UNSAVED_KEY, null);
      else if (backup.baseVersion === serverVersion ||
        confirm('This browser has unsaved map changes, but the saved map has changed since.\n\nOK: load your unsaved changes (they replace the saved map).\nCancel: keep the saved map.')) {
        data = draft;
      } else {
        storageSet(UNSAVED_KEY, null);
      }
    } catch { /* unreadable backup */ }
  }
}

async function loadData() {
  try {
    if (EDIT) await loadEditor();
    else data = normalize(await api('/map'));
  } catch (err) {
    console.error(err);
    if (EDIT) saver.fail(`Couldn't load the map from the worker (${err.message}).`);
  }
  commit();
  centerOnParty();
}

// Open the map on the party. Players can pan away freely afterwards.
function centerOnParty() {
  if (!data.party) return;
  map.setView([H - data.party.y, data.party.x], fitZoom + CONFIG.party.zoomIn, { animate: false });
}

/* ==========================================================================
   Places: fixed pins + drifting island names
   ========================================================================== */

// Name, link and status of a place. Players' places arrive pre-joined; the editor joins with Notion here.
function placeInfo(place) {
  if (!EDIT) return { ...place, status: 'public' };
  const loc = place.notionId ? locations.get(place.notionId) : null;
  if (loc) return { ...loc, status: loc.public ? 'public' : 'private' };
  if (place.notionId) return { name: place.workingName || 'Missing Notion page', status: 'missing' };
  return { name: place.workingName || 'Unlinked location', status: 'unlinked' };
}

function pinIcon(pin) {
  const t = placeType(pin.type);
  const info = placeInfo(pin);
  const tag = info.status === 'public' ? '' : ` data-tag="${info.status}"`;
  const box = t.dotSize + 6;
  return L.divIcon({
    className: `place-pin${tag ? ' is-flagged' : ''}`,
    html: `<span class="dot" style="width:${t.dotSize}px;height:${t.dotSize}px;background:${t.color}"></span>` +
          `<span class="name"${tag} style="left:${box + 4}px;font-size:${t.fontSize}px">${escapeHtml(info.name)}</span>`,
    iconSize: [box, box],
    iconAnchor: [box / 2, box / 2],
    popupAnchor: [0, -box / 2],
  });
}

function labelIcon(label) {
  const info = placeInfo(label);
  const tag = info.status === 'public' ? '' : ` data-tag="${info.status}"`;
  return L.divIcon({
    className: `island-label${tag ? ' is-flagged' : ''}${!EDIT && safeUrl(info.url) ? ' has-link' : ''}`,
    html: `<span${tag}>${escapeHtml(info.name)}</span>`,
    iconSize: null,
  });
}

const partyIcon = L.divIcon({
  className: 'party-marker',
  html: '<span class="party-pulse"></span><span class="party-dot"></span>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

function renderParty() {
  partyLayer.clearLayers();
  if (!data.party) return;
  const movable = EDIT && (editor.tool === 'places' || editor.tool === 'party');
  const marker = L.marker([H - data.party.y, data.party.x], {
    pane: 'party',
    icon: partyIcon,
    title: 'The party is here',
    alt: 'The party is here',
    keyboard: false,
    interactive: movable,
    draggable: movable,
  });
  if (movable) {
    marker.on('dragend', () => {
      const ll = clampLatLng(marker.getLatLng());
      change(() => { data.party = { x: Math.round(ll.lng), y: Math.round(H - ll.lat) }; }, { rebuildFog: false });
    });
  }
  marker.addTo(partyLayer);
}

// What players see when they click a place, e.g. "City・(New Shey-gaas)"
function viewPopup(place, kindLabel) {
  const info = placeInfo(place);
  const el = document.createElement('div');

  const name = document.createElement('div');
  name.className = 'popup-name';
  name.textContent = info.name;

  const kind = document.createElement('div');
  kind.className = 'popup-kind';
  kind.textContent = info.pronunciation ? `${kindLabel}・(${info.pronunciation})` : kindLabel;
  el.append(name, kind);

  if (info.aliases) {
    const aliases = document.createElement('div');
    aliases.className = 'popup-aliases';
    aliases.textContent = `Also known as ${info.aliases}`;
    el.append(aliases);
  }
  if (place.note) {
    const note = document.createElement('p');
    note.className = 'popup-note';
    note.textContent = place.note;
    el.append(note);
  }
  const href = safeUrl(info.url);
  if (href) {
    const link = document.createElement('a');
    link.className = 'popup-link';
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Open location page ↗';
    el.append(link);
  }
  return el;
}

function renderPlaces() {
  map.closePopup();
  renderParty();
  pinLayer.clearLayers();
  islandLabelLayer.clearLayers();
  islandLabelEntries = [];
  const editingPlaces = EDIT && editor.tool === 'places';

  data.pins.forEach(pin => {
    // Players only receive public places; also skip any still under the fog
    if (!EDIT && CONFIG.fog.enabled && !Fog.isRevealed(pin.x, pin.y)) return;

    const marker = L.marker([H - pin.y, pin.x], {
      pane: 'pins',
      icon: pinIcon(pin),
      interactive: !EDIT || editingPlaces,
      draggable: editingPlaces,
    });
    if (editingPlaces) {
      marker.on('dragend', () => {
        const ll = clampLatLng(marker.getLatLng());
        change(() => {
          pin.x = Math.round(ll.lng);
          pin.y = Math.round(H - ll.lat);
        }, { rebuildFog: false });
      });
      marker.on('click', () => openEditPopup(marker, pin, 'pins'));
    } else if (!EDIT) {
      marker.bindPopup(() => viewPopup(pin, placeType(pin.type).label));
    }
    marker.addTo(pinLayer);
  });

  data.islandLabels.forEach(label => {
    const playerLink = !EDIT && safeUrl(label.url);
    const marker = L.marker([H - label.y, label.x], {
      pane: 'labels',
      interactive: editingPlaces || !!playerLink,
      draggable: editingPlaces,
      keyboard: false,
      icon: labelIcon(label),
    });
    if (playerLink) {
      // Island names drift, so check the fog where the name is right now
      marker.on('click', () => {
        const ll = marker.getLatLng();
        if (CONFIG.fog.enabled && !Fog.isRevealed(ll.lng, H - ll.lat)) return;
        L.popup().setLatLng(ll).setContent(viewPopup(label, 'Island')).openOn(map);
      });
    }
    const entry = { place: label, marker, dragging: false };
    if (editingPlaces) {
      marker.on('dragstart', () => { entry.dragging = true; });
      marker.on('dragend', () => {
        entry.dragging = false;
        const ll = clampLatLng(marker.getLatLng());
        change(() => {
          label.x = Math.round(wrap01(ll.lng / W + state.islands) * W);   // screen spot -> islands image spot
          label.y = Math.round(H - ll.lat);
        }, { rebuildFog: false });
      });
      marker.on('click', () => openEditPopup(marker, label, 'islandLabels'));
    }
    islandLabelEntries.push(entry);
    marker.addTo(islandLabelLayer);
  });
}

/* ==========================================================================
   Speed + pause control
   ========================================================================== */
const DriftControl = L.Control.extend({
  options: { position: 'bottomleft' },
  onAdd() {
    const panel = L.DomUtil.create('div', 'drift-panel');
    panel.innerHTML = `
      <button type="button" class="play" aria-label="Pause drift"></button>
      <label>Drift speed
        <input type="range" min="0" max="${CONFIG.maxSpeed}" step="0.05" value="${state.speed}">
        <output></output>
      </label>`;
    L.DomEvent.disableClickPropagation(panel);
    L.DomEvent.disableScrollPropagation(panel);

    const button = panel.querySelector('button');
    const slider = panel.querySelector('input');
    const readout = panel.querySelector('output');

    const render = () => {
      button.textContent = state.paused ? '▶' : '❚❚';
      button.setAttribute('aria-label', state.paused ? 'Resume drift' : 'Pause drift');
      readout.textContent = `${state.speed.toFixed(2)}×`;
    };
    button.addEventListener('click', () => { state.paused = !state.paused; render(); });
    slider.addEventListener('input', () => { state.speed = parseFloat(slider.value); render(); });
    document.addEventListener('keydown', e => {
      const tag = document.activeElement.tagName;
      if (e.code === 'Space' && !['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(tag)) {
        e.preventDefault();
        button.click();
      }
    });
    render();
    return panel;
  },
});
new DriftControl().addTo(map);

/* ==========================================================================
   Edit mode (open the page with ?edit on the URL)
   ========================================================================== */
const editor = {
  tool: 'places',              // 'places' | 'party' | 'reveal' | 'hide'
  shape: 'brush',              // 'brush' | 'rect' | 'ellipse' | 'lasso'
  size: CONFIG.fog.brushSize,
  feather: CONFIG.fog.softness,
  showPlayerFog: false,
};
let editPanel = null;
let lastType = 'pin';
let lastKind = placeTypeKey(DEFAULT_PLACE_TYPE);

/* ---- Notion location picker ----
   A searchable dropdown (combobox). By default it lists only locations that
   aren't on the map yet; a checkbox brings the linked ones back.
   Type to filter by name or alias; arrows + Enter or the mouse to pick. */
let pickerCount = 0;
const PICKER_LIMIT = 50;   // rows rendered at once; typing narrows the rest

function locationPicker(currentPlace, onChange) {
  const uid = `loc-picker-${++pickerCount}`;
  const root = document.createElement('div');
  root.className = 'loc-picker';
  root.innerHTML = `
    <label for="${uid}-input">Notion location</label>
    <div class="combo">
      <input id="${uid}-input" class="combo-input" type="text" role="combobox"
        aria-autocomplete="list" aria-expanded="false" aria-controls="${uid}-list"
        autocomplete="off" spellcheck="false" placeholder="Not linked yet · type to search">
      <ul id="${uid}-list" class="combo-list" role="listbox" hidden></ul>
    </div>
    <label class="inline"><input type="checkbox" data-include-linked> Include places already on the map</label>
    <div class="loc-tags" data-tags></div>`;

  const input = root.querySelector('.combo-input');
  const list = root.querySelector('.combo-list');
  const includeLinked = root.querySelector('[data-include-linked]');
  const tags = root.querySelector('[data-tags]');

  let selected = currentPlace?.notionId || null;
  let query = '';
  let shown = [];
  let active = -1;

  const onMapElsewhere = id =>
    [...data.pins, ...data.islandLabels].some(p => p !== currentPlace && p.notionId === id);
  const labelFor = id => (id ? locations.get(id)?.name || 'Missing Notion page' : '');

  function matches() {
    const q = nameKey(query);
    return [...locations.values()].filter(loc =>
      (includeLinked.checked || loc.id === selected || !onMapElsewhere(loc.id)) &&
      (!q || nameKey(loc.name).includes(q) || nameKey(loc.aliases).includes(q)));
  }

  function row(text, className) {
    const li = document.createElement('li');
    li.className = className;
    li.textContent = text;
    return li;
  }

  function render() {
    const found = matches();
    shown = [{ id: null, name: 'Not linked yet' }, ...found.slice(0, PICKER_LIMIT)];
    list.replaceChildren();
    shown.forEach((opt, i) => {
      const li = row(opt.name, `combo-option${opt.id ? '' : ' is-none'}`);
      li.id = `${uid}-opt-${i}`;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(opt.id === selected));
      if (opt.id && onMapElsewhere(opt.id)) {
        const tag = document.createElement('span');
        tag.className = 'tag tag-muted';
        tag.textContent = 'on map';
        li.append(tag);
      }
      // pointerdown + preventDefault keeps focus in the input, so the list doesn't close first
      li.addEventListener('pointerdown', e => { e.preventDefault(); choose(opt.id); });
      list.append(li);
    });
    if (!found.length) list.append(row(query ? 'No matching locations' : 'Every location is already on the map', 'combo-note'));
    if (found.length > PICKER_LIMIT) list.append(row(`${found.length - PICKER_LIMIT} more · keep typing to narrow it down`, 'combo-note'));
    setActive(clamp(active, 0, shown.length - 1));
  }

  function setActive(i) {
    active = i;
    list.querySelectorAll('.combo-option').forEach((li, n) => li.classList.toggle('is-active', n === i));
    const li = list.querySelector(`#${uid}-opt-${i}`);
    if (li) {
      input.setAttribute('aria-activedescendant', li.id);
      li.scrollIntoView({ block: 'nearest' });
    }
  }

  function open() {
    if (!list.hidden) return;
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    active = -1;
    render();
    setActive(Math.max(0, shown.findIndex(o => o.id === selected)));
  }

  function close() {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    query = '';
    input.value = labelFor(selected);
  }

  function choose(id) {
    selected = id;
    close();
    renderTags();
    onChange(id);
  }

  function renderTags() {
    tags.replaceChildren();
    const add = (text, cls) => {
      const s = document.createElement('span');
      s.className = `tag ${cls}`;
      s.textContent = text;
      tags.append(s);
    };
    if (!selected) return add('Not linked', 'tag-muted');
    const loc = locations.get(selected);
    if (!loc) return add('Missing in Notion', 'tag-warn');
    add(loc.public ? 'Public' : 'Private', loc.public ? 'tag-public' : 'tag-private');
    if (onMapElsewhere(selected)) add('Also on map', 'tag-muted');
    const href = safeUrl(loc.url);
    if (href) {
      const a = document.createElement('a');
      a.className = 'loc-open';
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = 'Open in Notion ↗';
      tags.append(a);
    }
  }

  input.addEventListener('focus', () => input.select());
  input.addEventListener('click', open);
  input.addEventListener('blur', close);
  input.addEventListener('input', () => {
    query = input.value;
    if (list.hidden) open();
    active = shown.length > 1 ? 1 : 0;   // jump to the first real match while typing
    render();
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (list.hidden) open();
      else setActive(Math.min(active + 1, shown.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!list.hidden) setActive(Math.max(active - 1, 0));
    } else if (e.key === 'Enter' && !list.hidden) {
      e.preventDefault();   // pick instead of submitting the form
      choose(shown[active] ? shown[active].id : selected);
    } else if (e.key === 'Escape' && !list.hidden) {
      e.preventDefault();
      e.stopPropagation();  // close the list, not the popup
      close();
    }
  });
  includeLinked.addEventListener('change', () => { input.focus(); open(); render(); });

  input.value = labelFor(selected);
  renderTags();
  return { root, input, get value() { return selected; } };
}

function placeForm({ heading, place, isPin, allowType, onSave, onDelete }) {
  const kindOptions = Object.entries(PLACE_TYPES)
    .map(([key, t]) => `<option value="${escapeHtml(key)}">${escapeHtml(t.label)}</option>`).join('');

  const form = document.createElement('form');
  form.className = 'place-form';
  form.innerHTML = `
    <h3></h3>
    <div data-picker></div>
    <label class="unlinked-only">Working name <input type="text" name="workingName" autocomplete="off" placeholder="Optional, editor only"></label>
    ${allowType ? `
      <fieldset>
        <label><input type="radio" name="type" value="pin"> Fixed pin on the map</label>
        <label><input type="radio" name="type" value="island"> Island name (drifts)</label>
      </fieldset>` : ''}
    <label class="pin-only">Kind <select name="kind">${kindOptions}</select></label>
    <label class="pin-only">Map description <textarea name="note" rows="3"></textarea></label>
    <div class="row">
      <button type="submit" class="btn primary">Save</button>
      ${onDelete ? '<button type="button" class="btn danger" data-delete>Delete</button>' : ''}
    </div>`;

  form.querySelector('h3').textContent = heading;
  const picker = locationPicker(place.id ? place : null, () => sync());
  form.querySelector('[data-picker]').replaceWith(picker.root);
  form.elements.workingName.value = place.workingName || '';
  form.elements.note.value = place.note || '';
  form.elements.kind.value = place.type ? placeTypeKey(place.type) : lastKind;

  const currentType = () => (allowType ? form.elements.type.value : (isPin ? 'pin' : 'island'));
  const sync = () => {
    form.querySelectorAll('.pin-only').forEach(el => { el.hidden = currentType() !== 'pin'; });
    form.querySelector('.unlinked-only').hidden = !!picker.value;
  };
  if (allowType) {
    form.elements.type.value = lastType;
    form.querySelectorAll('input[name=type]').forEach(r => r.addEventListener('change', sync));
  }
  sync();

  form.addEventListener('submit', e => {
    e.preventDefault();
    onSave({
      notionId: picker.value,
      workingName: form.elements.workingName.value.trim(),
      note: form.elements.note.value.trim(),
      kind: form.elements.kind.value,
      type: currentType(),
    });
  });
  form.querySelector('[data-delete]')?.addEventListener('click', onDelete);
  L.DomEvent.disableClickPropagation(form);
  L.DomEvent.disableScrollPropagation(form);
  return form;
}

function openPopup(latlng, form) {
  L.popup({ minWidth: 230, maxWidth: 270 }).setLatLng(latlng).setContent(form).openOn(map);
  setTimeout(() => form.querySelector('.combo-input').focus(), 0);
}

function openAddPopup(latlng) {
  // Capture where this spot is on the islands image right now, in case the drift is running
  const islandX = wrap01(latlng.lng / W + state.islands) * W;
  const y = Math.round(H - latlng.lat);

  openPopup(latlng, placeForm({
    heading: 'New place',
    place: {},
    allowType: true,
    onSave: ({ notionId, workingName, note, kind, type }) => {
      lastType = type;
      change(() => {
        if (type === 'island') {
          data.islandLabels.push({ id: newId(), notionId, x: Math.round(islandX), y, workingName });
        } else {
          lastKind = kind;
          data.pins.push({ id: newId(), notionId, type: kind, x: Math.round(latlng.lng), y, note, workingName });
        }
      }, { rebuildFog: false });
    },
  }));
}

function openEditPopup(marker, place, listKey) {
  const isPin = listKey === 'pins';
  openPopup(marker.getLatLng(), placeForm({
    heading: isPin ? 'Edit pin' : 'Edit island name',
    place,
    isPin,
    allowType: false,
    onSave: ({ notionId, workingName, note, kind }) => {
      change(() => {
        place.notionId = notionId;
        place.workingName = workingName;
        if (isPin) {
          place.note = note;
          place.type = kind;
          lastKind = kind;
        }
      }, { rebuildFog: false });
    },
    onDelete: () => {
      if (!confirm(`Delete "${placeInfo(place).name}" from the map? (The Notion page isn't touched.)`)) return;
      change(() => { data[listKey] = data[listKey].filter(p => p.id !== place.id); }, { rebuildFog: false });
    },
  }));
}

function setTool(tool) {
  editor.tool = tool;
  map.closePopup();
  const fogTool = isFogTool(tool);
  if (fogTool) { map.dragging.disable(); map.boxZoom.disable(); }
  else { map.dragging.enable(); map.boxZoom.enable(); }
  container.classList.toggle('fog-tool', fogTool);
  container.style.touchAction = fogTool ? 'none' : '';
  renderPlaces();
  editPanel?.update();
  updateBrushCursor();
}

/* ---- Fog drawing ---- */
const brushCursor = L.DomUtil.create('div', 'brush-cursor', container);
let lastPointer = null;
let drawing = null;   // { op, start } while a fog stroke or shape is in progress

function updateBrushCursor(e = lastPointer) {
  const show = EDIT && e && isFogTool(editor.tool) && editor.shape === 'brush';
  if (!show) { brushCursor.style.display = 'none'; return; }
  const rect = container.getBoundingClientRect();
  const d = editor.size * Math.pow(2, map.getZoom());   // map pixels -> screen pixels in CRS.Simple
  Object.assign(brushCursor.style, {
    display: 'block',
    width: `${d}px`,
    height: `${d}px`,
    left: `${e.clientX - rect.left - d / 2}px`,
    top: `${e.clientY - rect.top - d / 2}px`,
  });
}

function imagePoint(e) {
  const ll = map.mouseEventToLatLng(e);
  return [Math.round(clamp(ll.lng, 0, W)), Math.round(clamp(H - ll.lat, 0, H))];
}

const isOnUi = e => e.target.closest('.leaflet-control, .leaflet-popup');

function startDrawing(e) {
  if (!isFogTool(editor.tool) || e.button !== 0 || isOnUi(e)) return;
  e.preventDefault();
  e.stopPropagation();
  container.setPointerCapture(e.pointerId);

  const p = imagePoint(e);
  const op = { mode: editor.tool, shape: editor.shape, feather: editor.feather };
  if (op.shape === 'brush') Object.assign(op, { size: editor.size, points: [p] });
  else if (op.shape === 'lasso') op.points = [p];
  else Object.assign(op, { x: p[0], y: p[1], w: 0, h: 0 });

  drawing = { op, start: p };
  if (op.shape === 'brush') Fog.preview(op, 0);
}

function continueDrawing(e) {
  lastPointer = e;
  updateBrushCursor(e);
  if (!drawing) return;

  const p = imagePoint(e);
  const { op, start } = drawing;
  if (op.shape === 'brush' || op.shape === 'lasso') {
    const prev = op.points[op.points.length - 1];
    const minStep = op.shape === 'brush' ? Math.max(3, op.size * 0.12) : 4;
    if (Math.hypot(p[0] - prev[0], p[1] - prev[1]) < minStep) return;
    op.points.push(p);
    Fog.preview(op, op.points.length - 1);
  } else {
    op.x = Math.min(start[0], p[0]);
    op.y = Math.min(start[1], p[1]);
    op.w = Math.abs(p[0] - start[0]);
    op.h = Math.abs(p[1] - start[1]);
    Fog.preview(op);
  }
}

function finishDrawing(e) {
  if (!drawing) return;
  const { op } = drawing;
  drawing = null;

  const valid = op.shape === 'brush' ? op.points.length > 0
    : op.shape === 'lasso' ? op.points.length >= 3
    : op.w >= 4 && op.h >= 4;
  if (!valid || e.type === 'pointercancel') { Fog.cancel(); return; }

  Fog.keep();
  change(() => data.fog.push(op), { rebuildFog: false });
}

if (EDIT) {
  container.classList.add('editing');

  // Save right away when the tab is hidden, and warn before closing with unsaved changes
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saver.flush();
  });
  window.addEventListener('beforeunload', e => {
    if (saver.dirty()) { e.preventDefault(); e.returnValue = ''; }
  });

  // A click that only closes an open popup shouldn't also start a new place
  let lastPopupClose = 0;
  map.on('popupclose', () => { lastPopupClose = performance.now(); });
  map.on('click', e => {
    if (isFogTool(editor.tool) || performance.now() - lastPopupClose < 300) return;
    const { lat, lng } = e.latlng;
    if (lat < 0 || lat > H || lng < 0 || lng > W) return;
    if (editor.tool === 'party') {
      change(() => { data.party = { x: Math.round(lng), y: Math.round(H - lat) }; }, { rebuildFog: false });
    } else {
      openAddPopup(e.latlng);
    }
  });

  if (CONFIG.fog.enabled) {
    container.addEventListener('pointerdown', startDrawing, true);
    container.addEventListener('pointermove', continueDrawing);
    container.addEventListener('pointerup', finishDrawing);
    container.addEventListener('pointercancel', finishDrawing);
    container.addEventListener('pointerleave', () => { if (!drawing) brushCursor.style.display = 'none'; });
    map.on('zoom', () => updateBrushCursor());
  }

  document.addEventListener('keydown', e => {
    const el = document.activeElement;
    if ((el.tagName === 'INPUT' && el.type === 'text') || el.tagName === 'TEXTAREA') return;
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if ((key === 'z' && e.shiftKey) || key === 'y') { e.preventDefault(); redo(); }
  });

  const HELP = {
    places: 'Click the map to add a place. Drag one to move it, or click it to rename or delete.',
    party: 'Click the map to put the party there, or drag the marker. The map opens centered on it.',
    reveal: 'Drag on the map to clear fog. Switch to Places to pan the map.',
    hide: 'Drag on the map to cover an area with fog again.',
  };

  const EditControl = L.Control.extend({
    options: { position: 'topleft' },
    onAdd() {
      const panel = L.DomUtil.create('div', 'edit-panel');
      panel.innerHTML = `
        <h2>Editor</h2>
        <div class="seg" role="group" aria-label="Tool">
          <button type="button" class="btn" data-tool="places">Places</button>
          <button type="button" class="btn" data-tool="party">Party</button>
          ${CONFIG.fog.enabled ? `
          <button type="button" class="btn" data-tool="reveal">Reveal</button>
          <button type="button" class="btn" data-tool="hide">Hide</button>` : ''}
        </div>
        <p class="muted" data-help></p>
        <div class="row" data-party-options>
          <button type="button" class="btn danger" data-party-clear>Remove party marker</button>
        </div>

        <div data-fog-options>
          <div class="seg" role="group" aria-label="Shape" style="margin-bottom:9px">
            <button type="button" class="btn" data-shape="brush">Brush</button>
            <button type="button" class="btn" data-shape="rect">Box</button>
            <button type="button" class="btn" data-shape="ellipse">Oval</button>
            <button type="button" class="btn" data-shape="lasso">Lasso</button>
          </div>
          <label class="slider" data-size-row>Brush size <output data-size-out></output>
            <input type="range" min="20" max="600" step="5" data-size>
          </label>
          <label class="slider">Edge softness <output data-feather-out></output>
            <input type="range" min="0" max="150" step="1" data-feather>
          </label>
        </div>

        <div class="row">
          <button type="button" class="btn" data-undo title="Ctrl/Cmd + Z">Undo</button>
          <button type="button" class="btn" data-redo title="Ctrl/Cmd + Shift + Z">Redo</button>
          ${CONFIG.fog.enabled ? '<button type="button" class="btn danger" data-fog-all>Fog everything</button>' : ''}
        </div>
        ${CONFIG.fog.enabled ? '<label class="check"><input type="checkbox" data-player-fog> Show fog as players see it</label>' : ''}

        <hr>
        <p data-count></p>
        <p class="muted" data-status role="status"></p>
        <p class="notion-error" data-notion-error role="alert"></p>
        <div class="row">
          <button type="button" class="btn" data-sync>Sync from Notion</button>
          <button type="button" class="btn" data-backup>Download backup</button>
        </div>`;
      L.DomEvent.disableClickPropagation(panel);
      L.DomEvent.disableScrollPropagation(panel);
      L.DomEvent.on(panel, 'pointerdown', L.DomEvent.stopPropagation);

      const $ = sel => panel.querySelector(sel);

      panel.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
      panel.querySelectorAll('[data-shape]').forEach(b => b.addEventListener('click', () => {
        editor.shape = b.dataset.shape;
        this.update();
      }));

      const size = $('[data-size]'), feather = $('[data-feather]');
      size.value = editor.size;
      feather.value = editor.feather;
      size.addEventListener('input', () => { editor.size = +size.value; this.update(); });
      feather.addEventListener('input', () => { editor.feather = +feather.value; this.update(); });

      $('[data-party-clear]').addEventListener('click', () => {
        change(() => { data.party = null; }, { rebuildFog: false });
      });
      $('[data-undo]').addEventListener('click', undo);
      $('[data-redo]').addEventListener('click', redo);
      $('[data-fog-all]')?.addEventListener('click', () => {
        change(() => data.fog.push({ mode: 'hide', shape: 'all' }));
      });
      $('[data-player-fog]')?.addEventListener('change', e => {
        editor.showPlayerFog = e.target.checked;
        fogLayer.setOpacity(editor.showPlayerFog ? CONFIG.fog.opacity : CONFIG.fog.editorOpacity);
      });

      const syncBtn = $('[data-sync]');
      syncBtn.addEventListener('click', async () => {
        syncBtn.disabled = true;
        syncBtn.textContent = 'Syncing…';
        try {
          const res = await editorApi('/sync', { method: 'POST' });
          locations = new Map(res.locations.map(l => [l.id, l]));
          notionError = null;
          renderPlaces();
          syncBtn.textContent = `Synced ${res.locations.length}`;
        } catch (err) {
          notionError = err.message;
          syncBtn.textContent = 'Sync failed';
          console.error(err);
        }
        setTimeout(() => { syncBtn.textContent = 'Sync from Notion'; syncBtn.disabled = false; }, 1500);
        this.update();
      });

      $('[data-backup]').addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `map-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      });

      const STATUS_TEXT = {
        saved: 'All changes saved.',
        pending: 'Unsaved changes…',
        saving: 'Saving…',
      };

      this.update = () => {
        panel.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-pressed', b.dataset.tool === editor.tool));
        panel.querySelectorAll('[data-shape]').forEach(b => b.setAttribute('aria-pressed', b.dataset.shape === editor.shape));
        $('[data-help]').textContent = HELP[editor.tool];
        $('[data-fog-options]').hidden = !isFogTool(editor.tool);
        $('[data-party-options]').hidden = editor.tool !== 'party';
        $('[data-party-clear]').disabled = !data.party;
        $('[data-size-row]').hidden = editor.shape !== 'brush';
        $('[data-size-out]').textContent = editor.size;
        $('[data-feather-out]').textContent = editor.feather;
        $('[data-undo]').disabled = !undoStack.past.length;
        $('[data-redo]').disabled = !undoStack.future.length;

        const places = [...data.pins, ...data.islandLabels];
        const count = s => places.filter(p => placeInfo(p).status === s).length;
        const flags = [
          count('unlinked') && `${count('unlinked')} unlinked`,
          count('private') && `${count('private')} private`,
          count('missing') && `${count('missing')} missing in Notion`,
        ].filter(Boolean);
        const p = data.pins.length, l = data.islandLabels.length;
        $('[data-count]').textContent =
          `${p} ${p === 1 ? 'pin' : 'pins'}, ${l} island ${l === 1 ? 'name' : 'names'}` +
          (flags.length ? ` (${flags.join(', ')})` : '') + `. ${locations.size} Notion locations.`;

        $('[data-status]').textContent = STATUS_TEXT[saver.status] || saver.message;
        $('[data-notion-error]').hidden = !notionError;
        $('[data-notion-error]').textContent = notionError ? `Notion sync failed: ${notionError}` : '';
      };
      return panel;
    },
  });
  editPanel = new EditControl().addTo(map);
  editPanel.update();
}

/* ==========================================================================
   Animation loop (time-based, so speed is the same at any frame rate)
   ========================================================================== */
const EDGE_FADE = 0.03; // island names fade out within this fraction of the map edge

let last = performance.now();
function tick(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;

  if (!state.paused && state.speed > 0) {
    state.islands = wrap01(state.islands + CONFIG.islands.direction * state.speed * dt / CONFIG.islands.loopSeconds);
    state.clouds  = wrap01(state.clouds  + CONFIG.clouds.direction  * state.speed * dt / CONFIG.clouds.loopSeconds);
  }

  islands.setProgress(state.islands);
  clouds.setProgress(state.clouds);

  islandLabelEntries.forEach(({ place, marker, dragging }) => {
    if (dragging) return;
    const nx = wrap01(place.x / W - state.islands);     // current position, 0..1 across the map
    marker.setLatLng([H - place.y, nx * W]);
    const fade = Math.min(1, Math.min(nx, 1 - nx) / EDGE_FADE);
    marker.setOpacity(EDIT ? Math.max(0.4, fade) : fade);
  });

  requestAnimationFrame(tick);
}

loadData();
requestAnimationFrame(tick);