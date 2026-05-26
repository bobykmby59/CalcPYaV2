// ==========================================
// BUSINESS & STATE ENGINE - RIDER CALC PRO v3.7.0 (CONSOLIDADO & HARDENED)
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

// Colores diferenciales de entregas consecutivas en mapas (v3.7.0)
const deliveryColors = ['#00ff66', '#bf5fff', '#ff2d55', '#00bfff'];

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
let earningsHidden = false; // Estado del ojo de privacidad

let trackState = {
  active: false, phase: null,
  times: { aceptar: null, llegue: null, recogi: null, entregu: null, aceptarRaw: null, llegueRaw: null, recogiRaw: null, entreguRaw: null },
  distances: { alRestaurante: 0, alCliente: 0 }, 
  routeRetiro: [],      
  routeEntrega: [],     
  currentDistance: 0, currentDeliveryIndex: 0
};

let wakeLockInstance = null; 
let watchPositionId = null; 
let gpsSmoothBuffer = []; 
let lastMovedTime = Date.now(); 
let lastMovedCoords = null; 
let latestCoords = null; 
let audioContextInstance = null; 
let bgGpsIntervalId = null;
let glovesModeActive = false;

let redHelmetIcon = null;
let leafMapInstance = null; 
let mapPolylineRetiro = null; 
let mapPolylinesEntrega = []; 
let mapStartMarker = null; 
let globalUserMarker = null;

let motoMapInstance = null; 
let motoPolylineRetiro = null; 
let motoPolylinesEntrega = []; 
let motoStartMarker = null; 
let globalUserMarkerMoto = null;

const historyMapInstances = {}; 
let deliverySegments = [];

document.addEventListener("DOMContentLoaded", () => {
  hydrateDataStorage(); 
  checkMidnightReset(); 
  initializeCoreEvents(); 
  renderPresetsChips(); 
  initDateDisplay(); 
  calculateRealtimeEarnings(); 
  initAutoTheme(); 
  fetchWeather();
  startLiveLocationKeepalive();
  checkVersionModalOnLoad(); 
  initPrivacyState(); // Inicializar estado del ojo de privacidad
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
      if (db.config.gasPrice === undefined) db.config.gasPrice = 32;
      if (db.config.gasRend === undefined) db.config.gasRend = 120;
      if (db.config.dailyMaint === undefined) db.config.dailyMaint = 15;
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
    renderTimelineRoutes(); 
  } catch(e) { console.error('Failed writing states', e); }
}

function checkMidnightReset() {
  const todayStr = new Date().toLocaleDateString('es-GT', { day: 'numeric', month: 'numeric', year: 'numeric' });
  const lastResetDate = localStorage.getItem('last_midnight_reset_date');
  
  if (lastResetDate && lastResetDate !== todayStr) {
    if (trackState.active) {
      return; 
    }
    if (db.orders.length > 0) {
      let globalArchive = JSON.parse(localStorage.getItem('rider_global_archive') || '[]');
      globalArchive.push(...db.orders);
      localStorage.setItem('rider_global_archive', JSON.stringify(globalArchive));
      
      db.orders = [];
      commitDataStorage();
      triggerAlert('🌅 Nuevo Día Iniciado', 'Los repartos del día anterior se han archivado automáticamente.');
    }
    localStorage.setItem('last_midnight_reset_date', todayStr);
  } else if (!lastResetDate) {
    localStorage.setItem('last_midnight_reset_date', todayStr);
  }
}

function manualMidnightReset() {
  if (confirm('¿Seguro que deseas realizar el Cierre de Día? Los datos de hoy se guardarán en tu archivo histórico general y la consola diaria comenzará en cero.')) {
    let globalArchive = JSON.parse(localStorage.getItem('rider_global_archive') || '[]');
    globalArchive.push(...db.orders);
    localStorage.setItem('rider_global_archive', JSON.stringify(globalArchive));
    
    db.orders = [];
    commitDataStorage();
    renderHistoryTrips();
    triggerAlert('Cierre Completado', 'Consola del día restablecida. ¡Buen camino en tu nueva jornada!');
  }
}

function confirmResetAllData() {
  if (confirm('⚠️ ¿Seguro que deseas RESTABLECER COMPLETAMENTE LA CONSOLA DIARIA? Se borrarán todos los repartos de hoy del acumulado y el progreso volverá a cero.')) {
    db.orders = [];
    commitDataStorage();
    renderHistoryTrips();
    clearCalculatorInputs();
    triggerAlert('Consola Restablecida', 'Los datos del día actual se han limpiado por completo.');
  }
}

function checkVersionModalOnLoad() {
  const currentVer = "v3.7.0";
  const key = `rider_version_shown_${currentVer}`;
  if (!localStorage.getItem(key)) {
    const targetModal = document.getElementById('versionModalOverlay');
    if (targetModal) targetModal.classList.add('open');
  }
}

function closeVersionModal() {
  const currentVer = "v3.7.0";
  const key = `rider_version_shown_${currentVer}`;
  localStorage.setItem(key, "true");
  const targetModal = document.getElementById('versionModalOverlay');
  if (targetModal) targetModal.classList.remove('open');
}

// Lógica Interactiva del Ojo de Privacidad
function initPrivacyState() {
  if (localStorage.getItem('earnings_hidden') === 'true') {
    earningsHidden = false; // Se niega para que el disparador ejecute la acción correcta
    toggleEarningsPrivacy();
  }
}

function toggleEarningsPrivacy() {
  earningsHidden = !earningsHidden;
  const el = document.getElementById('headerTotalDay');
  const btn = document.getElementById('privacyToggleBtn');
  if (el) {
    if (earningsHidden) {
      el.classList.add('masked');
      localStorage.setItem('earnings_hidden', 'true');
      if (btn) {
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="icon-svg"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 19c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
      }
    } else {
      el.classList.remove('masked');
      localStorage.setItem('earnings_hidden', 'false');
      if (btn) {
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="icon-svg"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
      }
    }
  }
}

// Lógica de Frases Motivacionales para el Motómetro
function updateMotivationalMessage(pct) {
  const motivationalEl = document.getElementById('goalMotivationalText');
  const cardEl = document.getElementById('goalProgressCard');
  if (!motivationalEl) return;
  
  if (pct === 0) {
    motivationalEl.textContent = "¡Buen inicio, Rider! El camino apenas comienza. 🏍️";
    if (cardEl) cardEl.classList.remove('completed');
  } else if (pct > 0 && pct <= 25) {
    motivationalEl.textContent = "¡Arrancamos con todo! Cada pedido suma. ⚡";
    if (cardEl) cardEl.classList.remove('completed');
  } else if (pct > 25 && pct <= 50) {
    motivationalEl.textContent = "¡Gran ritmo! Ya estás a mitad de camino. 🎯";
    if (cardEl) cardEl.classList.remove('completed');
  } else if (pct > 50 && pct <= 75) {
    motivationalEl.textContent = "¡Excelente jornada! La meta está a la vista. 🔥";
    if (cardEl) cardEl.classList.remove('completed');
  } else if (pct > 75 && pct < 100) {
    motivationalEl.textContent = "¡Casi lo logras! Un último esfuerzo. 🏆";
    if (cardEl) cardEl.classList.remove('completed');
  } else if (pct >= 100) {
    motivationalEl.textContent = "¡META ALCANZADA! Eres el rey de la ruta hoy. 👑👑";
    if (cardEl) cardEl.classList.add('completed');
  }
}

function initializeCoreEvents() {
  document.getElementById('cfgRiderName').value = db.config.riderName || '';
  document.getElementById('cfgDailyGoal').value = db.config.dailyGoal || 500;
  document.getElementById('cfgGasPrice').value = db.config.gasPrice || 32;
  document.getElementById('cfgGasRend').value = db.config.gasRend || 120;
  document.getElementById('cfgDailyMaint').value = db.config.dailyMaint !== undefined ? db.config.dailyMaint : 15;
  document.getElementById('cfgSatRegime').value = db.config.satRegime || 'pequeno';
  
  document.getElementById('cfgAutoMultSwitch').checked = db.config.autoMultiplierEnabled;
  if (db.config.autoMultiplierEnabled) {
    document.getElementById('cfgScheduleContainer').style.display = 'flex';
  }
  renderScheduleSlots();
  updateScheduledMultiplierOnCalcTab();
  syncDashboardValues();

  setInterval(() => {
    if (db.config.autoMultiplierEnabled) {
      updateScheduledMultiplierOnCalcTab();
    }
  }, 60000);
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
  if (currentTab === 'stats') {
    drawAnalyticsChart();
  }
}

function initKeepAliveAudio() {
  if (audioContextInstance) return;
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
  } catch(e) {
    console.warn("AudioContext keepalive not allowed or supported by OS configuration.", e);
  }
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
  if (!container) return;
  container.innerHTML = '';
  activeMultipliers.forEach(m => {
    const chip = document.createElement('div'); 
    chip.className = `preset-chip ${Math.abs(m - currentVal) < 0.01 ? 'active' : ''}`;
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
  if (deliverySegments.length >= 4) return; 
  const id = Date.now() + Math.random(); 
  const index = deliverySegments.length + 1;
  const container = document.getElementById('deliveryPointsList'); 
  const div = document.createElement('div');
  div.className = 'segment-box'; 
  div.id = `delivery-seg-${id}`;
  div.innerHTML = `
    <div class="segment-header"><span class="segment-title">🏠 Entrega ${index}</span><div class="km-input-wrap"><input type="number" class="km-input" id="kmE_${id}" placeholder="0.000" step="0.1" oninput="calculateRealtimeEarnings()"><span class="km-unit">km</span></div></div>
    <div class="segment-stepper"><button class="step-btn" onclick="stepSegment('kmE_${id}', -0.1)">− 0.1</button><button class="step-btn" onclick="stepSegment('kmE_${id}', 0.1)">+ 0.1</button></div>
    ${!isInitial ? `<button class="h-btn" onclick="removeDeliverySegment('${id}')" style="margin-top:12px; border-color: var(--accent); color: var(--accent); background:none; padding:6px; min-height:36px;">✕ Eliminar Entrega</button>` : ''}
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
    deliverySegments = deliverySegments.filter(s => String(s.id) !== String(id)); 
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
    distances: { alRestaurante: 0, alCliente: 0 }, 
    routeRetiro: [], 
    routeEntrega: [], 
    currentDistance: 0, currentDeliveryIndex: 0
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
  
  if (mapPolylineRetiro) mapPolylineRetiro.setLatLngs([]);
  mapPolylinesEntrega.forEach(p => { if (p) p.setLatLngs([]); });
  if (mapStartMarker) { mapStartMarker.remove(); mapStartMarker = null; }
  
  if (motoPolylineRetiro) motoPolylineRetiro.setLatLngs([]);
  motoPolylinesEntrega.forEach(p => { if (p) p.setLatLngs([]); });
  if (motoStartMarker) { motoStartMarker.remove(); motoStartMarker = null; }
  
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
    earnings: finalVal, timestamp: new Date().toISOString(), timings: { ...trackState.times }, 
    routeRetiro: [...trackState.routeRetiro], 
    routeEntrega: JSON.parse(JSON.stringify(trackState.routeEntrega))
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
  initKeepAliveAudio();
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
    trackState.routeEntrega[0] = []; 
    
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
      trackState.routeEntrega[trackState.currentDeliveryIndex] = []; 
      updateDeliveryButtonLabels(); 
      triggerAlert(`Entrega ${currentIdx + 1} Completada`, `Distancia: ${capturedDelivery.toFixed(3)} km. Ruta a Entrega ${trackState.currentDeliveryIndex + 1}.`);
    } else {
      trackState.times.entregu = timeStr; 
      trackState.times.entreguRaw = rawNow;
      
      document.getElementById('tDelivered').classList.add('active'); 
      document.getElementById('trackTimeDelivered').textContent = timeStr;
      const mBtn = document.getElementById('m_tDelivered'); if (mBtn) mBtn.classList.add('active');
      const mTime = document.getElementById('m_trackTimeDelivered'); if (mTime) mTime.textContent = timeStr;
      
      stopTripTracking(); 
      triggerAlert('Ruta Completada', 'Todas las entregas registradas.');
      setTimeout(() => { 
        saveTripToHistory(); 
        if (document.getElementById('motoModeOverlay').classList.contains('active')) { 
          exitMotoMode(); 
        } 
      }, 1200);
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
  gpsSmoothBuffer = []; 
  lastMovedTime = Date.now(); 
  lastMovedCoords = null;
  
  if (watchPositionId) {
    navigator.geolocation.clearWatch(watchPositionId);
  }
  
  const geoOpts = { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 };
  watchPositionId = navigator.geolocation.watchPosition(processLiveGpsPositionUpdate, handleGpsTrackingError, geoOpts);
  
  if (bgGpsIntervalId) clearInterval(bgGpsIntervalId);
  bgGpsIntervalId = setInterval(() => { 
    if (trackState.active) {
      navigator.geolocation.getCurrentPosition(processLiveGpsPositionUpdate, () => {}, { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }); 
    }
  }, 15000);
  
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
    triggerBannerNotification('💡 Sugerencia de Ruta', 'Llevas 10 minutos sin moverte. Deberías moverte a alguna zona de alta demanda para obtener un nuevo pedido.');
  }
}

function updateHotspotsUi(lat, lng) {
  const container = document.getElementById('hotspotsList'); if (!container) return;
  const calculated = gtHotspots.map(h => { const dist = calculateHaversineDistance(lat, lng, h.lat, h.lng); return { ...h, dist }; });
  calculated.sort((a, b) => a.dist - b.dist); container.innerHTML = '';
  calculated.forEach(h => {
    const item = document.createElement('div'); 
    item.style.display = 'flex'; 
    item.style.justifyContent = 'space-between'; 
    item.style.alignItems = 'center'; 
    item.style.padding = '10px 12px'; 
    item.style.background = 'var(--card2)'; 
    item.style.borderRadius = '12px'; 
    item.style.border = '1.5px solid var(--border)';
    item.innerHTML = `<div><div style="font-size: 13px; font-weight: 700;">${h.name}</div><div style="font-size: 11px; color: var(--muted);">Distancia: <span style="color: var(--blue); font-weight: 700;">${h.dist.toFixed(2)} km</span></div></div><div style="display: flex; gap: 6px;"><button class="step-btn" onclick="navigateHotspot(${h.lat}, ${h.lng}, '${h.name}')" style="font-size: 11px; padding: 6px 10px; background: var(--card); border-color: var(--accent); min-height: 36px;">Navegar</button></div>`;
    container.appendChild(item);
  });
}

function navigateHotspot(lat, lng, name) {
  if (confirm(`¿Navegar hacia ${name} usando Waze?`)) { 
    window.open(`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`, '_system'); 
  } else { 
    switchMainTab('mapa'); 
    if (leafMapInstance) { leafMapInstance.setView([lat, lng], 15); } 
  }
}

function processLiveGpsPositionUpdate(pos) {
  const lat = pos.coords.latitude; const lng = pos.coords.longitude; const speed = pos.coords.speed || 0.0; const accuracy = pos.coords.accuracy;
  if (accuracy > 30) return; gpsSmoothBuffer.push([lat, lng]); if (gpsSmoothBuffer.length > 3) gpsSmoothBuffer.shift();
  const avgLat = gpsSmoothBuffer.reduce((acc, curr) => acc + curr[0], 0) / gpsSmoothBuffer.length;
  const avgLng = gpsSmoothBuffer.reduce((acc, curr) => acc + curr[1], 0) / gpsSmoothBuffer.length;
  latestCoords = [avgLat, avgLng]; updateHelmetMarkerOnMap(avgLat, avgLng); updateHotspotsUi(avgLat, avgLng); checkInactivity(avgLat, avgLng);
  
  if (!trackState.active) {
    updateScheduledMultiplierOnCalcTab();
  }
  
  if (trackState.active) {
    if (trackState.routeRetiro.length > 0 || (trackState.routeEntrega[trackState.currentDeliveryIndex] && trackState.routeEntrega[trackState.currentDeliveryIndex].length > 0)) {
      let lastPoint = null;
      if (trackState.phase === 'retiro') {
        lastPoint = trackState.routeRetiro[trackState.routeRetiro.length - 1];
      } else if (trackState.phase === 'entrega') {
        const currentArr = trackState.routeEntrega[trackState.currentDeliveryIndex];
        if (currentArr && currentArr.length > 0) {
          lastPoint = currentArr[currentArr.length - 1];
        }
      }
      
      if (lastPoint) {
        const stepDist = calculateHaversineDistance(lastPoint[0], lastPoint[1], avgLat, avgLng);
        if (stepDist > 0.008) {
          if (trackState.phase === 'retiro' || trackState.phase === 'entrega') { 
            trackState.currentDistance += stepDist; 
          }
          
          if (trackState.phase === 'retiro') {
            trackState.routeRetiro.push(latestCoords);
          } else if (trackState.phase === 'entrega') {
            trackState.routeEntrega[trackState.currentDeliveryIndex].push(latestCoords);
          }
          
          document.getElementById('gpsDistanceLive').textContent = `${trackState.currentDistance.toFixed(3)} km`;
          drawLiveTrackingPathOnMap();
        }
      }
    } else { 
      if (trackState.phase === 'retiro') {
        trackState.routeRetiro.push(latestCoords);
      } else if (trackState.phase === 'entrega') {
        trackState.routeEntrega[trackState.currentDeliveryIndex] = [latestCoords];
      }
    }
    document.getElementById('motoSpeed').textContent = Math.round(speed * 3.6); 
    document.getElementById('motoGpsDistance').textContent = trackState.currentDistance.toFixed(3);
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
  const mapContainer = document.getElementById('liveMapDiv');
  if (!mapContainer) return;
  try {
    leafMapInstance = L.map('liveMapDiv', { zoomControl: false, attributionControl: false }).setView(latestCoords || [14.6349, -90.5069], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(leafMapInstance);
    
    // Naranja Eléctrico (#ff9500) para el trayecto al restaurante
    mapPolylineRetiro = L.polyline([], { color: '#ff9500', weight: 6, opacity: 0.9 }).addTo(leafMapInstance);
    mapPolylinesEntrega = [];
    
    if (latestCoords) updateHelmetMarkerOnMap(latestCoords[0], latestCoords[1]);
  } catch(e) { console.error('Map initialization failed', e); }
}

function initMotoMapInstance() {
  if (typeof L === 'undefined' || motoMapInstance) { 
    if (motoMapInstance) setTimeout(() => { motoMapInstance.invalidateSize(); }, 300);
    return; 
  }
  const mapContainer = document.getElementById('motoMapDiv');
  if (!mapContainer) return;
  try {
    motoMapInstance = L.map('motoMapDiv', { zoomControl: false, attributionControl: false }).setView(latestCoords || [14.6349, -90.5069], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(motoMapInstance);
    
    // Naranja Eléctrico (#ff9500) para el trayecto al restaurante en el modo moto
    motoPolylineRetiro = L.polyline([], { color: '#ff9500', weight: 6, opacity: 0.9 }).addTo(motoMapInstance);
    motoPolylinesEntrega = [];
    
    if (latestCoords) updateHelmetMarkerOnMap(latestCoords[0], latestCoords[1]);
  } catch(e) { console.error('Moto map initialization failed', e); }
}

function toggleMotoMapVisibility() {
  const isChecked = document.getElementById('motoMapToggle').checked; const wrapper = document.getElementById('motoMapWrapper');
  if (isChecked) { wrapper.classList.remove('hidden'); initMotoMapInstance(); } else { wrapper.classList.add('hidden'); }
}

function drawLiveTrackingPathOnMap() {
  if (leafMapInstance) {
    if (trackState.phase === 'retiro' && trackState.routeRetiro.length > 0) {
      mapPolylineRetiro.setLatLngs(trackState.routeRetiro);
      if (!mapStartMarker) { 
        mapStartMarker = L.circleMarker(trackState.routeRetiro[0], { radius: 8, color: '#ff9500', fillColor: '#ff9500', fillOpacity: 0.8 }).addTo(leafMapInstance); 
      }
    } else if (trackState.phase === 'entrega') {
      const idx = trackState.currentDeliveryIndex;
      const pathPts = trackState.routeEntrega[idx] || [];
      if (pathPts.length > 0) {
        if (!mapPolylinesEntrega[idx]) {
          const pathColor = deliveryColors[idx % deliveryColors.length];
          mapPolylinesEntrega[idx] = L.polyline([], { color: pathColor, weight: 6, opacity: 0.9 }).addTo(leafMapInstance);
        }
        mapPolylinesEntrega[idx].setLatLngs(pathPts);
      }
    }
  }
  
  if (motoMapInstance && !document.getElementById('motoMapWrapper').classList.contains('hidden')) {
    if (trackState.phase === 'retiro' && trackState.routeRetiro.length > 0) {
      motoPolylineRetiro.setLatLngs(trackState.routeRetiro);
      if (!motoStartMarker) { 
        motoStartMarker = L.circleMarker(trackState.routeRetiro[0], { radius: 8, color: '#ff9500', fillColor: '#ff9500', fillOpacity: 0.8 }).addTo(motoMapInstance); 
      }
    } else if (trackState.phase === 'entrega') {
      const idx = trackState.currentDeliveryIndex;
      const pathPts = trackState.routeEntrega[idx] || [];
      if (pathPts.length > 0) {
        if (!motoPolylinesEntrega[idx]) {
          const pathColor = deliveryColors[idx % deliveryColors.length];
          motoPolylinesEntrega[idx] = L.polyline([], { color: pathColor, weight: 6, opacity: 0.9 }).addTo(motoMapInstance);
        }
        motoPolylinesEntrega[idx].setLatLngs(pathPts);
      }
    }
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
  const isLight = document.body.classList.contains('light-mode'); const gridColor = isLight ? '#e5e5ea' : '#26262b'; const labelColor = isLight ? '#4a4a4f' : '#8e8e93';
  
  const daysArray = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
  const todayIndex = new Date().getDay();
  let daysLabels = [];
  for (let i = 6; i >= 0; i--) {
    let idx = (todayIndex - i + 7) % 7;
    daysLabels.push(daysArray[idx]);
  }

  let realBrutoGains = [0, 0, 0, 0, 0, 0, 0];
  let realNetoGains = [0, 0, 0, 0, 0, 0, 0];
  
  const now = new Date();
  const gasPrice = parseFloat(db.config.gasPrice) || 32;
  const gasRend = parseFloat(db.config.gasRend) || 120;
  const dailyMaint = parseFloat(db.config.dailyMaint) !== undefined ? parseFloat(db.config.dailyMaint) : 15;
  const costPerKm = gasPrice / gasRend;

  db.orders.forEach(order => {
    const oDate = new Date(order.timestamp);
    const diffTime = Math.abs(now - oDate);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 7) {
      const spotIndex = 6 - diffDays;
      if (spotIndex >= 0 && spotIndex < 7) {
        realBrutoGains[spotIndex] += order.earnings;
        const oKm = order.kmR + order.kmE;
        const fuelCost = oKm * costPerKm;
        const orderNet = order.earnings - fuelCost - (dailyMaint / Math.max(1, db.orders.length));
        realNetoGains[spotIndex] += Math.max(0, orderNet);
      }
    }
  });

  let maxVal = Math.max(...realBrutoGains, 100);
  maxVal = Math.ceil(maxVal / 50) * 50; 

  ctx.clearRect(0,0,width,height); ctx.strokeStyle = gridColor; ctx.lineWidth = 1.5; const spacing = width / 7;
  
  ctx.beginPath();
  for(let j = 1; j <= 3; j++) {
    const yGrid = ((height - 30) / 4) * j;
    ctx.moveTo(0, yGrid);
    ctx.lineTo(width, yGrid);
  }
  ctx.stroke();

  daysLabels.forEach((day, idx) => {
    const x = spacing * idx + (spacing / 2); 
    const hBruto = (realBrutoGains[idx] / maxVal) * (height - 40); 
    const hNeto = (realNetoGains[idx] / maxVal) * (height - 40);
    
    const bGrad = ctx.createLinearGradient(x - 8, height - 20 - hBruto, x - 2, height - 20);
    bGrad.addColorStop(0, '#ff2d55');
    bGrad.addColorStop(1, '#ff6b35');
    ctx.fillStyle = bGrad;
    drawRoundedRect(ctx, x - 8, height - 20 - hBruto, 6, hBruto, 3);
    
    const nGrad = ctx.createLinearGradient(x, height - 20 - hNeto, x + 6, height - 20);
    nGrad.addColorStop(0, '#00ff66');
    nGrad.addColorStop(1, '#008f39');
    ctx.fillStyle = nGrad;
    drawRoundedRect(ctx, x, height - 20 - hNeto, 6, hNeto, 3);
    
    ctx.fillStyle = labelColor; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(day, x - 1, height - 4);
  });
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  if (height <= 0) return;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height);
  ctx.lineTo(x, y + height);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();
}

function switchMainTab(tab) {
  currentTab = tab; 
  document.querySelectorAll('.tab-view').forEach(view => {
    view.classList.remove('active');
  });
  const currentView = document.getElementById(`view-${tab}`);
  if (currentView) currentView.classList.add('active');

  document.querySelectorAll('.nav-bar .nav-item').forEach(item => {
    item.classList.remove('active');
  });
  const currentNav = document.getElementById(`nav-${tab}`);
  if (currentNav) currentNav.classList.add('active');

  if (tab === 'mapa') {
    initLeafletMapInstance();
    setTimeout(() => { if (leafMapInstance) { leafMapInstance.invalidateSize(); if (latestCoords) { leafMapInstance.setView(latestCoords, 14); updateHelmetMarkerOnMap(latestCoords[0], latestCoords[1]); } } }, 300);
  } else if (tab === 'stats') { 
    drawAnalyticsChart(); 
  } else if (tab === 'historial') { 
    renderHistoryTrips(); 
  }
}

function saveConfigData() {
  db.config.riderName = document.getElementById('cfgRiderName').value || ''; 
  db.config.dailyGoal = parseFloat(document.getElementById('cfgDailyGoal').value) || 500;
  db.config.gasPrice = parseFloat(document.getElementById('cfgGasPrice').value) || 32; 
  db.config.gasRend = parseFloat(document.getElementById('cfgGasRend').value) || 120;
  
  const maintenanceVal = parseFloat(document.getElementById('cfgDailyMaint').value);
  db.config.dailyMaint = !isNaN(maintenanceVal) ? maintenanceVal : 15;
  db.config.satRegime = document.getElementById('cfgSatRegime').value || 'pequeno';
  
  commitDataStorage();
  triggerAlert('Ajustes Guardados', 'Tus parámetros y costos operativos se han actualizado.');
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
  
  // Guardar y formatear el acumulado bruto diario
  const formattedGain = `Q ${totalGain.toFixed(2)}`;
  const totalAmountEl = document.getElementById('headerTotalDay');
  if (totalAmountEl) {
    totalAmountEl.setAttribute('data-real-amount', formattedGain);
    if (earningsHidden) {
      totalAmountEl.textContent = "Q ••••";
    } else {
      totalAmountEl.textContent = formattedGain;
    }
  }

  const defaultHeaderStr = db.config.riderName ? `Rider ${db.config.riderName}` : 'Acumulado Hoy'; document.getElementById('headerWelcomeName').textContent = defaultHeaderStr;
  const dailyGoal = parseFloat(db.config.dailyGoal) || 500; const card = document.getElementById('goalProgressCard');
  if (dailyGoal > 0) {
    card.style.display = 'flex'; const progressPct = Math.min(100, Math.round((totalGain / dailyGoal) * 100));
    document.getElementById('goalProgressPct').textContent = `${progressPct}%`; document.getElementById('goalCardSub').textContent = `Q ${totalGain.toFixed(2)} de Q ${dailyGoal.toFixed(0)}`;
    
    const fill = document.getElementById('goalArcFill'); 
    if (fill) {
      fill.style.width = `${progressPct}%`;
      // Efecto interactivo de destello/boost al cargar el pedido
      fill.classList.remove('boost-pulse');
      void fill.offsetWidth; // Disparar reflow
      fill.classList.add('boost-pulse');
    }
    updateMotivationalMessage(progressPct);
  } else { card.style.display = 'none'; }
  updateSystemStatsMetrics(totalGain, totalKm, netEarnings); calculateComplexAdvancedStats();
}

function updateSystemStatsMetrics(bruto, km, neto) {
  let hoursCount = 1; if (db.orders.length > 1) {
    const firstTime = new Date(db.orders[0].timestamp); const lastTime = new Date(db.orders[db.orders.length-1].timestamp);
    const diffHours = Math.abs(lastTime - firstTime) / 3.6e6; if (diffHours > 0.1) hoursCount = diffHours;
  }
  const qHour = bruto / hoursCount; const qKm = km > 0 ? bruto / km : 0;
  const netQKm = km > 0 ? neto / km : 0; 
  
  document.getElementById('effQHour').textContent = `Q ${qHour.toFixed(2)}`; 
  document.getElementById('effQKm').textContent = `Q ${qKm.toFixed(2)}`;
  document.getElementById('effNetQKm').textContent = `Q ${netQKm.toFixed(2)}`;
  document.getElementById('effAvgTime').textContent = `${Math.round(hoursCount * 60 / Math.max(1, db.orders.length))} mins`;
  
  const gallonsRend = parseFloat(db.config.gasRend) || 120;
  const gallonsBurned = km / gallonsRend;
  document.getElementById('statsGallonsBurned').textContent = `${gallonsBurned.toFixed(2)} Gal`;
  
  const regime = db.config.satRegime || 'pequeno';
  let ivaValue = 0;
  let labelIvaStr = "Impuesto IVA (5%)";
  let titleTaxCardStr = "🧾 Estimación SAT (Peq. Contribuyente)";
  
  if (regime === 'pequeno') {
    ivaValue = bruto * 0.05;
    labelIvaStr = "Impuesto Peq. Contribuyente (5%)";
    titleTaxCardStr = "🧾 Estimación SAT (Peq. Contribuyente)";
  } else if (regime === 'general') {
    ivaValue = bruto * 0.12;
    labelIvaStr = "Débito Fiscal IVA (12%)";
    titleTaxCardStr = "🧾 Estimación SAT (Régimen General)";
  } else {
    labelIvaStr = "Impuesto Exento (0%)";
    titleTaxCardStr = "🧾 Sin Obligaciones Tributarias";
  }
  
  document.getElementById('statsIvaLabel').textContent = labelIvaStr;
  document.getElementById('statsTaxCardTitle').textContent = titleTaxCardStr;
  document.getElementById('taxIva').textContent = `- Q ${ivaValue.toFixed(2)}`;
  
  const depositNet = bruto - ivaValue - 18.50;
  document.getElementById('taxNetTotal').textContent = `Q ${Math.max(0, depositNet).toFixed(2)}`;

  // Predicción estimativa hacia la meta
  const dailyGoal = parseFloat(db.config.dailyGoal) || 500;
  const remainingToGoal = Math.max(0, dailyGoal - bruto);
  let predictionStr = "Meta alcanzada";
  if (remainingToGoal > 0) {
    if (bruto > 0 && hoursCount > 0) {
      const avgEarnPerHour = bruto / hoursCount;
      const hoursNeeded = remainingToGoal / avgEarnPerHour;
      predictionStr = `${hoursNeeded.toFixed(1)} h estimadas (a Q ${avgEarnPerHour.toFixed(1)}/h)`;
    } else {
      predictionStr = "Inicia repartos para calcular";
    }
  }
  const predEl = document.getElementById('statsPredictionGoal');
  if (predEl) predEl.textContent = predictionStr;
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
        if (rate > bestHourlyRate) { bestHourlyRate = rate; bestHourlyRateStr = `Q ${rate.toFixed(1)}/h (${o.restaurant})`; }
      }
    }
  });
  document.getElementById('statsBestHourlyRate').textContent = bestHourlyRate !== -1 ? bestHourlyRateStr : '--';
}

function calculateOrderPriceWithParams(kmR, kmE, nEnt, mult, rain, rainVal, prop) {
  let baseMult = mult; if (rain) baseMult += rainVal;
  
  // El retiro (PAGO_RETIRO) se cobra una única vez, sin importar la cantidad de entregas agrupadas
  const totalBasePerOrder = COMPONENTE_FIJO * nEnt;
  const totalPickup = PAGO_RETIRO;
  const totalDelivery = PAGO_ENTREGA * nEnt;
  const totalPublicidad = PAGO_PUBLICIDAD * nEnt;
  const totalDistance = (kmR + kmE) * PRECIO_KM;
  
  return parseFloat(((totalBasePerOrder + totalPickup + totalDelivery + totalPublicidad + totalDistance) * baseMult + prop).toFixed(2));
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
  initKeepAliveAudio();
  const semScreen = document.getElementById('semaforoScreen'); const semText = document.getElementById('semaforoStatusText'); const overlay = document.getElementById('motoModeOverlay');
  semScreen.classList.add('active'); const lights = [document.getElementById('light1'), document.getElementById('light2'), document.getElementById('light3')];
  setTimeout(() => { lights[0].classList.add('red'); semText.textContent = 'ROJO... ¡PREPARA MOTOR!'; triggerHapticFeedback([100, 100]); }, 1000);
  setTimeout(() => { lights[1].classList.add('yellow'); semText.textContent = 'AMARILLO... ¡ATENTO A RUTA!'; triggerHapticFeedback([150, 100]); }, 2200);
  setTimeout(() => { lights[2].classList.add('green'); semText.textContent = '¡VERDE! ¡A CONDUCIR RIDER!'; triggerHapticFeedback([400, 100, 100, 100]); }, 3400);
  setTimeout(() => { semScreen.classList.remove('active'); lights.forEach(l => l.className = 'light-bulb'); overlay.classList.add('active'); updateMotoBreakdownUI(); initMotoMapInstance(); }, 4500);
}

function exitMotoMode() { 
  document.getElementById('motoModeOverlay').classList.remove('active');
  releaseScreenWakeLock();
}

function calculateRealtimeEarnings() {
  const kmR = parseFloat(document.getElementById('kmRetiro').value) || 0.0;
  let kmETotal = 0.0;
  
  deliverySegments.forEach(seg => {
    const el = document.getElementById(seg.elementId);
    if (el) kmETotal += parseFloat(el.value) || 0.0;
  });
  
  const deliveriesCount = deliverySegments.length;
  const mult = parseFloat(document.getElementById('multValue').value) || 1.30;
  const rainValue = parseFloat(document.getElementById('rainValue').value) || 0.25;
  const prop = parseFloat(document.getElementById('propinaValue').value) || 0.0;
  
  const finalVal = calculateOrderPriceWithParams(
    kmR, 
    kmETotal, 
    deliveriesCount, 
    mult, 
    isRainActive, 
    rainValue, 
    prop
  );
  
  document.getElementById('liveCalcAmount').textContent = `Q ${finalVal.toFixed(2)}`;
  const motoGainEl = document.getElementById('motoGainRealtime');
  if (motoGainEl) {
    motoGainEl.textContent = `Q ${finalVal.toFixed(2)}`;
  }
  
  return finalVal;
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

function toggleGlovesMode() {
  glovesModeActive = !glovesModeActive;
  const badge = document.getElementById('glovesBadge');
  if (badge) {
    badge.textContent = glovesModeActive ? 'ACTIVO' : 'OFF';
    badge.style.color = glovesModeActive ? 'var(--green)' : 'var(--accent)';
  }
}

function clearCalculatorInputs() {
  if (confirm('¿Deseas restablecer y limpiar los datos de este cálculo?')) {
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
}

function triggerEmergencySOS() {
  const message = "🚨 ¡ALERTA DE AUXILIO GPS! Soy un Rider y requiero apoyo inmediato en mi ruta.";
  let url = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
  
  if (latestCoords) {
    const mapsLink = `https://maps.google.com/?q=${latestCoords[0]},${latestCoords[1]}`;
    url += encodeURIComponent(` Mi ubicación en vivo es: ${mapsLink}`);
  }
  
  triggerBannerNotification('🚨 AUXILIO SOS ENVIADO', 'Abriendo canal de emergencia de forma segura.');
  triggerHapticFeedback([150, 150, 150, 600]);
  window.open(url, '_system');
}

function toggleAutoMultiplier() {
  const isEnabled = document.getElementById('cfgAutoMultSwitch').checked;
  db.config.autoMultiplierEnabled = isEnabled;
  document.getElementById('cfgScheduleContainer').style.display = isEnabled ? 'flex' : 'none';
  commitDataStorage();
  updateScheduledMultiplierOnCalcTab();
}

function addScheduleSlotRow(startHour = "12:00", endHour = "14:00", multiplier = 1.30) {
  const id = Date.now() + Math.random();
  db.config.multiplierSchedule.push({ id, startHour, endHour, multiplier });
  commitDataStorage();
  renderScheduleSlots();
}

// Lógica de eliminación de franja horaria
function removeScheduleSlotRow(id) {
  db.config.multiplierSchedule = db.config.multiplierSchedule.filter(s => s.id !== id);
  commitDataStorage();
  renderScheduleSlots();
  updateScheduledMultiplierOnCalcTab();
}

function updateScheduleSlotValue(id, key, val) {
  const idx = db.config.multiplierSchedule.findIndex(s => s.id === id);
  if (idx !== -1) {
    db.config.multiplierSchedule[idx][key] = ke