// frontend/script.js

const API_BASE_URL = 'https://saferoutefinder.onrender.com';
const MAP_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const START_ICON_URL = 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png';
const END_ICON_URL = 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png';
const SHADOW_URL = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png';

let map, startMarker, endMarker, safePolyline, shortPolyline;
let startCoords = null;
let endCoords = null;
let isCalculating = false;

const startIcon = new L.Icon({ iconUrl: START_ICON_URL, shadowUrl: SHADOW_URL, iconSize: [25, 41], iconAnchor: [12, 41] });
const endIcon = new L.Icon({ iconUrl: END_ICON_URL, shadowUrl: SHADOW_URL, iconSize: [25, 41], iconAnchor: [12, 41] });

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    setupEventListeners();
});

function initMap() {
    map = L.map('map', { zoomControl: false }).setView([10.7905, 78.7047], 14);
    L.tileLayer(MAP_TILES, { attribution: '&copy; CartoDB' }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    map.on('click', onMapClick);
}

function setupEventListeners() {
    document.getElementById('find-route-btn').addEventListener('click', findSafeRoute);
    document.getElementById('reset-btn').addEventListener('click', resetAll);
}

function onMapClick(e) {
    const { lat, lng } = e.latlng;
    if (!startCoords) {
        startCoords = { lat, lng };
        startMarker = L.marker([lat, lng], { icon: startIcon }).addTo(map);
        updateUI('start', lat, lng);
    } else if (!endCoords) {
        endCoords = { lat, lng };
        endMarker = L.marker([lat, lng], { icon: endIcon }).addTo(map);
        updateUI('end', lat, lng);
    } else {
        map.removeLayer(endMarker);
        endCoords = { lat, lng };
        endMarker = L.marker([lat, lng], { icon: endIcon }).addTo(map);
        updateUI('end', lat, lng);
    }
}

function updateUI(step, lat, lng) {
    const label = step === 'start' ? 'start' : 'end';
    document.getElementById(`${label}-point-info`).classList.add('completed');
    document.getElementById(`${label}-coords`).innerText = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    
    const instr = document.getElementById('instruction');
    const findBtn = document.getElementById('find-route-btn');

    if (step === 'start') {
        instr.innerHTML = 'Click on the map to select <strong>END</strong> point';
    } else {
        instr.innerHTML = 'Neural network ready. Analyze safe path now.';
        findBtn.disabled = false;
    }
}

async function findSafeRoute() {
    if (!startCoords || !endCoords || isCalculating) return;
    toggleLoader(true);
    isCalculating = true;

    try {
        const response = await fetch(`${API_BASE_URL}/predict-route`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                start_lat: startCoords.lat, start_lon: startCoords.lng,
                end_lat: endCoords.lat, end_lon: endCoords.lng
            })
        });

        const data = await response.json();
        if (response.ok) {
            visualizeRoutes(data);
            showResults(data);
            document.getElementById('status-badge').innerText = 'SECURE PATH FOUND';
        } else {
            alert(`Routing Error: ${data.detail || 'Path unavailable.'}`);
        }
    } catch (err) {
        alert('Server unreachable. Ensure FastAPI is running.');
    } finally {
        toggleLoader(false);
        isCalculating = false;
    }
}

function visualizeRoutes(data) {
    if (safePolyline) map.removeLayer(safePolyline);
    if (shortPolyline) map.removeLayer(shortPolyline);

    // 1. Draw Shortest Route (Grey/Muted)
    if (data.short_route) {
        shortPolyline = L.polyline(data.short_route.coords, {
            color: '#64748b',
            weight: 4,
            opacity: 0.5,
            dashArray: '5, 10'
        }).addTo(map);
    }

    // 2. Draw Safe Route (Bright/Neon)
    if (data.safe_route) {
        safePolyline = L.polyline(data.safe_route.coords, {
            color: '#3b82f6',
            weight: 6,
            opacity: 0.9,
            lineCap: 'round',
            className: 'path-main'
        }).addTo(map);
        
        map.fitBounds(safePolyline.getBounds(), { padding: [50, 50] });
    }
}

function showResults(data) {
    const card = document.getElementById('result-card');
    const safe = data.safe_route.summary;
    const short = data.short_route ? data.short_route.summary : null;

    document.getElementById('safe-distance').innerText = `${safe.distance_km} km`;
    document.getElementById('safe-risk').innerText = `${safe.risk_percent}%`;
    
    // Safety Level UI
    const levelEl = document.getElementById('safety-level');
    levelEl.innerText = safe.safety_level;
    levelEl.className = 'safety-level ' + safe.safety_level.toLowerCase().replace(' ', '');

    // Comparison Logic
    const compInfo = document.getElementById('comparison-info');
    if (short) {
        const reduction = Math.max(0, short.risk_percent - safe.risk_percent);
        document.getElementById('risk-reduction').innerText = `${reduction.toFixed(1)}%`;
        compInfo.classList.remove('hidden');
    } else {
        compInfo.classList.add('hidden');
    }

    card.classList.remove('hidden');
}

function resetAll() {
    startCoords = null; endCoords = null;
    document.getElementById('start-coords').innerText = 'Not Selected';
    document.getElementById('end-coords').innerText = 'Not Selected';
    document.getElementById('start-point-info').classList.remove('completed');
    document.getElementById('end-point-info').classList.remove('completed');
    document.getElementById('instruction').innerHTML = 'Click on the map to select <strong>START</strong> point';
    document.getElementById('find-route-btn').disabled = true;
    document.getElementById('result-card').classList.add('hidden');
    document.getElementById('status-badge').innerText = 'READY TO NAVIGATE';
    
    if (startMarker) map.removeLayer(startMarker);
    if (endMarker) map.removeLayer(endMarker);
    if (safePolyline) map.removeLayer(safePolyline);
    if (shortPolyline) map.removeLayer(shortPolyline);
    
    startMarker = null; endMarker = null; safePolyline = null; shortPolyline = null;
}

function toggleLoader(show) {
    const loader = document.getElementById('loader');
    if (show) loader.classList.remove('hidden');
    else loader.classList.add('hidden');
}
