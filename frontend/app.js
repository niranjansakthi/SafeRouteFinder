/**
 * SafeRoute AI — app.js
 * Connects to: https://saferoutefinder.onrender.com
 * Endpoints used: POST /predict
 */

'use strict';

/* ══════════════════════════════════════════════
   CONFIG
══════════════════════════════════════════════ */
const CONFIG = {
  API_BASE:    'https://saferoutefinder.onrender.com',
  API_PREDICT: '/predict',
  MAP_CENTER:  [10.7905, 78.7047],
  MAP_ZOOM:    14,
  WALK_SPEED_KMH: 5,        // avg walking speed for ETA calc
};

/* ══════════════════════════════════════════════
   STATE
══════════════════════════════════════════════ */
const state = {
  start:       null,   // [lat, lng]
  end:         null,   // [lat, lng]
  startMarker: null,
  endMarker:   null,
  safeLayer:   null,
  shortLayer:  null,
  phase:       'idle', // idle | start-set | loading | done
};

/* ══════════════════════════════════════════════
   MAP INIT
══════════════════════════════════════════════ */
const map = L.map('map', {
  center:           CONFIG.MAP_CENTER,
  zoom:             CONFIG.MAP_ZOOM,
  zoomControl:      false,
  attributionControl: true,
});

L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  attribution: '© <a href="https://carto.com/">CARTO</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  subdomains: 'abcd',
  maxZoom: 20,
}).addTo(map);

L.control.zoom({ position: 'bottomright' }).addTo(map);

/* ══════════════════════════════════════════════
   LIVE CLOCK
══════════════════════════════════════════════ */
function updateClock() {
  const now  = new Date();
  const time = now.toLocaleTimeString('en-IN', { hour12: false });
  const date = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  document.getElementById('clock-time').textContent = time;
  document.getElementById('clock-date').textContent = date;
}
updateClock();
setInterval(updateClock, 1000);

/* ══════════════════════════════════════════════
   BACKEND HEALTH CHECK
══════════════════════════════════════════════ */
async function checkBackend() {
  const dot   = document.getElementById('backend-dot');
  const label = document.getElementById('backend-label');
  try {
    const res = await fetch(`${CONFIG.API_BASE}/health`, { signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      dot.className   = 'backend-dot online';
      label.textContent = 'saferoutefinder.onrender.com';
    } else {
      throw new Error('not ok');
    }
  } catch {
    dot.className   = 'backend-dot offline';
    label.textContent = 'Backend unreachable';
  }
}
checkBackend();

/* ══════════════════════════════════════════════
   CUSTOM SVG MARKERS
══════════════════════════════════════════════ */
function makeMarkerIcon(type) {
  const isStart = type === 'start';
  const color   = isStart ? '#00d68f' : '#7c6ff7';
  const label   = isStart ? 'A' : 'B';
  const glow    = isStart ? 'rgba(0,214,143,0.55)' : 'rgba(124,111,247,0.55)';

  return L.divIcon({
    className:    '',
    iconSize:     [38, 48],
    iconAnchor:   [19, 48],
    popupAnchor:  [0, -48],
    html: `
      <div style="width:38px;height:48px;filter:drop-shadow(0 6px 16px ${glow})">
        <svg width="38" height="48" viewBox="0 0 38 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M19 2C10.716 2 4 8.716 4 17C4 28 19 46 19 46C19 46 34 28 34 17C34 8.716 27.284 2 19 2Z"
                fill="${color}" fill-opacity="0.15" stroke="${color}" stroke-width="2"/>
          <circle cx="19" cy="17" r="8" fill="${color}"/>
          <text x="19" y="21.5" font-family="Inter,sans-serif" font-size="10"
                font-weight="800" fill="#070b12" text-anchor="middle">${label}</text>
        </svg>
      </div>`,
  });
}

/* ══════════════════════════════════════════════
   MOUSE HOVER → COORDINATES
══════════════════════════════════════════════ */
const coordsText = document.getElementById('coords-text');
map.on('mousemove', (e) => {
  coordsText.textContent = `${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`;
});

/* ══════════════════════════════════════════════
   MAP CLICK — 2-click flow
══════════════════════════════════════════════ */
map.on('click', async (e) => {
  const { lat, lng } = e.latlng;

  // Ignore clicks after both points are set
  if (state.phase === 'loading' || state.phase === 'done') return;

  if (!state.start) {
    // ── CLICK 1: Set start ──
    state.start = [lat, lng];
    state.phase = 'start-set';

    if (state.startMarker) map.removeLayer(state.startMarker);
    state.startMarker = L.marker([lat, lng], { icon: makeMarkerIcon('start') })
      .addTo(map)
      .bindTooltip(`<b style="color:#00d68f">Start</b><br>${fmtCoords(lat, lng)}`, { direction: 'top', offset: [0, -48] });

    document.getElementById('wp-start-coords').textContent = fmtCoords(lat, lng);
    setStepActive(2);
    setInstruction('step-end', 'Step 2', 'Now click your <strong>destination</strong> on the map');

  } else if (!state.end) {
    // ── CLICK 2: Set end → fetch ──
    state.end = [lat, lng];
    state.phase = 'loading';

    if (state.endMarker) map.removeLayer(state.endMarker);
    state.endMarker = L.marker([lat, lng], { icon: makeMarkerIcon('end') })
      .addTo(map)
      .bindTooltip(`<b style="color:#7c6ff7">Destination</b><br>${fmtCoords(lat, lng)}`, { direction: 'top', offset: [0, -48] });

    document.getElementById('wp-end-coords').textContent = fmtCoords(lat, lng);
    setInstruction('step-loading', 'Processing', 'Running A* algorithm on road network…');

    await fetchRoutes();
  }
});

/* ══════════════════════════════════════════════
   FETCH ROUTES FROM BACKEND
══════════════════════════════════════════════ */
async function fetchRoutes() {
  showLoader(true);

  try {
    const res = await fetch(`${CONFIG.API_BASE}${CONFIG.API_PREDICT}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start_lat: state.start[0],
        start_lon: state.start[1],
        end_lat:   state.end[0],
        end_lon:   state.end[1],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: `Server error ${res.status}` }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }

    const data = await res.json();
    renderRoutes(data);

  } catch (err) {
    console.error('[SafeRoute API]', err);
    showToast(err.message || 'Could not reach the routing server. Try again.');
    // Reset end so user can pick again
    state.end   = null;
    state.phase = 'start-set';
    if (state.endMarker) { map.removeLayer(state.endMarker); state.endMarker = null; }
    document.getElementById('wp-end-coords').textContent = '—';
    setInstruction('step-end', 'Step 2', 'Try clicking a different <strong>destination</strong>');

  } finally {
    showLoader(false);
  }
}

/* ══════════════════════════════════════════════
   RENDER ROUTES ON MAP + FILL PANEL
══════════════════════════════════════════════ */
function renderRoutes(data) {
  const { safe_route, short_route } = data;

  // Clear old layers
  clearLayers();

  // Draw shortest route first (below), dashed purple
  if (short_route?.coords?.length) {
    state.shortLayer = L.polyline(short_route.coords, {
      color:     '#7c6ff7',
      weight:    4,
      opacity:   0.7,
      dashArray: '10, 7',
      lineJoin:  'round',
      lineCap:   'round',
    }).addTo(map);
    state.shortLayer.bindTooltip('⚡ Shortest Route', { sticky: true });
  }

  // Draw safe route on top, solid green
  if (safe_route?.coords?.length) {
    state.safeLayer = L.polyline(safe_route.coords, {
      color:   '#00d68f',
      weight:  5,
      opacity: 0.9,
      lineJoin: 'round',
      lineCap:  'round',
    }).addTo(map);
    state.safeLayer.bindTooltip('🛡️ Safest Route', { sticky: true });
  }

  // Fit map to show both routes
  const all = [
    ...(safe_route?.coords  || []),
    ...(short_route?.coords || []),
  ];
  if (all.length) {
    map.fitBounds(L.latLngBounds(all), { padding: [60, 60] });
  }

  // Populate right panel cards
  populateCard('safe',  safe_route?.summary);
  populateCard('short', short_route?.summary);
  populateComparison(safe_route?.summary, short_route?.summary);

  // Show right panel
  document.getElementById('sidebar-right').classList.add('open');

  state.phase = 'done';
  setStepActive(3);
  setStepDone(1); setStepDone(2); setStepDone(3);
  setInstruction('step-done', 'Done ✓', 'Routes displayed — press <strong>Reset</strong> to plan a new route');
}

/* ══════════════════════════════════════════════
   POPULATE ROUTE CARD
══════════════════════════════════════════════ */
function populateCard(type, summary) {
  const distEl  = document.getElementById(`${type}-dist`);
  const etaEl   = document.getElementById(`${type}-eta`);
  const riskEl  = document.getElementById(`${type}-risk`);
  const fillEl  = document.getElementById(`${type}-fill`);
  const pctEl   = document.getElementById(`${type}-pct`);
  const pillEl  = document.getElementById(`${type}-pill`);
  const tagEl   = document.getElementById(`${type}-tag`);

  if (!summary) {
    distEl.textContent = 'N/A';
    etaEl.textContent  = '—';
    riskEl.textContent = '—';
    pctEl.textContent  = '—';
    pillEl.textContent = 'Unreachable';
    pillEl.className   = 'safety-pill pill-high';
    return;
  }

  const { distance_km, risk_percent, safety_level } = summary;

  distEl.textContent = `${distance_km} km`;
  etaEl.textContent  = calcETA(distance_km);
  riskEl.textContent = `${risk_percent}%`;
  pctEl.textContent  = `${(100 - risk_percent).toFixed(1)}%`;

  // Bar fills to (100 - risk)%
  requestAnimationFrame(() => {
    fillEl.style.width = `${Math.max(0, 100 - risk_percent)}%`;
  });

  // Safety pill
  const map2 = { SAFE: ['pill-safe', '✅ Safe'], MODERATE: ['pill-moderate', '⚠️ Moderate'], 'HIGH RISK': ['pill-high', '🔴 High Risk'] };
  const [cls, txt] = map2[safety_level] || ['pill-moderate', safety_level];
  pillEl.className   = `safety-pill ${cls}`;
  pillEl.textContent = txt;

  // Route tag
  if (type === 'safe') { tagEl.textContent = 'Recommended'; tagEl.className = 'route-tag tag-recommended'; }
  else                 { tagEl.textContent = 'Fastest';     tagEl.className = 'route-tag tag-fast'; }
}

/* ══════════════════════════════════════════════
   COMPARISON LOGIC
══════════════════════════════════════════════ */
function populateComparison(safe, short) {
  const box = document.getElementById('comparison-box');
  const txt = document.getElementById('comp-text');

  if (!safe && !short) {
    box.querySelector('.comp-icon').textContent = '❌';
    txt.innerHTML = 'No walkable path found between these points. Try selecting points closer to roads.';
    return;
  }

  if (!safe) {
    box.querySelector('.comp-icon').textContent = '⚡';
    txt.innerHTML = 'Only the <strong style="color:#7c6ff7">shortest route</strong> was found. No safer alternative exists.';
    return;
  }

  const safeDiff = safe && short ? (short.distance_km - safe.distance_km).toFixed(2) : 0;
  const riskDiff = safe && short ? (short.risk_percent - safe.risk_percent).toFixed(1) : 0;

  if (riskDiff > 0) {
    txt.innerHTML = `Take the <strong>green route</strong> — it's ${riskDiff}% safer, adding only ${Math.abs(safeDiff)} km.`;
  } else {
    txt.innerHTML = `Both routes have similar safety. The <strong>green route</strong> is the preferred choice.`;
  }
}

/* ══════════════════════════════════════════════
   RESET
══════════════════════════════════════════════ */
function resetAll() {
  state.start = null;
  state.end   = null;
  state.phase = 'idle';

  clearLayers();
  if (state.startMarker) { map.removeLayer(state.startMarker); state.startMarker = null; }
  if (state.endMarker)   { map.removeLayer(state.endMarker);   state.endMarker   = null; }

  // Reset panel text
  ['wp-start-coords', 'wp-end-coords'].forEach(id => {
    document.getElementById(id).textContent = '—';
  });
  ['safe', 'short'].forEach(t => {
    ['dist','eta','risk','pct'].forEach(f => {
      const el = document.getElementById(`${t}-${f}`);
      if (el) el.textContent = '—';
    });
    const fill = document.getElementById(`${t}-fill`);
    if (fill) fill.style.width = '0%';
    const pill = document.getElementById(`${t}-pill`);
    if (pill) { pill.textContent = '—'; pill.className = 'safety-pill'; }
    const tag = document.getElementById(`${t}-tag`);
    if (tag) { tag.textContent = ''; tag.className = 'route-tag'; }
  });

  // Reset steps
  [1, 2, 3].forEach(n => {
    const el = document.getElementById(`step-${n}`);
    el.classList.remove('active', 'completed');
    document.getElementById(`check-${n}`).style.opacity = '0';
  });
  setStepActive(1);

  // Close right panel
  document.getElementById('sidebar-right').classList.remove('open');

  setInstruction('step-start', 'Step 1', 'Click anywhere on the map to set your <strong>start point</strong>');
  map.flyTo(CONFIG.MAP_CENTER, CONFIG.MAP_ZOOM, { duration: 1.2 });
}

// Wire up reset button
document.getElementById('btn-reset').addEventListener('click', resetAll);

/* ══════════════════════════════════════════════
   UI HELPERS
══════════════════════════════════════════════ */
function setInstruction(cls, badgeText, htmlText) {
  const banner = document.getElementById('instruction-banner');
  banner.className = cls;
  document.getElementById('inst-badge').textContent = badgeText;
  document.getElementById('inst-text').innerHTML = htmlText;
}

function setStepActive(n) {
  [1, 2, 3].forEach(i => {
    document.getElementById(`step-${i}`).classList.remove('active');
  });
  const el = document.getElementById(`step-${n}`);
  if (el) el.classList.add('active');
}

function setStepDone(n) {
  const el = document.getElementById(`step-${n}`);
  if (!el) return;
  el.classList.remove('active');
  el.classList.add('completed');
  document.getElementById(`check-${n}`).style.opacity = '1';
}

function clearLayers() {
  if (state.safeLayer)  { map.removeLayer(state.safeLayer);  state.safeLayer  = null; }
  if (state.shortLayer) { map.removeLayer(state.shortLayer); state.shortLayer = null; }
}

/* ── Loading Overlay with animated steps ── */
let loaderStepTimer = null;
function showLoader(on) {
  const overlay = document.getElementById('loading-overlay');
  overlay.classList.toggle('active', on);

  // Reset step states
  [1, 2, 3].forEach(n => {
    const dot = document.getElementById(`ls-${n}`)?.querySelector('.l-step-dot');
    if (dot) dot.className = 'l-step-dot';
    document.getElementById(`ls-${n}`)?.classList.remove('active');
  });

  if (on) {
    // Animate loader steps sequentially
    activateLoaderStep(1);
    loaderStepTimer = setTimeout(() => activateLoaderStep(2), 1200);
    loaderStepTimer = setTimeout(() => activateLoaderStep(3), 2400);
  } else {
    clearTimeout(loaderStepTimer);
  }
}
function activateLoaderStep(n) {
  // Mark previous as done
  if (n > 1) {
    const prev = document.getElementById(`ls-${n - 1}`);
    prev?.querySelector('.l-step-dot')?.classList.replace('active', 'done');
    prev?.classList.remove('active');
  }
  const el  = document.getElementById(`ls-${n}`);
  const dot = el?.querySelector('.l-step-dot');
  if (dot) { dot.className = 'l-step-dot active'; }
  el?.classList.add('active');
}

/* ── Toast ── */
let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById('toast');
  document.getElementById('toast-msg').textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 5500);
}

/* ── ETA Calculator ── */
function calcETA(km) {
  const mins = Math.round((km / CONFIG.WALK_SPEED_KMH) * 60);
  if (mins < 1)  return '< 1 min';
  if (mins < 60) return `~${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

/* ── Coordinate format ── */
function fmtCoords(lat, lng) {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

/* ══════════════════════════════════════════════
   INIT — set step 1 active on load
══════════════════════════════════════════════ */
setStepActive(1);
setInstruction('step-start', 'Step 1', 'Click anywhere on the map to set your <strong>start point</strong>');
