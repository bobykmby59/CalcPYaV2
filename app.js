// ==========================================
// BUSINESS & STATE ENGINE - RIDER CALC PRO v3.6
// ==========================================
const COMPONENTE_FIJO = 2.50; 
const PAGO_RETIRO = 1.00;     
const PAGO_ENTREGA = 2.50;    
const PRECIO_KM = 1.50;       
const PAGO_PUBLICIDAD = 0.50;  

// Hotspots de alta demanda en Ciudad de Guatemala
const gtHotspots = [
  { name: "CC Miraflores (Zona 11)", lat: 14.6212, lng: -90.5526 },
  { name: "Oakland Place (Zona 10)", lat: 14.5985, lng: -90.5072 },
  { name: "CC Naranjo Mall (Condado Naranjo)", lat: 14.6436, lng: -90.5574 },
  { name: "Plaza Cayalá (Zona 16)", lat: 14.6121, lng: -90.4891 },
  { name: "CC Pradera Concepción (Carretera SV)", lat: 14.5492, lng: -90.4431 },
  { name: "CC Portales (Zona 17)", lat: 14.6548, lng: -90.4851 },
  { name: "CC Fontabella (Zona 10)", lat: 14.6006, lng: -90.5085 },
  { name: "CC Pradera (Zona 10)", lat: 14.5921, lng: -90.5015 }
];

// Base de datos de consejos útiles para Riders en Guatemala
const riderTips = [
  "¡Buen viaje! Revisa siempre la dirección en el mapa antes de arrancar.",
  "Guarda tu distancia. En asfalto mojado frena suavemente.",
  "¡Excelente trabajo! Recuerda tomar agua para mantenerte hidratado.",
  "Ojo al filtro de aceite de tu moto. Un motor bien cuidado rinde más.",
  "Si vas por Carretera a El Salvador, ten cuidado con las curvas.",
  "Mantén tu casco bien abrochado. ¡Tu seguridad es lo primero, Rider!",
  "Evita zonas solitarias de noche. Mejor espera en centros comerciales.",
  "¿Revisaste la presión de tus llantas hoy? Ahorrarás gasolina.",
  "Una sonrisa al cliente puede ganarte una propina en efectivo.",
  "Desinfecta tu mochila de reparto al final del día. Higiene ante todo.",
  "Retrovisores bien alineados reducen puntos ciegos peligrosos.",
  "Lleva impermeable en la mochila, las lluvias de Guate no avisan.",
  "Planificar tus rutas te ahorra valioso tiempo y combustible.",
  "Si el cliente se tarda en salir, respira hondo. Paciencia trae recompensa."
];

// Almacenamiento local del Rider
let db = {
  orders: [],
  restaurants: ["McDonald's", "Burger King", "Pollo Campero", "Pizza Hut", "Taco Bell", "Subway", "Little Caesars", "Wendy's"],
  config: { 
    riderName: '', dailyGoal: 500, gasPrice: 32, gasRend: 120, dailyMaint: 15,
    autoMultiplierEnabled: false, multiplierSchedule: [], satRegime: "pequeno"
  }
};

let currentTab = 'calc'; 
let activeMultipliers = [1.00, 1.10, 1.20, 1.25, 1.30, 1.50, 2.00]; 
let isRainActive = false; 
let isDobleOrder = false;
let segmentsCount = 1;

let trackState = {
  active: false, phase: null,
  times: { aceptar: null, llegue: null, recogi: null, entregu: null, aceptarRaw: null, llegueRaw: null, recogiRaw: null, entreguRaw: null },
  distances: { alRestaurante: 0, alCliente: 0 }, gpsPoints: [], currentDistance: 0, currentDeliveryIndex: 0
};

// Control de persistencia GPS, WakeLock y Antirreproducción suspendida
let wakeLockInstance = null; 
let watchPositionId = null; 
let gpsSmoothBuffer = []; 
let inactiveTimer = null;
let lastMovedTime = Date.now(); 
let lastMovedCoords = null; 
let latestCoords = null; 
let lastGpsActivity = Date.now();
let audioContextInstance = null; 
let bgGpsIntervalId = null;
let glovesModeActive = false;

// Instancias de Mapas Interactivos Leaflet
let redHelmetIcon = null;
let leafMapInstance = null; 
let mapPolylineRetiro = null; 
let mapPolylineEntrega = null; 
let mapStartMarker = null; 
let globalUserMarker = null;

let motoMapInstance = null; 
let motoPolylineRetiro = null; 
let motoPolylineEntrega = null; 
let motoStartMarker = null; 
let globalUserMarkerMoto = null;

const historyMapInstances = {}; 
let deliverySegments = [];

// Inicialización de la aplicación
document.addEventListener("DOMContentLoaded", () => {
  hydrateDataStorage(); 
  initializeCoreEvents(); 
  renderPresetsChips(); 
  initDateDisplay(); 
  calculateRealtimeEarnings(); 
  initAutoTheme(); 
  fetchWeather();
  startLiveLocationKeepalive();
});

function hydrateDataStorage() {
  try {
    const rawAll = localStorage.getItem('rider_db');
    if (rawAll) { 
      db = JSON.parse(rawAll); 
      if (!db.config) db.config = {};
      if (db.config.autoMultiplierEnabled === undefined) db.config.autoMultiplierEnabled = false;
      if (!db.config.multiplierSchedule) db.config.multiplierSchedule = [];
      if (db.config.satRegime === undefined) db.config.satRegime = "pequeno";
    } else { 
      localStorage.setItem('rider_db', JSON.stringify(db)); 
    }
  } catch(e) { console.error('Error hydrating store', e); }
  addDeliverySegment(true);
}

function commitDataStorage() {
  try { 
    localStorage.setItem('rider_db', JSON.stringify(db)); 
    syncDashboardValues(); 
  } catch(e) { console.error('Failed writing states', e); }
}

function initializeCoreEvents() {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', (e) => {
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      e.currentTarget.classList.add('active');
    });
  });
  document.getElementById('cfgRiderName').value = db.config.riderName || '';
  document.getElementById('cfgDailyGoal').value = db.config.dailyGoal || 500;
  document.getElementById('cfgGasPrice').value = db.config.gasPrice || 32;
  document.getElementById('cfgGasRend').value = db.config.gasRend || 120;
  document.getElementById('cfgDailyMaint').value = db.config.dailyMaint || 15;
  document.getElementById('cfgSatRegime').value = db.config.satRegime || 'pequeno';
  
  document.getElementById('cfgAutoMultSwitch').checked = db.config.autoMultiplierEnabled;
  if (db.config.autoMultiplierEnabled) {
    document.getElementById('cfgScheduleContainer').style.display = 'flex';
  }
  renderScheduleSlots();
  updateScheduledMultiplierOnCalcTab();
  
  syncDashboardValues();
}

function initDateDisplay() {
  const now = new Date();
  document.getElementById('headerDateStr').textContent = now.toLocaleDateString('es-GT', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase() + " GT";
}

function initAutoTheme() {
  const hour = new Date().getHours(); 
  const shouldBeDark = hour >= 18 || hour < 6;
  if (shouldBeDark) { 
    document.body.classList.remove('light-mode'); 
  } else { 
    document.body.classList.add('light-mode'); 
  }
}

function toggleTheme() {
  document.body.classList.toggle('light-mode');
  document.getElementById('themeToggleBtn').textContent = document.body.classList.contains('light-mode') ? '🌙' : '☀️';
  drawAnalyticsChart();
}

function adjustMult(amount) {
  if (db.config.autoMultiplierEnabled) return;
  const multInput = document.getElementById('multValue'); 
  let currentVal = parseFloat(multInput.value) || 1.30;
  currentVal = parseFloat((currentVal + amount).toFixed(2)); 
  if (currentVal < 1.0) currentVal = 1.0;
  multInput.value = currentVal.toFixed(2); 
  renderPresetsChips(); 
  calculateRealtimeEarnings();
}

function selectMultPreset(val) { 
  if (db.config.autoMultiplierEnabled) return;
  document.getElementById('multValue').value = val.toFixed(2); 
  renderPresetsChips(); 
  calculateRealtimeEarnings(); 
}

function renderPresetsChips() {
  const currentVal = parseFloat(document.getElementById('multValue').value) || 1.30;
  const container = document.getElementById('presetChipsList'); 
  container.innerHTML = '';
  activeMultipliers.forEach(m => {
    const chip = document.createElement('div'); 
    chip.className = `preset-chip ${m === currentVal ? 'active' : ''}`;
    chip.textContent = `${m.toFixed(2)}x`; 
    chip.onclick = () => selectMultPreset(m); 
    container.appendChild(chip);
  });
}

function stepSegment(targetId, step) {
  const input = document.getElementById(targetId); 
  let val = parseFloat(input.value) || 0.0;
  val = parseFloat((val + step).toFixed(3)); 
  if (val < 0.0) val = 0.0; 
  input.value = val === 0.0 ? '' : val.toFixed(3); 
  calculateRealtimeEarnings();
}

function addDeliverySegment(isInitial = false) {
  if (deliverySegments.length >= 5) return;
  const id = Date.now() + Math.random(); 
  const index = deliverySegments.length + 1;
  const container = document.getElementById('deliveryPointsList'); 
  const div = document.createElement('div');
  div.className = 'segment-box'; 
  div.id = `delivery-seg-${id}`;
  div.innerHTML = `
    <div class="segment-header"><span class="segment-title">🏠 Entrega ${index}</span><div class="km-input-wrap"><input type="number" class="km-input" id="kmE_${id}" placeholder="0.000" step="0.1" oninput="calculateRealtimeEarnings()"><span class="km-unit">km</span></div></div>
    <div class="segment-stepper"><button class="step-btn" onclick="stepSegment('kmE_${id}', -0.1)">− 0.1</button><button class="step-btn" onclick="stepSegment('kmE_${id}', 0.1)">+ 0.1</button></div>
    ${!isInitial ? `<button class="h-btn" onclick="removeDeliverySegment('${id}')" style="margin-top:12px; border-color: var(--accent); color: var(--accent); background:none; padding:6px;">Eliminar Entrega</button>` : ''}
  `;
  container.appendChild(div); 
  deliverySegments.push({ id, elementId: `kmE_${id}` });
  if (!isInitial) { 
    calculateRealtimeEarnings(); 
    updateDobleOrderBadge(); 
  }
}

function removeDeliverySegment(id) {
  const div = document.getElementById(`delivery-seg-${id}`);
  if (div) { 
    div.remove(); 
    deliverySegments = deliverySegments.filter(s => s.id !== id); 
    calculateRealtimeEarnings(); 
    updateDobleOrderBadge(); 
  }
}

function toggleRain(event) {
  if (event && event.target && event.target.id === 'rainValue') return;
  isRainActive = !isRainActive; 
  document.getElementById('rainSwitch').checked = isRainActive; 
  calculateRealtimeEarnings();
}

function toggleDobleOrder() { 
  isDobleOrder = !isDobleOrder; 
  updateDobleOrderBadge(); 
  calculateRealtimeEarnings(); 
}

function updateDobleOrderBadge() {
  const badge = document.getElementById('dobleBadge'); 
  const size = deliverySegments.length;
  badge.textContent = isDobleOrder ? `ACTIVO (x${size})` : 'OFF'; 
  badge.style.color = isDobleOrder ? 'var(--green)' : 'var(--accent)';
}

function resetClockTracking() {
  trackState = {
    active: false, phase: null,
    times: { aceptar: null, llegue: null, recogi: null, entregu: null, aceptarRaw: null, llegueRaw: null, recogiRaw: null, entreguRaw: null },
    distances: { alRestaurante: 0, alCliente: 0 }, gpsPoints: [], currentDistance: 0, currentDeliveryIndex: 0
  };
  const steps = ['Acepted', 'Arrived', 'Picked', 'Delivered'];
  steps.forEach(s => {
    const btn = document.getElementById(`t${s}`); if (btn) btn.classList.remove('active');
    const timeSpan = document.getElementById(`trackTime${s}`); if (timeSpan) timeSpan.textContent = '--:--';
    const mBtn = document.getElementById(`m_t${s}`); if (mBtn) mBtn.classList.remove('active');
    const mTimeSpan = document.getElementById(`m_trackTime${s}`); if (mTimeSpan) mTimeSpan.textContent = '--:--';
  });
  document.getElementById('gpsDistanceLive').textContent = '0.000 km';
  
  const dBtn = document.getElementById('tDelivered'); if (dBtn) { const s = dBtn.querySelector('.title'); if (s) s.textContent = "Entregué"; }
  const mdBtn = document.getElementById('m_tDelivered'); if (mdBtn) { const s = mdBtn.querySelector('.title'); if (s) s.textContent = "Entregué"; }
  updateMotoBreakdownUI();
  updateScheduledMultiplierOnCalcTab();
}

function updateDeliveryButtonLabels() {
  const btn = document.getElementById('tDelivered'); 
  const mBtn = document.getElementById('m_tDelivered');
  const total = deliverySegments.length; 
  const currentIdx = trackState.currentDeliveryIndex;
  const label = total > 1 ? `Entregué ${currentIdx + 1}/${total}` : "Entregué";
  if (btn) { const t = btn.querySelector('.title'); if (t) t.textContent = label; }
  if (mBtn) { const t = mBtn.querySelector('.title'); if (t) t.textContent = label; }
}

function saveTripToHistory() {
  const kmR = parseFloat(document.getElementById('kmRetiro').value) || 0.0; 
  let kmETotal = 0.0;
  deliverySegments.forEach(seg => { const el = document.getElementById(seg.elementId); if (el) kmETotal += parseFloat(el.value) || 0.0; });
  if (kmR === 0.0 && kmETotal === 0.0) { triggerAlert('Ingresa Distancia', 'Coloca distancia en retiro o entrega.'); return; }
  const finalVal = calculateRealtimeEarnings(); 
  const restName = document.getElementById('restaurantInput').value || 'Sin Nombre';
  
  const orderObj = {
    id: Date.now(), restaurant: restName, kmR, kmE: kmETotal, deliveriesCount: deliverySegments.length, doble: isDobleOrder, rain: isRainActive,
    rainVal: isRainActive ? (parseFloat(document.getElementById('rainValue').value) || 0.25) : 0.00,
    multiplier: parseFloat(document.getElementById('multValue').value) || 1.30, propina: parseFloat(document.getElementById('propinaValue').value) || 0.0,
    earnings: finalVal, timestamp: new Date().toISOString(), timings: { ...trackState.times }, routePoints: [...trackState.gpsPoints]
  };
  
  db.orders.push(orderObj); 
  if (restName !== 'Sin Nombre' && !db.restaurants.includes(restName)) { 
    db.restaurants.push(restName); 
  }
  commitDataStorage();
  
  const randomTip = riderTips[Math.floor(Math.random() * riderTips.length)];
  triggerBannerNotification(`Pedido Guardado · Q ${finalVal.toFixed(2)}`, `💡 Tip: ${randomTip}`);
  
  document.getElementById('kmRetiro').value = ''; 
  document.getElementById('propinaValue').value = '';
  document.getElementById('restaurantInput').value = ''; 
  document.getElementById('restaurantInputMoto').value = '';
  const container = document.getElementById('deliveryPointsList'); 
  container.innerHTML = ''; 
  deliverySegments = [];
  addDeliverySegment(true); 
  isRainActive = false; 
  isDobleOrder = false; 
  document.getElementById('rainSwitch').checked = false;
  updateDobleOrderBadge(); 
  resetClockTracking(); 
  calculateRealtimeEarnings();
}

function trackStep(phase) {
  if (glovesModeActive) {
    if (!confirm(`¿Confirmar acción: ${phase.toUpperCase()}?`)) return;
  }
  const now = new Date(); 
  const timeStr = now.toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' }); 
  const rawNow = now.getTime();
  
  if (phase === 'aceptar') {
    resetClockTracking(); 
    trackState.active = true; 
    trackState.phase = 'retiro'; 
    trackState.times.aceptar = timeStr; 
    trackState.times.aceptarRaw = rawNow;
    
    document.getElementById('tAcepted').classList.add('active'); 
    document.getElementById('trackTimeAcepted').textContent = timeStr;
    const mBtn = document.getElementById('m_tAcepted'); if (mBtn) mBtn.classList.add('active');
    const mTime = document.getElementById('m_trackTimeAcepted'); if (mTime) mTime.textContent = timeStr;
    
    updateScheduledMultiplierOnCalcTab();
    triggerAlert('GPS de Ruta Activado', 'El trayecto se está grabando.');
    
  } else if (phase === 'llegue') {
    if (!trackState.active) return; 
    trackState.times.llegue = timeStr; 
    trackState.times.llegueRaw = rawNow;
    
    document.getElementById('tArrived').classList.add('active'); 
    document.getElementById('trackTimeArrived').textContent = timeStr;
    const mBtn = document.getElementById('m_tArrived'); if (mBtn) mBtn.classList.add('active');
    const mTime = document.getElementById('m_trackTimeArrived'); if (mTime) mTime.textContent = timeStr;
    
    const capturedRetiro = trackState.currentDistance; 
    trackState.distances.alRestaurante = capturedRetiro;
    document.getElementById('kmRetiro').value = capturedRetiro.toFixed(3); 
    calculateRealtimeEarnings();
    
    trackState.phase = 'espera'; 
    trackState.currentDistance = 0; 
    triggerAlert('Llegaste al Rest.', `Retiro fijado a ${capturedRetiro.toFixed(3)} km.`);
    
  } else if (phase === 'recogi') {
    if (!trackState.active) return; 
    trackState.times.recogi = timeStr; 
    trackState.times.recogiRaw = rawNow;
    
    document.getElementById('tPicked').classList.add('active'); 
    document.getElementById('trackTimePicked').textContent = timeStr;
    const mBtn = document.getElementById('m_tPicked'); if (mBtn) mBtn.classList.add('active');
    const mTime = document.getElementById('m_trackTimePicked'); if (mTime) mTime.textContent = timeStr;
    
    trackState.phase = 'entrega'; 
    trackState.currentDistance = 0; 
    trackState.currentDeliveryIndex = 0;
    
    updateDeliveryButtonLabels(); 
    triggerAlert('Pedido Recogido', 'Trayecto de entregas iniciado.');
    
  } else if (phase === 'entregu') {
    if (!trackState.active) return;
    const totalDeliveries = deliverySegments.length; 
    const currentIdx = trackState.currentDeliveryIndex;
    const capturedDelivery = trackState.currentDistance; 
    const currentSeg = deliverySegments[currentIdx];
    
    if (currentSeg) { 
      const inputEl = document.getElementById(currentSeg.elementId); 
      if (inputEl) { inputEl.value = capturedDelivery.toFixed(3); } 
    }
    calculateRealtimeEarnings();
    
    if (currentIdx < totalDeliveries - 1) {
      trackState.currentDeliveryIndex++; 
      trackState.currentDistance = 0;
      updateDeliveryButtonLabels(); 
      triggerAlert(`Entrega ${currentIdx + 1} Completada`, `Distancia: ${capturedDelivery.toFixed(3)} km. Ruta iniciada a Entrega ${trackState.currentDeliveryIndex + 1}.`);
    } else {
      trackState.times.entregu = timeStr; 
      trackState.times.entreguRaw = rawNow;
      
      document.getElementById('tDelivered').classList.add('active'); 
      document.getElementById('trackTimeDelivered').textContent = timeStr;
      const mBtn = document.getElementById('m_tDelivered'); if (mBtn) mBtn.classList.add('active');
      const mTime = document.getElementById('m_trackTimeDelivered'); if (mTime) mTime.textContent = timeStr;
      
      stopTripTracking(); 
      triggerAlert('Ruta Completada', 'Todas las entregas registradas.');
      setTimeout(() => { saveTripToHistory(); if (document.getElementById('motoModeOverlay').classList.contains('active')) { exitMotoMode(); } }, 1200);
    }
  }
  updateMotoBreakdownUI();
}

function updateMotoBreakdownUI() {
  const rowRetiro = document.getElementById('motoSegmentRetiro'); 
  const rowEspera = document.getElementById('motoSegmentEspera'); 
  const rowEntrega = document.getElementById('motoSegmentEntrega');
  if (!rowRetiro || !rowEspera || !rowEntrega) return;
  
  if (trackState.times.aceptarRaw && trackState.times.llegueRaw) {
    rowRetiro.textContent = `${Math.round((trackState.times.llegueRaw - trackState.times.aceptarRaw) / 60000)} min | ${trackState.distances.alRestaurante.toFixed(2)} km`;
  } else if (trackState.times.aceptarRaw && trackState.phase === 'retiro') {
    rowRetiro.textContent = `Viajando... (${Math.round((Date.now() - trackState.times.aceptarRaw) / 60000)} min) | ${trackState.currentDistance.toFixed(2)} km`;
  } else { rowRetiro.textContent = '--:-- | 0.00 km'; }
  
  if (trackState.times.llegueRaw && trackState.times.recogiRaw) {
    rowEspera.textContent = `${Math.round((trackState.times.recogiRaw - trackState.times.llegueRaw) / 60000)} min`;
  } else if (trackState.times.llegueRaw && trackState.phase === 'espera') {
    rowEspera.textContent = `Esperando... (${Math.round((Date.now() - trackState.times.llegueRaw) / 60000)} min)`;
  } else { rowEspera.textContent = '--:--'; }
  
  if (trackState.times.recogiRaw && trackState.times.entreguRaw) {
    rowEntrega.textContent = `${Math.round((trackState.times.entreguRaw - trackState.times.recogiRaw) / 60000)} min | ${trackState.distances.alCliente.toFixed(2)} km`;
  } else if (trackState.times.recogiRaw && trackState.phase === 'entrega') {
    rowEntrega.textContent = `Viajando... (${Math.round((Date.now() - trackState.times.recogiRaw) / 60000)} min) | ${trackState.currentDistance.toFixed(2)} km`;
  } else { rowEntrega.textContent = '--:-- | 0.00 km'; }
}

function startLiveLocationKeepalive() {
  if (!navigator.geolocation) return; 
  requestScreenWakeLock(); 
  trackState.currentDistance = 0; 
  trackState.gpsPoints = []; 
  gpsSmoothBuffer = []; 
  lastMovedTime = Date.now(); 
  lastMovedCoords = null;
  
  const geoOpts = { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 };
  watchPositionId = navigator.geolocation.watchPosition(processLiveGpsPositionUpdate, handleGpsTrackingError, geoOpts);
  
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioContextInstance = new AudioContextClass(); 
      const osc = audioContextInstance.createOscillator(); 
      const gain = audioContextInstance.createGain();
      gain.gain.value = 0.0001; 
      osc.connect(gain); 
      gain.connect(audioContextInstance.destination); 
      osc.start();
    }
  } catch(e) {}
  
  if (bgGpsIntervalId) clearInterval(bgGpsIntervalId);
  bgGpsIntervalId = setInterval(() => { navigator.geolocation.getCurrentPosition(processLiveGpsPositionUpdate, () => {}, { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }); }, 4000);
  
  document.getElementById('gpsStateText').textContent = '🛰️ GPS Buscando...'; 
  document.getElementById('gpsStateText').style.color = 'var(--accent2)';
}

function stopTripTracking() { 
  trackState.active = false; 
  document.getElementById('gpsStateText').textContent = '🛰️ GPS Listo'; 
  document.getElementById('gpsStateText').style.color = 'var(--green)'; 
}

function checkInactivity(lat, lng) {
  const now = Date.now(); 
  if (!lastMovedCoords) { lastMovedCoords = [lat, lng]; lastMovedTime = now; return; }
  const dist = calculateHaversineDistance(lastMovedCoords[0], lastMovedCoords[1], lat, lng);
  if (dist > 0.03) { lastMovedCoords = [lat, lng]; lastMovedTime = now; } else if (now - lastMovedTime >= 600000) {
    lastMovedTime = now; 
    triggerBannerNotification('💡 Sugerencia de Ruta', 'Llevas 10 minutos sin moverte de este punto. Deberías moverte a alguna zona de alta demanda para obtener un nuevo pedido.');
  }
}

function updateHotspotsUi(lat, lng) {
  const container = document.getElementById('hotspotsList'); if (!container) return;
  const calculated = gtHotspots.map(h => { const dist = calculateHaversineDistance(lat, lng, h.lat, h.lng); return { ...h, dist }; });
  calculated.sort((a, b) => a.dist - b.dist); container.innerHTML = '';
  calculated.forEach(h => {
    const item = document.createElement('div'); item.style.display = 'flex'; item.style.justifyContent = 'space-between'; item.style.alignItems = 'center'; item.style.padding = '10px 12px'; item.style.background = 'var(--card2)'; item.style.borderRadius = '12px'; item.style.border = '1.5px solid var(--border)';
    item.innerHTML = `<div><div style="font-size: 13px; font-weight: 700;">${h.name}</div><div style="font-size: 11px; color: var(--muted);">Distancia: <span style="color: var(--blue); font-weight: 700;">${h.dist.toFixed(2)} km</span></div></div><div style="display: flex; gap: 6px;"><button class="step-btn" onclick="navigateHotspot(${h.lat}, ${h.lng}, '${h.name}')" style="font-size: 11px; padding: 6px 10px; background: var(--card); border-color: var(--accent);">Navegar</button></div>`;
    container.appendChild(item);
  });
}

function navigateHotspot(lat, lng, name) {
  if (confirm(`¿Navegar hacia ${name} usando Waze o Google Maps?`)) { window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank'); } else { switchMainTab('mapa'); if (leafMapInstance) { leafMapInstance.setView([lat, lng], 15); } }
}

function processLiveGpsPositionUpdate(pos) {
  const lat = pos.coords.latitude; const lng = pos.coords.longitude; const speed = pos.coords.speed || 0.0; const accuracy = pos.coords.accuracy;
  if (accuracy > 25) return; gpsSmoothBuffer.push([lat, lng]); if (gpsSmoothBuffer.length > 3) gpsSmoothBuffer.shift();
  const avgLat = gpsSmoothBuffer.reduce((acc, curr) => acc + curr[0], 0) / gpsSmoothBuffer.length;
  const avgLng = gpsSmoothBuffer.reduce((acc, curr) => acc + curr[1], 0) / gpsSmoothBuffer.length;
  latestCoords = [avgLat, avgLng]; updateHelmetMarkerOnMap(avgLat, avgLng); updateHotspotsUi(avgLat, avgLng); checkInactivity(avgLat, avgLng);
  
  if (!trackState.active) {
    updateScheduledMultiplierOnCalcTab();
  }
  
  if (trackState.active) {
    if (trackState.gpsPoints.length > 0) {
      const lastPoint = trackState.gpsPoints[trackState.gpsPoints.length - 1]; const stepDist = calculateHaversineDistance(lastPoint[0], lastPoint[1], avgLat, avgLng);
      if (stepDist > 0.008) {
        if (trackState.phase === 'retiro' || trackState.phase === 'entrega') { trackState.currentDistance += stepDist; }
        trackState.gpsPoints.push(latestCoords); lastGpsActivity = Date.now(); document.getElementById('gpsDistanceLive').textContent = `${trackState.currentDistance.toFixed(3)} km`;
        drawLiveTrackingPathOnMap(trackState.gpsPoints);
      }
    } else { trackState.gpsPoints.push(latestCoords); }
    document.getElementById('motoSpeed').textContent = Math.round(speed * 3.6); document.getElementById('motoGpsDistance').textContent = trackState.currentDistance.toFixed(3);
    updateMotoBreakdownUI();
  }
  document.getElementById('gpsStateText').textContent = '🛰️ GPS Conectado'; document.getElementById('gpsStateText').style.color = 'var(--green)';
}

function handleGpsTrackingError() {
  document.getElementById('gpsStateText').textContent = '🛰️ GPS Señal Débil'; document.getElementById('gpsStateText').style.color = 'var(--accent)';
}

async function requestScreenWakeLock() {
  try { if ('wakeLock' in navigator) { wakeLockInstance = await navigator.wakeLock.request('screen'); document.getElementById('wakeLockStatus').style.display = 'inline-block'; } } catch(e) {}
}

function releaseScreenWakeLock() { if (wakeLockInstance) { wakeLockInstance.release(); wakeLockInstance = null; } document.getElementById('wakeLockStatus').style.display = 'none'; }

function initLeafletAssets() {
  if (redHelmetIcon || typeof L === 'undefined') return;
  redHelmetIcon = L.divIcon({
    html: `<div style="position: relative; width: 42px; height: 42px; display: flex; align-items: center; justify-content: center;"><div style="position: absolute; width: 42px; height: 42px; background: rgba(255, 45, 85, 0.25); border-radius: 50%; animation: pulse 1.8s infinite;"></div><div style="width: 32px; height: 32px; background: #ff2d55; border: 2.5px solid white; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 3px 8px rgba(0,0,0,0.4);"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="18" height="18" style="transform: scale(1.15);"><path fill="#ffffff" d="M256 32C132.3 32 32 132.3 32 256c0 47.9 15 92.4 40.7 129.2l12.8 18.3c15 21.4 39.5 34.5 65.8 35.1l32.3.7c11.9.3 22-8 24.3-19.7l9-44.8c2.9-14.7 15.9-25.3 30.9-25.3h16.3c15 0 28 10.6 30.9 25.3l9 44.8c2.3 11.7 12.4 20 24.3 19.7l32.3-.7c26.3-.6 50.8-13.7 65.8-35.1l12.8-18.3C465 348.4 480 303.9 480 256 480 132.3 379.7 32 256 32zm0 64c88.4 0 160 71.6 160 160v16H96v-16C96 167.6 167.6 96 256 96z"/><path fill="#ff2d55" d="M128 256h256v32H128z"/></svg></div></div>`,
    className: 'helmet-marker-icon', iconSize: [42, 42], iconAnchor: [21, 21]
  });
}

function initLeafletMapInstance() {
  if (typeof L === 'undefined' || leafMapInstance) return;
  try {
    leafMapInstance = L.map('liveMapDiv', { zoomControl: false, attributionControl: false }).setView(latestCoords || [14.6349, -90.5069], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(leafMapInstance);
    mapPolylineRetiro = L.polyline([], { color: '#00bfff', weight: 6, opacity: 0.9 }).addTo(leafMapInstance);
    mapPolylineEntrega = L.polyline([], { color: '#00ff66', weight: 6, opacity: 0.9 }).addTo(leafMapInstance);
    if (latestCoords) updateHelmetMarkerOnMap(latestCoords[0], latestCoords[1]);
  } catch(e) { console.error('Map failed', e); }
}

function initMotoMapInstance() {
  if (typeof L === 'undefined') return; if (motoMapInstance) { setTimeout(() => { motoMapInstance.invalidateSize(); }, 300); return; }
  try {
    motoMapInstance = L.map('motoMapDiv', { zoomControl: false, attributionControl: false }).setView(latestCoords || [14.6349, -90.5069], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(motoMapInstance);
    motoPolylineRetiro = L.polyline([], { color: '#00bfff', weight: 6, opacity: 0.9 }).addTo(motoMapInstance);
    motoPolylineEntrega = L.polyline([], { color: '#00ff66', weight: 6, opacity: 0.9 }).addTo(motoMapInstance);
    if (latestCoords) updateHelmetMarkerOnMap(latestCoords[0], latestCoords[1]);
  } catch(e) { console.error('Moto map failed', e); }
}

function toggleMotoMapVisibility() {
  const isChecked = document.getElementById('motoMapToggle').checked; const wrapper = document.getElementById('motoMapWrapper');
  if (isChecked) { wrapper.classList.remove('hidden'); initMotoMapInstance(); } else { wrapper.classList.add('hidden'); }
}

function drawLiveTrackingPathOnMap(points) {
  const pathCoordinates = points.map(p => [p[0], p[1]]); const lastPos = pathCoordinates[pathCoordinates.length - 1];
  if (leafMapInstance) {
    if (trackState.phase === 'retiro') { mapPolylineRetiro.setLatLngs(pathCoordinates); } else { mapPolylineEntrega.setLatLngs(pathCoordinates); }
    if (!mapStartMarker && pathCoordinates.length > 0) { mapStartMarker = L.circleMarker(pathCoordinates[0], { radius: 8, color: '#00bfff', fillColor: '#00bfff', fillOpacity: 0.8 }).addTo(leafMapInstance); }
    updateHelmetMarkerOnMap(lastPos[0], lastPos[1]); leafMapInstance.setView(lastPos);
  }
  if (motoMapInstance && !document.getElementById('motoMapWrapper').classList.contains('hidden')) {
    if (trackState.phase === 'retiro') { motoPolylineRetiro.setLatLngs(pathCoordinates); } else { motoPolylineEntrega.setLatLngs(pathCoordinates); }
    if (!motoStartMarker && pathCoordinates.length > 0) { motoStartMarker = L.circleMarker(pathCoordinates[0], { radius: 8, color: '#00bfff', fillColor: '#00bfff', fillOpacity: 0.8 }).addTo(motoMapInstance); }
    updateHelmetMarkerOnMap(lastPos[0], lastPos[1]); motoMapInstance.setView(lastPos);
  }
}

function updateHelmetMarkerOnMap(lat, lng) {
  if (typeof L === 'undefined') return; initLeafletAssets();
  if (leafMapInstance) { if (globalUserMarker) { globalUserMarker.setLatLng([lat, lng]); } else { globalUserMarker = L.marker([lat, lng], { icon: redHelmetIcon }).addTo(leafMapInstance); } }
  if (motoMapInstance) { if (globalUserMarkerMoto) { globalUserMarkerMoto.setLatLng([lat, lng]); } else { globalUserMarkerMoto = L.marker([lat, lng], { icon: redHelmetIcon }).addTo(motoMapInstance); } }
}

function recenterLiveMap() { if (latestCoords && leafMapInstance) { leafMapInstance.setView(latestCoords, 16); } }
function recenterMotoMap() { if (latestCoords && motoMapInstance) { motoMapInstance.setView(latestCoords, 16); } }
function triggerAlert(title, message) { triggerBannerNotification(title, message); }

function triggerBannerNotification(title, desc) {
  const banner = document.getElementById('notifBanner'); 
  document.getElementById('notifBannerTitle').textContent = title; 
  document.getElementById('notifBannerDesc').textContent = desc;
  banner.classList.add('active'); 
  triggerHapticFeedback([100]); 
  setTimeout(() => { banner.classList.remove('active'); }, 5000);
}

function triggerHapticFeedback(pattern) {
  if (navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch(e) {}
  }
}

async function fetchWeather() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(async (pos) => {
    try {
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${pos.coords.latitude.toFixed(4)}&longitude=${pos.coords.longitude.toFixed(4)}&current=temperature_2m,weather_code&timezone=auto`);
      const data = await res.json(); const temp = Math.round(data.current.temperature_2m); const code = data.current.weather_code;
      let icon = '☀️'; if (code >= 51 && code <= 67) icon = '🌧️'; else if (code >= 1 && code <= 3) icon = '⛅'; else if (code >= 71 && code <= 86) icon = '❄️'; else if (code >= 95) icon = '⛈️';
      document.getElementById('weatherIcon').textContent = icon; document.getElementById('weatherTemp').textContent = `${temp}°C`;
    } catch(e) {}
  });
}

function drawAnalyticsChart() {
  const canvas = document.getElementById('chartGains'); if (!canvas) return; const ctx = canvas.getContext('2d');
  const width = canvas.offsetWidth || 300; const height = canvas.offsetHeight || 160; canvas.width = width; canvas.height = height;
  const isLight = document.body.classList.contains('light-mode'); const gridColor = isLight ? '#e5e5ea' : '#26262b'; const labelColor = isLight ? '#6e6e73' : '#8e8e93';
  const lastDays = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom']; const brutoVals = [350, 420, 310, 510, 480, 620, 290]; const netoVals = [290, 350, 240, 430, 400, 530, 230];
  ctx.clearRect(0,0,width,height); ctx.strokeStyle = gridColor; ctx.lineWidth = 1.5; const spacing = width / 7; const maxVal = 700;
  lastDays.forEach((day, idx) => {
    const x = spacing * idx + (spacing / 2); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height - 20); ctx.stroke();
    const hBruto = (brutoVals[idx] / maxVal) * (height - 40); const hNeto = (netoVals[idx] / maxVal) * (height - 40);
    ctx.fillStyle = isLight ? '#e0002a' : '#ff2d55'; ctx.fillRect(x - 8, height - 20 - hBruto, 6, hBruto);
    ctx.fillStyle = isLight ? '#008f39' : '#00ff66'; ctx.fillRect(x, height - 20 - hNeto, 6, hNeto);
    ctx.fillStyle = labelColor; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(day, x - 1, height - 4);
  });
}

function switchMainTab(tab) {
  currentTab = tab; document.querySelectorAll('.tab-view').forEach(view => view.classList.remove('active')); document.getElementById(`view-${tab}`).classList.add('active');
  if (tab === 'mapa') {
    initLeafletMapInstance();
    setTimeout(() => { if (leafMapInstance) { leafMapInstance.invalidateSize(); if (latestCoords) { leafMapInstance.setView(latestCoords, 14); updateHelmetMarkerOnMap(latestCoords[0], latestCoords[1]); } } }, 300);
  } else if (tab === 'stats') { drawAnalyticsChart(); } else if (tab === 'historial') { renderHistoryTrips(); }
}

function saveConfigData() {
  db.config.riderName = document.getElementById('cfgRiderName').value || ''; db.config.dailyGoal = parseFloat(document.getElementById('cfgDailyGoal').value) || 500;
  db.config.gasPrice = parseFloat(document.getElementById('cfgGasPrice').value) || 32; db.config.gasRend = parseFloat(document.getElementById('cfgGasRend').value) || 120;
  db.config.dailyMaint = parseFloat(document.getElementById('cfgDailyMaint').value) || 15; 
  db.config.satRegime = document.getElementById('cfgSatRegime').value || 'pequeno';
  commitDataStorage();
}

function exportBackupJSON() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(db));
  const dlAnchorElem = document.createElement('a'); dlAnchorElem.setAttribute("href", dataStr); dlAnchorElem.setAttribute("download", `rider_backup_${Date.now()}.json`); dlAnchorElem.click();
}

function triggerImportBackup() { document.getElementById('importFileInput').click(); }

function importBackupJSON(event) {
  const file = event.target.files[0]; if (!file) return; const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const parsed = JSON.parse(e.target.result);
      if (parsed && parsed.orders) { db = parsed; commitDataStorage(); triggerAlert('Respaldo Cargado', 'Tus datos se han sincronizado con éxito.'); initializeCoreEvents(); } else { triggerAlert('Error', 'Archivo no compatible.'); }
    } catch(err) { triggerAlert('Error de Lectura', 'No se pudo leer el archivo JSON.'); }
  }; reader.readAsText(file);
}

function syncDashboardValues() {
  const ordersTotal = db.orders.length; let totalGain = 0.0; let totalKm = 0.0; let totalSegments = 0;
  db.orders.forEach(o => { totalGain += o.earnings; totalKm += o.kmR + o.kmE; totalSegments += o.deliveriesCount; });
  const costPerKm = parseFloat(db.config.gasPrice) / parseFloat(db.config.gasRend); const totalFuelCost = totalKm * costPerKm;
  const netEarnings = totalGain - totalFuelCost - parseFloat(db.config.dailyMaint);
  document.getElementById('statOrders').textContent = ordersTotal; document.getElementById('statKm').textContent = totalKm.toFixed(1);
  document.getElementById('statDeliveries').textContent = totalSegments; document.getElementById('statNeta').textContent = `Q ${Math.max(0, netEarnings).toFixed(2)}`;
  document.getElementById('headerTotalDay').textContent = `Q ${totalGain.toFixed(2)}`;
  const defaultHeaderStr = db.config.riderName ? `Rider ${db.config.riderName}` : 'Acumulado Hoy'; document.getElementById('headerWelcomeName').textContent = defaultHeaderStr;
  const dailyGoal = parseFloat(db.config.dailyGoal) || 500; const card = document.getElementById('goalProgressCard');
  if (dailyGoal > 0) {
    card.style.display = 'flex'; const progressPct = Math.min(100, Math.round((totalGain / dailyGoal) * 100));
    document.getElementById('goalProgressPct').textContent = `${progressPct}%`; document.getElementById('goalCardSub').textContent = `Q ${totalGain.toFixed(2)} de Q ${dailyGoal.toFixed(0)}`;
    const fill = document.getElementById('goalArcFill'); fill.style.width = `${progressPct}%`;
  } else { card.style.display = 'none'; }
  updateSystemStatsMetrics(totalGain, totalKm, netEarnings); calculateComplexAdvancedStats();
}

function updateSystemStatsMetrics(bruto, km, neto) {
  let hoursCount = 1; if (db.orders.length > 1) {
    const firstTime = new Date(db.orders[0].timestamp); const lastTime = new Date(db.orders[db.orders.length-1].timestamp);
    const diffHours = Math.abs(lastTime - firstTime) / 3.6e6; if (diffHours > 0.1) hoursCount = diffHours;
  }
  const qHour = bruto / hoursCount; const qKm = km > 0 ? bruto / km : 0;
  document.getElementById('effQHour').textContent = `Q ${qHour.toFixed(2)}`; document.getElementById('effQKm').textContent = `Q ${qKm.toFixed(2)}`;
  document.getElementById('effAvgTime').textContent = `${Math.round(hoursCount * 60 / Math.max(1, db.orders.length))} mins`;
  
  const gallonsRend = parseFloat(db.config.gasRend) || 120;
  const gallonsBurned = km / gallonsRend;
  document.getElementById('statsGallonsBurned').textContent = `${gallonsBurned.toFixed(2)} Gal`;
  
  const regime = db.config.satRegime || 'pequeno';
  let ivaValue = 0;
  let isrValue = 0;
  let labelIvaStr = "Impuesto IVA (5%)";
  let titleTaxCardStr = "🧾 Estimación Cargos e IVA (Lunes)";
  
  if (regime === 'pequeno') {
    ivaValue = bruto * 0.05;
    labelIvaStr = "Impuesto Peq. Contribuyente (5%)";
    titleTaxCardStr = "🧾 Estimación SAT (Peq. Contribuyente)";
  } else if (regime === 'general') {
    ivaValue = bruto * 0.12;
    isrValue = bruto * 0.05;
    labelIvaStr = "Débito Fiscal IVA (12%)";
    titleTaxCardStr = "🧾 Estimación SAT (Régimen General)";
  } else {
    labelIvaStr = "Impuesto Exento / Especial (0%)";
    titleTaxCardStr = "🧾 Sin Obligaciones Tributarias";
  }
  
  document.getElementById('statsIvaLabel').textContent = labelIvaStr;
  document.getElementById('statsTaxCardTitle').textContent = titleTaxCardStr;
  document.getElementById('taxIva').textContent = `- Q ${ivaValue.toFixed(2)}`;
  
  const satRetentionVal = bruto * 0.015;
  document.getElementById('taxRetention').textContent = `- Q ${satRetentionVal.toFixed(2)}`;
  
  const depositNet = bruto - ivaValue - isrValue - satRetentionVal - 18.50;
  document.getElementById('taxNetTotal').textContent = `Q ${Math.max(0, depositNet).toFixed(2)}`;
}

function calculateComplexAdvancedStats() {
  if (db.orders.length === 0) return; const sorted = [...db.orders].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  let totalDeadMins = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const prevOrder = sorted[i]; const nextOrder = sorted[i+1];
    if (prevOrder.timings && prevOrder.timings.entreguRaw && nextOrder.timings && nextOrder.timings.aceptarRaw) {
      const diffMs = nextOrder.timings.aceptarRaw - prevOrder.timings.entreguRaw; if (diffMs > 0) { totalDeadMins += Math.round(diffMs / 60000); }
    }
  }
  document.getElementById('statsDeadTime').textContent = `${totalDeadMins} min`;
  let worstWaitMins = -1; let worstWaitRest = '--';
  sorted.forEach(o => {
    if (o.timings && o.timings.llegueRaw && o.timings.recogiRaw) {
      const waitMs = o.timings.recogiRaw - o.timings.llegueRaw; const waitMins = Math.round(waitMs / 60000);
      if (waitMins > worstWaitMins) { worstWaitMins = waitMins; worstWaitRest = `${waitMins} min (${o.restaurant})`; }
    }
  });
  document.getElementById('statsWorstWait').textContent = worstWaitMins !== -1 ? worstWaitRest : '--';
  let fastestMins = Infinity; let fastestRest = '--';
  sorted.forEach(o => {
    if (o.timings && o.timings.aceptarRaw && o.timings.entreguRaw) {
      const tripMs = o.timings.entreguRaw - o.timings.aceptarRaw; const tripMins = Math.round(tripMs / 60000);
      if (tripMins < fastestMins && tripMins > 0) { fastestMins = tripMins; fastestRest = `${tripMins} min (${o.restaurant})`; }
    }
  });
  document.getElementById('statsFastestTrip').textContent = fastestMins !== Infinity ? fastestRest : '--';
  let bestHourlyRate = -1; let bestHourlyRateStr = '--';
  sorted.forEach(o => {
    if (o.timings && o.timings.aceptarRaw && o.timings.entreguRaw) {
      const tripMs = o.timings.entreguRaw - o.timings.aceptarRaw; const tripHours = tripMs / 3.6e6;
      if (tripHours > 0.01) {
        const rate = o.earnings / tripHours;
        if (rate > bestHourlyRate) { bestHourlyRate = rate; bestHourlyRateStr = `Q${rate.toFixed(1)}/h (${o.restaurant} · Q${o.earnings.toFixed(0)} en ${Math.round(tripMs/60000)}m)`; }
      }
    }
  });
  document.getElementById('statsBestHourlyRate').textContent = bestHourlyRate !== -1 ? bestHourlyRateStr : '--';
}

function calculateOrderPriceWithParams(kmR, kmE, nEnt, mult, rain, rainVal, prop) {
  let baseMult = mult; if (rain) baseMult += rainVal;
  const totalPickup = COMPONENTE_FIJO + PAGO_RETIRO; const totalDelivery = PAGO_ENTREGA * nEnt;
  const totalPublicidad = PAGO_PUBLICIDAD * nEnt; const totalDistance = (kmR + kmE) * PRECIO_KM;
  return parseFloat(((totalPickup + totalDelivery + totalPublicidad + totalDistance) * baseMult + prop).toFixed(2));
}

function confirmClearHistory() {
  if (confirm('¿Seguro que deseas eliminar los datos de hoy?')) { db.orders = []; commitDataStorage(); renderHistoryTrips(); triggerAlert('Limpieza', 'Historial eliminado.'); }
}

function deleteSingleHistoryItem(id) {
  if (confirm('¿Eliminar este registro?')) { db.orders = db.orders.filter(o => o.id !== id); commitDataStorage(); renderHistoryTrips(); }
}

function openOrderEditSheet(id) {
  const orderObj = db.orders.find(o => o.id === id); if (!orderObj) return;
  document.getElementById('editOrderId').value = id; document.getElementById('editRestaurantName').value = orderObj.restaurant || '';
  document.getElementById('editKmRetiro').value = orderObj.kmR.toFixed(3); document.getElementById('editKmEntrega').value = orderObj.kmE.toFixed(3);
  document.getElementById('editMultiplierVal').value = orderObj.multiplier.toFixed(2); document.getElementById('editPropinaVal').value = orderObj.propina.toFixed(2);
  document.getElementById('editModalOverlay').classList.add('open');
}

function closeEditModal() { document.getElementById('editModalOverlay').classList.remove('open'); }

function saveEditedOrderData() {
  const id = parseInt(document.getElementById('editOrderId').value); const orderIndex = db.orders.findIndex(o => o.id === id); if (orderIndex === -1) return;
  const newRest = document.getElementById('editRestaurantName').value || 'Sin Nombre';
  const newKmR = parseFloat(document.getElementById('editKmRetiro').value) || 0.0; const newKmE = parseFloat(document.getElementById('editKmEntrega').value) || 0.0;
  const newMult = parseFloat(document.getElementById('editMultiplierVal').value) || 1.30; const newProp = parseFloat(document.getElementById('editPropinaVal').value) || 0.0;
  const originalOrder = db.orders[orderIndex];
  const updatedEarnings = calculateOrderPriceWithParams(newKmR, newKmE, originalOrder.deliveriesCount, newMult, originalOrder.rain, originalOrder.rainVal, newProp);
  db.orders[orderIndex] = { ...originalOrder, restaurant: newRest, kmR: newKmR, kmE: newKmE, multiplier: newMult, propina: newProp, earnings: updatedEarnings };
  commitDataStorage(); closeEditModal(); renderHistoryTrips(); triggerAlert('Modificado', `Actualizado. Nueva ganancia: Q ${updatedEarnings.toFixed(2)}`);
}

function searchRestaurant() {
  const query = document.getElementById('restaurantInput').value.toLowerCase().trim(); const drop = document.getElementById('restaurantSearchDropdown'); drop.innerHTML = '';
  if (!query) { drop.style.display = 'none'; return; }
  const matches = db.restaurants.filter(r => r.toLowerCase().includes(query)).slice(0, 5); if (matches.length === 0) { drop.style.display = 'none'; return; }
  matches.forEach(m => {
    const item = document.createElement('div'); item.className = 'search-item'; item.textContent = m;
    item.onclick = () => { document.getElementById('restaurantInput').value = m; document.getElementById('restaurantInputMoto').value = m; drop.style.display = 'none'; };
    drop.appendChild(item);
  });
  drop.style.display = 'block';
}

function searchRestaurantMoto() {
  const query = document.getElementById('restaurantInputMoto').value.toLowerCase().trim(); const drop = document.getElementById('restaurantSearchDropdownMoto'); drop.innerHTML = '';
  if (!query) { drop.style.display = 'none'; return; }
  const matches = db.restaurants.filter(r => r.toLowerCase().includes(query)).slice(0, 5); if (matches.length === 0) { drop.style.display = 'none'; return; }
  matches.forEach(m => {
    const item = document.createElement('div'); item.className = 'search-item'; item.textContent = m;
    item.onclick = () => { document.getElementById('restaurantInput').value = m; document.getElementById('restaurantInputMoto').value = m; drop.style.display = 'none'; };
    drop.appendChild(item);
  });
  drop.style.display = 'block';
}

function syncRestaurantInput(origin) { if (origin === 'moto') { const val = document.getElementById('restaurantInputMoto').value; document.getElementById('restaurantInput').value = val; searchRestaurantMoto(); } else { const val = document.getElementById('restaurantInput').value; document.getElementById('restaurantInputMoto').value = val; searchRestaurant(); } }

function enterMotoMode() {
  const semScreen = document.getElementById('semaforoScreen'); const semText = document.getElementById('semaforoStatusText'); const overlay = document.getElementById('motoModeOverlay');
  semScreen.classList.add('active'); const lights = [document.getElementById('light1'), document.getElementById('light2'), document.getElementById('light3')];
  setTimeout(() => { lights[0].classList.add('red'); semText.textContent = 'ROJO... ¡PREPARA MOTOR!'; triggerHapticFeedback([100, 100]); }, 1000);
  setTimeout(() => { lights[1].classList.add('yellow'); semText.textContent = 'AMARILLO... ¡ATENTO A RUTA!'; triggerHapticFeedback([150, 100]); }, 2200);
  setTimeout(() => { lights[2].classList.add('green'); semText.textContent = '¡VERDE! ¡A CONDUCIR RIDER!'; triggerHapticFeedback([400, 100, 100, 100]); }, 3400);
  setTimeout(() => { semScreen.classList.remove('active'); lights.forEach(l => l.className = 'light-bulb'); overlay.classList.add('active'); updateMotoBreakdownUI(); initMotoMapInstance(); }, 4500);
}

function exitMotoMode() { document.getElementById('motoModeOverlay').classList.remove('active'); }

function renderHistoryTrips() {
  const container = document.getElementById('historyEntries'); container.innerHTML = '';
  if (db.orders.length === 0) {
    container.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--muted);"><span style="font-size: 40px; display:block; margin-bottom:12px;">📋</span>No hay registros del día. ¡Comienza a rodar!</div>`;
    return;
  }
  const sorted = [...db.orders].reverse();
  sorted.forEach(o => {
    const dTime = new Date(o.timestamp).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' });
    const hasRoute = o.routePoints && o.routePoints.length > 0;
    const div = document.createElement('div'); div.className = 'hist-card';
    div.innerHTML = `
      <div class="hist-card-header">
        <div>
          <div class="hist-card-title">${o.restaurant}</div>
          <div class="hist-card-time">${dTime} · Mult: ${o.multiplier}x ${o.rain ? `+ 🌧️(${o.rainVal || '0.25'})` : ''}</div>
        </div>
        <div style="font-family: 'Bebas Neue', sans-serif; font-size: 28px; color: var(--green);">Q ${o.earnings.toFixed(2)}</div>
      </div>
      <div class="hist-card-stats">
        <div class="h-stat"><span class="lbl">Retiro</span><span class="val">${o.kmR.toFixed(3)} km</span></div>
        <div class="h-stat"><span class="lbl">Entrega</span><span class="val">${o.kmE.toFixed(3)} km</span></div>
        <div class="h-stat"><span class="lbl">Tramos</span><span class="val">${o.deliveriesCount}</span></div>
      </div>
      <div class="hist-map-wrap" id="hist-map-wrap-${o.id}"><div class="hist-map-div" id="hist-map-${o.id}"></div></div>
      <div class="hist-card-actions">
        <button class="h-btn" onclick="openOrderEditSheet(${o.id})">✏️ Editar</button>
        ${hasRoute ? `<button class="h-btn" onclick="toggleOrderHistoryPathTrace(${o.id})">🗺️ Ver Trazado</button>` : ''}
        <button class="h-btn" onclick="deleteSingleHistoryItem(${o.id})" style="border-color: var(--accent); color: var(--accent);">🗑️ Eliminar</button>
      </div>
    `;
    container.appendChild(div);
  });
}

function toggleOrderHistoryPathTrace(orderId) {
  const wrap = document.getElementById(`hist-map-wrap-${orderId}`); const divId = `hist-map-${orderId}`; if (!wrap) return;
  const isVisible = wrap.style.display === 'block';
  if (isVisible) {
    wrap.style.display = 'none'; if (historyMapInstances[orderId]) { historyMapInstances[orderId].remove(); delete historyMapInstances[orderId]; } return;
  }
  wrap.style.display = 'block';
  setTimeout(() => {
    const orderObj = db.orders.find(o => o.id === orderId); if (!orderObj || !orderObj.routePoints || orderObj.routePoints.length === 0) return;
    try {
      const map = L.map(divId, { zoomControl: false, attributionControl: false }).setView(orderObj.routePoints[0], 14);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
      const pathLine = L.polyline(orderObj.routePoints, { color: '#ff2d55', weight: 5, opacity: 0.85 }).addTo(map);
      L.circleMarker(orderObj.routePoints[0], { radius: 6, color: '#00bfff', fillOpacity: 1 }).addTo(map);
      L.circleMarker(orderObj.routePoints[orderObj.routePoints.length - 1], { radius: 6, color: '#00ff66', fillOpacity: 1 }).addTo(map);
      map.fitBounds(pathLine.getBounds(), { padding: [12, 12] }); historyMapInstances[orderId] = map;
    } catch(e) { console.error('Failed history trace map', e); }
  }, 200);
}

function calculateRealtimeEarnings() {
  const kmR = parseFloat(document.getElementById('kmRetiro').value) || 0;
  let kmETotal = 0;
  deliverySegments.forEach(s => { const el = document.getElementById(s.elementId); if (el) kmETotal += parseFloat(el.value) || 0; });
  const nEnt = deliverySegments.length, prop = parseFloat(document.getElementById('propinaValue').value) || 0;
  let baseMult = parseFloat(document.getElementById('multValue').value) || 1.3;
  if (isRainActive) { baseMult += (parseFloat(document.getElementById('rainValue').value) || 0.25); }
  const totalPickup = COMPONENTE_FIJO + PAGO_RETIRO, totalDelivery = PAGO_ENTREGA * nEnt, totalPublicidad = PAGO_PUBLICIDAD * nEnt, totalDistance = (kmR + kmETotal) * PRECIO_KM;
  const totalBaseCalc = (totalPickup + totalDelivery + totalPublicidad + totalDistance) * baseMult;
  const finalEarnings = parseFloat((totalBaseCalc + prop).toFixed(2));
  document.getElementById('liveCalcAmount').textContent = `Q ${finalEarnings.toFixed(2)}`;
  const motoAmt = document.getElementById('motoGainRealtime'); if (motoAmt) motoAmt.textContent = `Q ${finalEarnings.toFixed(2)}`;
  return finalEarnings;
}

function toggleAutoMultiplier() {
  const isChecked = document.getElementById('cfgAutoMultSwitch').checked;
  db.config.autoMultiplierEnabled = isChecked;
  document.getElementById('cfgScheduleContainer').style.display = isChecked ? 'flex' : 'none';
  commitDataStorage();
  updateScheduledMultiplierOnCalcTab();
}

function renderScheduleSlots() {
  const container = document.getElementById('scheduleSlotsList');
  container.innerHTML = '';
  if (db.config.multiplierSchedule.length === 0) {
    addScheduleSlotRow("11:30", "14:00", 1.25);
    return;
  }
  db.config.multiplierSchedule.forEach(slot => {
    addScheduleSlotRow(slot.start, slot.end, slot.value);
  });
}

function addScheduleSlotRow(start = "", end = "", val = 1.20) {
  const container = document.getElementById('scheduleSlotsList');
  const rowId = 'slot-row-' + Math.random().toString(36).substring(2, 9);
  const div = document.createElement('div');
  div.id = rowId;
  div.style.cssText = 'display:flex;align-items:center;gap:8px;background:var(--card2);padding:8px 12px;border-radius:12px;border:1px solid var(--border);';
  div.innerHTML = `
    <input type="time" class="slot-start" value="${start}" onchange="saveScheduleData()" style="background:none;border:none;color:var(--text);font-size:13px;font-weight:700;width:75px;outline:none;">
    <span style="color:var(--muted);font-size:11px;">a</span>
    <input type="time" class="slot-end" value="${end}" onchange="saveScheduleData()" style="background:none;border:none;color:var(--text);font-size:13px;font-weight:700;width:75px;outline:none;">
    <span style="color:var(--muted);font-size:11px;">=</span>
    <input type="number" class="slot-val" value="${val.toFixed(2)}" step="0.05" min="1.00" max="9.99" onchange="saveScheduleData()" style="background:none;border:none;color:var(--accent);font-family:'Bebas Neue';font-size:20px;width:60px;outline:none;text-align:center;">
    <button onclick="deleteScheduleSlotRow('${rowId}')" style="background:none;border:none;color:var(--accent);font-size:16px;margin-left:auto;cursor:pointer;padding:4px 8px;">✕</button>
  `;
  container.appendChild(div);
}

function deleteScheduleSlotRow(rowId) {
  const row = document.getElementById(rowId);
  if (row) {
    row.remove();
    saveScheduleData();
  }
}

function saveScheduleData() {
  const container = document.getElementById('scheduleSlotsList');
  const rows = container.children;
  const newSchedule = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const startVal = row.querySelector('.slot-start').value;
    const endVal = row.querySelector('.slot-end').value;
    const multVal = parseFloat(row.querySelector('.slot-val').value) || 1.00;
    if (startVal && endVal) {
      newSchedule.push({ start: startVal, end: endVal, value: multVal });
    }
  }
  newSchedule.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  db.config.multiplierSchedule = newSchedule;
  commitDataStorage();
  updateScheduledMultiplierOnCalcTab();
}

function getActiveScheduledMultiplier() {
  if (!db.config.autoMultiplierEnabled || db.config.multiplierSchedule.length === 0) return null;
  const now = new Date();
  const currentMin = now.getHours() * 60 + now.getMinutes();
  for (let slot of db.config.multiplierSchedule) {
    const startMin = timeToMinutes(slot.start);
    const endMin = timeToMinutes(slot.end);
    if (startMin <= endMin) {
      if (currentMin >= startMin && currentMin < endMin) return slot.value;
    } else {
      if (currentMin >= startMin || currentMin < endMin) return slot.value;
    }
  }
  return 1.00;
}

function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function updateScheduledMultiplierOnCalcTab() {
  const multInput = document.getElementById('multValue');
  if (db.config.autoMultiplierEnabled) {
    const activeMult = getActiveScheduledMultiplier();
    if (activeMult !== null) {
      multInput.value = activeMult.toFixed(2);
      multInput.disabled = true;
      multInput.style.color = "var(--yellow)";
      multInput.style.textShadow = "0 0 10px rgba(255, 170, 0, 0.4)";
    } else {
      multInput.value = "1.00";
      multInput.disabled = true;
      multInput.style.color = "var(--muted)";
    }
  } else {
    multInput.disabled = false;
    multInput.style.color = "var(--accent)";
    multInput.style.textShadow = "none";
  }
  calculateRealtimeEarnings();
}

function triggerEmergencySOS() {
  if (!latestCoords) {
    triggerAlert('GPS sin Señal', 'Aún no se reciben coordenadas del GPS de fondo.');
    return;
  }
  const lat = latestCoords[0];
  const lng = latestCoords[1];
  const message = encodeURIComponent(`🚨 ¡ALERTA AUXILIO SOS RIDER! Necesito asistencia urgente en esta ubicación GPS: https://maps.google.com/?q=${lat},${lng}`);
  triggerHapticFeedback([500, 100, 500, 100, 500]);
  if (confirm('¿Enviar enlace de alerta de emergencia SOS con tu ubicación GPS actual por WhatsApp?')) {
    window.open(`https://api.whatsapp.com/send?text=${message}`, '_blank');
  }
}

function toggleGlovesMode() {
  glovesModeActive = !glovesModeActive;
  const badge = document.getElementById('glovesBadge');
  badge.textContent = glovesModeActive ? 'ACTIVO' : 'OFF';
  badge.style.color = glovesModeActive ? 'var(--green)' : 'var(--accent)';
  triggerHapticFeedback([100]);
}

function exportHistoryToCSV() {
  if (db.orders.length === 0) {
    triggerAlert('Sin Datos', 'No tienes viajes registrados hoy para exportar.');
    return;
  }
  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += "ID,Fecha,Restaurante,KM Retiro,KM Entrega,Multiplicador,Propina,Ganancia Bruta (Q),IVA Estimado (Q),Retencion SAT (Q),Ganancia Neta (Q)\n";
  db.orders.forEach(o => {
    const date = new Date(o.timestamp).toLocaleDateString('es-GT');
    
    const regime = db.config.satRegime || 'pequeno';
    let iva = 0;
    if (regime === 'pequeno') iva = o.earnings * 0.05;
    else if (regime === 'general') iva = o.earnings * 0.12;
    
    const satRetention = o.earnings * 0.015;
    const costPerKm = parseFloat(db.config.gasPrice) / parseFloat(db.config.gasRend);
    const fuelCost = (o.kmR + o.kmE) * costPerKm;
    const neta = o.earnings - fuelCost;
    csvContent += `"${o.id}","${date}","${o.restaurant.replace(/"/g, '""')}","${o.kmR}","${o.kmE}","${o.multiplier}","${o.propina}","${o.earnings}","${iva.toFixed(2)}","${satRetention.toFixed(2)}","${neta.toFixed(2)}"\n`;
  });
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `Ruta_Rider_SAT_GT_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}