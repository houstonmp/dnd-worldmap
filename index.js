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

  search: {
    zoomIn: 1.5,               // when jumping to a place, zoom at least this far past the full-map view
  },

  api: 'https://dnd-world-map-api.houston-mp.workers.dev',   // the map worker
  placesFile: 'places.json',   // only read once: imported the first time the editor finds the worker empty

  startSpeed: 1,               // speed multiplier on load
  maxSpeed: 3,                 // top of the speed slider
  scrollWheelZoom: false,      // false plays nicer inside a Notion embed
};

/* ==========================================================================
   PLACE_TYPES: the starting set of pin kinds. Once you save place types from
   the editor's Settings (gear icon), those are stored with the map and used
   instead, for players too. dotSize and fontSize are in screen pixels.
   ========================================================================== */
const PLACE_TYPES = {
  continent: { label: 'Continent', color: '#3f6f8f', dotSize: 14, fontSize: 22 },
  empire:    { label: 'Empire',    color: '#8e2f3f', dotSize: 13, fontSize: 20 },
  city:      { label: 'City',      color: '#b8893a', dotSize: 10, fontSize: 16 },
  town:      { label: 'Town',      color: '#4f7a4a', dotSize: 8,  fontSize: 14 },
  hamlet:    { label: 'Hamlet',    color: '#9a9ea3', dotSize: 6,  fontSize: 13 },
};
const DEFAULT_PLACE_TYPE = 'town';   // starting default for new pins (changeable in Settings)

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
// Three ways to open the map:
//   (no param)  Player view: the real thing, public places only, no key needed
//   ?dm         DM view: every place, DM page links, session links, initiative tracker
//               (edit key required; ?preview still works as an older name for it)
//   ?edit       Editor (edit key required)
const PARAMS = new URLSearchParams(location.search);
const EDIT = PARAMS.has('edit');
const DMVIEW = !EDIT && (PARAMS.has('dm') || PARAMS.has('preview'));
const PLAYER_FOG = !EDIT && !DMVIEW;   // only real players have places hidden by the fog
const EDIT_KEY_STORAGE = 'dnd-map:edit-key';
const UNSAVED_KEY = 'dnd-map:unsaved';

const wrap01 = v => ((v % 1) + 1) % 1;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clampLatLng = ll => L.latLng(clamp(ll.lat, 0, H), clamp(ll.lng, 0, W));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Place types: the list saved in Settings, or the starting set from PLACE_TYPES
const STARTING_PLACE_TYPES = Object.entries(PLACE_TYPES).map(([key, t]) => ({ key, ...t }));
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
function placeTypes() {
  const saved = data.settings?.placeTypes;
  return Array.isArray(saved) && saved.length ? saved : STARTING_PLACE_TYPES;
}
function defaultPlaceType() {
  const types = placeTypes();
  return types.find(t => t.key === data.settings?.defaultPlaceType) ||
    types.find(t => t.key === DEFAULT_PLACE_TYPE) || types[0];
}
const placeType = key => placeTypes().find(t => t.key === key) || defaultPlaceType();
const placeTypeKey = key => (placeTypes().some(t => t.key === key) ? key : defaultPlaceType().key);
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
const islandLabelLayer = L.layerGroup().addTo(map);   // places on sky islands (they drift)
const partyLayer = L.layerGroup().addTo(map);   // always shown, so it's not in the layers menu

map.fitBounds(bounds);
const fitZoom = map.getZoom();
map.setMinZoom(map.getZoom() - 0.5);
map.setMaxBounds(L.latLngBounds(bounds).pad(0.15));

// Fog is deliberately left out of this menu so players can't turn it off
const layersControl = L.control.layers(null, {
  'Drifting isles': islands,
  'Sky island places': islandLabelLayer,
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
  // The DM view can switch the players' fog off; players never get this toggle
  if (DMVIEW) layersControl.addOverlay(fogLayer, 'Fog of war');
}

/* ==========================================================================
   Data
   The worker stores the map. Players get a trimmed copy with only places linked
   to Public Notion locations; the editor gets everything plus the Location list.

   Saved shape (editor):
     party:        { x, y } or null
     pins:         [{ id, notionId, type, x, y, note, workingName, subLocations: [notionId], drifts }]
       drifts: true = the place is on a sky island and moves with it; its x is
       measured on the islands image instead of the base map. Everything else
       about a drifting place is identical to a fixed one.
     islandLabels: [] (older format; converted into drifting pins on load)
     fog:          [ ...operations ]
   notionId is the Campaign Database page ID. workingName is an editor-only
   placeholder for places that aren't linked yet; players never receive it.

   Player shape: places arrive already joined with Notion
     { id, x, y, name, url, pronunciation, aliases } (+ type, note, subLocations for pins)
   Pins' subLocations arrive as [{ id, name, url, pronunciation }], public ones only.
   ========================================================================== */
const emptyData = () => ({ party: null, pins: [], islandLabels: [], fog: [], settings: {} });
const normalize = d => ({
  settings: d?.settings && typeof d.settings === 'object' && !Array.isArray(d.settings) ? d.settings : {},
  party: Number.isFinite(d?.party?.x) && Number.isFinite(d?.party?.y) ? { x: d.party.x, y: d.party.y } : null,
  pins: Array.isArray(d?.pins) ? d.pins : [],
  islandLabels: Array.isArray(d?.islandLabels) ? d.islandLabels : [],
  fog: Array.isArray(d?.fog) ? d.fog : [],
});

let data = emptyData();       // what's on screen
let saved = emptyData();      // editor: the last version the worker confirmed
let serverVersion = 0;        // editor: version of `saved` on the worker
let locations = new Map();    // editor: notionId -> { id, name, url, public, pronunciation, aliases }
let islandLabelEntries = [];   // drifting pins: { place, marker, dragging }, repositioned every frame
let pinMarkers = new Map();   // pin id -> marker, so search can find it
let partyMarker = null;
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

/* ---- Saving ----
   Rule for the whole map: every edit is kept in this browser right away
   (localStorage), and nothing is sent to the worker until you press Save
   (or Ctrl/Cmd + S). The map is uploaded as one snapshot per Save. */
const saver = (() => {
  let inFlight = false;
  let status = 'saved', message = '';

  const dirty = () => !same(data, saved);
  const set = (s, msg = '') => { status = s; message = msg; editPanel?.update(); };
  const backup = () => storageSet(UNSAVED_KEY, dirty() ? JSON.stringify({ baseVersion: serverVersion, data }) : null);

  // Called after every edit: keep it locally, upload nothing
  function schedule() {
    backup();
    if (status === 'conflict' || inFlight) return;
    set(dirty() ? 'pending' : 'saved');
  }

  // Upload to the worker (the Save button)
  async function flush() {
    if (inFlight || !dirty()) return;
    inFlight = true;
    const snapshot = structuredClone(data);
    set('saving');
    try {
      const res = await editorApi('/map', { method: 'PUT', body: { baseVersion: serverVersion, data: snapshot } });
      serverVersion = res.version;
      saved = snapshot;
      backup();
      inFlight = false;
      set(dirty() ? 'pending' : 'saved');
    } catch (err) {
      inFlight = false;
      if (err.status === 409) {
        set('conflict', 'The map was saved from another tab or device. Reload to get the latest; your version is kept in this browser.');
      } else {
        set('error', `Couldn't save (${err.message}). Your changes are kept in this browser; press Save to try again.`);
      }
    }
  }

  return {
    schedule,
    flush,
    dirty,
    get status() { return status; },
    get saving() { return inFlight; },
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
  // Older island names become drifting pins with every field a pin has
  const fromIslands = d.islandLabels.map(label => ({
    ...fix(label), type: label.type, note: label.note || '', subLocations: label.subLocations || [], drifts: true,
  }));
  return { ...d, pins: [...d.pins.map(fix), ...fromIslands], islandLabels: [] };
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
    else if (DMVIEW) {
      const [mapData] = await Promise.all([editorApi('/preview'), dm.load()]);
      data = normalize(mapData);
    }
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

// Editor: a Notion location plus its status ('public' | 'private' | 'visibility unknown'), or null
function locationInfo(id) {
  const loc = id ? locations.get(id) : null;
  if (!loc) return null;
  return { ...loc, status: loc.public ? 'public' : loc.visibility === 'private' ? 'private' : 'visibility unknown' };
}

// Name, link and status of a place. Players' places arrive pre-joined; the editor joins with Notion here.
const viewStatus = v => ({ public: 'public', private: 'private', missing: 'missing', unlinked: 'unlinked' }[v] || 'visibility unknown');

function placeInfo(place) {
  if (!EDIT) return { ...place, status: DMVIEW ? viewStatus(place.visibility) : 'public' };
  const loc = locationInfo(place.notionId);
  if (loc) return loc;
  if (place.notionId) return { name: place.workingName || 'Missing Notion page', status: 'missing' };
  return { name: place.workingName || 'Unlinked location', status: 'unlinked' };
}

// A sub-location's name/link/status. Players get objects; the editor stores Notion IDs.
function subInfo(sub) {
  if (!EDIT) return { ...sub, status: DMVIEW ? viewStatus(sub.visibility) : 'public' };
  return locationInfo(sub) || { id: sub, name: 'Missing Notion page', status: 'missing' };
}

const pinKind = pin => placeType(pin.type).label;

// Editor only: links to a location's paired DM Database page(s). The relation gives
// page IDs, and notion.so/<id> opens any page you have access to by its ID.
const dmPageUrl = id => `https://www.notion.so/${id}`;
function dmLinks(loc, { short = false } = {}) {
  const ids = loc?.dmPages || [];
  return ids.map((id, i) => {
    const a = document.createElement('a');
    a.className = 'loc-open dm-link';
    a.href = dmPageUrl(id);
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    const label = short ? 'DM' : 'DM page';
    a.textContent = `${label}${ids.length > 1 ? ` ${i + 1}` : ''} ↗`;
    a.addEventListener('click', e => e.stopPropagation());
    return a;
  });
}

function pinIcon(pin) {
  const t = placeType(pin.type);
  const info = placeInfo(pin);
  const tag = info.status === 'public' ? '' : ` data-tag="${info.status}"`;
  const box = t.dotSize + 6;
  return L.divIcon({
    className: `place-pin${tag ? ' is-flagged' : ''}`,
    html: `<span class="dot" style="width:${+t.dotSize}px;height:${+t.dotSize}px;background:${HEX_COLOR.test(t.color) ? t.color : '#b8893a'}"></span>` +
          `<span class="name"${tag} style="left:${box + 4}px;font-size:${+t.fontSize}px">${escapeHtml(info.name)}</span>`,
    iconSize: [box, box],
    iconAnchor: [box / 2, box / 2],
    popupAnchor: [0, -box / 2],
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
  partyMarker = null;
  updatePartyButton();
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
  partyMarker = marker;
}

// What players see when they click a place, e.g. "City・(New Shey-gaas)"
function placeDetails(place, kindLabel) {
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
  if (DMVIEW) {
    const row = document.createElement('div');
    row.className = 'popup-dm';
    const [tagText, tagClass] = statusTag(info.status);
    if (tagText) {
      const tag = document.createElement('span');
      tag.className = `tag ${tagClass}`;
      tag.textContent = tagText;
      row.append(tag);
    }
    row.append(...dmLinks(place));
    if (row.children.length) el.append(row);
  }
  return el;
}

/* ---- Places-within panel ----
   A pin's popup works as always. If the pin has places within it, they're
   listed in a panel docked above the drift controls (same width), so the
   list doesn't cover the map. No places within, no panel. */
let selectedPinId = null;

const SubPanel = L.Control.extend({
  options: { position: 'bottomleft' },
  onAdd() {
    const el = L.DomUtil.create('section', 'sub-panel');
    el.hidden = true;
    L.DomEvent.disableClickPropagation(el);
    L.DomEvent.disableScrollPropagation(el);
    this.el = el;
    return el;
  },
});
let subPanel = null;   // created after the drift controls so it stacks above them

function markSelected(pinId) {
  pinMarkers.forEach((marker, id) => marker.getElement()?.classList.toggle('is-selected', id === pinId));
}

function showSubLocations(pin, highlightSubId = null) {
  const subs = (pin.subLocations || []).map(subInfo);
  if (!subPanel || !subs.length) return hideSubLocations();
  const el = subPanel.el;
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const close = make('button', 'sub-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close places within');
  close.addEventListener('click', hideSubLocations);

  const heading = make('h2', 'sub-heading');
  heading.append(make('span', 'sub-heading-label', 'Places within'), make('span', 'sub-heading-parent', placeInfo(pin).name));
  el.setAttribute('aria-label', `Places within ${placeInfo(pin).name}`);

  const list = make('ul', 'sub-list');
  let highlighted = null;
  subs.forEach(sub => {
    const li = make('li');
    const href = safeUrl(sub.url);
    const row = make(href ? 'a' : 'span', 'sub-row');
    if (href) {
      row.href = href;
      row.target = '_blank';
      row.rel = 'noopener noreferrer';
    }
    row.append(make('span', 'sub-name', sub.name));
    if (sub.pronunciation) row.append(make('span', 'sub-pron', sub.pronunciation));
    li.append(row);
    if (DMVIEW) {
      const [tagText, tagClass] = statusTag(sub.status);
      if (sub.status !== 'public' && tagText) li.append(make('span', `tag ${tagClass}`, tagText));
      li.append(...dmLinks(sub, { short: true }));
    }
    if (sub.id === highlightSubId) { li.classList.add('is-highlight'); highlighted = li; }
    list.append(li);
  });

  el.replaceChildren(close, heading, list);
  el.hidden = false;
  el.scrollTop = 0;
  if (highlighted) setTimeout(() => highlighted.scrollIntoView({ block: 'nearest' }), 0);
  selectedPinId = pin.id;
  markSelected(selectedPinId);
}

function hideSubLocations() {
  if (subPanel) subPanel.el.hidden = true;
  selectedPinId = null;
  markSelected(null);
}

function renderPlaces() {
  map.closePopup();
  renderParty();
  pinLayer.clearLayers();
  islandLabelLayer.clearLayers();
  islandLabelEntries = [];
  pinMarkers = new Map();
  const editingPlaces = EDIT && editor.tool === 'places';

  data.pins.forEach(pin => {
    const drifts = !!pin.drifts;
    // Players only receive public places; fixed ones under the fog are skipped here.
    // Drifting ones move in and out of the fog, so they're checked when clicked.
    if (PLAYER_FOG && !drifts && CONFIG.fog.enabled && !Fog.isRevealed(pin.x, pin.y)) return;

    const marker = L.marker([H - pin.y, pin.x], {
      pane: drifts ? 'labels' : 'pins',   // drifting places sit above the islands they ride on
      icon: pinIcon(pin),
      interactive: !EDIT || editingPlaces,
      draggable: editingPlaces,
    });
    const entry = { place: pin, marker, dragging: false };

    if (editingPlaces) {
      marker.on('dragstart', () => { entry.dragging = true; });
      marker.on('dragend', () => {
        entry.dragging = false;
        const ll = clampLatLng(marker.getLatLng());
        change(() => {
          // A drifting place stores its spot on the islands image, not the screen
          pin.x = Math.round(drifts ? wrap01(ll.lng / W + state.islands) * W : ll.lng);
          pin.y = Math.round(H - ll.lat);
        }, { rebuildFog: false });
      });
      marker.on('click', () => openEditPopup(marker, pin));
    } else if (!EDIT) {
      marker.bindPopup(() => placeDetails(pin, pinKind(pin)));
      marker.on('popupopen', () => {
        // A drifting place may have floated into the fog since it was drawn
        const ll = marker.getLatLng();
        if (PLAYER_FOG && drifts && CONFIG.fog.enabled && !Fog.isRevealed(ll.lng, H - ll.lat)) { marker.closePopup(); return; }
        showSubLocations(pin);
      });
      marker.on('popupclose', () => { if (selectedPinId === pin.id) hideSubLocations(); });
    }

    marker.addTo(drifts ? islandLabelLayer : pinLayer);
    pinMarkers.set(pin.id, marker);
    if (drifts) islandLabelEntries.push(entry);
    if (pin.id === selectedPinId) marker.getElement()?.classList.add('is-selected');
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
   DM tools (DM view only): session links and the initiative tracker.
   Edits are kept in this browser (localStorage) as you make them, with no
   network calls. The Save button uploads them to the worker (/dm) so they're
   on your other devices; saving or deleting an encounter uploads too.
   The worker keeps this separate from the map, and never sends it to players.
   ========================================================================== */
const emptyDm = () => ({ links: [], currentLinkId: null, party: { size: 4, level: 1 }, tracker: { round: 1, turn: 0, combatants: [] }, encounters: [], bestiary: [], presets: [], spells: [], spellAliases: {} });

const DM_CACHE = 'dnd-map:dm-cache';

// Fields we sent with a real value that the worker's stored copy doesn't have at all.
// That means the worker is older than the site and would silently lose data.
function droppedFields(sent, stored, path = '', out = new Set()) {
  if (Array.isArray(sent) && Array.isArray(stored)) {
    sent.forEach((v, i) => droppedFields(v, stored.find?.(s => s && v && s.id && s.id === v.id) ?? stored[i], path, out));
  } else if (sent && typeof sent === 'object' && stored && typeof stored === 'object') {
    for (const [k, v] of Object.entries(sent)) {
      const has = v !== null && v !== undefined && v !== '' && v !== false;
      if (has && !(k in stored)) out.add(path ? `${path}.${k}` : k);
      else if (k in stored) droppedFields(v, stored[k], k === 'statblock' ? 'statblock' : (path ? `${path}.${k}` : k), out);
    }
  }
  return out;
}

// Compare data by content, ignoring the order of fields (the worker may store fields in a different order)
const stableJson = v => JSON.stringify(v, (key, val) =>
  val && typeof val === 'object' && !Array.isArray(val)
    ? Object.fromEntries(Object.keys(val).sort().map(k => [k, val[k]]))
    : val);

const dm = (() => {
  let state = emptyDm();
  let version = 0;           // version of the worker's copy this browser last saw
  let savedJson = stableJson(state);
  let saving = false, problem = '';
  let creaturePages = [];   // Notion pages tagged Hostiles / NPC / PC (read only, never saved)
  let tagsSeen = [];        // every tag in the database, to explain an empty list
  const listeners = new Set();
  const redraw = () => listeners.forEach(fn => fn());
  const refreshStatus = () => listeners.forEach(fn => fn.statusOnly?.());   // never re-renders, so typing isn't interrupted
  const cacheLocally = () => storageSet(DM_CACHE, JSON.stringify({ baseVersion: version, data: state }));

  async function upload() {
    const sent = stableJson(state);
    const res = await editorApi('/dm', { method: 'PUT', body: { baseVersion: version, data: structuredClone(state) } });
    version = res.version;
    if (res.data) {
      const stored = { ...emptyDm(), ...res.data };
      savedJson = stableJson(stored);
      // Safety net: if the worker didn't keep some fields, it's out of date. Keep this browser's copy
      // (still marked unsaved, so nothing is lost) and say which fields it dropped.
      const dropped = [...droppedFields(JSON.parse(sent), stored)];
      if (dropped.length) {
        cacheLocally();
        throw Object.assign(new Error(`The worker didn't keep ${dropped.slice(0, 4).join(', ')}${dropped.length > 4 ? '…' : ''}. It's probably an older version; run npx wrangler deploy. Your changes are kept in this browser.`), { dropped });
      }
      // Adopt exactly what the worker stored as the saved copy, if nothing was edited during the save
      if (stableJson(state) === sent) state = stored;
    } else {
      savedJson = stableJson(state);
    }
    cacheLocally();
  }

  return {
    get data() { return state; },
    get dirty() { return stableJson(state) !== savedJson; },
    get saving() { return saving; },
    get problem() { return problem; },
    get creaturePages() { return creaturePages; },
    get tagsSeen() { return tagsSeen; },
    setCreaturePages(list, tags) { creaturePages = list || []; tagsSeen = tags || tagsSeen; redraw(); },

    async load() {
      const res = await editorApi('/dm');
      creaturePages = res.creaturePages || [];
      tagsSeen = res.tagsSeen || [];
      const server = { ...emptyDm(), ...res.data };
      migrateCreatures(server.bestiary);
      version = res.version;
      savedJson = stableJson(server);
      migrateCreatures(server.bestiary);
      state = server;
      // Prefer this browser's copy if it has edits that were never saved
      try {
        const cached = JSON.parse(storageGet(DM_CACHE) || 'null');
        if (cached && stableJson({ ...emptyDm(), ...cached.data }) !== savedJson) {
          if (cached.baseVersion === res.version ||
            confirm('This browser has DM changes that were never saved, but the saved copy has changed on another device.\n\nOK: keep this browser\'s version (press Save to upload it).\nCancel: use the saved copy.')) {
            state = { ...emptyDm(), ...cached.data };
            migrateCreatures(state.bestiary);
          }
        }
      } catch { /* unreadable cache */ }
      cacheLocally();
      redraw();
    },

    // Edit locally. quiet: don't redraw (used while typing in fields, so focus isn't lost)
    update(mutate, { quiet = false } = {}) {
      mutate(state);
      problem = '';
      cacheLocally();
      if (quiet) refreshStatus();
      else redraw();
    },

    // Upload to the worker
    async save() {
      if (saving || !this.dirty) return;
      saving = true;
      problem = '';
      refreshStatus();
      try {
        await upload();
      } catch (err) {
        if (err.status === 409 && confirm('The saved copy was changed on another device.\n\nOverwrite it with this browser\'s version?')) {
          try {
            version = (await editorApi('/dm')).version;
            await upload();
          } catch (retryErr) {
            problem = `Couldn't save (${retryErr.message}).`;
          }
        } else {
          problem = err.status === 409 ? 'Not saved: the saved copy changed elsewhere.'
            : err.dropped ? err.message : `Couldn't save (${err.message}).`;
        }
      } finally {
        saving = false;
        refreshStatus();
      }
    },

    subscribe(fn) { listeners.add(fn); },
    refresh() { redraw(); },   // redraw panels after quiet edits (e.g. when the Bestiary closes)
    unsubscribe(fn) { listeners.delete(fn); },
  };
})();

const dmStatusText = () => dm.problem || (dm.saving ? 'Saving…' : dm.dirty ? 'Unsaved changes' : 'Saved');

// A Save button + status line that update in place (no redraw) as things change
function saveControls(className) {
  const wrap = el('div', className);
  const status = el('span', 'dm-status');
  const button = el('button', 'btn dm-save', 'Save');
  button.type = 'button';
  button.title = 'Upload to the worker so it\'s on your other devices';
  button.addEventListener('click', () => dm.save());
  const refresh = () => {
    status.textContent = dmStatusText();
    status.classList.toggle('is-unsaved', dm.dirty && !dm.problem);
    status.classList.toggle('is-problem', !!dm.problem);
    button.disabled = dm.saving || !dm.dirty;
  };
  refresh();
  wrap.append(status, button);
  wrap.refresh = refresh;
  return wrap;
}
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
// Remember which DM panels are minimized, per browser
const panelOpen = (key, fallback = true) => (storageGet(`dnd-map:open:${key}`) ?? String(fallback)) === 'true';
const setPanelOpen = (key, open) => storageSet(`dnd-map:open:${key}`, String(open));

/* ---- Unsaved-changes banner (editor and DM view) ----
   A loud pill at the bottom center whenever something hasn't been uploaded with Save. */
function createUnsavedBanner({ dirty, saving, problem, conflict = () => false, save }) {
  const bar = L.DomUtil.create('div', 'unsaved-banner', container);
  bar.setAttribute('role', 'status');
  bar.setAttribute('aria-live', 'polite');
  const text = el('span', 'unsaved-text');
  const button = el('button', 'unsaved-save', 'Save now');
  button.type = 'button';
  bar.append(el('span', 'unsaved-icon', '⚠'), text, button);
  L.DomEvent.disableClickPropagation(bar);
  L.DomEvent.disableScrollPropagation(bar);
  button.addEventListener('click', () => (conflict() ? location.reload() : save()));

  const refresh = () => {
    const err = problem();
    const busy = saving();
    bar.hidden = !dirty() && !err && !busy;
    bar.classList.toggle('is-saving', busy);
    text.textContent = busy ? 'Saving to the worker…' : err || 'Unsaved changes, not on the worker yet';
    button.textContent = conflict() ? 'Reload' : err ? 'Try again' : 'Save now';
    button.disabled = busy;
  };
  refresh();
  return { refresh };
}

/* ---- Party at a glance: AC, passive Perception and initiative (Dex) for everyone tagged Party ---- */
const PartyPanel = L.Control.extend({
  options: { position: 'bottomleft' },
  onAdd() {
    const root = L.DomUtil.create('section', 'dm-panel party-panel');
    root.setAttribute('aria-label', 'Party at a glance');
    L.DomEvent.disableClickPropagation(root);
    L.DomEvent.disableScrollPropagation(root);
    root.addEventListener('click', e => e.stopPropagation());

    const render = () => {
      const open = panelOpen('party');
      const members = dm.data.bestiary.filter(c => c.inParty)
        .sort((a, b) => creatureName(a).localeCompare(creatureName(b)));
      root.replaceChildren();

      const head = el('header', 'dm-head');
      head.append(el('h2', 'dm-title', `Party${members.length ? ` (${members.length})` : ''}`));
      const tools = el('div', 'dm-tools');
      const bestiaryBtn = el('button', 'icon-btn', '📖');
      bestiaryBtn.type = 'button';
      bestiaryBtn.setAttribute('aria-label', 'Open the bestiary to change who is in the party');
      bestiaryBtn.title = 'Change who is in the party (Bestiary)';
      bestiaryBtn.addEventListener('click', () => openBestiary());
      const toggle = el('button', 'icon-btn', open ? '–' : '+');
      toggle.type = 'button';
      toggle.setAttribute('aria-label', open ? 'Minimize the party' : 'Show the party');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.addEventListener('click', () => { setPanelOpen('party', !open); render(); });
      const spellBtn = el('button', 'icon-btn', '✨');
      spellBtn.type = 'button';
      spellBtn.setAttribute('aria-label', 'Open your spellbook');
      spellBtn.title = 'Spellbook';
      spellBtn.addEventListener('click', () => openSpellbook());
      tools.append(bestiaryBtn, spellBtn, toggle);
      head.append(tools);
      root.append(head);
      if (!open) return;

      if (!members.length) {
        root.append(el('p', 'dm-empty', 'No one is tagged Party yet. Tick "Party member" on characters in the Bestiary (📖).'));
        return;
      }
      const table = el('table', 'party-table');
      const thead = el('thead');
      const hr = el('tr');
      [['', 'Name'], ['AC', 'Armor Class'], ['PP', 'Passive Perception'], ['Init', 'Initiative bonus (Dex modifier)']].forEach(([t, full]) => {
        const th = el('th', '', t);
        th.scope = 'col';
        if (full && t) th.title = full;
        if (!t) th.append(el('span', 'sr-only', full));
        hr.append(th);
      });
      thead.append(hr);
      const tbody = el('tbody');
      const dash = v => (v === null || v === undefined || v === '' ? '–' : String(v));
      members.forEach(c => {
        const tr = el('tr');
        const nameCell = el('th');
        nameCell.scope = 'row';
        const nameBtn = el('button', 'party-name', creatureName(c));
        nameBtn.type = 'button';
        nameBtn.title = `Open ${creatureName(c)} in the Bestiary`;
        nameBtn.addEventListener('click', () => openBestiary(c.id));
        nameCell.append(nameBtn);
        const init = c.initBonus ?? (c.statblock?.abilities ? abilityMod(c.statblock.abilities.dex) : null);
        tr.append(nameCell,
          el('td', '', dash(c.ac)),
          el('td', '', dash(c.passive)),
          el('td', '', init === null || init === undefined ? '–' : signed(init)));
        tbody.append(tr);
      });
      table.append(thead, tbody);
      root.append(table);
    };
    dm.subscribe(render);
    render();
    return root;
  },
});

/* ---- Session panel: quick links, with one marked as the current session ---- */
const SessionPanel = L.Control.extend({
  options: { position: 'bottomleft' },
  onAdd() {
    const root = L.DomUtil.create('section', 'dm-panel');
    root.setAttribute('aria-label', 'Session links');
    L.DomEvent.disableClickPropagation(root);
    L.DomEvent.disableScrollPropagation(root);
    root.addEventListener('click', e => e.stopPropagation());
    let editing = false;

    const render = () => {
      const open = panelOpen('session');
      const { links, currentLinkId } = dm.data;
      root.replaceChildren();

      const head = el('header', 'dm-head');
      head.append(el('h2', 'dm-title', 'Session'));
      const tools = el('div', 'dm-tools');
      if (open) {
        const editBtn = el('button', 'icon-btn', editing ? 'Done' : 'Edit');
        editBtn.type = 'button';
        editBtn.classList.add('text-btn');
        editBtn.addEventListener('click', () => { editing = !editing; render(); });
        tools.append(editBtn);
      }
      const toggle = el('button', 'icon-btn', open ? '–' : '+');
      toggle.type = 'button';
      toggle.setAttribute('aria-label', open ? 'Minimize session links' : 'Show session links');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.addEventListener('click', () => { setPanelOpen('session', !open); editing = false; render(); });
      tools.append(toggle);
      head.append(tools);
      root.append(head);
      if (!open) { render.statusOnly = null; return; }

      // Current session first, then the rest in your order
      const ordered = [...links].sort((a, b) => (b.id === currentLinkId) - (a.id === currentLinkId));
      const list = el('ul', 'dm-links');
      if (!links.length && !editing) list.append(el('li', 'dm-empty', 'No links yet. Use Edit to add session notes, plans, or anything you reach for mid-game.'));

      ordered.forEach(link => {
        const li = el('li', `dm-link-row${link.id === currentLinkId ? ' is-current' : ''}`);
        if (editing) {
          const star = el('button', 'icon-btn', link.id === currentLinkId ? '★' : '☆');
          star.type = 'button';
          star.title = link.id === currentLinkId ? 'Current session' : 'Mark as current session';
          star.setAttribute('aria-label', star.title);
          star.addEventListener('click', () => dm.update(d => { d.currentLinkId = d.currentLinkId === link.id ? null : link.id; }));
          li.append(star, el('span', 'dm-link-label', link.label));
          const i = links.indexOf(link);
          const move = dir => dm.update(d => { const [x] = d.links.splice(i, 1); d.links.splice(i + dir, 0, x); });
          const up = el('button', 'icon-btn', '↑'); up.type = 'button'; up.disabled = i === 0; up.setAttribute('aria-label', 'Move up');
          const down = el('button', 'icon-btn', '↓'); down.type = 'button'; down.disabled = i === links.length - 1; down.setAttribute('aria-label', 'Move down');
          const del = el('button', 'icon-btn danger', '×'); del.type = 'button'; del.setAttribute('aria-label', `Remove ${link.label}`);
          up.addEventListener('click', () => move(-1));
          down.addEventListener('click', () => move(1));
          del.addEventListener('click', () => dm.update(d => {
            d.links = d.links.filter(l => l.id !== link.id);
            if (d.currentLinkId === link.id) d.currentLinkId = null;
          }));
          li.append(up, down, del);
        } else {
          const a = el('a', 'session-link', link.label);
          a.href = safeUrl(link.url) || '#';
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          if (link.id === currentLinkId) a.prepend(el('span', 'dm-current-tag', 'Current'));
          li.append(a);
        }
        list.append(li);
      });
      root.append(list);

      if (editing) {
        const form = el('form', 'dm-add');
        form.innerHTML = `
          <input type="text" name="label" placeholder="Label (e.g. Session 5 plan)" maxlength="80" aria-label="Link label">
          <input type="url" name="url" placeholder="https://www.notion.so/…" required aria-label="Link URL">
          <button type="submit" class="btn">Add link</button>`;
        form.addEventListener('submit', e => {
          e.preventDefault();
          const url = safeUrl(form.elements.url.value.trim());
          if (!url) { form.elements.url.focus(); return; }
          const label = form.elements.label.value.trim() || url;
          dm.update(d => { d.links.push({ id: newId(), label, url }); });
        });
        root.append(form);
      }
      const saveRow = saveControls('dm-save-row');
      root.append(saveRow);
      render.statusOnly = saveRow.refresh;
    };
    dm.subscribe(render);
    render();
    return root;
  },
});

/* ---- Initiative tracker ----
   Rows: initiative, name, HP (current / max), AC; only the name matters.
   HP accepts "-7" or "+5" to apply damage or healing.
   Each combatant has notes, and a reserved `source` for future bestiary links. */
/* ---- Bestiary (Open5e, through the worker) ----
   Read only: lookups never write anything. Results are cached for this page. */
const bestiaryClient = (() => {
  const searches = new Map(), creatures = new Map();
  const remember = (cache, key, load) => {
    if (!cache.has(key)) cache.set(key, load().catch(err => { cache.delete(key); throw err; }));
    return cache.get(key);
  };
  return {
    // One page of results: { results, page, hasMore, fuzzy }
    search: (q, page = 1) => remember(searches, `${q.toLowerCase()}|${page}`, () =>
      editorApi(`/bestiary/search?q=${encodeURIComponent(q)}&page=${page}`)),
    creature: slug => remember(creatures, slug, () =>
      editorApi(`/bestiary/creature/${encodeURIComponent(slug)}`)),
    spellSearch: (q, page = 1) => remember(searches, `spell:${q.toLowerCase()}|${page}`, () =>
      editorApi(`/bestiary/spells?q=${encodeURIComponent(q)}&page=${page}`)),
    spell: slug => remember(creatures, `spell:${slug}`, () =>
      editorApi(`/bestiary/spell/${encodeURIComponent(slug)}`)),
  };
})();

const abilityMod = score => Math.floor(((Number(score) || 10) - 10) / 2);
const signed = n => (n >= 0 ? `+${n}` : `${n}`);
const rollD20 = () => 1 + Math.floor(Math.random() * 20);
const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Open5e text uses light markdown (_italic_, **bold**); show it as plain text
const plainDesc = s => String(s || '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/(^|\W)_(.+?)_(?=\W|$)/g, '$1$2');

// Names for new combatants: "Goblin", or "Goblin 1", "Goblin 2"… once there's more than one
function nextNames(combatants, base, count) {
  const re = new RegExp(`^${escapeRegExp(base)}(?: (\\d+))?$`, 'i');
  const same = combatants.filter(c => re.test(c.name || ''));
  if (same.length + count === 1) return { names: [base], rename: null };
  let max = 0, unnumbered = null;
  same.forEach(c => { const m = c.name.match(re); if (m[1]) max = Math.max(max, Number(m[1])); else unnumbered = c; });
  let rename = null;
  if (unnumbered) {
    const taken = same.some(c => c.name.toLowerCase() === `${base} 1`.toLowerCase());
    const n = taken ? max + 1 : 1;
    rename = { id: unnumbered.id, name: `${base} ${n}` };
    max = Math.max(max, n);
  }
  return { names: Array.from({ length: count }, (_, i) => `${base} ${max + i + 1}`), rename };
}

// A 5e-style stat block from the worker's trimmed Open5e data
function renderStatBlock(sb) {
  const root = el('div', 'statblock');
  root.append(el('h3', 'sb-name', sb.name));
  const meta = [sb.size, sb.type ? sb.type.toLowerCase() + (sb.subtype ? ` (${sb.subtype})` : '') : ''].filter(Boolean).join(' ');
  root.append(el('div', 'sb-meta', [meta, sb.alignment].filter(Boolean).join(', ') || (sb.homebrew ? 'Homebrew' : '')));

  const line = (label, value) => {
    if (!value) return null;
    const p = el('p', 'sb-line');
    p.append(el('strong', '', `${label} `), document.createTextNode(value));
    return p;
  };
  const top = el('div', 'sb-section');
  top.append(...[
    line('Armor Class', sb.ac ? `${sb.ac}${sb.acDesc ? ` (${sb.acDesc})` : ''}` : ''),
    line('Hit Points', sb.hp ? `${sb.hp}${sb.hitDice ? ` (${sb.hitDice})` : ''}` : ''),
    line('Speed', sb.speed),
    line('Initiative', sb.initBonus !== null && sb.initBonus !== undefined ? signed(sb.initBonus) : ''),
  ].filter(Boolean));
  if (top.children.length) root.append(top);

  const abilities = el('div', 'sb-abilities');
  if (sb.abilities) ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(k => {
    const cell = el('div', 'sb-ability');
    const score = sb.abilities?.[k] ?? 10;
    cell.append(el('span', 'sb-ab-name', k.toUpperCase()), el('span', 'sb-ab-score', `${score} (${signed(abilityMod(score))})`));
    abilities.append(cell);
  });
  if (sb.abilities) root.append(abilities);

  const props = el('div', 'sb-section');
  props.append(...[
    line('Saving Throws', sb.saves),
    line('Skills', sb.skills),
    line('Damage Vulnerabilities', sb.vulnerabilities),
    line('Damage Resistances', sb.resistances),
    line('Damage Immunities', sb.immunities),
    line('Condition Immunities', sb.conditionImmunities),
    line('Senses', sb.senses),
    line('Languages', sb.languages),
    line('Challenge', sb.cr ? `${sb.cr}${sb.xp ? ` (${sb.xp.toLocaleString()} XP)` : ''}` : ''),
  ].filter(Boolean));
  if (props.children.length) root.append(props);

  const section = (title, items, intro) => {
    if (!items?.length && !intro) return;
    const s = el('div', 'sb-section');
    if (title) s.append(el('h4', 'sb-heading', title));
    if (intro) s.append(el('p', 'sb-desc', plainDesc(intro)));
    items.forEach(it => {
      const p = el('p', 'sb-desc');
      p.append(el('strong', 'sb-item', `${plainDesc(it.name)}. `), document.createTextNode(plainDesc(it.desc)));
      s.append(p);
    });
    root.append(s);
  };
  section('', sb.traits);
  section('Actions', sb.actions);
  section('Bonus Actions', sb.bonusActions);
  section('Reactions', sb.reactions);
  section('Legendary Actions', sb.legendaryActions, sb.legendaryDesc);
  if (sb.source) root.append(el('p', 'sb-source', `Source: ${sb.source} (via Open5e)`));
  return root;
}

// 2014 DMG experience by challenge rating ("1/4" or 0.25 both work)
const XP_BY_CR = {
  0: 10, 0.125: 25, 0.25: 50, 0.5: 100, 1: 200, 2: 450, 3: 700, 4: 1100, 5: 1800, 6: 2300, 7: 2900,
  8: 3900, 9: 5000, 10: 5900, 11: 7200, 12: 8400, 13: 10000, 14: 11500, 15: 13000, 16: 15000,
  17: 18000, 18: 20000, 19: 22000, 20: 25000, 21: 33000, 22: 41000, 23: 50000, 24: 62000,
  25: 75000, 26: 90000, 27: 105000, 28: 120000, 29: 135000, 30: 155000,
};
const crValue = cr => {
  const s = String(cr ?? '').trim();
  if (!s) return null;
  if (s.includes('/')) { const [a, b] = s.split('/').map(Number); return b ? a / b : null; }
  return Number.isFinite(Number(s)) ? Number(s) : null;
};
const xpForCr = cr => XP_BY_CR[crValue(cr)] ?? null;

const findCreature = id => dm.data.bestiary.find(c => c.id === id);

const findPreset = id => dm.data.presets.find(p => p.id === id);
const isPcPage = page => /\b(pcs?|player characters?)\b/i.test(page?.tag || '');
// Characters get the Character section: linked to a PC page, or tagged Party
const isCharacter = c => !!c && (c.inParty || isPcPage(findCreaturePage(c.notionId)));

// Add every Party member who isn't already in initiative (players roll their own initiative)
function addParty() {
  const members = dm.data.bestiary.filter(c => c.inParty);
  const present = new Set(dm.data.tracker.combatants.filter(c => c.source?.type === 'library').map(c => c.source.slug));
  const missing = members.filter(c => !present.has(c.id));
  if (!missing.length) return { added: 0, total: members.length };
  dm.update(d => {
    missing.forEach(c => d.tracker.combatants.push({
      id: newId(), name: creatureName(c), init: null, hp: c.hp, maxHp: c.hp, ac: c.ac, notes: '',
      source: { type: 'library', slug: c.id }, side: 'party', hidden: false, level: c.level ?? null, cr: c.cr || '',
    }));
  });
  return { added: missing.length, total: members.length };
}
// Fill a creature from a preset: numbers + stat block. Name override, notes and Notion link stay.
function applyPreset(c, preset) {
  Object.assign(c, {
    cr: preset.cr, ac: preset.ac, hp: preset.hp, hitDice: preset.hitDice, initBonus: preset.initBonus,
    source: { type: 'preset', slug: preset.id },
    statblock: structuredClone(preset.statblock || { name: preset.name }),
    // Spellcasting comes along too
    spellAbility: preset.spellAbility || '', spellDc: preset.spellDc ?? null, spellAttack: preset.spellAttack ?? null,
    spells: structuredClone(preset.spells || []),
  });
  c.xp = xpForCr(c.cr);
}

// The name a creature goes by: your override, else its Notion page's name, else Open5e's
const creatureName = c => (c.nameOverride || '').trim() || findCreaturePage(c.notionId)?.name ||
  c.statblock?.name || c.name || 'Unnamed creature';
const nameSourceLabel = c => ((c.nameOverride || '').trim() ? 'Your name'
  : findCreaturePage(c.notionId)?.name ? 'Using the Notion page name'
  : c.statblock?.name ? 'Using the Open5e name' : 'No name yet');

// Older creatures stored one name; a name that matches Open5e's counts as inherited, anything else as yours
function migrateCreatures(bestiary) {
  (bestiary || []).forEach(c => {
    if (c.nameOverride === undefined) c.nameOverride = c.statblock && c.name === c.statblock.name ? '' : (c.name || '');
  });
}
const findCreaturePage = id => dm.creaturePages.find(p => p.id === id);

// Add creatures from your bestiary to initiative (initiative rolled: d20 + their bonus)
function addFromBestiary(creature, count = 1) {
  dm.update(d => {
    const { names, rename } = nextNames(d.tracker.combatants, creatureName(creature), count);
    if (rename) { const t = d.tracker.combatants.find(x => x.id === rename.id); if (t) t.name = rename.name; }
    names.forEach(n => d.tracker.combatants.push({
      id: newId(), name: n,
      init: rollD20() + (creature.initBonus ?? abilityMod(creature.statblock?.abilities?.dex)),
      hp: creature.hp, maxHp: creature.hp, ac: creature.ac,
      notes: '', source: { type: 'library', slug: creature.id },
      // PCs (linked to a Notion page tagged PC) join the party; everything else starts hostile
      side: creature.inParty ? 'party' : 'hostile',
      hidden: false, level: null, cr: creature.cr || '',
    }));
  });
}

// Campaign page + DM page links for a creature linked to a Notion page (Hostiles, NPC or PC)
function notionLinks(page) {
  const out = [];
  const href = page && safeUrl(page.url);
  if (href) {
    const a = el('a', 'loc-open', 'Player page ↗');
    a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer';
    out.push(a);
  }
  if (page) {
    const dm = dmLinks(page);
    out.push(...(dm.length ? dm : [el('span', 'tag tag-muted', 'No DM page linked in Notion')]));
  }
  return out;
}

// Read a stat block's Spellcasting / Innate Spellcasting trait:
// ability, save DC, attack bonus, the intro sentence, and each spell with its level or note.
const ABILITY_KEYS = { intelligence: 'int', wisdom: 'wis', charisma: 'cha' };
function spellcastingTrait(sb) {
  return (sb?.traits || []).find(t => /spellcasting/i.test(t.name || '') && /:/.test(t.desc || ''));
}
function parseSpellcasting(sb) {
  const trait = spellcastingTrait(sb);
  if (!trait) return null;
  const desc = plainDesc(trait.desc);
  const ability = (desc.match(/spellcasting ability is (\w+)/i) || [])[1];
  const dc = (desc.match(/spell save DC (\d+)/i) || [])[1];
  const attack = (desc.match(/([+-]\d+) to hit with spell attacks/i) || [])[1];
  const spells = [], levelNotes = {};
  desc.split(/\n+/).forEach(raw => {
    const line = raw.replace(/^[\s*•\-]+/, '').trim();
    let m, level = null, note = '', list = '';
    if ((m = line.match(/^(cantrips?|(\d+)(?:st|nd|rd|th)[- ]level)\s*(?:\(([^)]*)\))?\s*:\s*(.+)$/i))) {
      level = /^cantrip/i.test(m[1]) ? 0 : Number(m[2]);
      if (m[3]) levelNotes[level] = m[3].trim();
      list = m[4];
    } else if ((m = line.match(/^(at will|\d+\s*\/\s*day(?:\s+each)?)\s*:\s*(.+)$/i))) {
      note = m[1].toLowerCase().replace(/\s*each$/, '').replace(/\s+/g, '');
      list = m[2];
    } else return;
    list.split(',').forEach(part => {
      const extra = (part.match(/\(([^)]*)\)/) || [])[1];
      const name = part.replace(/\([^)]*\)/g, '').replace(/[*†]+/g, '').trim();
      if (name) spells.push({ name, level, note: [note === 'atwill' ? 'at will' : note, extra].filter(Boolean).join(', ') });
    });
  });
  return {
    intro: desc.split(/\n/)[0].trim(),
    ability: ABILITY_KEYS[(ability || '').toLowerCase()] || '',
    dc: dc ? Number(dc) : null,
    attack: attack ? Number(attack) : null,
    spells,
    levelNotes,
  };
}
// Find the Spellbook spell for a name: Open5e's exact spell for this monster first, then your own spells
// and other names, then core rules over other publishers' spells of the same name
function matchSpell(name, slugHints = new Set()) {
  const n = nameKey(name);
  const cat = spellCatalog();
  const named = s => nameKey(s.name) === n || (s.aliases || []).some(a => nameKey(a) === n);
  return cat.find(s => s.slug && slugHints.has(s.slug) && named(s))
    || cat.find(s => s.mine && named(s))
    || cat.find(s => named(s) && /core|srd|basic/i.test(s.source || ''))
    || cat.find(named)
    || null;
}
// "cone of cold" -> "Cone of Cold" (short words stay lowercase except at the start)
const spellTitle = s => String(s).toLowerCase().split(' ')
  .map((w, i) => (i && /^(of|and|the|to|from|in|on|with|a|an|or|for|at|by)$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
const unlinkedKey = name => `u:${nameKey(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 110) || 'spell'}`;
// Fill a creature's Spellcasting from its stat block, linking each spell to the Spellbook
async function spellsFromStatblock(sb) {
  const parsed = parseSpellcasting(sb);
  if (!parsed) return null;
  try { await spellIndex.load(); } catch { /* match against your own spells only */ }
  const hints = new Set(sb.spellSlugs || []);
  const seen = new Set(), spells = [];
  parsed.spells.forEach(p => {
    const hit = matchSpell(p.name, hints);
    const key = hit ? hit.key : unlinkedKey(p.name);
    if (seen.has(key)) return;
    seen.add(key);
    spells.push({ key, name: hit?.name || spellTitle(p.name), level: hit?.level ?? p.level ?? 0, prepared: true, note: p.note || '' });
  });
  return { spells, ability: parsed.ability, dc: parsed.dc, attack: parsed.attack };
}
async function importSpellsFromStatblock(creatureId) {
  const found = await spellsFromStatblock(findCreature(creatureId)?.statblock);
  if (!found) return null;
  dm.update(d => {
    const c = d.bestiary.find(x => x.id === creatureId);
    if (!c) return;
    c.spells = found.spells;
    if (found.ability) c.spellAbility = found.ability;
    if (found.dc != null) c.spellDc = found.dc;
    if (found.attack != null) c.spellAttack = found.attack;
  });
  return { found: found.spells.length, unlinked: found.spells.filter(s => s.key.startsWith('u:')).length };
}

/* ---- Merging: carry chosen parts of one creature into another ----
   Speeds merge by type (a fly speed is added, a slower walk is never kept over a faster one),
   lists merge without duplicates, and named entries replace same-named ones. */
const parseSpeed = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean).map(seg => {
  const m = seg.match(/^(?:([a-z]+)\s+)?(\d+)\s*ft\.?\s*(.*)$/i);
  return m ? { type: (m[1] || 'walk').toLowerCase(), ft: Number(m[2]), extra: m[3].trim() } : { type: seg.toLowerCase(), ft: 0, extra: '', raw: seg };
});
const speedText = list => [...list].sort((a, b) => (a.type === 'walk' ? -1 : b.type === 'walk' ? 1 : 0))
  .map(s => s.raw || `${s.type === 'walk' ? '' : `${s.type} `}${s.ft} ft.${s.extra ? ` ${s.extra}` : ''}`).join(', ');
const splitList = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
const listKey = x => nameKey(x).replace(/\s*[+-]?\d.*$/, '').trim();   // "darkvision 60 ft." -> "darkvision", "Stealth +4" -> "stealth"

// Everything a source creature could contribute, as checklist items with what each would do
function buildMergeItems(target, src) {
  const tsb = target.statblock || {}, ssb = src.sb || {}, items = [];
  const tSpeed = parseSpeed(tsb.speed);
  parseSpeed(ssb.speed).forEach(sp => {
    if (sp.raw) return;
    const have = tSpeed.find(t => t.type === sp.type);
    if (have && have.ft >= sp.ft) return;
    items.push({ group: 'Movement & senses', label: `${titleCase(sp.type)} ${sp.ft} ft.${sp.extra ? ` ${sp.extra}` : ''}`,
      detail: have ? `replaces your ${have.ft} ft.` : 'speed',
      apply: c => { const list = parseSpeed(c.statblock.speed); const i = list.findIndex(t => t.type === sp.type); if (i >= 0) list[i] = sp; else list.push(sp); c.statblock.speed = speedText(list); } });
  });
  const listField = (field, group, what, skip) => {
    const have = new Set(splitList(tsb[field]).map(listKey));
    splitList(ssb[field]).forEach(x => {
      if (skip?.(x)) return;
      const already = have.has(listKey(x));
      items.push({ group, label: x, detail: already ? 'already has this' : what, disabled: already,
        apply: c => { const cur = splitList(c.statblock[field]); if (!cur.some(y => listKey(y) === listKey(x))) cur.push(x); c.statblock[field] = cur.join(', '); } });
    });
  };
  listField('senses', 'Movement & senses', 'sense', x => /passive perception/i.test(x));
  listField('skills', 'Skills & languages', 'skill');
  listField('languages', 'Skills & languages', 'language');
  [['vulnerabilities', 'Damage vulnerabilities'], ['resistances', 'Damage resistances'], ['immunities', 'Damage immunities']].forEach(([f, label]) => {
    const v = String(ssb[f] || '').trim();
    if (!v) return;
    const already = nameKey(tsb[f] || '').includes(nameKey(v));
    items.push({ group: 'Defenses', label: `${label}: ${v}`, detail: already ? 'already has this' : '', disabled: already,
      apply: c => { c.statblock[f] = [c.statblock[f], v].filter(Boolean).join('; '); } });
  });
  listField('conditionImmunities', 'Defenses', 'condition immunity');
  if (ssb.size || ssb.type) {
    const text = [ssb.size, ssb.type && `${ssb.type.toLowerCase()}${ssb.subtype ? ` (${ssb.subtype})` : ''}`].filter(Boolean).join(' ');
    items.push({ group: 'Size & type', label: text, detail: tsb.type || tsb.size ? `replaces ${[tsb.size, tsb.type].filter(Boolean).join(' ').toLowerCase()}` : 'size and type',
      apply: c => { c.statblock.size = ssb.size || ''; c.statblock.type = ssb.type || ''; c.statblock.subtype = ssb.subtype || ''; } });
  }
  const castTrait = spellcastingTrait(ssb);
  [['traits', 'Traits'], ['actions', 'Actions'], ['bonusActions', 'Bonus actions'], ['reactions', 'Reactions'], ['legendaryActions', 'Legendary actions']].forEach(([f, group]) => {
    (ssb[f] || []).forEach(it => {
      if (f === 'traits' && it === castTrait && src.spells?.length) return;   // offered as spells below
      const same = (tsb[f] || []).find(x => nameKey(x.name) === nameKey(it.name));
      if (same && same.desc === it.desc) { items.push({ group, label: it.name, detail: 'already has this', disabled: true }); return; }
      items.push({ group, label: it.name, detail: `${same ? 'replaces yours · ' : ''}${plainDesc(it.desc).slice(0, 160)}${plainDesc(it.desc).length > 160 ? '…' : ''}`,
        apply: c => {
          const arr = c.statblock[f] = c.statblock[f] || [];
          const i = arr.findIndex(x => nameKey(x.name) === nameKey(it.name));
          if (i >= 0) arr[i] = structuredClone(it); else arr.push(structuredClone(it));
          if (f === 'legendaryActions' && !c.statblock.legendaryDesc && ssb.legendaryDesc) c.statblock.legendaryDesc = ssb.legendaryDesc;
        } });
    });
  });
  if (src.spellAbility || src.spellDc != null || src.spellAttack != null) {
    items.push({ group: 'Spellcasting', label: 'Ability, save DC & attack',
      detail: [src.spellAbility && src.spellAbility.toUpperCase(), src.spellDc != null && `DC ${src.spellDc}`, src.spellAttack != null && `${signed(src.spellAttack)} to hit`]
        .filter(Boolean).join(' · ') + (target.spellAbility || target.spellDc != null ? ' · replaces yours' : ''),
      apply: c => {
        if (src.spellAbility) c.spellAbility = src.spellAbility;
        if (src.spellDc != null) c.spellDc = src.spellDc;
        if (src.spellAttack != null) c.spellAttack = src.spellAttack;
        // No spellcasting text of its own? Bring the source's, so the stat block shows the intro and slot counts
        const srcTrait = spellcastingTrait(ssb);
        if (srcTrait && !spellcastingTrait(c.statblock)) (c.statblock.traits = c.statblock.traits || []).push(structuredClone(srcTrait));
      } });
  }
  const resolved = k => spellInfo(k)?.key || k;
  // Spells the target only has as Spellcasting text still count as "already has"
  const textSpells = !(target.spells || []).length ? new Set((parseSpellcasting(tsb)?.spells || []).map(s => nameKey(s.name))) : new Set();
  (src.spells || []).forEach(sp => {
    const has = (target.spells || []).some(x => resolved(x.key) === resolved(sp.key)) || textSpells.has(nameKey(spellInfo(sp.key)?.name || sp.name));
    items.push({ group: 'Spellcasting', label: spellInfo(sp.key)?.name || sp.name,
      detail: has ? 'already has this' : [sp.level === 0 ? 'Cantrip' : `Level ${sp.level}`, sp.note, sp.key.startsWith('u:') && 'not linked'].filter(Boolean).join(' · '),
      disabled: has, apply: c => { c.spells = c.spells || []; if (!c.spells.some(x => resolved(x.key) === resolved(sp.key))) c.spells.push(structuredClone(sp)); } });
  });
  return items;
}

// A source for merging: Open5e creatures (with their spells linked), presets, or your own creatures
async function mergeSourceFromOpen5e(slug) {
  const sb = await bestiaryClient.creature(slug);
  const sp = await spellsFromStatblock(sb);
  return { sb, spells: sp?.spells || [], spellAbility: sp?.ability || '', spellDc: sp?.dc ?? null, spellAttack: sp?.attack ?? null };
}
async function mergeSourceFromCreature(c) {
  const src = { sb: c.statblock || {}, spells: c.spells || [], spellAbility: c.spellAbility || '', spellDc: c.spellDc ?? null, spellAttack: c.spellAttack ?? null };
  // Spells only written in its Spellcasting trait (older imports and presets): read them so they can be merged
  if (!src.spells.length && parseSpellcasting(src.sb)) {
    const sp = await spellsFromStatblock(src.sb);
    src.spells = sp?.spells || [];
    src.spellAbility = src.spellAbility || sp?.ability || '';
    src.spellDc = src.spellDc ?? sp?.dc ?? null;
    src.spellAttack = src.spellAttack ?? sp?.attack ?? null;
  }
  return src;
}

// Spellcasting in a stat block: ability, DC and attack, then spells by level as clickable names.// Spellcasting in a stat block: ability, DC and attack, then spells by level as clickable names.
// Prepared spells are bold; click a name to open its card.
function renderSpellcasting(creature) {
  const sec = el('div', 'sb-section sb-spells');
  sec.append(el('h4', 'sb-heading', 'Spellcasting'));
  const parsed = parseSpellcasting(creature.statblock);
  if (parsed?.intro && creature.spells?.length) sec.append(el('p', 'sb-desc', parsed.intro));
  const bits = parsed?.intro && creature.spells?.length ? [] : [creature.spellAbility && `${creature.spellAbility.toUpperCase()}`,
    creature.spellDc != null && `spell save DC ${creature.spellDc}`,
    creature.spellAttack != null && `${signed(creature.spellAttack)} to hit with spell attacks`].filter(Boolean);
  if (bits.length) sec.append(el('p', 'sb-line', bits.join(' · ')));
  const byLevel = new Map();
  (creature.spells || []).forEach(sp => {
    const info = spellInfo(sp.key);
    const level = info?.level ?? sp.level ?? 0;
    if (!byLevel.has(level)) byLevel.set(level, []);
    byLevel.get(level).push({ ...sp, name: info?.name || sp.name, level });
  });
  [...byLevel.keys()].sort((a, b) => a - b).forEach(level => {
    const p = el('p', 'sb-spell-level');
    const slots = parsed?.levelNotes?.[level];
    p.append(el('strong', '', `${level === 0 ? 'Cantrips' : `${ordinal(level)} level`}${slots ? ` (${slots})` : ''}: `));
    byLevel.get(level).sort((a, b) => a.name.localeCompare(b.name)).forEach((sp, i) => {
      if (i) p.append(document.createTextNode(', '));
      if (sp.key.startsWith('u:')) {
        // Not linked to a Spellbook spell yet: show the name, link it in the Bestiary editor
        const u = el('span', 'spell-chip is-unlinked', sp.name);
        u.title = 'Not linked to a spell in your Spellbook yet (link it in the Bestiary editor)';
        p.append(u);
      } else {
        const b = el('button', `spell-chip${sp.prepared ? ' is-prepared' : ''}`, sp.name);
        b.type = 'button';
        b.title = `${sp.prepared ? 'Prepared · ' : ''}Open ${sp.name}`;
        b.addEventListener('click', () => openSpellCard(sp.key));
        p.append(b);
      }
      if (sp.note) p.append(el('span', 'spell-note', ` (${sp.note})`));
    });
    sec.append(p);
  });
  return sec;
}

// What a creature from your bestiary shows in the tracker and the bestiary menu:
// its stat block (your copy, with the tracker numbers on top) plus your notes and Notion links
function renderCreatureBlock(creature) {
  const sb = creature.statblock || {};
  const linkedSpells = creature.spells?.length > 0;
  const block = renderStatBlock({
    ...sb,
    traits: linkedSpells ? (sb.traits || []).filter(t => t !== spellcastingTrait(sb)) : sb.traits,
    name: creatureName(creature),
    ac: creature.ac ?? sb.ac,
    hp: creature.hp ?? sb.hp,
    hitDice: creature.hitDice || sb.hitDice,
    cr: creature.cr || sb.cr,
    xp: xpForCr(creature.cr) ?? sb.xp,
    initBonus: creature.initBonus,
    homebrew: !creature.source,
  });
  const casts = creature.spells?.length || creature.spellAbility;
  if (isCharacter(creature)) {
    const bits = [
      creature.level ? `Level ${creature.level}${creature.className ? ` ${creature.className}` : ''}` : creature.className,
      creature.player && `Played by ${creature.player}`,
      creature.passive != null && `Passive Perception ${creature.passive}`,
      !casts && creature.spellDc != null && `Spell save DC ${creature.spellDc}`,
    ].filter(Boolean);
    const line = el('div', 'sb-character');
    line.append(el('span', 'tag party-tag', creature.inParty ? 'Party' : 'PC'), document.createTextNode(bits.join(' · ') || 'Add level, class and player in Edit'));
    block.insertBefore(line, block.children[2] || null);
  }
  if (casts) {
    // Where the original trait sat: just before Actions
    const actionsHead = [...block.querySelectorAll('.sb-heading')].find(h => h.textContent === 'Actions');
    const section = renderSpellcasting(creature);
    if (actionsHead) block.insertBefore(section, actionsHead.parentElement); else block.append(section);
  }
  if (creature.notes) {
    const notes = el('div', 'sb-section');
    notes.append(el('h4', 'sb-heading', 'Your notes'), el('p', 'sb-desc', creature.notes));
    block.append(notes);
  }
  const links = notionLinks(findCreaturePage(creature.notionId));
  if (links.length) {
    const row = el('div', 'sb-links');
    row.append(...links);
    block.append(row);
  }
  return block;
}

/* ---- Encounter math (2014 DMG, as in Kobold Fight Club) ---- */
// XP thresholds per character level: [Easy, Medium, Hard, Deadly]
const XP_THRESHOLDS = {
  1: [25, 50, 75, 100], 2: [50, 100, 150, 200], 3: [75, 150, 225, 400], 4: [125, 250, 375, 500],
  5: [250, 500, 750, 1100], 6: [300, 600, 900, 1400], 7: [350, 750, 1100, 1700], 8: [450, 900, 1400, 2100],
  9: [550, 1100, 1600, 2400], 10: [600, 1200, 1900, 2800], 11: [800, 1600, 2400, 3600], 12: [1000, 2000, 3000, 4500],
  13: [1100, 2200, 3400, 5100], 14: [1250, 2500, 3800, 5700], 15: [1400, 2800, 4300, 6400], 16: [1600, 3200, 4800, 7200],
  17: [2000, 3900, 5900, 8800], 18: [2100, 4200, 6300, 9500], 19: [2400, 4900, 7300, 10900], 20: [2800, 5700, 8500, 12700],
};
const MULTIPLIERS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5];
const DIFFICULTIES = ['Easy', 'Medium', 'Hard', 'Deadly'];

const sideOf = c => (['party', 'ally', 'hostile'].includes(c.side) ? c.side : 'hostile');
// A combatant's CR: live from your bestiary when it came from there, else what was copied when added
const combatantCr = c => (c.source?.type === 'library' ? findCreature(c.source.slug)?.cr : null) || c.cr || '';

// The party: the combatants marked Party, at their levels. Levels come live from the bestiary
// when the combatant came from there, so a level set in the Bestiary applies to every fight.
const combatantLevel = c => (c.source?.type === 'library' ? findCreature(c.source.slug)?.level : null) ?? c.level ?? null;
function partyLevels(list) {
  const members = list.filter(c => sideOf(c) === 'party');
  return {
    members,
    levels: members.map(c => Math.min(20, Math.max(1, combatantLevel(c) || 1))),
    missingLevel: members.filter(c => !combatantLevel(c)).length,
  };
}

function encounterMath(list, { includeHidden }) {
  const { levels } = partyLevels(list);
  const hostiles = list.filter(c => sideOf(c) === 'hostile' && (includeHidden || !c.hidden));
  const counted = hostiles.filter(c => xpForCr(combatantCr(c)) !== null);
  const rawXp = counted.reduce((sum, c) => sum + xpForCr(combatantCr(c)), 0);
  // Multiplier by number of monsters, shifted for small (<3) or large (6+) parties
  const n = counted.length;
  let idx = n === 0 ? 1 : n === 1 ? 1 : n === 2 ? 2 : n <= 6 ? 3 : n <= 10 ? 4 : n <= 14 ? 5 : 6;
  if (levels.length < 3) idx += 1;
  else if (levels.length >= 6) idx -= 1;
  const multiplier = MULTIPLIERS[Math.min(MULTIPLIERS.length - 1, Math.max(0, idx))];
  const adjusted = Math.round(rawXp * multiplier);
  const thresholds = [0, 1, 2, 3].map(i => levels.reduce((sum, lv) => sum + XP_THRESHOLDS[lv][i], 0));
  let difficulty = levels.length ? 'Trivial' : 'No party';
  if (levels.length) thresholds.forEach((t, i) => { if (adjusted >= t) difficulty = DIFFICULTIES[i]; });
  return {
    party: levels.length, hostiles: hostiles.length, counted: n, missingCr: hostiles.length - n,
    rawXp, multiplier, adjusted, thresholds, difficulty,
    perPlayer: levels.length ? Math.floor(rawXp / levels.length) : 0,
  };
}

const InitiativeTracker = L.Control.extend({
  options: { position: 'bottomright' },
  onAdd() {
    const root = L.DomUtil.create('section', 'init-tracker');
    root.setAttribute('aria-label', 'Initiative tracker');
    L.DomEvent.disableClickPropagation(root);
    L.DomEvent.disableScrollPropagation(root);
    root.addEventListener('click', e => e.stopPropagation());
    const openNotes = new Set();
    let hpTargetId = null;   // who the Damage / Heal bar points at

    // Health band from current vs max HP: healthy > 1/2, bloodied <= 1/2, critical <= 1/4, down at 0
    const hpState = c => {
      if (c.hp === null || c.hp === undefined) return '';
      if (c.hp <= 0) return 'hp-down';
      if (!c.maxHp) return '';
      const ratio = c.hp / c.maxHp;
      return ratio <= 0.25 ? 'hp-critical' : ratio <= 0.5 ? 'hp-bloodied' : 'hp-healthy';
    };
    const HP_STATES = ['hp-healthy', 'hp-bloodied', 'hp-critical', 'hp-down'];
    const paintHp = (row, c) => {
      row.classList.remove(...HP_STATES);
      const s = hpState(c);
      if (s) row.classList.add(s);
    };
    // Apply damage (negative) or healing (positive): never below 0, healing never past max
    const applyHp = (c, delta) => {
      const base = c.hp ?? c.maxHp ?? 0;
      let next = Math.max(0, base + delta);
      if (delta > 0 && c.maxHp) next = Math.min(next, Math.max(c.maxHp, base));
      c.hp = next;
    };

    const numOrNull = v => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Math.round(Number(v)));
    const btn = (text, label, onClick, cls = 'icon-btn') => {
      const b = el('button', cls, text);
      b.type = 'button';
      if (label) { b.setAttribute('aria-label', label); b.title = label; }
      b.addEventListener('click', onClick);
      return b;
    };

    // "+ Add party": everyone tagged Party in the Bestiary who isn't in initiative yet
    const partyButton = () => {
      const count = dm.data.bestiary.filter(c => c.inParty).length;
      const b = btn('+ Add party', count ? `Add the ${count} Party member${count === 1 ? '' : 's'} not already in initiative`
        : 'Tag creatures as Party members in the Bestiary to add them all at once', () => {
        const { added, total } = addParty();
        if (!total) { openBestiary(); return; }
        if (!added) { b.textContent = 'Party already in'; setTimeout(() => { b.textContent = '+ Add party'; }, 1500); }
      }, 'btn party-btn-add');
      return b;
    };

    // Large view: search your bestiary to add combatants. "3 goblin" adds three;
    // any name not in your bestiary can be added as a custom combatant.
    const bestiarySearch = host => {
      const wrap = el('div', 'init-search');
      const combo = el('div', 'combo');
      const input = el('input', 'combo-input init-input add-input');
      input.type = 'text';
      input.id = 'init-bestiary-search';
      input.placeholder = 'Add from your bestiary…  ("3 goblin" adds three)';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.setAttribute('role', 'combobox');
      input.setAttribute('aria-label', 'Add a combatant from your bestiary');
      input.setAttribute('aria-autocomplete', 'list');
      input.setAttribute('aria-expanded', 'false');
      const list = el('ul', 'combo-list');
      list.id = 'init-bestiary-search-list';
      list.setAttribute('role', 'listbox');
      list.hidden = true;
      input.setAttribute('aria-controls', list.id);
      combo.append(input, list);

      const parse = q => {
        const m = q.trim().match(/^(\d{1,2})\s*[x×]?\s+(.+)$/i);
        return m ? { count: Math.min(20, Math.max(1, Number(m[1]))), term: m[2].trim() } : { count: 1, term: q.trim() };
      };
      const box = createCombobox({
        input,
        list,
        getOptions(query) {
          const { count, term } = parse(query);
          const q = nameKey(term);
          const found = dm.data.bestiary
            .filter(c => !q || nameKey(creatureName(c)).includes(q))
            .sort((a, b) => creatureName(a).localeCompare(creatureName(b)));
          const options = found.slice(0, 50).map(c => ({
            kind: 'creature', id: c.id, count,
            label: `${creatureName(c)}${count > 1 ? ` ×${count}` : ''}`,
            detail: [c.cr && `CR ${c.cr}`, c.ac != null && `AC ${c.ac}`, c.hp != null && `HP ${c.hp}`].filter(Boolean).join(' · '),
          }));
          if (term) options.push({ kind: 'custom', name: term, count, className: 'is-none',
            label: `Add "${term}"${count > 1 ? ` ×${count}` : ''} as a custom combatant` });
          const notes = [];
          if (!dm.data.bestiary.length) notes.push('Your bestiary is empty. Open it with 📖 to import or create creatures.');
          else if (term && !found.length) notes.push('No creatures in your bestiary match.');
          return { options, notes };
        },
        onChoose(opt) {
          if (opt.kind === 'creature') {
            const creature = findCreature(opt.id);
            if (creature) addFromBestiary(creature, opt.count);
          } else {
            dm.update(d => {
              const { names, rename } = nextNames(d.tracker.combatants, opt.name, opt.count);
              if (rename) { const t = d.tracker.combatants.find(x => x.id === rename.id); if (t) t.name = rename.name; }
              names.forEach(n => d.tracker.combatants.push({ id: newId(), name: n, init: null, hp: null, maxHp: null, ac: null, notes: '', source: null, side: 'party', hidden: false, level: null, cr: '' }));
            });
          }
          host.querySelector('.add-input')?.focus();
        },
      });
      input.addEventListener('focus', () => box.open());
      wrap.append(combo, partyButton(), btn('+ Blank', 'Add an empty row', () => {
        dm.update(d => { d.tracker.combatants.push({ id: newId(), name: '', init: null, hp: null, maxHp: null, ac: null, notes: '', source: null, side: 'party', hidden: false, level: null, cr: '' }); });
        host.querySelector('.init-table .init-row:last-of-type .init-name')?.focus();
      }, 'btn'));
      return wrap;
    };

    // Encounter difficulty: a one-line summary that expands into the full breakdown
    const encounterPanel = (list, large) => {
      const wrap = el('div', 'enc');
      const open = panelOpen(`encounter-${large ? 'large' : 'corner'}`, large);
      const all = encounterMath(list, { includeHidden: true });
      const now = encounterMath(list, { includeHidden: false });
      const anyHidden = list.some(c => c.hidden && sideOf(c) === 'hostile');

      const summary = el('button', 'enc-summary');
      summary.type = 'button';
      summary.setAttribute('aria-expanded', String(open));
      const badge = (math, label) => {
        const b = el('span', `enc-badge diff-${math.difficulty.toLowerCase()}`);
        b.append(el('strong', '', math.difficulty), document.createTextNode(` ${math.adjusted.toLocaleString()} XP${label ? ` ${label}` : ''}`));
        return b;
      };
      summary.append(el('span', 'enc-title', 'Encounter'), badge(all, anyHidden ? 'all' : ''));
      if (anyHidden) summary.append(badge(now, 'in fight'));
      summary.append(el('span', 'enc-caret', open ? '▾' : '▸'));
      summary.addEventListener('click', () => { setPanelOpen(`encounter-${large ? 'large' : 'corner'}`, !open); render(); });
      wrap.append(summary);
      if (!open) return wrap;

      const body = el('div', 'enc-body');
      // Party: whoever is marked Party in the tracker. Levels edit the Bestiary entry when there is one.
      const { members, missingLevel } = partyLevels(list);
      const partyRow = el('div', 'enc-party');
      partyRow.append(el('span', 'enc-label', `Party (${members.length})`));
      if (!members.length) {
        partyRow.append(el('span', 'enc-hint', 'No one is marked Party. Use + Add party, or click a row\'s chip until it shows P.'));
      }
      members.forEach(c => {
        const lab = el('label', 'enc-level');
        lab.append(el('span', '', c.name || 'Unnamed'));
        const inp = el('input', 'init-input');
        inp.type = 'number'; inp.min = '1'; inp.max = '20';
        inp.value = combatantLevel(c) ?? '';
        inp.placeholder = '?';
        inp.setAttribute('aria-label', `Level of ${c.name || 'party member'}`);
        inp.addEventListener('change', () => dm.update(d => {
          const level = Math.min(20, Math.max(1, Math.round(Number(inp.value) || 1)));
          const creature = c.source?.type === 'library' ? d.bestiary.find(x => x.id === c.source.slug) : null;
          if (creature) creature.level = level;
          const t = d.tracker.combatants.find(x => x.id === c.id);
          if (t) t.level = level;
        }));
        lab.append(inp);
        partyRow.append(lab);
      });
      if (missingLevel) partyRow.append(el('span', 'enc-warn', `${missingLevel} without a level (counted as level 1)`));
      body.append(partyRow);

      // Numbers: everyone vs. in the fight now
      const table = el('div', 'enc-table');
      const cols = anyHidden ? [['All (incl. hidden)', all], ['In the fight now', now]] : [['Encounter', all]];
      const rowOf = (label, f) => { const r = el('div', 'enc-row'); r.append(el('span', 'enc-k', label), ...cols.map(([, m]) => el('span', 'enc-v', f(m)))); return r; };
      const head = el('div', 'enc-row enc-head'); head.append(el('span', ''), ...cols.map(([t]) => el('span', 'enc-v', t)));
      table.append(head,
        rowOf('Difficulty', m => m.difficulty),
        rowOf('Hostiles counted', m => `${m.counted}${m.missingCr ? ` (+${m.missingCr} without CR)` : ''}`),
        rowOf('XP (raw)', m => m.rawXp.toLocaleString()),
        rowOf('Multiplier', m => `×${m.multiplier}`),
        rowOf('Adjusted XP', m => m.adjusted.toLocaleString()),
        rowOf('XP per player', m => m.perPlayer.toLocaleString()),
      );
      body.append(table);

      // Party thresholds
      const th = el('div', 'enc-thresholds');
      all.thresholds.forEach((t, i) => {
        const cell = el('span', `enc-th diff-${DIFFICULTIES[i].toLowerCase()}`);
        cell.append(el('strong', '', DIFFICULTIES[i]), document.createTextNode(` ${t.toLocaleString()}`));
        th.append(cell);
      });
      body.append(th);
      if (all.missingCr) body.append(el('p', 'enc-warn', `${all.missingCr} hostile${all.missingCr === 1 ? ' has' : 's have'} no CR, so ${all.missingCr === 1 ? "it isn't" : "they aren't"} counted. Add them from the bestiary, or set a CR there.`));
      body.append(el('p', 'enc-note', `2014 DMG rules · ${all.party} player${all.party === 1 ? '' : 's'} · allies don't count`));
      wrap.append(body);
      return wrap;
    };

    // Fill a Damage / Heal pill from a combatant (name, HP, health color)
    const fillPill = (pill, c) => {
      pill.className = `hp-pill ${hpState(c)}`;
      pill.replaceChildren(el('span', 'hp-pill-name', c.name || 'Unnamed'));
      if (c.hp !== null && c.hp !== undefined) {
        pill.append(el('span', 'hp-pill-hp', c.maxHp ? `${c.hp}/${c.maxHp}` : `${c.hp}`));
      }
    };

    // Move the turn forward or back, skipping hidden combatants (rounds count on wrap-around)
    const step = (tracker, dir) => {
      const all = tracker.combatants;
      if (!all.some(c => !c.hidden)) return;
      let i = tracker.turn;
      do {
        i += dir;
        if (i >= all.length) { i = 0; tracker.round += 1; }
        if (i < 0) { i = all.length - 1; tracker.round = Math.max(1, tracker.round - 1); }
      } while (all[i].hidden);
      tracker.turn = i;
    };

    // Builds the whole tracker into `root`: the corner panel, or the large centered view
    const build = (root, large) => {
      // Field edits don't redraw (so typing isn't interrupted), so update that one pill directly
      const syncPill = id => {
        const c = dm.data.tracker.combatants.find(x => x.id === id);
        const pill = root.querySelector(`.hp-pill[data-id="${CSS.escape(id)}"]`);
        if (c && pill) fillPill(pill, c);
      };
      const open = large || panelOpen('initiative', !window.matchMedia('(max-width: 640px)').matches);
      const { tracker, encounters } = dm.data;
      const list = tracker.combatants;
      root.replaceChildren();
      root.classList.toggle('is-min', !open);

      if (!open) {
        root.append(btn(`⚔ Initiative${list.length ? ` (${list.length})` : ''}`, 'Show initiative tracker',
          () => { setPanelOpen('initiative', true); render(); }, 'btn init-open'));
        render.statusOnly = null;
        return;
      }

      // Header: round, turn controls, minimize
      const head = el('header', 'dm-head');
      const title = el('h2', 'dm-title', 'Initiative');
      title.append(el('span', 'init-round', `Round ${tracker.round}`));
      const tools = el('div', 'dm-tools');
      tools.append(
        btn('◀', 'Previous turn', () => dm.update(d => step(d.tracker, -1))),
        btn('Next ▶', 'Next turn', () => dm.update(d => step(d.tracker, 1)), 'btn primary'),
        btn('Sort', 'Sort by initiative (highest first)', () => dm.update(d => {
          const currentId = d.tracker.combatants[d.tracker.turn]?.id;
          d.tracker.combatants.sort((a, b) => (b.init ?? -Infinity) - (a.init ?? -Infinity));
          d.tracker.turn = Math.max(0, d.tracker.combatants.findIndex(c => c.id === currentId));
        }), 'btn'),
        btn('📖', 'Open your bestiary', () => openBestiary()),
        btn('✨', 'Open your spellbook', () => openSpellbook()),
        ...(large
          ? [btn('Close', 'Close the large view', () => dialog?.close(), 'btn')]
          : [btn('⤢', 'Open a larger view', openLarge),
             btn('–', 'Minimize initiative tracker', () => { setPanelOpen('initiative', false); render(); })]),
      );
      head.append(title, tools);
      root.append(head);
      if (large) root.append(bestiarySearch(root));

      // Rows
      const table = el('div', 'init-table');
      const cols = el('div', 'init-row init-cols');
      ['', '', 'Init', 'Name', 'HP', 'Max', 'AC', '', '', '', ''].forEach(t => cols.append(el('span', '', t)));
      table.append(cols);
      if (!list.length) table.append(el('p', 'dm-empty', 'Add combatants, or load a saved encounter below.'));

      list.forEach((c, i) => {
        const row = el('div', `init-row${i === tracker.turn ? ' is-turn' : ''}${c.hidden ? ' is-hidden' : ''}`);
        paintHp(row, c);
        row.append(el('span', 'turn-mark', i === tracker.turn ? '▶' : ''));
        // Side chip: click to cycle Party → Ally → Hostile
        const side = sideOf(c);
        const SIDES = { party: ['P', 'Party'], ally: ['A', 'Ally'], hostile: ['H', 'Hostile'] };
        const next = { party: 'ally', ally: 'hostile', hostile: 'party' }[side];
        row.append(btn(SIDES[side][0], `${c.name || 'Combatant'} is ${SIDES[side][1]}; click for ${SIDES[next][1]}`, () => dm.update(d => {
          const t = d.tracker.combatants.find(x => x.id === c.id);
          if (t) t.side = next;
        }), `side-chip side-${side}`));

        const field = (key, label, width, opts = {}) => {
          const input = el('input', `init-input ${opts.cls || ''}`);
          input.type = 'text';
          input.inputMode = opts.text ? 'text' : 'numeric';
          input.value = c[key] ?? '';
          input.setAttribute('aria-label', `${label} for ${c.name || 'combatant'}`);
          input.placeholder = opts.placeholder || '';
          input.addEventListener('change', () => {
            const raw = input.value.trim();
            dm.update(d => {
              const target = d.tracker.combatants.find(x => x.id === c.id);
              if (!target) return;
              if (opts.text) target[key] = raw;
              else if (key === 'hp' && /^[+-]\d+$/.test(raw)) {
                // "-7" deals 7 damage, "+5" heals 5
                applyHp(target, Number(raw));
                input.value = target.hp;
              } else target[key] = numOrNull(raw);
              paintHp(row, target);
            }, { quiet: true });
            syncPill(c.id);
          });
          input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
          return input;
        };

        row.append(
          field('init', 'Initiative', 0),
          field('name', 'Name', 0, { text: true, placeholder: 'Name', cls: 'init-name' }),
          field('hp', 'Current HP', 0, { placeholder: '–' }),
          field('maxHp', 'Max HP', 0, { placeholder: '–' }),
          field('ac', 'AC', 0, { placeholder: '–' }),
          (() => {
            // Move up / down to break ties (e.g. by Dex). The current turn stays with the same combatant.
            const move = dir => dm.update(d => {
              const all = d.tracker.combatants;
              const idx = all.findIndex(x => x.id === c.id);
              const to = idx + dir;
              if (to < 0 || to >= all.length) return;
              const currentId = all[d.tracker.turn]?.id;
              [all[idx], all[to]] = [all[to], all[idx]];
              d.tracker.turn = Math.max(0, all.findIndex(x => x.id === currentId));
            });
            const wrap = el('span', 'init-move');
            const up = btn('▲', `Move ${c.name || 'combatant'} up`, () => move(-1), 'move-btn');
            const down = btn('▼', `Move ${c.name || 'combatant'} down`, () => move(1), 'move-btn');
            up.disabled = i === 0;
            down.disabled = i === list.length - 1;
            wrap.append(up, down);
            return wrap;
          })(),
          btn(c.hidden ? '◌' : '◉', c.hidden ? `Show ${c.name || 'combatant'} (bring into the fight)` : `Hide ${c.name || 'combatant'} (staged; skipped in turns, still counted in encounter math)`,
            () => dm.update(d => { const t = d.tracker.combatants.find(x => x.id === c.id); if (t) t.hidden = !t.hidden; }),
            `icon-btn eye-btn${c.hidden ? ' is-off' : ''}`),
          btn(openNotes.has(c.id) ? '▾' : (c.notes ? '✎' : '▸'),
            `${c.source ? 'Stat block and notes' : 'Notes'} for ${c.name || 'combatant'}`, () => {
            openNotes.has(c.id) ? openNotes.delete(c.id) : openNotes.add(c.id);
            render();
          }, `icon-btn${c.notes ? ' has-notes' : ''}${c.source ? ' has-statblock' : ''}`),
          btn('×', `Remove ${c.name || 'combatant'}`, () => dm.update(d => {
            const idx = d.tracker.combatants.findIndex(x => x.id === c.id);
            d.tracker.combatants.splice(idx, 1);
            if (idx < d.tracker.turn) d.tracker.turn -= 1;
            d.tracker.turn = Math.min(d.tracker.turn, Math.max(0, d.tracker.combatants.length - 1));
          }), 'icon-btn danger'),
        );
        table.append(row);

        if (openNotes.has(c.id)) {
          // Creatures from your bestiary show their stat block above the notes
          if (c.source?.type === 'library') {
            const creature = findCreature(c.source.slug);
            const holder = el('div', 'statblock-holder');
            if (creature) holder.append(renderCreatureBlock(creature));
            else holder.textContent = 'This creature is no longer in your bestiary.';
            table.append(holder);
          } else if (c.source?.type === 'open5e' && c.source.slug) {
            const holder = el('div', 'statblock-holder', 'Loading stat block…');
            bestiaryClient.creature(c.source.slug)
              .then(sb => holder.replaceChildren(renderStatBlock(sb)))
              .catch(err => { holder.textContent = `Couldn't load the stat block (${err.message}).`; });
            table.append(holder);
          }
          const notes = el('textarea', 'init-notes');
          notes.rows = 3;
          notes.placeholder = 'Abilities, resistances, reminders…';
          notes.value = c.notes || '';
          notes.setAttribute('aria-label', `Notes for ${c.name || 'combatant'}`);
          notes.addEventListener('change', () => dm.update(d => {
            const target = d.tracker.combatants.find(x => x.id === c.id);
            if (target) target.notes = notes.value;
          }, { quiet: true }));
          table.append(notes);
        }
      });
      root.append(table);
      if (large && list.length) root.append(encounterPanel(list, large));

      // Damage / Heal: pick someone, type an amount, press a button (Enter = Damage). Hidden combatants are left out.
      const active = list.filter(c => !c.hidden);
      if (active.length) {
        if (!active.some(c => c.id === hpTargetId)) hpTargetId = (list[tracker.turn] && !list[tracker.turn].hidden ? list[tracker.turn].id : active[0].id);
        const bar = el('div', 'hp-adjust');
        // One pill per combatant: click to choose who the Damage / Heal buttons apply to
        const pills = el('div', 'hp-pills');
        pills.setAttribute('role', 'group');
        pills.setAttribute('aria-label', 'Choose who to damage or heal');
        active.forEach(c => {
          const pill = el('button');
          pill.type = 'button';
          pill.dataset.id = c.id;
          pill.setAttribute('aria-pressed', String(c.id === hpTargetId));
          fillPill(pill, c);
          pill.addEventListener('click', () => {
            hpTargetId = c.id;
            pills.querySelectorAll('.hp-pill').forEach(p => p.setAttribute('aria-pressed', String(p.dataset.id === c.id)));
            root.querySelector('.hp-amount')?.focus();
          });
          pills.append(pill);
        });
        const controls = el('div', 'hp-controls');
        const amount = el('input', 'init-input hp-amount');
        amount.type = 'number';
        amount.min = '0';
        amount.inputMode = 'numeric';
        amount.placeholder = 'HP';
        amount.setAttribute('aria-label', 'Amount of HP');
        const apply = sign => {
          const n = Math.abs(Math.round(Number(amount.value)));
          if (!n) { amount.focus(); return; }
          dm.update(d => {
            const target = d.tracker.combatants.find(x => x.id === hpTargetId);
            if (target) applyHp(target, sign * n);
          });
          root.querySelector('.hp-amount')?.focus();
        };
        amount.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); apply(-1); } });
        controls.append(amount,
          btn('− Damage', 'Subtract HP', () => apply(-1), 'btn danger'),
          btn('+ Heal', 'Add HP (up to max)', () => apply(1), 'btn heal'));
        bar.append(pills, controls);
        root.append(bar);
      }

      if (!large) {
        const addRow = el('div', 'init-add-buttons');
        addRow.append(
          btn('+ Add combatant', null, () => {
            dm.update(d => { d.tracker.combatants.push({ id: newId(), name: '', init: null, hp: null, maxHp: null, ac: null, notes: '', source: null, side: 'party', hidden: false, level: null, cr: '' }); });
            root.querySelector('.init-table .init-row:last-of-type .init-name')?.focus();
          }, 'btn init-add'),
          partyButton(),
        );
        root.append(addRow);
      }


      // Saved encounters
      const enc = el('div', 'init-encounters');
      const select = el('select', 'init-select');
      select.setAttribute('aria-label', 'Saved encounters');
      select.append(new Option(encounters.length ? 'Saved encounters…' : 'No saved encounters', ''));
      encounters.forEach(e => select.append(new Option(`${e.name} (${e.combatants.length})`, e.id)));
      const chosen = () => encounters.find(e => e.id === select.value);

      enc.append(
        select,
        btn('Load', 'Load the selected encounter', () => {
          const e = chosen();
          if (!e) return;
          if (list.length && !confirm(`Replace the current initiative with "${e.name}"?`)) return;
          dm.update(d => {
            d.tracker = { round: 1, turn: 0, combatants: e.combatants.map(c => ({ ...structuredClone(c), id: newId() })) };
          });
        }, 'btn'),
        btn('Delete', 'Delete the selected saved encounter', () => {
          const e = chosen();
          if (!e || !confirm(`Delete the saved encounter "${e.name}"?`)) return;
          dm.update(d => { d.encounters = d.encounters.filter(x => x.id !== e.id); });
          dm.save();
        }, 'btn danger'),
      );
      root.append(enc);

      const foot = el('div', 'init-foot');
      foot.append(
        btn('Save as encounter…', 'Save the current combatants as a reusable encounter', () => {
          if (!list.length) return;
          const name = (prompt('Name this encounter') || '').trim();
          if (!name) return;
          const existing = encounters.find(e => e.name.toLowerCase() === name.toLowerCase());
          if (existing && !confirm(`Replace the saved encounter "${existing.name}"?`)) return;
          dm.update(d => {
            const saved = { id: existing?.id || newId(), name, savedAt: new Date().toISOString(), combatants: structuredClone(d.tracker.combatants) };
            d.encounters = [...d.encounters.filter(e => e.id !== saved.id), saved];
          });
          dm.save();   // saving an encounter is a deliberate save, so upload it
        }, 'btn'),
        btn('Clear', 'Remove everyone from initiative', () => {
          if (!list.length || !confirm('Clear the initiative tracker?')) return;
          dm.update(d => { d.tracker = { round: 1, turn: 0, combatants: [] }; });
        }, 'btn danger'),
      );
      const saveRow = saveControls('dm-save-row init-save');
      foot.append(saveRow);
      root.append(foot);
      render.statusOnly = saveRow.refresh;
    };

    // Large view: the same tracker in a centered modal with bigger text
    let dialog = null, body = null;
    function openLarge() {
      dialog = document.createElement('dialog');
      dialog.className = 'init-modal';
      dialog.setAttribute('aria-label', 'Initiative tracker');
      body = el('section', 'init-tracker is-large');
      body.tabIndex = -1;   // lets focus rest on the window itself after a rebuild
      dialog.append(body);
      document.body.append(dialog);
      dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });   // click outside to close
      dialog.addEventListener('close', () => {
        dialog.remove();
        dialog = body = null;
        render();
      });
      render();
      dialog.showModal();
    }

    const render = () => {
      if (dialog) {
        // While the large view is open, the corner just shows a placeholder
        root.replaceChildren();
        root.classList.add('is-min');
        root.append(btn('⚔ Initiative (large view open)', null, () => {}, 'btn init-open'));
        build(body, true);
        // A rebuild replaces the button you clicked; keep focus in the window so Escape and Tab still work
        if (!dialog.contains(document.activeElement)) body.focus({ preventScroll: true });
      } else {
        build(root, false);
      }
    };
    dm.subscribe(render);
    render();
    return root;
  },
});

/* ---- Bestiary menu (DM view) ----
   Your prepared creatures: import from Open5e or create from scratch, set the
   numbers the tracker uses, link a Notion page (Hostiles, NPC or PC), and keep notes.
   Edits are local until you press Save, like everything else. */
function openBestiary(selectId = null) {
  if (document.querySelector('dialog.bestiary-modal')) return;
  let selected = selectId;
  let editing = false;   // view mode by default; new creatures open in edit mode
  let filter = '';

  const dialog = document.createElement('dialog');
  dialog.className = 'bestiary-modal';
  dialog.setAttribute('aria-labelledby', 'bestiary-title');
  dialog.innerHTML = `
    <div class="bst">
      <header class="bst-head">
        <h2 id="bestiary-title">Bestiary</h2>
        <div class="bst-head-tools">
          <button type="button" class="btn" data-sync title="Refresh the list of Notion pages tagged Hostiles, NPC or PC">Sync Notion</button>
          <button type="button" class="btn" data-close>Close</button>
        </div>
      </header>
      <div class="bst-body">
        <aside class="bst-side">
          <input type="search" class="bst-filter" placeholder="Filter your creatures…" aria-label="Filter your creatures">
          <ul class="bst-list" aria-label="Your creatures"></ul>
          <button type="button" class="btn" data-new>+ New creature</button>
        </aside>
        <section class="bst-main" aria-live="polite"></section>
        <aside class="bst-search bst-spellcol" hidden aria-label="Spell">
          <header class="bst-search-head">
            <h3>Spell</h3>
            <button type="button" class="icon-btn" data-spell-close aria-label="Close the spell">✕</button>
          </header>
          <div class="bst-spellcol-body"></div>
        </aside>
        <aside class="bst-search bst-o5e" hidden aria-label="Search Open5e">
          <header class="bst-search-head">
            <h3>Presets &amp; Open5e</h3>
            <button type="button" class="icon-btn" data-search-close aria-label="Close the search without choosing">✕</button>
          </header>
          <input type="search" class="bst-filter" id="bst-search-input" placeholder="Search your presets and Open5e…" aria-label="Search your presets and Open5e" autocomplete="off">
          <p class="bst-search-status" role="status"></p>
          <ul class="bst-results" aria-label="Open5e results"></ul>
        </aside>
      </div>
      <footer class="bst-foot"></footer>
    </div>`;
  document.body.append(dialog);
  const $ = s => dialog.querySelector(s);
  const listEl = $('.bst-list'), mainEl = $('.bst-main');

  // Save controls (the same local-then-Save rule as the rest of the DM view)
  const saveRow = saveControls('dm-save-row');
  $('.bst-foot').append(saveRow);
  const onDmChange = () => { renderList(); saveRow.refresh(); };
  onDmChange.statusOnly = saveRow.refresh;
  dm.subscribe(onDmChange);

  const close = () => dialog.close();
  dialog.addEventListener('close', () => { dm.unsubscribe(onDmChange); dialog.remove(); dm.refresh(); });
  dialog.addEventListener('click', e => { if (e.target === dialog) close(); });
  $('[data-close]').addEventListener('click', close);

  function select(id, { edit = false } = {}) { selected = id; editing = edit; renderList(); renderEditor(); }

  function renderList() {
    const q = nameKey(filter);
    const creatures = [...dm.data.bestiary].sort((a, b) => creatureName(a).localeCompare(creatureName(b)))
      .filter(c => !q || nameKey(creatureName(c)).includes(q));
    listEl.replaceChildren();
    if (!dm.data.bestiary.length) listEl.append(el('li', 'dm-empty', 'No creatures yet. Import one from Open5e or create a new one.'));
    else if (!creatures.length) listEl.append(el('li', 'dm-empty', 'No matches.'));
    creatures.forEach(c => {
      const li = el('li');
      const b = el('button', 'bst-item');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(c.id === selected));
      b.append(el('span', 'bst-item-name', creatureName(c)), el('span', 'bst-item-cr', c.cr ? `CR ${c.cr}` : ''));
      if (c.inParty) b.append(el('span', 'bst-item-party', 'P'));
      if (c.notionId) b.append(el('span', 'bst-item-linked', '🔗'));
      b.addEventListener('click', () => select(c.id));
      li.append(b);
      listEl.append(li);
    });
  }

  // One creature, in view mode (name + stat block + notes) or edit mode (every input)
  function renderEditor() {
    const creature = findCreature(selected);
    const keepScroll = mainEl.scrollTop;
    mainEl.replaceChildren();
    mainEl.classList.toggle('is-editing', editing && !!creature);
    if (!creature) {
      mainEl.append(el('p', 'bst-empty', 'Pick a creature on the left, or create a new one.'));
      return;
    }

    // Change the creature, keep its stored name in sync, then refresh what depends on it
    const set = (mutate, { redraw = false } = {}) => {
      dm.update(d => {
        const c = d.bestiary.find(x => x.id === creature.id);
        if (!c) return;
        mutate(c);
        c.name = creatureName(c);
        c.xp = xpForCr(c.cr);
      }, { quiet: true });
      renderList();
      if (redraw) renderEditor();
      else drawPreview();
    };
    const setSb = mutate => set(c => { c.statblock = c.statblock || {}; mutate(c.statblock); });
    const current = () => findCreature(creature.id) || creature;

    const addRow = () => {
      const row = el('div', 'bst-add-row');
      const count = el('input', 'init-input bst-count');
      count.type = 'number'; count.min = '1'; count.max = '20'; count.value = '1';
      count.setAttribute('aria-label', 'How many to add');
      const added = el('span', 'bst-added');
      const addBtn = el('button', 'btn primary', 'Add to initiative');
      addBtn.type = 'button';
      addBtn.addEventListener('click', () => {
        const n = Math.min(20, Math.max(1, Math.round(Number(count.value) || 1)));
        addFromBestiary(current(), n);
        added.textContent = `Added ${n} to initiative`;
        setTimeout(() => { added.textContent = ''; }, 2000);
      });
      row.append(count, addBtn, added);
      return row;
    };

    // ---------- View mode ----------
    if (!editing) {
      const head = el('div', 'bst-view-head');
      head.append(el('h3', 'bst-view-name', creatureName(creature)));
      const editBtn = el('button', 'btn', 'Edit');
      editBtn.type = 'button';
      editBtn.addEventListener('click', () => { editing = true; renderEditor(); });
      head.append(editBtn);
      mainEl.append(head, addRow());
      const holder = el('div', 'statblock-holder bst-block');
      holder.append(renderCreatureBlock(creature));
      mainEl.append(holder);
      return;
    }

    // ---------- Edit mode ----------
    const num = v => (v === '' || !Number.isFinite(Number(v)) ? null : Math.round(Number(v)));
    const top = el('div', 'bst-editor-top');
    const searchBtn = el('button', 'btn', creature.source ? 'Replace from search…' : 'Search presets & Open5e…');
    searchBtn.type = 'button';
    searchBtn.dataset.openSearch = '';
    searchBtn.addEventListener('click', () => openSearch(creatureName(creature) !== 'Unnamed creature' ? creatureName(creature) : ''));
    top.append(searchBtn);
    if (creature.source?.type === 'open5e' && creature.source.slug) {
      const reset = el('button', 'btn', 'Reset to Open5e');
      reset.type = 'button';
      reset.title = 'Re-fetch the original stat block and numbers (your name override, notes and Notion link stay)';
      reset.addEventListener('click', async () => {
        if (!confirm(`Reset ${creatureName(creature)} to the Open5e stat block? Your edits to stats and actions will be replaced.`)) return;
        try {
          const sb = await bestiaryClient.creature(creature.source.slug);
          set(c => Object.assign(c, { cr: sb.cr, ac: sb.ac, hp: sb.hp, hitDice: sb.hitDice, initBonus: abilityMod(sb.abilities?.dex), statblock: structuredClone(sb) }), { redraw: true });
          if (parseSpellcasting(sb)) importSpellsFromStatblock(creature.id).then(() => renderEditor());
        } catch (err) { alert(`Couldn't reach Open5e (${err.message}).`); }
      });
      top.append(reset);
    }
    const preset = creature.source?.type === 'preset' ? findPreset(creature.source.slug) : null;
    if (preset) {
      const resetP = el('button', 'btn', 'Reset to preset');
      resetP.type = 'button';
      resetP.title = 'Put the stats and actions back to the saved preset (your name override, notes and Notion link stay)';
      resetP.addEventListener('click', () => {
        if (!confirm(`Reset ${creatureName(creature)} to the "${preset.name}" preset? Your edits to stats and actions will be replaced.`)) return;
        set(c => applyPreset(c, preset), { redraw: true });
      });
      top.append(resetP);
    }
    const savePreset = el('button', 'btn', 'Save as preset');
    savePreset.type = 'button';
    savePreset.title = 'Save this stat block to reuse later; presets show up in search next to Open5e';
    savePreset.addEventListener('click', () => {
      const c = current();
      const name = (prompt('Name this preset (it will show up in search)', creatureName(c)) || '').trim();
      if (!name) return;
      const existing = dm.data.presets.find(p => p.name.toLowerCase() === name.toLowerCase());
      if (existing && !confirm(`Replace the existing "${existing.name}" preset?`)) return;
      dm.update(d => {
        const saved = {
          id: existing?.id || newId(), name, cr: c.cr, xp: xpForCr(c.cr), ac: c.ac, hp: c.hp, hitDice: c.hitDice,
          initBonus: c.initBonus, source: c.source?.type === 'open5e' ? c.source : null,
          statblock: { ...structuredClone(c.statblock || {}), name },
          spellAbility: c.spellAbility || '', spellDc: c.spellDc ?? null, spellAttack: c.spellAttack ?? null,
          spells: structuredClone(c.spells || []),
        };
        d.presets = [...d.presets.filter(p => p.id !== saved.id), saved];
      }, { quiet: true });
      savePreset.textContent = 'Saved as preset ✓';
      setTimeout(() => { savePreset.textContent = 'Save as preset'; }, 1800);
    });
    top.append(savePreset);
    top.append(el('span', 'bst-source', preset ? `From preset: ${preset.name}`
      : creature.source?.type === 'preset' ? 'From a deleted preset'
      : creature.source ? `From Open5e${creature.statblock?.source ? `: ${creature.statblock.source}` : ''}` : 'Homebrew'));
    const done = el('button', 'btn primary bst-done', 'Done');
    done.type = 'button';
    done.addEventListener('click', () => { editing = false; renderEditor(); });
    top.append(done);
    mainEl.append(top);

    const group = (title) => { const g = el('fieldset', 'bst-group'); g.append(el('legend', '', title)); return g; };
    const input = (label, value, onChange, { wide = false, cls = '', placeholder = '', inputMode = '' } = {}) => {
      const lab = el('label', `bst-field ${wide ? 'wide' : ''} ${cls}`);
      lab.append(el('span', 'bst-label', label));
      const i = el('input', 'init-input');
      i.type = 'text';
      if (inputMode) i.inputMode = inputMode;
      i.value = value ?? '';
      i.placeholder = placeholder;
      i.addEventListener('change', () => onChange(i.value.trim(), i));
      lab.append(i);
      return lab;
    };

    // Name: your override; the placeholder shows what it falls back to
    const nameGroup = group('Name');
    const fallback = findCreaturePage(creature.notionId)?.name || creature.statblock?.name || '';
    const nameField = input('Name', creature.nameOverride, v => {
      set(c => { c.nameOverride = v; });
      nameHint.textContent = nameSourceLabel(current());
    }, { wide: true, placeholder: fallback || 'Name this creature' });
    const nameHint = el('span', 'bst-hint-line', nameSourceLabel(creature));
    nameGroup.append(nameField, nameHint);
    mainEl.append(nameGroup);

    // Notion link (pages tagged Hostiles, NPC or PC)
    const notion = el('div', 'bst-notion');
    notion.append(el('span', 'bst-label', 'Notion page (Hostiles, NPC, PC)'));
    const nCombo = el('div', 'combo');
    const nInput = el('input', 'combo-input init-input');
    nInput.type = 'text';
    nInput.id = 'bst-notion-input';
    nInput.placeholder = dm.creaturePages.length ? 'Not linked · type to search' : 'No Hostiles, NPC or PC pages found (try Sync Notion)';
    nInput.autocomplete = 'off';
    nInput.setAttribute('role', 'combobox');
    nInput.setAttribute('aria-label', 'Link a Notion page (Hostiles, NPC or PC)');
    nInput.setAttribute('aria-autocomplete', 'list');
    nInput.setAttribute('aria-expanded', 'false');
    const nList = el('ul', 'combo-list');
    nList.id = 'bst-notion-list';
    nList.setAttribute('role', 'listbox');
    nList.hidden = true;
    nInput.setAttribute('aria-controls', nList.id);
    nCombo.append(nInput, nList);
    const nLinks = el('div', 'loc-tags');
    const linkedName = () => findCreaturePage(current().notionId)?.name || (current().notionId ? 'Missing Notion page' : '');
    const drawLinks = () => {
      const page = findCreaturePage(current().notionId);
      nLinks.replaceChildren(...(page?.tag ? [el('span', 'tag tag-muted', page.tag)] : []), ...notionLinks(page));
      if (current().notionId) {
        const unlink = el('button', 'btn danger', 'Unlink');
        unlink.type = 'button';
        unlink.addEventListener('click', () => { set(c => { c.notionId = null; }, { redraw: true }); });
        nLinks.append(unlink);
      }
    };
    nInput.value = linkedName();
    createCombobox({
      input: nInput,
      list: nList,
      getOptions(query) {
        const q = nameKey(query);
        const found = dm.creaturePages.filter(pg => !q || nameKey(pg.name).includes(q) || nameKey(pg.tag).includes(q));
        return {
          options: found.slice(0, 50).map(pg => ({ id: pg.id, label: pg.name, detail: pg.tag, detailTag: true, selected: pg.id === current().notionId })),
          notes: dm.creaturePages.length ? (found.length ? [] : ['No matching pages.']) : ['No Notion pages tagged Hostiles, NPC or PC yet.'],
        };
      },
      // Linking only sets the link. The creature's name follows the page only while you haven't typed
      // your own (your name > Notion page > Open5e); nothing else about the creature changes.
      onChoose(opt) { set(c => { c.notionId = opt.id; }, { redraw: true }); },
      onClose() { nInput.value = linkedName(); },
    });
    nInput.addEventListener('focus', () => nInput.select());
    drawLinks();
    notion.append(nCombo, nLinks);
    if (!dm.creaturePages.length) {
      notion.append(el('p', 'bst-hint', 'No pages tagged Hostiles, NPC or PC were found in Notion.' +
        (dm.tagsSeen.length ? ` Tags in your database: ${dm.tagsSeen.join(', ')}.` : ' Try Sync Notion.')));
    }
    nameGroup.append(notion);

    // Party tag: "+ Add party" in the tracker adds everyone tagged
    const partyLab = el('label', 'bst-check');
    const partyBox = el('input');
    partyBox.type = 'checkbox';
    partyBox.checked = !!creature.inParty;
    partyBox.addEventListener('change', () => set(c => { c.inParty = partyBox.checked; }, { redraw: true }));
    partyLab.append(partyBox, document.createTextNode(' Party member (added together with + Add party)'));
    nameGroup.append(partyLab);

    // Character details (PCs and party members)
    if (isCharacter(creature)) {
      const ch = group('Character');
      const chGrid = el('div', 'bst-grid');
      chGrid.append(
        input('Level', creature.level, v => set(c => { c.level = v === '' ? null : Math.min(20, Math.max(1, num(v) || 1)); }), { inputMode: 'numeric', placeholder: '1' }),
        input('Class', creature.className, v => set(c => { c.className = v; }), { cls: 'span2', placeholder: 'Wizard (Divination)' }),
        input('Player', creature.player, v => set(c => { c.player = v; }), { placeholder: 'Who plays them' }),
        input('Passive Perception', creature.passive, v => set(c => { c.passive = num(v); }), { inputMode: 'numeric', placeholder: '10' }),
      );
      ch.append(chGrid);
      mainEl.append(ch);
    }

    // Core numbers (these are what the tracker uses) and description
    const sb = creature.statblock || {};
    const core = group('Combat');
    const coreGrid = el('div', 'bst-grid');
    const initField = input('Initiative bonus', creature.initBonus === null || creature.initBonus === undefined ? '' : signed(creature.initBonus),
      v => set(c => { c.initBonus = num(v.replace(/^\+/, '')); }), { inputMode: 'numeric' });
    coreGrid.append(
      input('CR', creature.cr, v => set(c => { c.cr = v; })),
      input('AC', creature.ac, v => set(c => { c.ac = num(v); }), { inputMode: 'numeric' }),
      input('Armor note', sb.acDesc, v => setSb(s => { s.acDesc = v; }), { cls: 'span2', placeholder: 'natural armor' }),
      input('HP', creature.hp, v => set(c => { c.hp = num(v); }), { inputMode: 'numeric' }),
      input('Hit dice', creature.hitDice, v => set(c => { c.hitDice = v; }), { placeholder: '2d6' }),
      initField,
      input('Speed', sb.speed, v => setSb(s => { s.speed = v; }), { cls: 'span2', placeholder: '30 ft., fly 60 ft.' }),
      input('Size', sb.size, v => setSb(s => { s.size = v; }), { placeholder: 'Medium' }),
      input('Type', sb.type, v => setSb(s => { s.type = v; }), { placeholder: 'humanoid' }),
      input('Subtype', sb.subtype, v => setSb(s => { s.subtype = v; }), { placeholder: 'goblinoid' }),
      input('Alignment', sb.alignment, v => setSb(s => { s.alignment = v; }), { cls: 'span2', placeholder: 'neutral evil' }),
    );
    core.append(coreGrid);
    mainEl.append(core);

    // Ability scores (Dex also moves the initiative bonus, unless you've set it to something else)
    const abil = group('Ability scores');
    const abilGrid = el('div', 'bst-abilities');
    ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(k => {
      abilGrid.append(input(k.toUpperCase(), sb.abilities?.[k], (v, i) => {
        const score = num(v);
        set(c => {
          c.statblock = c.statblock || {};
          c.statblock.abilities = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, ...(c.statblock.abilities || {}) };
          const oldDexMod = abilityMod(c.statblock.abilities.dex);
          c.statblock.abilities[k] = score ?? 10;
          if (k === 'dex' && (c.initBonus === null || c.initBonus === undefined || c.initBonus === oldDexMod)) {
            c.initBonus = abilityMod(c.statblock.abilities.dex);
            initField.querySelector('input').value = signed(c.initBonus);
          }
        });
        i.value = score ?? 10;
      }, { inputMode: 'numeric', placeholder: '10' }));
    });
    abil.append(abilGrid);
    mainEl.append(abil);

    // Details
    const details = group('Details');
    const detailGrid = el('div', 'bst-grid two');
    [['Saving throws', 'saves', 'Dex +4, Wis +2'], ['Skills', 'skills', 'Stealth +6'],
     ['Damage vulnerabilities', 'vulnerabilities', ''], ['Damage resistances', 'resistances', ''],
     ['Damage immunities', 'immunities', ''], ['Condition immunities', 'conditionImmunities', ''],
     ['Senses', 'senses', 'darkvision 60 ft., passive Perception 9'], ['Languages', 'languages', 'Common, Goblin'],
    ].forEach(([label, key, ph]) => detailGrid.append(input(label, sb[key], v => setSb(s => { s[key] = v; }), { placeholder: ph })));
    details.append(detailGrid);
    mainEl.append(details);

    // Spellcasting: ability, DC, attack bonus, and spells picked from the whole Spellbook catalog
    const casting = group('Spellcasting');
    const castGrid = el('div', 'bst-grid');
    const abilLab = el('label', 'bst-field');
    abilLab.append(el('span', 'bst-label', 'Ability'));
    const abilSel = el('select', 'init-input');
    [['', '—'], ['int', 'Intelligence'], ['wis', 'Wisdom'], ['cha', 'Charisma']].forEach(([v, t]) => { const o = el('option', '', t); o.value = v; abilSel.append(o); });
    abilSel.value = creature.spellAbility || '';
    abilSel.addEventListener('change', () => set(c => { c.spellAbility = abilSel.value; }));
    abilLab.append(abilSel);
    castGrid.append(abilLab,
      input('Spell save DC', creature.spellDc, v => set(c => { c.spellDc = num(v); }), { inputMode: 'numeric', placeholder: '13' }),
      input('Spell attack', creature.spellAttack == null ? '' : signed(creature.spellAttack), v => set(c => { c.spellAttack = num(v.replace(/^\+/, '')); }), { inputMode: 'numeric', placeholder: '+5' }));
    casting.append(castGrid);

    // Picker over every spell (Open5e + yours)
    const pick = el('div', 'combo spl-pick');
    const pickInput = el('input', 'combo-input init-input');
    pickInput.type = 'text';
    pickInput.id = 'bst-spell-pick';
    pickInput.placeholder = 'Add a spell… (type to search every spell)';
    pickInput.autocomplete = 'off';
    pickInput.setAttribute('role', 'combobox');
    pickInput.setAttribute('aria-label', 'Add a spell');
    pickInput.setAttribute('aria-autocomplete', 'list');
    pickInput.setAttribute('aria-expanded', 'false');
    const pickList = el('ul', 'combo-list');
    pickList.id = 'bst-spell-pick-list';
    pickList.setAttribute('role', 'listbox');
    pickList.hidden = true;
    pickInput.setAttribute('aria-controls', pickList.id);
    pick.append(pickInput, pickList);
    const pickBox = createCombobox({
      input: pickInput,
      list: pickList,
      getOptions(query) {
        const words = nameKey(query).split(' ').filter(Boolean);
        const have = new Set((current().spells || []).map(sp => spellInfo(sp.key)?.key || sp.key));
        const found = words.length ? spellCatalog().map(s => ({ ...s, via: spellMatch(s, words).via, ok: spellMatch(s, words).ok })).filter(s => s.ok) : [];
        found.sort((a, b) => (b.mine - a.mine) || a.level - b.level || a.name.localeCompare(b.name));
        const notes = [];
        if (!spellIndex.list) notes.push(spellIndex.loading ? 'Loading Open5e spells…' : 'Open5e spells not loaded yet; your own spells still show.');
        if (!words.length) notes.push('Type a spell name.');
        else if (!found.length) notes.push('No spells match. Add it in the Spellbook (✨) with "+ New spell".');
        return {
          options: found.slice(0, 40).map(s => ({
            key: s.key, name: s.name, level: s.level, label: s.name + (have.has(s.key) ? ' ✓' : ''),
            detail: [s.via && `aka ${s.via}`, s.level === 0 ? 'Cantrip' : `Level ${s.level}`, s.school && titleCase(s.school), s.mine ? 'Yours' : s.source].filter(Boolean).join(' · '),
          })),
          notes,
        };
      },
      onChoose(opt) {
        set(c => {
          c.spells = c.spells || [];
          if (!c.spells.some(sp => sp.key === opt.key)) c.spells.push({ key: opt.key, name: opt.name, level: opt.level, prepared: true, note: '' });
        }, { redraw: true });
        setTimeout(() => mainEl.querySelector('#bst-spell-pick')?.focus(), 0);
      },
    });
    if (!spellIndex.list && !spellIndex.loading) spellIndex.load().then(() => pickBox.refresh()).catch(() => {});
    casting.append(pick);

    // The creature's spells: open, prepared, note, remove
    const spellRows = el('div', 'spl-pick-rows');
    const spells = [...(creature.spells || [])].map(sp => ({ ...sp, info: spellInfo(sp.key) }))
      .sort((a, b) => (a.info?.level ?? a.level) - (b.info?.level ?? b.level) || (a.info?.name || a.name).localeCompare(b.info?.name || b.name));
    // Point one spell at a different Spellbook spell (Open5e, another source, or your own)
    const relink = (row, sp) => {
      const box = el('div', 'combo spl-relink');
      const inp = el('input', 'combo-input init-input');
      inp.type = 'text'; inp.value = sp.name; inp.autocomplete = 'off';
      inp.id = `bst-relink-${sp.key.replace(/[^\w-]/g, '')}`;
      inp.setAttribute('role', 'combobox'); inp.setAttribute('aria-label', `Link ${sp.name} to a spell`);
      inp.setAttribute('aria-autocomplete', 'list'); inp.setAttribute('aria-expanded', 'false');
      const lst = el('ul', 'combo-list'); lst.id = `${inp.id}-list`; lst.setAttribute('role', 'listbox'); lst.hidden = true;
      inp.setAttribute('aria-controls', lst.id);
      box.append(inp, lst);
      const cancel = el('button', 'btn', 'Cancel'); cancel.type = 'button';
      cancel.addEventListener('click', () => renderEditor());
      row.replaceChildren(box, cancel);
      row.classList.add('is-relinking');
      const relinkBox = createCombobox({
        input: inp, list: lst,
        getOptions(query) {
          const words = nameKey(query || inp.value).split(' ').filter(Boolean);   // starts with the spell's own name
          const found = spellCatalog().map(s => ({ ...s, ...spellMatch(s, words) })).filter(s => s.ok)
            .sort((a, b) => (b.mine - a.mine) || a.level - b.level || a.name.localeCompare(b.name));
          return {
            options: found.slice(0, 40).map(s => ({ key: s.key, name: s.name, level: s.level, label: s.name,
              detail: [s.via && `aka ${s.via}`, s.level === 0 ? 'Cantrip' : `Level ${s.level}`, s.mine ? 'Yours' : s.source].filter(Boolean).join(' · ') })),
            notes: found.length ? [] : ['No spells match. Use Create to add it to your Spellbook.'],
          };
        },
        onChoose(opt) {
          set(c => {
            const t = c.spells.find(x => x.key === sp.key);
            if (!t) return;
            if (c.spells.some(x => x.key === opt.key && x !== t)) { c.spells = c.spells.filter(x => x !== t); return; }
            Object.assign(t, { key: opt.key, name: opt.name, level: opt.level });
          }, { redraw: true });
        },
      });
      inp.focus(); inp.select();
      relinkBox.open();   // show matches for the current name straight away
    };

    // Not in your Spellbook: start a spell there with the name and level filled in, and link to it
    const createFor = sp => {
      const id = newId();
      dm.update(d => {
        d.spells.push({ id, name: sp.name, level: sp.level ?? 0, school: '', castingTime: '1 action', range: '', components: '', material: '',
          duration: '', concentration: false, ritual: false, classes: '', desc: '', higherLevel: '', book: '', notes: '', source: null });
        const c = d.bestiary.find(x => x.id === creature.id);
        const t = c?.spells.find(x => x.key === sp.key);
        if (t) t.key = `c:${id}`;
      });
      renderEditor();
      openSpellbook(`c:${id}`, { edit: true });
    };

    spells.forEach(sp => {
      const row = el('div', `spl-pick-row${sp.key.startsWith('u:') ? ' is-unlinked' : ''}`);
      if (sp.key.startsWith('u:')) {
        const name = el('span', 'spl-pick-open spl-unlinked-name', sp.name);
        name.title = 'Not linked to a spell in your Spellbook';
        const lvl = el('span', 'spl-pick-level', (sp.level ?? 0) === 0 ? 'Cantrip' : `L${sp.level}`);
        const actions = el('span', 'spl-link-actions');
        const linkBtn = el('button', 'btn', 'Link…'); linkBtn.type = 'button';
        linkBtn.addEventListener('click', () => relink(row, sp));
        const createBtn = el('button', 'btn', 'Create'); createBtn.type = 'button';
        createBtn.title = 'Add it to your Spellbook (name and level filled in) and link it';
        createBtn.addEventListener('click', () => createFor(sp));
        actions.append(el('span', 'spl-unlinked-tag', 'not linked'), linkBtn, createBtn);
        const rmU = el('button', 'icon-btn danger', '×'); rmU.type = 'button';
        rmU.setAttribute('aria-label', `Remove ${sp.name}`);
        rmU.addEventListener('click', () => set(c => { c.spells = c.spells.filter(x => x.key !== sp.key); }, { redraw: true }));
        row.append(name, lvl, actions, rmU);
        spellRows.append(row);
        return;
      }
      const open = el('button', 'spl-pick-open', sp.info?.name || sp.name);
      open.type = 'button';
      open.title = 'Open the spell card';
      open.addEventListener('click', () => openSpellCard(sp.key));
      const relinkBtn = el('button', 'icon-btn spl-relink-btn', '🔗');
      relinkBtn.type = 'button';
      relinkBtn.title = 'Link to a different spell (another source, or your own version)';
      relinkBtn.setAttribute('aria-label', `Link ${sp.name} to a different spell`);
      relinkBtn.addEventListener('click', () => relink(row, sp));
      const lvl = el('span', 'spl-pick-level', (sp.info?.level ?? sp.level) === 0 ? 'Cantrip' : `L${sp.info?.level ?? sp.level}`);
      const prep = el('label', 'bst-check spl-prep');
      const box = el('input'); box.type = 'checkbox'; box.checked = !!sp.prepared;
      box.setAttribute('aria-label', `${sp.name} prepared`);
      box.addEventListener('change', () => set(c => { const t = c.spells.find(x => x.key === sp.key); if (t) t.prepared = box.checked; }));
      prep.append(box, document.createTextNode(' Prepared'));
      const note = el('input', 'init-input spl-note');
      note.type = 'text'; note.value = sp.note || ''; note.placeholder = 'at will, 1/day…';
      note.setAttribute('aria-label', `Note for ${sp.name}`);
      note.addEventListener('change', () => set(c => { const t = c.spells.find(x => x.key === sp.key); if (t) t.note = note.value.trim(); }));
      const rm = el('button', 'icon-btn danger', '×');
      rm.type = 'button';
      rm.setAttribute('aria-label', `Remove ${sp.name}`);
      rm.addEventListener('click', () => set(c => { c.spells = c.spells.filter(x => x.key !== sp.key); }, { redraw: true }));
      row.append(open, lvl, prep, note, relinkBtn, rm);
      spellRows.append(row);
    });
    if (!spells.length) spellRows.append(el('p', 'enc-hint', 'No spells yet. Leave this empty for creatures that don\'t cast.'));
    const unlinked = spells.filter(sp => sp.key.startsWith('u:')).length;
    if (unlinked) spellRows.prepend(el('p', 'bst-hint', `${unlinked} spell${unlinked === 1 ? ' isn\'t' : 's aren\'t'} in your Spellbook yet. Link each to a spell, or Create it.`));
    // Read the stat block's Spellcasting trait (for creatures imported before this existed, or to start over)
    if (parseSpellcasting(creature.statblock)) {
      const importBtn = el('button', 'btn', creature.spells?.length ? 'Re-import spells from stat block' : 'Import spells from stat block');
      importBtn.type = 'button';
      importBtn.title = "Read the stat block's Spellcasting trait and link each spell to your Spellbook";
      importBtn.addEventListener('click', async () => {
        if (creature.spells?.length && !confirm('Replace this creature\'s spell list with the one from its stat block? Links you changed by hand will be redone.')) return;
        importBtn.disabled = true; importBtn.textContent = 'Linking spells…';
        await importSpellsFromStatblock(creature.id);
        renderEditor();
      });
      spellRows.append(importBtn);
    }
    casting.append(spellRows);
    mainEl.append(casting);

    // Sections like Open5e's: Traits, Actions, Bonus actions, Reactions, Legendary actions
    [['traits', 'Traits', 'trait'], ['actions', 'Actions', 'action'], ['bonusActions', 'Bonus actions', 'bonus action'],
     ['reactions', 'Reactions', 'reaction'], ['legendaryActions', 'Legendary actions', 'legendary action']].forEach(([key, title, noun]) => {
      const sec = group(title);
      if (key === 'legendaryActions') {
        const lab = el('label', 'bst-field wide');
        lab.append(el('span', 'bst-label', 'Intro'));
        const intro = el('textarea', 'init-notes bst-desc');
        intro.rows = 2;
        intro.placeholder = 'The creature can take 3 legendary actions…';
        intro.value = sb.legendaryDesc || '';
        intro.addEventListener('change', () => setSb(s => { s.legendaryDesc = intro.value; }));
        lab.append(intro);
        sec.append(lab);
      }
      const items = sb[key] || [];
      items.forEach((it, i) => {
        const card = el('div', 'bst-entry');
        const nameIn = el('input', 'init-input bst-entry-name');
        nameIn.type = 'text';
        nameIn.value = it.name || '';
        nameIn.placeholder = `${noun[0].toUpperCase()}${noun.slice(1)} name`;
        nameIn.setAttribute('aria-label', `${title} ${i + 1} name`);
        nameIn.addEventListener('change', () => setSb(s => { s[key][i].name = nameIn.value.trim(); }));
        const tools = el('span', 'bst-entry-tools');
        const mk = (text, label, fn, extra = '') => { const b = el('button', `icon-btn ${extra}`, text); b.type = 'button'; b.setAttribute('aria-label', label); b.title = label; b.addEventListener('click', fn); return b; };
        const move = dir => set(c => { const arr = c.statblock[key]; const [x] = arr.splice(i, 1); arr.splice(i + dir, 0, x); }, { redraw: true });
        const up = mk('↑', 'Move up', () => move(-1)); up.disabled = i === 0;
        const down = mk('↓', 'Move down', () => move(1)); down.disabled = i === items.length - 1;
        tools.append(up, down, mk('×', `Remove ${it.name || noun}`, () => set(c => { c.statblock[key].splice(i, 1); }, { redraw: true }), 'danger'));
        const descIn = el('textarea', 'init-notes bst-desc');
        descIn.rows = 2;
        descIn.value = it.desc || '';
        descIn.placeholder = 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.';
        descIn.setAttribute('aria-label', `${title} ${i + 1} description`);
        descIn.addEventListener('change', () => setSb(s => { s[key][i].desc = descIn.value; }));
        const headRow = el('div', 'bst-entry-head');
        headRow.append(nameIn, tools);
        card.append(headRow, descIn);
        sec.append(card);
      });
      const add = el('button', 'btn', `+ Add ${noun}`);
      add.type = 'button';
      add.addEventListener('click', () => {
        set(c => { c.statblock = c.statblock || {}; (c.statblock[key] = c.statblock[key] || []).push({ name: '', desc: '' }); }, { redraw: true });
        const cards = mainEl.querySelectorAll(`.bst-group[data-key="${key}"] .bst-entry-name`);
        cards[cards.length - 1]?.focus();
      });
      sec.dataset.key = key;
      sec.append(add);
      mainEl.append(sec);
    });

    // Notes
    const notesGroup = group('Your notes');
    const notes = el('textarea', 'init-notes bst-notes');
    notes.rows = 4;
    notes.placeholder = 'Tactics, reminders, changes from the book…';
    notes.value = creature.notes || '';
    notes.addEventListener('change', () => set(c => { c.notes = notes.value; }));
    notesGroup.append(notes);
    mainEl.append(notesGroup);

    const bottom = el('div', 'bst-actions');
    const del = el('button', 'btn danger', 'Delete creature');
    del.type = 'button';
    del.addEventListener('click', () => {
      if (!confirm(`Delete "${creatureName(creature)}" from your bestiary? Combatants already in initiative keep their numbers.`)) return;
      dm.update(d => { d.bestiary = d.bestiary.filter(c => c.id !== creature.id); });
      select(null);
    });
    bottom.append(del);
    mainEl.append(bottom);

    // Live preview of the finished stat block
    const previewGroup = group('Preview');
    const preview = el('div', 'statblock-holder bst-block');
    previewGroup.append(preview);
    mainEl.append(previewGroup);
    function drawPreview() { preview.replaceChildren(renderCreatureBlock(current())); }
    drawPreview();
    mainEl.scrollTop = keepScroll;
  }

  // New homebrew creature
  $('[data-new]').addEventListener('click', () => {
    const id = newId();
    dm.update(d => { d.bestiary.push({ id, name: 'Unnamed creature', nameOverride: '', cr: '', xp: null, ac: null, hp: null, hitDice: '', initBonus: null, notes: '', notionId: null, source: null, statblock: null }); });
    select(id, { edit: true });
    mainEl.scrollTop = 0;
    mainEl.querySelector('.bst-field input')?.focus();
  });

  // Filter
  $('.bst-filter').addEventListener('input', e => { filter = e.target.value; renderList(); });

  // Open5e search panel: a third column with full results. Choosing one fills the
  // selected creature's stats (notes and Notion link are kept). Clicking the left two
  // columns, or ✕, closes it without choosing. Searches are reads only.
  const bodyEl = $('.bst-body'), panel = $('.bst-o5e');
  // Spell cards open in the right-hand column while the Bestiary is open
  const spellCol = $('.bst-spellcol'), spellBody = $('.bst-spellcol-body');
  const closeSpellCol = () => { if (spellCol.hidden) return; spellCol.hidden = true; if (panel.hidden) bodyEl.classList.remove('has-search'); };
  spellCardTarget = key => {
    panel.hidden = true;
    spellCol.hidden = false;
    bodyEl.classList.add('has-search');
    spellBody.replaceChildren(el('p', 'bst-search-status', 'Loading…'));
    spellDetailFor(key)
      .then(s => spellBody.replaceChildren(s ? renderSpellCard(s) : el('p', '', 'That spell is no longer in your Spellbook.')))
      .catch(err => spellBody.replaceChildren(el('p', '', `Couldn't load the spell (${err.message}).`)));
  };
  $('[data-spell-close]').addEventListener('click', closeSpellCol);
  dialog.addEventListener('close', () => { spellCardTarget = null; });
  const searchInput = $('#bst-search-input'), statusEl = $('.bst-search-status'), resultsEl = $('.bst-results');
  let searchTimer = null, searchSeq = 0;

  function openSearch(initial = '') {
    closeSpellCol();
    panel.hidden = false;
    bodyEl.classList.add('has-search');
    searchInput.value = initial;
    searchInput.focus();
    searchInput.select();
    runSearch();
  }
  function closeSearch() {
    if (panel.hidden) return;
    panel.hidden = true;
    bodyEl.classList.remove('has-search');
  }
  $('[data-search-close]').addEventListener('click', closeSearch);
  // Clicking the list or editor closes the panel (the Search button itself just reopens it)
  // Close the right-hand column after a click completes, not on mouse-down: closing it widens the middle
  // column, and doing that mid-click would slide the button out from under the pointer and lose the click
  [$('.bst-side'), mainEl].forEach(col => col.addEventListener('click', e => {
    if (e.target.closest('.spell-chip, .spl-pick-open')) return;   // switching spells keeps the column open
    if (!e.target.closest('[data-open-search]')) closeSearch();
    closeSpellCol();
  }));
  searchInput.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeSearch(); } });

  const resultButton = r => {
    const li = el('li');
    const b = el('button', 'bst-result');
    b.type = 'button';
    b.append(el('span', 'bst-result-name', r.name));
    const meta = [[r.size, r.type && r.type.toLowerCase()].filter(Boolean).join(' '), r.cr && `CR ${r.cr}`,
      r.ac != null && `AC ${r.ac}`, r.hp != null && `HP ${r.hp}`].filter(Boolean).join(' · ');
    b.append(el('span', 'bst-result-meta', meta), el('span', 'bst-result-source', r.source || ''));
    b.addEventListener('click', () => previewCreature({
      title: r.name,
      load: async () => renderStatBlock(await bestiaryClient.creature(r.slug)),
      onApply: () => chooseResult(r, { confirmed: true }),
      merge: () => mergeSourceFromOpen5e(r.slug),
    }));
    li.append(b);
    return li;
  };

  // Loads one page of results; Load more fetches the next. Broad searches ("dragon") page through everything.
  async function loadPage(term, page, seq, note = statusEl) {
    const presetMatched = !!resultsEl.querySelector('.bst-result.is-preset');
    const more = resultsEl.querySelector('.bst-more');
    if (more) { more.disabled = true; more.textContent = 'Loading…'; }
    try {
      const res = await bestiaryClient.search(term, page);
      if (seq !== searchSeq) return;
      more?.parentElement.remove();
      (res.results || []).forEach(r => resultsEl.append(resultButton(r)));
      const shown = resultsEl.querySelectorAll('.bst-result:not(.is-preset)').length;
      note.textContent = res.fuzzy
        ? `No exact matches for "${term}". Close matches:`
        : shown ? `${shown} result${shown === 1 ? '' : 's'}${res.hasMore ? ' so far' : ''}` : (res.hasMore ? 'Nothing on this page yet…' : `No matches on Open5e for "${term}".`);
      if (res.hasMore) {
        const li = el('li');
        const b = el('button', 'btn bst-more', 'Load more results');
        b.type = 'button';
        b.addEventListener('click', () => loadPage(term, page + 1, seq, note));
        li.append(b);
        resultsEl.append(li);
        // A page can be all description matches (no name matches); keep going automatically
        if (!res.results?.length) loadPage(term, page + 1, seq, note);
      }
      if (!res.hasMore && !shown && !presetMatched) note.textContent += ' It may not be openly licensed; you can create it as homebrew (and save it as a preset).';
    } catch (err) {
      if (seq === searchSeq) note.textContent = `Search failed (${err.message}).`;
    }
  }

  // Your presets, shown above Open5e results. Each can be deleted with ×.
  const presetButton = preset => {
    const li = el('li', 'bst-preset-row');
    const b = el('button', 'bst-result is-preset');
    b.type = 'button';
    b.append(el('span', 'bst-result-name', preset.name));
    const sb = preset.statblock || {};
    const meta = [[sb.size, sb.type && sb.type.toLowerCase()].filter(Boolean).join(' '), preset.cr && `CR ${preset.cr}`,
      preset.ac != null && `AC ${preset.ac}`, preset.hp != null && `HP ${preset.hp}`].filter(Boolean).join(' · ');
    b.append(el('span', 'bst-result-meta', meta), el('span', 'bst-result-source', 'Your preset'));
    b.addEventListener('click', () => previewCreature({
      title: preset.name,
      load: async () => renderCreatureBlock({ ...preset, nameOverride: preset.name }),
      onApply: () => choosePreset(preset, { confirmed: true }),
      merge: () => mergeSourceFromCreature(preset),
    }));
    const del = el('button', 'icon-btn danger bst-preset-del', '×');
    del.type = 'button';
    del.setAttribute('aria-label', `Delete the ${preset.name} preset`);
    del.title = 'Delete this preset';
    del.addEventListener('click', () => {
      if (!confirm(`Delete the "${preset.name}" preset? Creatures already filled from it keep their stats.`)) return;
      dm.update(d => { d.presets = d.presets.filter(p => p.id !== preset.id); }, { quiet: true });
      runSearch();
    });
    li.append(b, del);
    return li;
  };

  function runSearch() {
    clearTimeout(searchTimer);
    const term = searchInput.value.trim();
    resultsEl.replaceChildren();
    const seq = ++searchSeq;
    const words = nameKey(term).split(' ').filter(Boolean);
    const presets = dm.data.presets
      .filter(p => words.every(w => nameKey(p.name).includes(w)))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (presets.length) {
      resultsEl.append(el('li', 'bst-results-head', `Your presets (${presets.length})`));
      presets.forEach(p => resultsEl.append(presetButton(p)));
    }
    // Your other creatures, to merge from (e.g. an Aarakocra's fly speed and Talon onto a mage)
    const mine = dm.data.bestiary
      .filter(c => c.id !== selected && words.every(w => nameKey(creatureName(c)).includes(w)))
      .sort((a, b) => creatureName(a).localeCompare(creatureName(b)));
    if (mine.length && words.length) {
      resultsEl.append(el('li', 'bst-results-head', `Your creatures (${mine.length}) · merge`));
      mine.slice(0, 20).forEach(c => {
        const li = el('li');
        const b = el('button', 'bst-result is-creature');
        b.type = 'button';
        b.append(el('span', 'bst-result-name', creatureName(c)));
        const sb = c.statblock || {};
        b.append(el('span', 'bst-result-meta', [[sb.size, sb.type && sb.type.toLowerCase()].filter(Boolean).join(' '), c.cr && `CR ${c.cr}`,
          c.ac != null && `AC ${c.ac}`, c.hp != null && `HP ${c.hp}`].filter(Boolean).join(' · ')), el('span', 'bst-result-source', 'In your Bestiary · merge only'));
        b.addEventListener('click', () => previewCreature({
          title: creatureName(c),
          load: async () => renderCreatureBlock(c),
          merge: () => mergeSourceFromCreature(findCreature(c.id) || c),
        }));
        li.append(b);
        resultsEl.append(li);
      });
    }
    if (term.length < 2) {
      statusEl.textContent = dm.data.presets.length
        ? 'Type to search Open5e too. Several words narrow it down ("red wyrmling").'
        : 'Type at least 2 letters. Several words narrow it down ("red wyrmling").';
      return;
    }
    resultsEl.append(el('li', 'bst-results-head', 'Open5e'));
    const note = el('li', 'bst-results-note', 'Searching…');
    resultsEl.append(note);
    statusEl.textContent = '';
    searchTimer = setTimeout(() => loadPage(term, 1, seq, note), 300);
  }

  // Preview a preset or Open5e creature as a card before applying it. Cancel, Escape or clicking
  // outside closes it and leaves the Bestiary as it was. Spells inside open their own card on top.
  function previewCreature({ title, load, onApply, merge }) {
    const target = findCreature(selected);
    if (!target) return;
    const pv = document.createElement('dialog');
    pv.className = 'creature-preview';
    pv.setAttribute('aria-label', `Preview: ${title}`);
    const body = el('div', 'cp-body');
    const holder = el('div', 'statblock-holder bst-block', 'Loading…');
    body.append(holder);
    const foot = el('footer', 'cp-foot');
    const replacing = target.statblock || target.ac != null || target.hp != null;
    foot.append(el('span', 'cp-note', replacing
      ? `Replaces ${creatureName(target)}'s stats. Name override, notes and Notion link stay.`
      : `Fills in ${creatureName(target)}.`));
    const cancel = el('button', 'btn', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', () => pv.close());
    const apply = el('button', 'btn primary', `Apply to ${creatureName(target)}`);
    apply.type = 'button';
    apply.disabled = true;
    apply.addEventListener('click', () => { pv.close(); onApply(); });
    const mergeBtn = el('button', 'btn', 'Merge…');
    mergeBtn.type = 'button';
    mergeBtn.title = `Pick parts of ${title} (speeds, actions, traits, spells…) to add to ${creatureName(target)}`;
    mergeBtn.disabled = true;
    mergeBtn.addEventListener('click', () => showMerge());
    foot.append(cancel, ...(merge ? [mergeBtn] : []), ...(onApply ? [apply] : []));
    if (!onApply) foot.querySelector('.cp-note').textContent = `Merge picks parts of ${title} to add to ${creatureName(target)}.`;
    pv.append(body, foot);

    // Merge mode: a checklist of everything the source has, grouped like a stat block
    async function showMerge() {
      mergeBtn.disabled = true;
      let src;
      try { src = await merge(); } catch (err) { holder.textContent = `Couldn't load ${title} (${err.message}).`; return; }
      const items = buildMergeItems(findCreature(target.id) || target, src);
      const list = el('div', 'merge-list');
      list.append(el('p', 'merge-intro', `Tick what ${creatureName(target)} should get from ${title}. Its AC, HP, CR, name, notes and Notion link stay as they are.`));
      if (!items.length) list.append(el('p', 'bst-empty', `${title} has nothing ${creatureName(target)} doesn't already have.`));
      const ORDER = ['Movement & senses', 'Skills & languages', 'Defenses', 'Size & type', 'Traits', 'Actions', 'Bonus actions', 'Reactions', 'Legendary actions', 'Spellcasting'];
      const boxes = [];
      ORDER.forEach(group => {
        const groupItems = items.filter(it => it.group === group);
        if (!groupItems.length) return;
        const fs = el('fieldset', 'bst-group merge-group');
        fs.append(el('legend', '', group));
        groupItems.forEach(it => {
          const lab = el('label', `merge-item${it.disabled ? ' is-disabled' : ''}`);
          const box = el('input'); box.type = 'checkbox'; box.disabled = !!it.disabled;
          box.addEventListener('change', updateCount);
          if (!it.disabled) boxes.push({ box, it });
          const text = el('span', 'merge-text');
          text.append(el('strong', '', it.label));
          if (it.detail) text.append(el('span', 'merge-detail', it.detail));
          lab.append(box, text);
          fs.append(lab);
        });
        list.append(fs);
      });
      holder.replaceChildren(list);
      holder.classList.add('is-merging');
      // Footer becomes: Back · Cancel · Merge selected
      const back = el('button', 'btn', '← Back'); back.type = 'button';
      back.addEventListener('click', () => { pv.close(); previewCreature({ title, load, onApply, merge }); });
      const go = el('button', 'btn primary', 'Merge selected'); go.type = 'button'; go.disabled = true;
      go.addEventListener('click', async () => {
        const chosen = boxes.filter(b => b.box.checked).map(b => b.it);
        if (!chosen.length) return;
        // The target's own spells may only be written in its Spellcasting trait: link them first,
        // otherwise adding a spell would hide that text and its spells would disappear from the stat block
        const current = findCreature(target.id);
        let own = null;
        if (chosen.some(it => it.group === 'Spellcasting') && !current?.spells?.length && parseSpellcasting(current?.statblock)) {
          go.disabled = true; go.textContent = 'Linking its own spells…';
          own = await spellsFromStatblock(current.statblock);
        }
        dm.update(d => {
          const c = d.bestiary.find(x => x.id === target.id);
          if (!c) return;
          c.statblock = c.statblock || {};
          if (own) {
            c.spells = own.spells;
            if (own.ability && !c.spellAbility) c.spellAbility = own.ability;
            if (own.dc != null && c.spellDc == null) c.spellDc = own.dc;
            if (own.attack != null && c.spellAttack == null) c.spellAttack = own.attack;
          }
          chosen.forEach(it => it.apply(c));
          c.name = creatureName(c);
        });
        pv.close();
        renderList();
        renderEditor();
      });
      const note = foot.querySelector('.cp-note');
      foot.replaceChildren(note, back, cancel, go);
      function updateCount() {
        const n = boxes.filter(b => b.box.checked).length;
        go.disabled = !n;
        go.textContent = n ? `Merge ${n} into ${creatureName(target)}` : 'Merge selected';
        note.textContent = n ? `${n} selected` : 'Nothing selected yet';
      }
      updateCount();
    }
    // While previewing, spell names open a popup on top instead of the Bestiary's (hidden) right column
    const keepTarget = spellCardTarget;
    spellCardTarget = null;
    pv.addEventListener('click', e => { if (e.target === pv) pv.close(); });
    pv.addEventListener('close', () => { spellCardTarget = keepTarget; pv.remove(); });
    document.body.append(pv);
    pv.showModal();
    apply.focus();
    load()
      .then(block => { holder.replaceChildren(block); apply.disabled = false; mergeBtn.disabled = false; })
      .catch(err => { holder.textContent = `Couldn't load ${title} (${err.message}).`; });
  }

  function choosePreset(preset, { confirmed = false } = {}) {
    const creature = findCreature(selected);
    if (!creature) return;
    const hasStats = creature.statblock || creature.ac != null || creature.hp != null;
    if (hasStats && !confirmed && !confirm(`Replace ${creatureName(creature)}'s stats with the "${preset.name}" preset? Your notes and Notion link stay.`)) return;
    dm.update(d => {
      const c = d.bestiary.find(x => x.id === creature.id);
      if (c) { applyPreset(c, preset); c.name = creatureName(c); }
    });
    closeSearch();
    renderEditor();
  }
  searchInput.addEventListener('input', runSearch);

  async function chooseResult(r, { confirmed = false } = {}) {
    const creature = findCreature(selected);
    if (!creature) return;
    const hasStats = creature.statblock || creature.ac != null || creature.hp != null;
    if (hasStats && !confirmed && !confirm(`Replace ${creature.name}'s stats with ${r.name} from Open5e? Your notes and Notion link stay.`)) return;
    statusEl.textContent = `Loading ${r.name}…`;
    try {
      const sb = await bestiaryClient.creature(r.slug);
      dm.update(d => {
        const c = d.bestiary.find(x => x.id === creature.id);
        if (c) Object.assign(c, {
          cr: sb.cr, xp: sb.xp, ac: sb.ac, hp: sb.hp, hitDice: sb.hitDice,
          initBonus: abilityMod(sb.abilities?.dex), source: { type: 'open5e', slug: r.slug }, statblock: structuredClone(sb),
        });
        if (c) c.name = creatureName(c);
      });
      closeSearch();
      renderEditor();
      // Link its spells to the Spellbook
      if (parseSpellcasting(sb)) importSpellsFromStatblock(creature.id).then(() => renderEditor());
    } catch (err) {
      statusEl.textContent = `Couldn't load ${r.name} (${err.message}).`;
    }
  }

  // Refresh the Hostiles / NPC / PC list from Notion (a read; only writes if Notion changed)
  const syncBtn = $('[data-sync]');
  syncBtn.addEventListener('click', async () => {
    syncBtn.disabled = true;
    syncBtn.textContent = 'Syncing…';
    try {
      const res = await editorApi('/sync', { method: 'POST' });
      dm.setCreaturePages(res.creaturePages, res.tagsSeen);
      syncBtn.textContent = `${(res.creaturePages || []).length} linkable pages`;
      renderEditor();
    } catch (err) {
      syncBtn.textContent = 'Sync failed';
    }
    setTimeout(() => { syncBtn.textContent = 'Sync Notion'; syncBtn.disabled = false; }, 1800);
  });

  renderList();
  renderEditor();
  dialog.showModal();
}

/* ---- Spell cards ---- */
const SPELL_SCHOOLS = ['Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Illusion', 'Necromancy', 'Transmutation'];
const ordinal = n => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
const titleCase = s => String(s || '').replace(/\b\w/g, ch => ch.toUpperCase());
const spellLevelText = s => {
  const school = titleCase(s.school);
  const base = s.level === 0 ? `${school || 'Spell'} cantrip` : `${ordinal(s.level)}-level ${school.toLowerCase() || 'spell'}`;
  return `${base}${s.ritual ? ' (ritual)' : ''}`;
};
const spellLevelShort = level => (level === 0 ? 'Cantrip' : `Level ${level}`);

// A card in the style of printed spell cards: banner, four stats, text, higher levels, footer
function renderSpellCard(s) {
  const card = el('article', `spell-card school-${(s.school || 'none').toLowerCase()}`);
  const head = el('header', 'sc-head');
  head.append(el('h3', 'sc-name', s.name || 'Unnamed spell'), el('div', 'sc-type', spellLevelText(s)));
  if (s.aliases?.length) head.append(el('div', 'sc-aka', `Also known as ${s.aliases.join(', ')}`));
  card.append(head);
  const stats = el('div', 'sc-stats');
  [['Casting time', s.castingTime], ['Range', s.range], ['Components', s.components],
   ['Duration', `${s.concentration ? 'Concentration, ' : ''}${s.duration || ''}`.replace(/^Concentration, $/, 'Concentration')]]
    .forEach(([k, v]) => { const cell = el('div', 'sc-stat'); cell.append(el('span', 'sc-k', k), el('span', 'sc-v', v || '—')); stats.append(cell); });
  card.append(stats);
  const flags = [s.concentration && 'Concentration', s.ritual && 'Ritual'].filter(Boolean);
  if (flags.length) { const f = el('div', 'sc-flags'); flags.forEach(t => f.append(el('span', 'tag', t))); card.append(f); }
  if (s.material) card.append(el('p', 'sc-material', `Material: ${s.material}`));
  card.append(el('div', 'sc-desc', plainDesc(s.desc) || 'No description yet.'));
  if (s.higherLevel) {
    const hl = el('div', 'sc-higher');
    hl.append(el('strong', '', s.level === 0 ? 'Cantrip upgrade. ' : 'At higher levels. '), document.createTextNode(plainDesc(s.higherLevel)));
    card.append(hl);
  }
  if (s.notes) { const n = el('div', 'sc-notes'); n.append(el('strong', '', 'Your notes. '), document.createTextNode(s.notes)); card.append(n); }
  const foot = el('footer', 'sc-foot');
  foot.append(el('span', '', s.classes || ''), el('span', '', s.book || (s.source?.type === 'open5e' ? 'Open5e' : '')));
  card.append(foot);
  return card;
}

/* ---- Spell catalog: every Open5e spell (cached index) plus your own ----
   The index is slim (name, level, school, classes, source), walked page by page once and kept in
   this browser for two weeks. Full spell text is fetched when a card opens. */
const SPELL_INDEX_KEY = 'dnd-map:spell-index';
const spellIndex = (() => {
  let list = null, loading = null, progress = { loaded: 0, total: null };
  const listeners = new Set();
  try {
    const cached = JSON.parse(localStorage.getItem(SPELL_INDEX_KEY) || 'null');
    if (cached?.list?.length && Date.now() - cached.savedAt < 14 * 864e5) list = cached.list;
  } catch { /* no cache */ }
  function load(force = false) {
    if (list && !force) return Promise.resolve(list);
    if (loading) return loading;
    loading = (async () => {
      const out = [];
      for (let page = 1, more = true; more && page <= 60; page++) {
        const res = await editorApi(`/bestiary/spell-index?page=${page}`);
        out.push(...(res.results || []));
        progress = { loaded: out.length, total: res.count };
        listeners.forEach(fn => fn(progress));
        more = res.hasMore;
      }
      list = out;
      try { localStorage.setItem(SPELL_INDEX_KEY, JSON.stringify({ savedAt: Date.now(), list })); } catch { /* storage full: keep in memory */ }
      listeners.forEach(fn => fn(progress));
      return list;
    })().finally(() => { loading = null; });
    return loading;
  }
  return {
    load,
    get list() { return list; },
    get loading() { return !!loading; },
    get progress() { return progress; },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
})();

const findSpell = id => dm.data.spells.find(s => s.id === id);
// Other names: stored per key; a customized copy also picks up the names given to its Open5e original
const splitNames = v => String(v || '').split(',').map(n => n.trim()).filter(Boolean);
const aliasesFor = (key, slug) => [...new Set([...splitNames(dm.data.spellAliases?.[key]), ...(slug ? splitNames(dm.data.spellAliases?.[`o:${slug}`]) : [])])];
// "Player's Handbook p. 247" -> "Player's Handbook" (for the source menu)
const bookName = book => String(book || '').replace(/[\s,]*(?:p\.?|pg\.?|page|pp\.?)\s*\d.*$/i, '').replace(/[\s,]+\d+\s*$/, '').trim();
// Match a spell by its name or any other name; returns the other name that matched (or '' for the real name)
function spellMatch(s, words) {
  if (!words.length) return { ok: true, via: '' };
  if (words.every(w => nameKey(s.name).includes(w))) return { ok: true, via: '' };
  const via = (s.aliases || []).find(a => words.every(w => nameKey(a).includes(w)));
  return via ? { ok: true, via } : { ok: false, via: '' };
}
const copyOf = slug => dm.data.spells.find(s => s.source?.type === 'open5e' && s.source.slug === slug);
// Everything you can pick or browse: your spells first (customized copies replace the Open5e original)
function spellCatalog() {
  const mine = dm.data.spells.map(s => ({
    key: `c:${s.id}`, id: s.id, name: s.name, level: s.level ?? 0, school: s.school, classes: s.classes,
    concentration: s.concentration, ritual: s.ritual, castingTime: s.castingTime, mine: true, slug: s.source?.slug,
    book: bookName(s.book),
    source: bookName(s.book) || (s.source?.type === 'open5e' ? 'Customized from Open5e' : 'Your spell'),
    aliases: aliasesFor(`c:${s.id}`, s.source?.slug),
  }));
  const copied = new Set(mine.map(s => s.slug).filter(Boolean));
  const open = (spellIndex.list || []).filter(s => !copied.has(s.slug))
    .map(s => ({ ...s, key: `o:${s.slug}`, school: (s.school || '').toLowerCase(), level: s.level ?? 0, mine: false, aliases: aliasesFor(`o:${s.slug}`) }));
  return [...mine, ...open];
}
// Look up a key, following an Open5e spell to your customized copy if you made one
function spellInfo(key) {
  if (!key) return null;
  if (key.startsWith('o:')) {
    const copy = copyOf(key.slice(2));
    if (copy) return spellCatalog().find(s => s.key === `c:${copy.id}`);
  }
  return spellCatalog().find(s => s.key === key) || null;
}
// Full spell for a card: your copy, or fetched from Open5e
async function spellDetailFor(key) {
  const withNames = (s, k, slug) => (s ? { ...s, aliases: aliasesFor(k, slug) } : s);
  if (key.startsWith('c:')) { const s = findSpell(key.slice(2)); return withNames(s, key, s?.source?.slug); }
  const slug = key.slice(2);
  const copy = copyOf(slug);
  if (copy) return withNames(copy, `c:${copy.id}`, slug);
  const d = await bestiaryClient.spell(slug);
  return withNames({ ...d, school: (d.school || '').toLowerCase(), book: d.source ? `${d.source} (Open5e)` : 'Open5e', source: { type: 'open5e', slug } }, key);
}

// Open a spell's card: in the Bestiary's right column when it's open, otherwise as a popup
let spellCardTarget = null;
function openSpellCard(key) {
  if (spellCardTarget) return spellCardTarget(key);
  document.querySelector('dialog.spell-popup')?.close();
  const dialog = document.createElement('dialog');
  dialog.className = 'spell-popup';
  dialog.setAttribute('aria-label', 'Spell');
  const close = el('button', 'icon-btn spell-popup-close', '✕');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close the spell');
  close.addEventListener('click', () => dialog.close());
  const holder = el('div', 'spell-popup-body', 'Loading…');
  dialog.append(close, holder);
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  spellDetailFor(key)
    .then(s => holder.replaceChildren(s ? renderSpellCard(s) : el('p', '', 'That spell is no longer in your Spellbook.')))
    .catch(err => { holder.textContent = `Couldn't load the spell (${err.message}).`; });
}

/* ---- Spellbook menu (DM view) ----
   A browsable catalog of every Open5e spell plus your own. Only your spells (from your books, or
   Open5e spells you customized) are saved; Open5e spells are always there without adding them. */
function openSpellbook(selectKey = null, { edit = false } = {}) {
  if (document.querySelector('dialog.spellbook-modal')) return;
  let selected = selectKey, editing = edit && !!selectKey;
  const f = { text: '', level: 'all', cls: 'all', school: 'all', source: 'all', mine: false };
  const MAX_SHOWN = 300;

  const dialog = document.createElement('dialog');
  dialog.className = 'bestiary-modal spellbook-modal';
  dialog.setAttribute('aria-labelledby', 'spellbook-title');
  dialog.innerHTML = `
    <div class="bst">
      <header class="bst-head">
        <h2 id="spellbook-title">Spellbook</h2>
        <div class="bst-head-tools">
          <button type="button" class="btn" data-refresh title="Download the Open5e spell list again">Refresh Open5e</button>
          <button type="button" class="btn" data-close>Close</button>
        </div>
      </header>
      <div class="bst-body">
        <aside class="bst-side spl-side">
          <input type="search" class="bst-filter" data-f="text" placeholder="Search spells…" aria-label="Search spells">
          <div class="spl-filters">
            <select class="bst-filter" data-f="level" aria-label="Level"></select>
            <select class="bst-filter" data-f="cls" aria-label="Class"></select>
            <select class="bst-filter" data-f="school" aria-label="School"></select>
            <select class="bst-filter" data-f="source" aria-label="Source"></select>
          </div>
          <label class="bst-check"><input type="checkbox" data-f="mine"> Yours only</label>
          <p class="spl-status" role="status"></p>
          <ul class="bst-list" aria-label="Spells"></ul>
          <button type="button" class="btn" data-new>+ New spell (from your books)</button>
        </aside>
        <section class="bst-main" aria-live="polite"></section>
      </div>
      <footer class="bst-foot"></footer>
    </div>`;
  document.body.append(dialog);
  const $ = s => dialog.querySelector(s);
  const listEl = $('.bst-list'), mainEl = $('.bst-main'), statusEl = $('.spl-status');

  const saveRow = saveControls('dm-save-row');
  $('.bst-foot').append(saveRow);
  const onDmChange = () => { renderList(); saveRow.refresh(); };
  onDmChange.statusOnly = saveRow.refresh;
  dm.subscribe(onDmChange);
  const offIndex = spellIndex.onChange(() => { fillFilters(); renderList(); if (!editing) renderMain(); });
  dialog.addEventListener('close', () => { dm.unsubscribe(onDmChange); offIndex(); dialog.remove(); });
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  $('[data-close]').addEventListener('click', () => dialog.close());
  $('[data-refresh]').addEventListener('click', () => { spellIndex.load(true).catch(err => { statusEl.textContent = `Couldn't load Open5e spells (${err.message}).`; }); renderList(); });

  // Filter menus are built from whatever is in the catalog
  function fillFilters() {
    const cat = spellCatalog();
    const opts = (key, all, values) => {
      const sel = $(`[data-f="${key}"]`);
      const keep = sel.value || 'all';
      sel.replaceChildren(...[['all', all], ...values].map(([v, t]) => { const o = el('option', '', t); o.value = v; return o; }));
      sel.value = [...sel.options].some(o => o.value === keep) ? keep : 'all';
    };
    opts('level', 'All levels', [...Array(10).keys()].map(l => [String(l), spellLevelShort(l) + (l === 0 ? 's' : '')]));
    const classes = [...new Set(cat.flatMap(s => String(s.classes || '').split(',').map(c => c.trim()).filter(Boolean)))].sort();
    opts('cls', 'All classes', classes.map(c => [c, c]));
    opts('school', 'All schools', SPELL_SCHOOLS.map(sc => [sc.toLowerCase(), sc]));
    // Open5e sources plus the books you've typed into your own spells
    const sources = [...new Set(cat.map(s => (s.mine ? s.book : s.source)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    sources.unshift('Yours');
    opts('source', 'All sources', sources.map(s => [s, s]));
  }
  dialog.querySelectorAll('[data-f]').forEach(input => input.addEventListener(input.type === 'search' ? 'input' : 'change', () => {
    f[input.dataset.f] = input.type === 'checkbox' ? input.checked : input.value;
    renderList();
  }));

  function filtered() {
    const words = nameKey(f.text).split(' ').filter(Boolean);
    return spellCatalog().filter(s =>
      (!f.mine || s.mine) &&
      (f.level === 'all' || s.level === Number(f.level)) &&
      (f.cls === 'all' || String(s.classes || '').split(',').map(c => c.trim()).includes(f.cls)) &&
      (f.school === 'all' || (s.school || '').toLowerCase() === f.school) &&
      (f.source === 'all' || (f.source === 'Yours' ? s.mine : (s.mine ? s.book === f.source : s.source === f.source))) &&
      spellMatch(s, words).ok)
      .map(s => ({ ...s, via: spellMatch(s, words).via }))
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  }

  function renderList() {
    const spells = filtered();
    listEl.replaceChildren();
    const idx = spellIndex.list;
    statusEl.textContent = !idx && spellIndex.loading
      ? `Loading Open5e spells… ${spellIndex.progress.loaded}${spellIndex.progress.total ? ` of ${spellIndex.progress.total}` : ''}`
      : !idx ? 'Open5e spells not loaded.' : `${spells.length.toLocaleString()} spell${spells.length === 1 ? '' : 's'}${spells.length > MAX_SHOWN ? ` (showing ${MAX_SHOWN}; narrow it down)` : ''}`;
    if (!spells.length) listEl.append(el('li', 'dm-empty', idx ? 'No spells match.' : 'Your own spells will show here; Open5e spells appear once loaded.'));
    let lastLevel = null;
    spells.slice(0, MAX_SHOWN).forEach(s => {
      if (s.level !== lastLevel) { listEl.append(el('li', 'bst-results-head', s.level === 0 ? 'Cantrips' : `Level ${s.level}`)); lastLevel = s.level; }
      const li = el('li');
      const b = el('button', 'bst-item');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(s.key === selected));
      const nameSpan = el('span', 'bst-item-name', s.name);
      if (s.via) nameSpan.append(el('span', 'spl-via', ` · aka ${s.via}`));
      b.append(nameSpan);
      if (s.mine) b.append(el('span', 'bst-item-party spl-mine', 'Yours'));
      if (s.concentration) b.append(el('span', 'bst-item-cr', 'C'));
      if (s.ritual) b.append(el('span', 'bst-item-cr', 'R'));
      b.title = [s.school && titleCase(s.school), s.classes, s.source].filter(Boolean).join(' · ');
      b.addEventListener('click', () => { selected = s.key; editing = false; renderList(); renderMain(); });
      li.append(b);
      listEl.append(li);
    });
  }

  async function renderMain() {
    mainEl.replaceChildren();
    mainEl.classList.toggle('is-editing', editing);
    if (!selected) { mainEl.append(el('p', 'bst-empty', 'Pick a spell on the left. Every Open5e spell is here; add spells from your books with "+ New spell".')); return; }
    const info = spellInfo(selected);
    const key = info?.key || selected;
    const isMine = key.startsWith('c:');
    if (isMine && editing) return renderEdit(findSpell(key.slice(2)));

    const head = el('div', 'bst-view-head');
    const actions = el('div', 'spl-actions');
    const button = (text, fn, cls = 'btn') => { const b = el('button', cls, text); b.type = 'button'; b.addEventListener('click', fn); return b; };
    if (isMine) {
      const sp = findSpell(key.slice(2));
      head.append(el('span', 'bst-source', sp?.source?.type === 'open5e' ? 'Your customized copy of an Open5e spell' : (sp?.book || 'Your spell')));
      actions.append(button('Edit', () => { editing = true; renderMain(); }));
      if (sp?.source?.type === 'open5e') {
        actions.append(button('Revert to Open5e', () => {
          if (!confirm(`Remove your customized copy of ${sp.name} and use the Open5e version again?`)) return;
          selected = `o:${sp.source.slug}`;
          dm.update(d => { d.spells = d.spells.filter(s => s.id !== sp.id); });
          renderMain();
        }));
      }
    } else {
      head.append(el('span', 'bst-source', 'Open5e'));
      actions.append(button('Customize', async () => {
        try {
          const d = await spellDetailFor(key);
          const id = newId();
          dm.update(dd => { dd.spells.push({
            id, name: d.name, level: d.level ?? 0, school: d.school, castingTime: d.castingTime, range: d.range, components: d.components,
            material: d.material, duration: d.duration, concentration: !!d.concentration, ritual: !!d.ritual, classes: d.classes,
            desc: d.desc, higherLevel: d.higherLevel, book: '', notes: '', source: { type: 'open5e', slug: key.slice(2) },
          }); });
          selected = `c:${id}`; editing = true; renderList(); renderMain();
        } catch (err) { alert(`Couldn't load the spell (${err.message}).`); }
      }));
    }
    head.append(actions);
    mainEl.append(head, otherNamesField(key));
    const holder = el('div', 'spl-card-holder', 'Loading…');
    mainEl.append(holder);
    try {
      const s = await spellDetailFor(key);
      if (selected === key || spellInfo(selected)?.key === key) holder.replaceChildren(s ? renderSpellCard(s) : el('p', '', 'Spell not found.'));
    } catch (err) {
      holder.textContent = `Couldn't load the spell (${err.message}).`;
    }
  }

  // Other names: edit without entering edit mode, so Open5e spells can have them too
  function otherNamesField(key) {
    const lab = el('label', 'bst-field wide spl-aliases');
    lab.append(el('span', 'bst-label', 'Other names (comma-separated; searchable)'));
    const input = el('input', 'init-input');
    input.type = 'text';
    input.value = splitNames(dm.data.spellAliases?.[key]).join(', ');
    input.placeholder = "e.g. Melf's Acid Arrow";
    input.addEventListener('change', () => {
      const names = splitNames(input.value);
      dm.update(d => {
        d.spellAliases = { ...(d.spellAliases || {}) };
        if (names.length) d.spellAliases[key] = names.join(', ');
        else delete d.spellAliases[key];
      }, { quiet: true });
      input.value = names.join(', ');
      renderList();
      const card = mainEl.querySelector('.spell-card');
      if (card) spellDetailFor(key).then(s => { if (s) card.replaceWith(renderSpellCard(s)); });
    });
    lab.append(input);
    return lab;
  }

  // Edit mode for your own spells (hand-entered or customized copies)
  function renderEdit(spell) {
    if (!spell) { editing = false; return renderMain(); }
    const current = () => findSpell(spell.id) || spell;
    const set = (mutate) => {
      dm.update(d => { const s = d.spells.find(x => x.id === spell.id); if (s) mutate(s); }, { quiet: true });
      fillFilters(); renderList(); drawPreview();
    };
    const top = el('div', 'bst-editor-top');
    const done = el('button', 'btn primary bst-done', 'Done');
    done.type = 'button';
    done.addEventListener('click', () => { editing = false; renderMain(); });
    top.append(el('span', 'bst-source', spell.source?.type === 'open5e' ? 'Customized from Open5e' : 'Hand-entered'), done);
    mainEl.append(top);

    const group = title => { const g = el('fieldset', 'bst-group'); g.append(el('legend', '', title)); return g; };
    const text = (label, key, { cls = '', placeholder = '' } = {}) => {
      const lab = el('label', `bst-field ${cls}`);
      lab.append(el('span', 'bst-label', label));
      const i = el('input', 'init-input');
      i.type = 'text'; i.value = spell[key] ?? ''; i.placeholder = placeholder;
      i.addEventListener('change', () => set(s => { s[key] = i.value.trim(); }));
      lab.append(i);
      return lab;
    };
    const area = (label, key, rows, placeholder = '') => {
      const lab = el('label', 'bst-field wide');
      lab.append(el('span', 'bst-label', label));
      const t = el('textarea', 'init-notes bst-desc');
      t.rows = rows; t.value = spell[key] || ''; t.placeholder = placeholder;
      t.addEventListener('change', () => set(s => { s[key] = t.value; }));
      lab.append(t);
      return lab;
    };
    const check = (label, key) => {
      const lab = el('label', 'bst-check');
      const c = el('input'); c.type = 'checkbox'; c.checked = !!spell[key];
      c.addEventListener('change', () => set(s => { s[key] = c.checked; }));
      lab.append(c, document.createTextNode(` ${label}`));
      return lab;
    };
    const select = (label, key, options, parse = v => v) => {
      const lab = el('label', 'bst-field');
      lab.append(el('span', 'bst-label', label));
      const sel = el('select', 'init-input');
      options.forEach(([v, t]) => { const o = el('option', '', t); o.value = v; sel.append(o); });
      sel.value = String(spell[key] ?? options[0][0]);
      sel.addEventListener('change', () => set(s => { s[key] = parse(sel.value); }));
      lab.append(sel);
      return lab;
    };

    const basics = group('Spell');
    const grid = el('div', 'bst-grid');
    grid.append(
      text('Name', 'name', { cls: 'span2', placeholder: 'Toll the Dead' }),
      select('Level', 'level', [...Array(10).keys()].map(l => [String(l), spellLevelShort(l)]), Number),
      select('School', 'school', [['', '—'], ...SPELL_SCHOOLS.map(sc => [sc.toLowerCase(), sc])]),
      text('Casting time', 'castingTime', { placeholder: '1 action' }),
      text('Range', 'range', { placeholder: '60 feet' }),
      text('Components', 'components', { placeholder: 'V, S, M' }),
      text('Duration', 'duration', { placeholder: 'Instantaneous' }),
      text('Material', 'material', { cls: 'span2', placeholder: 'A tiny bell' }),
      text('Classes', 'classes', { cls: 'span2', placeholder: 'Cleric, Warlock, Wizard' }),
    );
    const flags = el('div', 'bst-flags');
    flags.append(check('Concentration', 'concentration'), check('Ritual', 'ritual'));
    basics.append(grid, flags);
    const textGroup = group('Text');
    textGroup.append(area('Description', 'desc', 8, 'What the spell does…'),
      area('At higher levels', 'higherLevel', 2, 'When you cast this spell using a spell slot of …'));
    const srcGroup = group('Source & notes');
    const bookField = text('Book & page', 'book', { cls: 'wide', placeholder: "Player's Handbook p. 247" });
    // Suggest books you've already used, so the source menu stays tidy
    const books = el('datalist');
    books.id = 'spl-book-names';
    [...new Set(dm.data.spells.map(s => bookName(s.book)).filter(Boolean))].sort().forEach(b => { const o = el('option'); o.value = b; books.append(o); });
    bookField.querySelector('input').setAttribute('list', books.id);
    bookField.append(books);
    srcGroup.append(bookField, otherNamesField(`c:${spell.id}`), area('Your notes', 'notes', 2, 'Rulings, reminders…'));
    const bottom = el('div', 'bst-actions');
    const del = el('button', 'btn danger', 'Delete spell');
    del.type = 'button';
    del.addEventListener('click', () => {
      if (!confirm(`Delete "${spell.name}" from your Spellbook?`)) return;
      dm.update(d => { d.spells = d.spells.filter(s => s.id !== spell.id); });
      selected = spell.source?.type === 'open5e' ? `o:${spell.source.slug}` : null;
      editing = false; renderMain();
    });
    bottom.append(del);
    const previewGroup = group('Preview');
    const preview = el('div', 'spl-preview');
    previewGroup.append(preview);
    mainEl.append(basics, textGroup, srcGroup, bottom, previewGroup);
    function drawPreview() { preview.replaceChildren(renderSpellCard({ ...current(), aliases: aliasesFor(`c:${spell.id}`, spell.source?.slug) })); }
    drawPreview();
  }

  // New hand-entered spell (opens in edit mode)
  $('[data-new]').addEventListener('click', () => {
    const id = newId();
    dm.update(d => { d.spells.push({ id, name: 'New spell', level: 0, school: '', castingTime: '1 action', range: '', components: '', material: '', duration: '', concentration: false, ritual: false, classes: '', desc: '', higherLevel: '', book: '', notes: '', source: null }); });
    selected = `c:${id}`; editing = true; renderList(); renderMain();
    const name = mainEl.querySelector('.bst-field input');
    name?.focus(); name?.select();
  });

  fillFilters();
  renderList();
  renderMain();
  dialog.showModal();
  // Load the Open5e list the first time (later opens use the cached copy)
  if (!spellIndex.list) spellIndex.load().catch(err => { statusEl.textContent = `Couldn't load Open5e spells (${err.message}). Your own spells still work.`; });
}

if (DMVIEW) {
  new SessionPanel().addTo(map);
  new PartyPanel().addTo(map);   // sits directly above the session links
  new InitiativeTracker().addTo(map);
  const dmBanner = createUnsavedBanner({
    dirty: () => dm.dirty,
    saving: () => dm.saving,
    problem: () => dm.problem,
    save: () => dm.save(),
  });
  const refreshBanner = () => dmBanner.refresh();
  refreshBanner.statusOnly = dmBanner.refresh;
  dm.subscribe(refreshBanner);
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); dm.save(); }
  });
  // Warn before leaving with changes that haven't been uploaded with Save.
  // (They're still kept in this browser; this is about your other devices.)
  window.addEventListener('beforeunload', e => {
    if (!dm.dirty) return;
    e.preventDefault();
    e.returnValue = '';   // older browsers need this to show the dialog
  });
}

if (!EDIT) {
  subPanel = new SubPanel().addTo(map);   // closes along with its pin's popup
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) map.closePopup();
  });
}

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
let editorBanner = null;   // the unsaved-changes pill (editor)
let lastType = 'pin';
let lastKind = null;   // the kind picked most recently, reused for the next new pin

/* ---- Combobox ----
   Shared by the Notion location picker and the map search: a text input that
   filters a listbox. Arrows + Enter or the mouse pick an option; Escape closes.
   getOptions(query) returns { options, notes }. Each option is
   { label, detail?, detailTag?, className?, pinned?, selected?, ...anything }.
   onChoose(option) runs before the list closes; onClose() runs whenever it closes. */
let comboCount = 0;

function createCombobox({ input, list, getOptions, onChoose, onClose = () => {} }) {
  const uid = input.id || `combo-${++comboCount}`;
  let query = '';
  let shown = [];
  let active = -1;

  function setActive(i) {
    active = shown.length ? clamp(i, 0, shown.length - 1) : -1;
    list.querySelectorAll('.combo-option').forEach((li, n) => li.classList.toggle('is-active', n === active));
    const li = active >= 0 ? list.querySelector(`#${CSS.escape(uid)}-opt-${active}`) : null;
    if (li) {
      input.setAttribute('aria-activedescendant', li.id);
      li.scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  function render() {
    const { options, notes = [] } = getOptions(query);
    shown = options;
    list.replaceChildren();
    options.forEach((opt, i) => {
      const li = document.createElement('li');
      li.id = `${uid}-opt-${i}`;
      li.className = `combo-option${opt.className ? ` ${opt.className}` : ''}`;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(!!opt.selected));
      const label = document.createElement('span');
      label.className = 'combo-label';
      label.textContent = opt.label;
      li.append(label);
      if (opt.detail) {
        const detail = document.createElement('span');
        detail.className = opt.detailTag ? 'tag tag-muted' : 'combo-detail';
        detail.textContent = opt.detail;
        li.append(detail);
      }
      // pointerdown + preventDefault keeps focus in the input so the list stays open;
      // choosing on click (not pointerdown) means the click lands on this row, not on the
      // map behind it, so Leaflet doesn't mistake it for a map click and close the popup
      li.addEventListener('pointerdown', e => e.preventDefault());
      li.addEventListener('click', e => { e.stopPropagation(); choose(i); });
      list.append(li);
    });
    notes.forEach(text => {
      const li = document.createElement('li');
      li.className = 'combo-note';
      li.textContent = text;
      list.append(li);
    });
    setActive(active);
  }

  function open() {
    if (!list.hidden) return;
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    active = -1;
    render();
    setActive(Math.max(0, shown.findIndex(o => o.selected)));
  }

  function close() {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    query = '';
    onClose();
  }

  function choose(i) {
    const opt = shown[i];
    if (!opt) return;
    onChoose(opt);
    close();
  }

  input.addEventListener('click', open);
  input.addEventListener('blur', close);
  input.addEventListener('input', () => {
    query = input.value;
    if (list.hidden) open();
    render();
    // While typing, jump to the first real match (skipping pinned rows like "Not linked yet")
    const first = shown.findIndex(o => !o.pinned);
    setActive(first >= 0 ? first : 0);
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (list.hidden) open();
      else setActive(active + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!list.hidden) setActive(active - 1);
    } else if (e.key === 'Enter' && !list.hidden) {
      e.preventDefault();   // pick instead of submitting a form
      choose(active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();  // close the list, not a popup around it
      if (!list.hidden) close();
      else input.blur();
    }
  });

  return {
    open,
    close,
    refresh() { if (!list.hidden) render(); },
  };
}

/* ---- Notion location picker ----
   By default it lists only locations that aren't on the map yet; a checkbox
   brings the linked ones back. Type to filter by name or alias. */
const PICKER_LIMIT = 50;   // rows rendered at once; typing narrows the rest

function locationPicker(currentPlace, onChange) {
  const uid = `loc-picker-${++comboCount}`;
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

  const onMapElsewhere = id => [...data.pins, ...data.islandLabels].some(p =>
    (p !== currentPlace && p.notionId === id) || (p.subLocations || []).includes(id));
  const labelFor = id => (id ? locations.get(id)?.name || 'Missing Notion page' : '');

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
    if (loc.public) add('Public', 'tag-public');
    else if (loc.visibility === 'private') add('Private', 'tag-private');
    else add('Visibility unknown', 'tag-warn');
    if (onMapElsewhere(selected)) add('Also on map', 'tag-muted');
    const href = safeUrl(loc.url);
    if (href) {
      const a = document.createElement('a');
      a.className = 'loc-open';
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = 'Campaign page ↗';
      tags.append(a);
    }
    tags.append(...dmLinks(loc));
  }

  const combo = createCombobox({
    input,
    list,
    getOptions(query) {
      const q = nameKey(query);
      const found = [...locations.values()].filter(loc =>
        (includeLinked.checked || loc.id === selected || !onMapElsewhere(loc.id)) &&
        (!q || nameKey(loc.name).includes(q) || nameKey(loc.aliases).includes(q)));
      const options = [
        { id: null, label: 'Not linked yet', className: 'is-none', pinned: true, selected: !selected },
        ...found.slice(0, PICKER_LIMIT).map(loc => ({
          id: loc.id,
          label: loc.name,
          selected: loc.id === selected,
          detail: onMapElsewhere(loc.id) ? 'on map' : '',
          detailTag: true,
        })),
      ];
      const notes = [];
      if (!found.length) notes.push(query ? 'No matching locations' : 'Every location is already on the map');
      if (found.length > PICKER_LIMIT) notes.push(`${found.length - PICKER_LIMIT} more · keep typing to narrow it down`);
      return { options, notes };
    },
    onChoose(opt) {
      selected = opt.id;
      renderTags();
      onChange(selected);
    },
    onClose() { input.value = labelFor(selected); },
  });

  input.addEventListener('focus', () => input.select());
  includeLinked.addEventListener('change', () => { input.focus(); combo.open(); combo.refresh(); });

  input.value = labelFor(selected);
  renderTags();
  return { root, input, get value() { return selected; } };
}

// "Places within" field for pins: removable chips plus a search to add more
function statusTag(status) {
  return {
    public: ['Public', 'tag-public'],
    private: ['Private', 'tag-private'],
    'visibility unknown': ['Visibility unknown', 'tag-warn'],
    missing: ['Missing in Notion', 'tag-warn'],
    unlinked: ['Unlinked', 'tag-muted'],
  }[status] || ['', 'tag-muted'];
}

function subLocationField(place, getParentId) {
  const uid = `subs-${++comboCount}`;
  let subs = [...(place.subLocations || [])];
  const root = document.createElement('div');
  root.className = 'sub-field';
  root.innerHTML = `
    <label for="${uid}-input">Places within</label>
    <ul class="sub-chips"></ul>
    <div class="combo">
      <input id="${uid}-input" class="combo-input" type="text" role="combobox"
        aria-autocomplete="list" aria-expanded="false" aria-controls="${uid}-list"
        autocomplete="off" spellcheck="false" placeholder="Add a place within…">
      <ul id="${uid}-list" class="combo-list" role="listbox" hidden></ul>
    </div>`;
  const chips = root.querySelector('.sub-chips');
  const input = root.querySelector('.combo-input');

  // Is this location used anywhere else on the map (as a place or inside another pin)?
  const usedElsewhere = id => [...data.pins, ...data.islandLabels].some(p =>
    p.notionId === id || (p !== place && (p.subLocations || []).includes(id)));

  function renderChips() {
    chips.replaceChildren();
    subs.forEach(id => {
      const info = subInfo(id);
      const li = document.createElement('li');
      li.className = 'sub-chip';
      const name = document.createElement('span');
      name.className = 'sub-chip-name';
      name.textContent = info.name;
      li.append(name);
      const [tagText, tagClass] = statusTag(info.status);
      if (tagText) {
        const tag = document.createElement('span');
        tag.className = `tag ${tagClass}`;
        tag.textContent = tagText;
        li.append(tag);
      }
      li.append(...dmLinks(locations.get(id), { short: true }));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'chip-remove';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Remove ${info.name}`);
      remove.addEventListener('click', e => {
        e.stopPropagation();   // this button is removed below; don't let the click reach the map
        subs = subs.filter(s => s !== id);
        renderChips();
      });
      li.append(remove);
      chips.append(li);
    });
  }

  createCombobox({
    input,
    list: root.querySelector('.combo-list'),
    getOptions(query) {
      const q = nameKey(query);
      const found = [...locations.values()].filter(loc =>
        !subs.includes(loc.id) && loc.id !== getParentId() &&
        (!q || nameKey(loc.name).includes(q) || nameKey(loc.aliases).includes(q)));
      const options = found.slice(0, PICKER_LIMIT).map(loc => ({
        id: loc.id,
        label: loc.name,
        detail: usedElsewhere(loc.id) ? 'on map' : '',
        detailTag: true,
      }));
      const notes = [];
      if (!found.length) notes.push(query ? 'No matching locations' : 'No more locations to add');
      if (found.length > PICKER_LIMIT) notes.push(`${found.length - PICKER_LIMIT} more · keep typing to narrow it down`);
      return { options, notes };
    },
    onChoose(opt) {
      subs.push(opt.id);
      renderChips();
    },
    onClose() { input.value = ''; },
  });

  renderChips();
  return { root, get value() { return [...subs]; } };
}

function placeForm({ heading, place, onSave, onDelete }) {
  const kindOptions = placeTypes()
    .map(t => `<option value="${escapeHtml(t.key)}">${escapeHtml(t.label)}</option>`).join('');

  const form = document.createElement('form');
  form.className = 'place-form';
  form.innerHTML = `
    <h3></h3>
    <div data-picker></div>
    <label class="unlinked-only">Working name <input type="text" name="workingName" autocomplete="off" placeholder="Optional, editor only"></label>
    <fieldset>
      <label><input type="radio" name="type" value="pin"> On the map (fixed)</label>
      <label><input type="radio" name="type" value="island"> On a sky island (drifts)</label>
    </fieldset>
    <label>Kind <select name="kind">${kindOptions}</select></label>
    <label>Map description <textarea name="note" rows="3"></textarea></label>
    <div data-subs></div>
    <div class="row">
      <button type="submit" class="btn primary">Save</button>
      ${onDelete ? '<button type="button" class="btn danger" data-delete>Delete</button>' : ''}
    </div>`;

  form.querySelector('h3').textContent = heading;
  const picker = locationPicker(place.id ? place : null, () => sync());
  form.querySelector('[data-picker]').replaceWith(picker.root);
  const subField = subLocationField(place, () => picker.value);
  form.querySelector('[data-subs]').replaceWith(subField.root);
  form.elements.workingName.value = place.workingName || '';
  form.elements.note.value = place.note || '';
  form.elements.kind.value = placeTypeKey(place.type || lastKind);

  const currentType = () => form.elements.type.value;
  const sync = () => {
    form.querySelector('.unlinked-only').hidden = !!picker.value;
  };
  form.elements.type.value = place.id ? (place.drifts ? 'island' : 'pin') : lastType;
  sync();

  form.addEventListener('submit', e => {
    e.preventDefault();
    onSave({
      notionId: picker.value,
      workingName: form.elements.workingName.value.trim(),
      note: form.elements.note.value.trim(),
      kind: form.elements.kind.value,
      type: currentType(),
      subLocations: subField.value,
    });
  });
  form.querySelector('[data-delete]')?.addEventListener('click', onDelete);
  // Clicks inside the form never count as map clicks (which would close this popup),
  // even when the element clicked is removed from the page by its own handler
  form.addEventListener('click', e => e.stopPropagation());
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
    onSave: ({ notionId, workingName, note, kind, type, subLocations }) => {
      lastType = type;
      lastKind = kind;
      const drifts = type === 'island';
      change(() => {
        data.pins.push({
          id: newId(), notionId, type: kind, note, workingName, subLocations, drifts,
          x: Math.round(drifts ? islandX : latlng.lng), y,
        });
      }, { rebuildFog: false });
    },
  }));
}

function openEditPopup(marker, place) {
  openPopup(marker.getLatLng(), placeForm({
    heading: 'Edit place',
    place,
    onSave: ({ notionId, workingName, note, kind, type, subLocations }) => {
      change(() => {
        Object.assign(place, { notionId, workingName, note, type: kind, subLocations });
        lastKind = kind;
        // Moving a place between the map and a sky island keeps it where it is on screen right now
        const drifts = type === 'island';
        if (drifts !== !!place.drifts) {
          place.x = Math.round(drifts ? wrap01(place.x / W + state.islands) * W : wrap01(place.x / W - state.islands) * W);
          place.drifts = drifts;
        }
      }, { rebuildFog: false });
    },
    onDelete: () => {
      if (!confirm(`Delete "${placeInfo(place).name}" from the map? (The Notion page isn't touched.)`)) return;
      change(() => { data.pins = data.pins.filter(p => p.id !== place.id); }, { rebuildFog: false });
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

const isOnUi = e => e.target.closest('.leaflet-control, .leaflet-popup, .map-search, .unsaved-banner');

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

  // Warn before closing with changes that haven't been uploaded with Save (they're still kept in this browser)
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
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    // Ctrl/Cmd + S uploads to the worker, even while typing in a field
    if (key === 's') { e.preventDefault(); saver.flush(); return; }
    if ((el.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes(el.type)) || el.tagName === 'TEXTAREA') return;
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
        <div class="edit-head">
          <h2>Editor</h2>
          <button type="button" class="gear-btn" data-settings aria-label="Settings" title="Settings">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.6 7.6 0 0 0-1.7-1L15 3.3h-4l-.3 2.6a7.6 7.6 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.6 7.6 0 0 0 1.7 1l.3 2.6h4l.3-2.6a7.6 7.6 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5A3.5 3.5 0 1 1 13 8.5a3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)"/></svg>
          </button>
        </div>
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
        <div class="dm-save-row editor-save">
          <span class="dm-status" data-status role="status"></span>
          <button type="button" class="btn primary" data-save title="Upload to the worker (Ctrl/Cmd + S)">Save</button>
        </div>
        <p class="notion-error" data-notion-error role="alert"></p>
        <div class="row">
          <button type="button" class="btn" data-sync>Sync from Notion</button>
          <button type="button" class="btn" data-backup>Download backup</button>
        </div>`;
      L.DomEvent.disableClickPropagation(panel);
      L.DomEvent.disableScrollPropagation(panel);
      L.DomEvent.on(panel, 'pointerdown', L.DomEvent.stopPropagation);

      const $ = sel => panel.querySelector(sel);
      $('[data-settings]').addEventListener('click', openSettings);
      $('[data-save]').addEventListener('click', () => saver.flush());

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
        saved: 'Saved',
        pending: 'Unsaved changes',
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
          count('visibility unknown') && `${count('visibility unknown')} with unknown visibility`,
        ].filter(Boolean);
        const p = data.pins.length, l = data.pins.filter(x => x.drifts).length;
        $('[data-count]').textContent =
          `${p} ${p === 1 ? 'place' : 'places'}${l ? ` (${l} on sky islands)` : ''}` +
          (flags.length ? ` (${flags.join(', ')})` : '') + `. ${locations.size} Notion locations.`;

        const statusEl = $('[data-status]');
        statusEl.textContent = STATUS_TEXT[saver.status] || saver.message;
        statusEl.classList.toggle('is-unsaved', saver.status === 'pending');
        statusEl.classList.toggle('is-problem', saver.status === 'error' || saver.status === 'conflict');
        $('[data-save]').disabled = saver.saving || !saver.dirty() || saver.status === 'conflict';
        editorBanner?.refresh();
        $('[data-notion-error]').hidden = !notionError;
        $('[data-notion-error]').textContent = notionError ? `Notion sync failed: ${notionError}` : '';
      };
      return panel;
    },
  });
  editorBanner = createUnsavedBanner({
    dirty: () => saver.dirty(),
    saving: () => saver.saving,
    problem: () => (saver.status === 'error' || saver.status === 'conflict' ? saver.message : ''),
    conflict: () => saver.status === 'conflict',
    save: () => saver.flush(),
  });
  editPanel = new EditControl().addTo(map);
  editPanel.update();
}

/* ==========================================================================
   Map search: find a place and fly to it, or jump to the party.
   Players can only find places they could already see (public and out of the fog).
   Press / to focus the search.
   ========================================================================== */
const SEARCH_LIMIT = 50;
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function updatePartyButton() {
  const button = document.querySelector('.party-btn');
  if (button) button.hidden = !data.party;
}

function searchablePlaces() {
  const found = [];
  data.pins.forEach(pin => {
    // Fixed places are checked where they are; drifting ones where they've floated to right now
    const spot = pin.drifts ? pinMarkers.get(pin.id)?.getLatLng() : L.latLng(H - pin.y, pin.x);
    if (PLAYER_FOG && CONFIG.fog.enabled && (!spot || !Fog.isRevealed(spot.lng, H - spot.lat))) return;
    const info = placeInfo(pin);
    const kindLabel = pin.drifts ? `${pinKind(pin)} · sky island` : pinKind(pin);
    found.push({ place: pin, kind: 'pin', info, kindLabel });
    // Places within this pin: found through their parent
    (pin.subLocations || []).forEach(sub => {
      const subDetails = subInfo(sub);
      found.push({ place: pin, kind: 'sub', subId: subDetails.id, info: subDetails, kindLabel: `In ${info.name}` });
    });
  });
  return found.sort((a, b) => a.info.name.localeCompare(b.info.name));
}

// Fly to a spot, then run `after` once the map settles
function flyToSpot(latlng, after) {
  const zoom = Math.max(map.getZoom(), fitZoom + CONFIG.search.zoomIn);
  let done = false;
  const finish = () => { if (!done) { done = true; after?.(); } };
  map.once('moveend', finish);
  setTimeout(finish, 1500);   // in case the view didn't need to move
  if (prefersReducedMotion()) map.setView(latlng, zoom, { animate: false });
  else map.flyTo(latlng, zoom, { duration: 0.8 });
}

function highlight(marker) {
  const el = marker?.getElement();
  if (!el) return;
  el.classList.remove('is-found');
  void el.offsetWidth;   // restart the animation
  el.classList.add('is-found');
  setTimeout(() => el.classList.remove('is-found'), 2400);
}

function goToPlace({ place, kind, subId }) {
  const marker = pinMarkers.get(place.id);
  if (!marker) return;
  flyToSpot(marker.getLatLng(), () => {
    highlight(marker);
    if (EDIT) return;
    if (map.hasLayer(place.drifts ? islandLabelLayer : pinLayer)) {
      marker.openPopup();   // also opens the places-within panel
      if (kind === 'sub') showSubLocations(place, subId);
    }
  });
}

function goToParty() {
  if (!data.party) return;
  flyToSpot(L.latLng(H - data.party.y, data.party.x), () => highlight(partyMarker));
}

(() => {
  const bar = L.DomUtil.create('div', 'map-search', container);
  bar.innerHTML = `
    <div class="combo">
      <input id="map-search-input" class="combo-input" type="search" role="combobox"
        aria-label="Search places" aria-autocomplete="list" aria-expanded="false" aria-controls="map-search-list"
        autocomplete="off" spellcheck="false" placeholder="Search places  ( / )">
      <ul id="map-search-list" class="combo-list" role="listbox" hidden></ul>
    </div>
    <button type="button" class="party-btn" aria-label="Go to the party" title="Go to the party" hidden>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <circle cx="12" cy="12" r="3.5" fill="currentColor"/>
        <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/>
        <path d="M12 1v3.5M12 19.5V23M1 12h3.5M19.5 12H23" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    </button>`;
  L.DomEvent.disableClickPropagation(bar);
  L.DomEvent.disableScrollPropagation(bar);
  L.DomEvent.on(bar, 'pointerdown keydown', L.DomEvent.stopPropagation);

  const input = bar.querySelector('.combo-input');
  const list = bar.querySelector('.combo-list');
  // "/spell <name>" searches spells (DM view and editor only; spells come through your edit key)
  const SPELL_SEARCH = EDIT || DMVIEW;
  if (SPELL_SEARCH) {
    input.placeholder = 'Search places · /s for spells  ( / )';
    input.setAttribute('aria-label', 'Search places, or type /s to search spells');
  }

  const box = createCombobox({
    input,
    list,
    getOptions(query) {
      // "/s", "/spell" or "/spells", then the name
      const spellMode = SPELL_SEARCH && query.match(/^\s*\/(?:s|spells?)\b\s*(.*)$/i);
      if (spellMode) {
        const words = nameKey(spellMode[1]).split(' ').filter(Boolean);
        if (!spellIndex.list && !spellIndex.loading) spellIndex.load().then(() => box.refresh()).catch(() => box.refresh());
        const found = words.length ? spellCatalog().map(s => ({ ...s, ...spellMatch(s, words) })).filter(s => s.ok) : [];
        // Exact and starts-with matches first (by name or other name), then your spells, then by level
        const term = words.join(' ');
        const rank = s => { const n = nameKey(s.via || s.name); return n === term ? 0 : n.startsWith(term) ? 1 : 2; };
        found.sort((a, b) => rank(a) - rank(b) || (b.mine - a.mine) || a.level - b.level || a.name.localeCompare(b.name));
        const notes = [];
        if (!spellIndex.list) notes.push(spellIndex.loading ? 'Loading Open5e spells…' : 'Open5e spells unavailable; showing your own.');
        if (!words.length) notes.unshift('Spell search · type a spell name');
        else if (!found.length && spellIndex.list) notes.push('No matching spells');
        if (found.length > SEARCH_LIMIT) notes.push(`${found.length - SEARCH_LIMIT} more · keep typing to narrow it down`);
        return {
          options: found.slice(0, SEARCH_LIMIT).map(s => ({
            spellKey: s.key,
            label: s.name,
            detail: [s.via && `aka ${s.via}`, s.level === 0 ? 'Cantrip' : `Level ${s.level}`, s.school && titleCase(s.school), s.mine && 'Yours'].filter(Boolean).join(' · '),
          })),
          notes,
        };
      }
      const q = nameKey(query);
      const found = searchablePlaces().filter(({ info }) =>
        !q || nameKey(info.name).includes(q) || nameKey(info.aliases).includes(q));
      const options = found.slice(0, SEARCH_LIMIT).map(item => ({
        ...item,
        label: item.info.name,
        detail: EDIT && item.info.status !== 'public' ? `${item.kindLabel} · ${item.info.status}` : item.kindLabel,
      }));
      const notes = [];
      if (!found.length) notes.push(query ? 'No matching places' : 'No places on the map yet');
      if (found.length > SEARCH_LIMIT) notes.push(`${found.length - SEARCH_LIMIT} more · keep typing to narrow it down`);
      if (SPELL_SEARCH && !query) notes.push('Tip: /s fireball searches spells');
      return { options, notes };
    },
    onChoose(item) {
      input.value = '';
      input.blur();
      if (item.spellKey) openSpellCard(item.spellKey);   // centered card
      else goToPlace(item);
    },
  });

  bar.querySelector('.party-btn').addEventListener('click', goToParty);

  // "/" focuses the search, like most sites
  document.addEventListener('keydown', e => {
    const el = document.activeElement;
    if (e.key !== '/' || e.ctrlKey || e.metaKey || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
    e.preventDefault();
    input.focus();
  });
})();

/* ==========================================================================
   Settings (editor gear icon). A modal with its own draft: nothing changes
   until Save, and Save is a normal undoable edit that autosaves to the worker.
   Sections are plain functions so more can be added later.
   ========================================================================== */
const slugify = s => nameKey(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'type';

function openSettings() {
  const dialog = document.createElement('dialog');
  dialog.className = 'settings-modal';
  dialog.setAttribute('aria-labelledby', 'settings-title');
  dialog.innerHTML = `
    <form method="dialog" class="settings-form">
      <header class="settings-head">
        <h2 id="settings-title">Settings</h2>
        <button type="button" class="settings-x" data-cancel aria-label="Close without saving">×</button>
      </header>
      <div class="settings-body"></div>
      <footer class="settings-foot">
        <p class="settings-note" role="status"></p>
        <button type="button" class="btn" data-cancel>Cancel</button>
        <button type="submit" class="btn primary">Save</button>
      </footer>
    </form>`;
  document.body.append(dialog);

  const body = dialog.querySelector('.settings-body');
  const note = dialog.querySelector('.settings-note');
  const sections = [placeTypesSection()];
  sections.forEach(s => body.append(s.el));

  const close = () => { dialog.close(); dialog.remove(); };
  dialog.querySelectorAll('[data-cancel]').forEach(b => b.addEventListener('click', close));
  dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });   // Escape

  dialog.querySelector('form').addEventListener('submit', e => {
    e.preventDefault();
    const problems = sections.flatMap(s => s.validate());
    if (problems.length) { note.textContent = problems[0]; return; }
    change(() => sections.forEach(s => s.apply()), { rebuildFog: false });
    close();
  });

  dialog.showModal();
}

// Place types: label, color, sizes, order, default, add/remove
function placeTypesSection() {
  let draft = placeTypes().map(t => ({ ...t }));
  let defaultRow = draft.find(t => t.key === defaultPlaceType().key) || draft[0];   // tracked by row, since new rows have no key yet
  const inUse = key => data.pins.filter(p => placeTypeKey(p.type) === key).length;

  const el = document.createElement('section');
  el.className = 'settings-section';
  el.innerHTML = `
    <h3>Place types</h3>
    <p class="settings-help">The kinds of pins on the map. Changes show for players too.</p>
    <div class="type-head" aria-hidden="true"><span></span><span>Name</span><span>Color</span><span>Dot</span><span>Text</span><span>Default</span><span></span></div>
    <ol class="type-list"></ol>
    <button type="button" class="btn" data-add>+ Add place type</button>`;
  const list = el.querySelector('.type-list');

  function render() {
    list.replaceChildren();
    draft.forEach((t, i) => {
      const li = document.createElement('li');
      li.className = 'type-row';
      li.innerHTML = `
        <span class="type-preview" aria-hidden="true"><span class="dot"></span></span>
        <input type="text" class="type-label" aria-label="Name" maxlength="40">
        <input type="color" class="type-color" aria-label="Color">
        <input type="number" class="type-dot" aria-label="Dot size" title="Dot size" min="4" max="30">
        <input type="number" class="type-font" aria-label="Text size" title="Text size" min="10" max="36">
        <input type="radio" name="default-type" class="type-default" aria-label="Default for new pins">
        <span class="type-actions">
          <button type="button" class="icon-btn" data-up aria-label="Move up">↑</button>
          <button type="button" class="icon-btn" data-down aria-label="Move down">↓</button>
          <button type="button" class="icon-btn danger" data-remove aria-label="Remove">×</button>
        </span>`;
      const $ = s => li.querySelector(s);
      const dot = $('.type-preview .dot');
      const paint = () => {
        dot.style.background = HEX_COLOR.test(t.color) ? t.color : '#b8893a';
        dot.style.width = dot.style.height = `${clamp(+t.dotSize || 8, 4, 30)}px`;
      };
      $('.type-label').value = t.label;
      $('.type-color').value = HEX_COLOR.test(t.color) ? t.color : '#b8893a';
      $('.type-dot').value = t.dotSize;
      $('.type-font').value = t.fontSize;
      $('.type-default').checked = t === defaultRow;
      $('[data-up]').disabled = i === 0;
      $('[data-down]').disabled = i === draft.length - 1;
      $('[data-remove]').disabled = draft.length === 1;
      paint();

      $('.type-label').addEventListener('input', e => { t.label = e.target.value; });
      $('.type-color').addEventListener('input', e => { t.color = e.target.value; paint(); });
      $('.type-dot').addEventListener('input', e => { t.dotSize = +e.target.value; paint(); });
      $('.type-font').addEventListener('input', e => { t.fontSize = +e.target.value; });
      $('.type-default').addEventListener('change', () => { defaultRow = t; });
      const move = dir => { draft.splice(i, 1); draft.splice(i + dir, 0, t); render(); };
      $('[data-up]').addEventListener('click', () => move(-1));
      $('[data-down]').addEventListener('click', () => move(1));
      $('[data-remove]').addEventListener('click', () => {
        const count = inUse(t.key);
        const fallback = defaultRow !== t ? defaultRow : draft.find(x => x !== t);
        if (count && !confirm(`${count} ${count === 1 ? 'pin uses' : 'pins use'} "${t.label}". ` +
          `When you save, ${count === 1 ? 'it' : 'they'} will become "${fallback.label}".`)) return;
        draft.splice(i, 1);
        if (defaultRow === t) defaultRow = fallback;
        render();
      });
      list.append(li);
    });
  }

  el.querySelector('[data-add]').addEventListener('click', () => {
    draft.push({ key: '', label: 'New type', color: '#b8893a', dotSize: 8, fontSize: 14 });
    render();
    list.lastElementChild.querySelector('.type-label').select();
  });

  render();
  return {
    el,
    validate() {
      const labels = draft.map(t => t.label.trim());
      if (labels.some(l => !l)) return ['Every place type needs a name.'];
      const dupe = labels.find((l, i) => labels.findIndex(x => x.toLowerCase() === l.toLowerCase()) !== i);
      if (dupe) return [`There are two place types named "${dupe}".`];
      return [];
    },
    apply() {
      // New types get a permanent key from their first name; renaming later never breaks pins
      const taken = new Set(draft.filter(t => t.key).map(t => t.key));
      let fallback = null;
      const types = draft.map(t => {
        let key = t.key;
        if (!key) {
          const base = slugify(t.label);
          key = base;
          for (let n = 2; taken.has(key); n++) key = `${base}-${n}`;
          taken.add(key);
        }
        if (t === defaultRow) fallback = key;
        return {
          key,
          label: t.label.trim(),
          color: HEX_COLOR.test(t.color) ? t.color.toLowerCase() : '#b8893a',
          dotSize: clamp(Math.round(+t.dotSize) || 8, 4, 30),
          fontSize: clamp(Math.round(+t.fontSize) || 14, 10, 36),
        };
      });
      const keys = new Set(types.map(t => t.key));
      fallback = fallback || types[0].key;
      data.settings = { ...data.settings, placeTypes: types, defaultPlaceType: fallback };
      data.pins.forEach(p => { if (!keys.has(p.type)) p.type = fallback; });   // removed types move to the default
    },
  };
}

/* ==========================================================================
   View switcher: Player / Preview / Editor, inside the layers menu.
   Only shown in a browser that has the edit key, so players never see it.
   ========================================================================== */
(() => {
  if (!EDIT && !DMVIEW && !storageGet(EDIT_KEY_STORAGE)) return;
  const current = EDIT ? 'edit' : DMVIEW ? 'dm' : 'player';
  const listEl = layersControl.getContainer().querySelector('.leaflet-control-layers-list');
  const section = document.createElement('fieldset');
  section.className = 'view-switch';
  section.innerHTML = `
    <legend>View</legend>
    <label><input type="radio" name="map-view" value="player"> Player</label>
    <label><input type="radio" name="map-view" value="dm"> DM view</label>
    <label><input type="radio" name="map-view" value="edit"> Editor</label>`;
  section.querySelector(`input[value="${current}"]`).checked = true;
  section.addEventListener('change', e => {
    const params = new URLSearchParams(location.search);
    params.delete('edit');
    params.delete('preview');
    params.delete('dm');
    if (e.target.value !== 'player') params.set(e.target.value, '');
    const query = params.toString().replace(/=(&|$)/g, '$1');   // "?preview" rather than "?preview="
    location.href = location.pathname + (query ? `?${query}` : '') + location.hash;
  });
  listEl.append(section);

})();

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