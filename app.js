// --- Variables de Estado Global ---
let currentTab = 'calc';
let isShiftActive = false;
let currentMultiplier = 1.0;
let selectedDeliveriesCount = 1;
let completedTrips = [];
let dailyGoal = 100.00;

// Configuración persistente (Local Storage)
let fuelCostPerKm = parseFloat(localStorage.getItem('fuelCost')) || 1.20;
let maintCostPerKm = parseFloat(localStorage.getItem('maintCost')) || 0.15;
let otherCostPerKm = parseFloat(localStorage.getItem('otherCost')) || 0.10;

let mainLeafletMap = null;

document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  loadSavedData();
  setupTabSystem();
  setupEventListeners();
  setupNumSelector();
  calculateLivePreview();
  toggleStatsHeader();
}

// Carga información guardada
function loadSavedData() {
  const savedGoal = localStorage.getItem('dailyGoal');
  if (savedGoal) {
    dailyGoal = parseFloat(savedGoal);
    document.getElementById('daily-goal-input').value = dailyGoal.toFixed(2);
  }

  const savedTrips = localStorage.getItem('tripsHistory');
  if (savedTrips) {
    completedTrips = JSON.parse(savedTrips);
  }

  document.getElementById('cfg-fuel').value = fuelCostPerKm;
  document.getElementById('cfg-maint').value = maintCostPerKm;
  document.getElementById('cfg-other').value = otherCostPerKm;

  updateGlobalUI();
}

// Control de Visibilidad del Stats Header
function toggleStatsHeader() {
  const header = document.getElementById('global-stats-header');
  const banner = document.getElementById('meta-banner');
  if (currentTab === 'calc' || currentTab === 'historial') {
    header.style.display = 'flex';
    banner.style.display = 'block';
  } else {
    header.style.display = 'none';
    banner.style.display = 'none';
  }
}

// Seteo del sistema de pestañas
function setupTabSystem() {
  const footerTabs = [
    { id: 'tab-calc', label: 'Calc' },
    { id: 'tab-map', label: 'Mapa' },
    { id: 'tab-historial', label: 'Historial' },
    { id: 'tab-stats', label: 'Stats' },
    { id: 'tab-ajustes', label: 'Ajustes' }
  ];

  // Crear la barra de navegación dinámica en base al DOM de Capacitor
  const body = document.body;
  const navBar = document.createElement('div');
  navBar.className = 'tab-bar';
  navBar.style.position = 'fixed';
  navBar.style.bottom = '0';
  navBar.style.left = '0';
  navBar.style.right = '0';
  navBar.style.height = '60px';
  navBar.style.backgroundColor = '#FFFFFF';
  navBar.style.borderTop = '1px solid #E5E7EB';
  navBar.style.display = 'flex';
  navBar.style.justifyContent = 'space-around';
  navBar.style.alignItems = 'center';
  navBar.style.zIndex = '1000';

  footerTabs.forEach(tab => {
    const tabItem = document.createElement('div');
    tabItem.className = `tab-item ${tab.id === 'tab-calc' ? 'active-tab' : ''}`;
    tabItem.style.textAlign = 'center';
    tabItem.style.flex = '1';
    tabItem.style.cursor = 'pointer';

    let iconName = 'calculator-outline';
    if (tab.id === 'tab-map') iconName = 'map-outline';
    if (tab.id === 'tab-historial') iconName = 'list-outline';
    if (tab.id === 'tab-stats') iconName = 'stats-chart-outline';
    if (tab.id === 'tab-ajustes') iconName = 'settings-outline';

    tabItem.innerHTML = `
      <ion-icon name="${iconName}" style="font-size: 20px; color: ${tab.id === 'tab-calc' ? '#2563EB' : '#6B7280'}"></ion-icon>
      <div style="font-size: 10px; color: ${tab.id === 'tab-calc' ? '#2563EB' : '#6B7280'}; font-weight: 600;">${tab.label}</div>
    `;

    tabItem.addEventListener('click', () => {
      document.querySelectorAll('.tab-view').forEach(view => view.classList.remove('active'));
      document.getElementById(tab.id).classList.add('active');
      
      document.querySelectorAll('.tab-item').forEach(item => {
        item.querySelector('ion-icon').style.color = '#6B7280';
        item.querySelector('div').style.color = '#6B7280';
      });
      tabItem.querySelector('ion-icon').style.color = '#2563EB';
      tabItem.querySelector('div').style.color = '#2563EB';

      currentTab = tab.id.replace('tab-', '');
      toggleStatsHeader();

      if (tab.id === 'tab-map') {
        setTimeout(initLeafletMap, 100);
      }
      if (tab.id === 'tab-historial') {
        renderHistoryList();
      }
      if (tab.id === 'tab-stats') {
        renderStats();
      }
    });

    navBar.appendChild(tabItem);
  });
  body.appendChild(navBar);
}

// Configuración de listeners en Calc y Ajustes
function setupEventListeners() {
  const shiftToggle = document.getElementById('shift-toggle');
  const shiftModal = document.getElementById('shift-modal');

  shiftToggle.addEventListener('change', (e) => {
    if (e.target.checked) {
      shiftModal.classList.remove('hidden');
    } else {
      isShiftActive = false;
      currentMultiplier = 1.0;
      document.getElementById('shift-status-text').innerText = "Jornada laboral inactiva.";
    }
  });

  // Cancelar Jornada
  document.getElementById('btn-modal-cancel').addEventListener('click', () => {
    shiftModal.classList.add('hidden');
    shiftToggle.checked = false;
  });

  // Opciones predefinidas del Modal
  document.querySelectorAll('.mult-opt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mult-opt-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMultiplier = parseFloat(btn.getAttribute('data-mult'));
    });
  });

  // Confirmar Jornada
  document.getElementById('btn-modal-start').addEventListener('click', () => {
    const custom = parseFloat(document.getElementById('custom-multiplier').value);
    if (!isNaN(custom) && custom > 0) {
      currentMultiplier = custom;
    }
    isShiftActive = true;
    document.getElementById('shift-status-text').innerText = `Jornada Activa con Multiplicador: x${currentMultiplier.toFixed(2)}`;
    shiftModal.classList.add('hidden');
  });

  // Cambios dinámicos en los campos de entrada
  document.querySelectorAll('.dist-input').forEach(input => {
    input.addEventListener('input', calculateLivePreview);
  });

  // Botón Reiniciar
  document.getElementById('btn-reset').addEventListener('click', resetCalcForm);

  // Guardar Ajustes Operativos
  document.getElementById('btn-save-settings').addEventListener('click', () => {
    fuelCostPerKm = parseFloat(document.getElementById('cfg-fuel').value) || 0;
    maintCostPerKm = parseFloat(document.getElementById('cfg-maint').value) || 0;
    otherCostPerKm = parseFloat(document.getElementById('cfg-other').value) || 0;

    localStorage.setItem('fuelCost', fuelCostPerKm);
    localStorage.setItem('maintCost', maintCostPerKm);
    localStorage.setItem('otherCost', otherCostPerKm);

    alert('Costos operativos de mantenimiento guardados correctamente de forma permanente.');
  });

  // Entrada de Meta del Día
  document.getElementById('daily-goal-input').addEventListener('input', (e) => {
    dailyGoal = parseFloat(e.target.value) || 0;
    localStorage.setItem('dailyGoal', dailyGoal);
    updateGlobalUI();
  });

  // Aceptar Viaje
  document.getElementById('btn-accept').addEventListener('click', acceptTripRecord);
}

// Selector de número de entregas (Máx 4)
function setupNumSelector() {
  document.querySelectorAll('.num-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.num-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedDeliveriesCount = parseInt(btn.getAttribute('data-val'));

      // Ocultar / Mostrar inputs correspondientes de forma consecutiva
      for (let i = 2; i <= 4; i++) {
        const inputGroup = document.getElementById(`input-group-c${i}`);
        if (selectedDeliveriesCount >= i) {
          inputGroup.classList.remove('hidden');
        } else {
          inputGroup.classList.add('hidden');
          const inp = document.getElementById(`dist-c${i-1}-c${i}`);
          if (inp) inp.value = ''; // Limpiar campos no usados
        }
      }
      calculateLivePreview();
    });
  });
}

// --- Cálculos de la Ruta Consecutiva Sin Duplicados ---
function runDistanceCalculation() {
  const d1 = parseFloat(document.getElementById('dist-origin-rest').value) || 0;
  const d2 = parseFloat(document.getElementById('dist-rest-c1').value) || 0;
  const d3 = parseFloat(document.getElementById('dist-c1-c2').value) || 0;
  const d4 = parseFloat(document.getElementById('dist-c2-c3').value) || 0;
  const d5 = parseFloat(document.getElementById('dist-c3-c4').value) || 0;

  // Suma de distancias lineal (Origen -> Restaurante -> Cliente 1 -> Cliente 2 -> Cliente 3 -> Cliente 4)
  let totalKm = d1;
  if (selectedDeliveriesCount >= 1) totalKm += d2;
  if (selectedDeliveriesCount >= 2) totalKm += d3;
  if (selectedDeliveriesCount >= 3) totalKm += d4;
  if (selectedDeliveriesCount >= 4) totalKm += d5;

  const ratePerKm = 8.00; // Tarifa base por km
  let grossEarnings = totalKm * ratePerKm * currentMultiplier;

  // Añadir un bono fijo de $5 por cada entrega extra consecutiva (stacked delivery)
  if (selectedDeliveriesCount > 1) {
    grossEarnings += (selectedDeliveriesCount - 1) * 5.00;
  }

  // Costos operativos basados en tus configuraciones guardadas
  const costPerKm = fuelCostPerKm + maintCostPerKm + otherCostPerKm;
  const totalCostOfRoute = totalKm * costPerKm;

  // IVA Estimado exacto (5% del bruto, sin tasa retenida del 1.5%)
  const ivaDeduction = grossEarnings * 0.05;

  const netEarnings = grossEarnings - ivaDeduction - totalCostOfRoute;

  return {
    totalKm,
    grossEarnings,
    totalCostOfRoute,
    ivaDeduction,
    netEarnings
  };
}

function calculateLivePreview() {
  const results = runDistanceCalculation();
  document.getElementById('prev-km').innerText = `${results.totalKm.toFixed(1)} km`;
  document.getElementById('prev-gross').innerText = `$${results.grossEarnings.toFixed(2)}`;
  document.getElementById('prev-costs').innerText = `-$${results.totalCostOfRoute.toFixed(2)}`;
  document.getElementById('prev-iva').innerText = `-$${results.ivaDeduction.toFixed(2)}`;
  document.getElementById('prev-net').innerText = `$${results.netEarnings.toFixed(2)}`;
}

// Botón Limpiar / Reiniciar
function resetCalcForm() {
  document.getElementById('input-restaurant').value = '';
  document.getElementById('dist-origin-rest').value = '';
  document.getElementById('dist-rest-c1').value = '';
  document.getElementById('dist-c1-c2').value = '';
  document.getElementById('dist-c2-c3').value = '';
  document.getElementById('dist-c3-c4').value = '';
  calculateLivePreview();
}

// Registrar Viaje Completado
function acceptTripRecord() {
  if (!isShiftActive) {
    alert("Debes iniciar tu jornada para poder registrar viajes.");
    document.getElementById('shift-modal').classList.remove('hidden');
    return;
  }

  const results = runDistanceCalculation();
  if (results.totalKm <= 0) {
    alert("Por favor ingresa un kilometraje de ruta válido.");
    return;
  }

  const restaurant = document.getElementById('input-restaurant').value || "Restaurante General";

  const newTrip = {
    id: Date.now().toString(),
    date: new Date().toISOString(),
    restaurant,
    deliveriesCount: selectedDeliveriesCount,
    totalKm: results.totalKm,
    gross: results.grossEarnings,
    net: results.netEarnings,
    costs: results.totalCostOfRoute,
    // Coordenadas consecutivas simuladas para graficar el trazado de colores en el mapa
    pathCoords: [
      { lat: 14.580, lng: -90.550, label: 'Inicio' },
      { lat: 14.588, lng: -90.542, label: 'Restaurante' },
      { lat: 14.595, lng: -90.530, label: 'C1' },
      { lat: 14.601, lng: -90.520, label: 'C2' },
      { lat: 14.610, lng: -90.510, label: 'C3' },
      { lat: 14.620, lng: -90.500, label: 'C4' }
    ].slice(0, selectedDeliveriesCount + 2)
  };

  completedTrips.unshift(newTrip);
  localStorage.setItem('tripsHistory', JSON.stringify(completedTrips));

  alert("Viaje guardado e ingresado al historial.");
  resetCalcForm();
  updateGlobalUI();
}

// Actualizar UI del Header Superior y Progreso de la Meta del Día
function updateGlobalUI() {
  const totalOrders = completedTrips.length;
  const totalKm = completedTrips.reduce((sum, item) => sum + item.totalKm, 0);
  const totalNet = completedTrips.reduce((sum, item) => sum + item.net, 0);

  document.getElementById('header-orders').innerText = totalOrders;
  document.getElementById('header-km').innerText = totalKm.toFixed(1);
  document.getElementById('header-net').innerText = `$${totalNet.toFixed(2)}`;

  // Actualizar Progreso Visual de la Meta del Día
  const progressPercent = dailyGoal > 0 ? Math.min((totalNet / dailyGoal) * 100, 100) : 0;
  document.getElementById('progress-bar-fill').style.width = `${progressPercent}%`;
  document.getElementById('meta-progress-text').innerText = `Progreso: $${totalNet.toFixed(2)} / $${dailyGoal.toFixed(2)} (${progressPercent.toFixed(1)}%)`;
}

// --- Integración Externa de Waze ---
function openWaze(lat, lon) {
  const wazeUrl = `waze://?ll=${lat},${lon}&navigate=yes`;
  window.open(wazeUrl, '_system');
}

// --- Renderizado del Mapa con Leaflet (Seguimiento Consolidado de Rutas) ---
function initLeafletMap() {
  if (mainLeafletMap) return;

  mainLeafletMap = L.map('main-map').setView([14.580, -90.550], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: 'Moto Calculadora Maps'
  }).addTo(mainLeafletMap);

  // Renderizar rutas consolidadas del día en el mapa general
  completedTrips.forEach(trip => {
    if (trip.pathCoords && trip.pathCoords.length > 1) {
      const latLngs = trip.pathCoords.map(c => [c.lat, c.lng]);
      L.polyline(latLngs, { color: '#10B981', weight: 4 }).addTo(mainLeafletMap);

      trip.pathCoords.forEach(c => {
        L.marker([c.lat, c.lng]).addTo(mainLeafletMap).bindPopup(c.label);
      });
    }
  });
}

// --- Render del Historial con Trazado Diferenciado ---
function renderHistoryList() {
  const container = document.getElementById('history-list');
  container.innerHTML = '';

  if (completedTrips.length === 0) {
    container.innerHTML = `<p style="text-align: center; color: #6B7280; margin-top: 15px;">Aún no tienes viajes registrados hoy.</p>`;
    return;
  }

  const segmentColors = ['#2563EB', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444'];

  completedTrips.forEach((trip, idx) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.borderLeft = `5px solid ${segmentColors[idx % 5]}`;

    let segmentsMarkup = `<div style="font-size: 10px; font-weight: bold; margin-top: 8px;">Trazado por color:</div>`;
    segmentsMarkup += `<div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px;">`;
    segmentsMarkup += `<span style="background: #2563EB; color: white; padding: 2px 6px; border-radius: 4px; font-size: 9px;">Origen ➔ Rest</span>`;
    
    if (trip.deliveriesCount >= 1) {
      segmentsMarkup += `<span style="background: #10B981; color: white; padding: 2px 6px; border-radius: 4px; font-size: 9px;">Rest ➔ C1</span>`;
    }
    if (trip.deliveriesCount >= 2) {
      segmentsMarkup += `<span style="background: #F59E0B; color: white; padding: 2px 6px; border-radius: 4px; font-size: 9px;">C1 ➔ C2</span>`;
    }
    if (trip.deliveriesCount >= 3) {
      segmentsMarkup += `<span style="background: #8B5CF6; color: white; padding: 2px 6px; border-radius: 4px; font-size: 9px;">C2 ➔ C3</span>`;
    }
    if (trip.deliveriesCount >= 4) {
      segmentsMarkup += `<span style="background: #EF4444; color: white; padding: 2px 6px; border-radius: 4px; font-size: 9px;">C3 ➔ C4</span>`;
    }
    segmentsMarkup += `</div>`;

    card.innerHTML = `
      <div class="row-between">
        <strong>${trip.restaurant}</strong>
        <span style="font-size: 11px; color: #9CA3AF;">${new Date(trip.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <p style="font-size: 11px; margin-top: 4px; color: #4B5563;">Distancia: ${trip.totalKm.toFixed(1)} Km | Entregas: ${trip.deliveriesCount}</p>
      ${segmentsMarkup}
      <div class="row-between divider" style="margin-top: 10px; padding-top: 6px;">
        <span style="font-size: 11px; color: var(--text-light);">Bruto: $${trip.gross.toFixed(2)}</span>
        <strong style="color: var(--success); font-size: 13px;">Neto: $${trip.net.toFixed(2)}</strong>
      </div>
    `;
    container.appendChild(card);
  });
}

// --- Render y Métricas Inteligentes (Tab Stats) ---
function renderStats() {
  const totalKm = completedTrips.reduce((sum, item) => sum + item.totalKm, 0);
  const totalNet = completedTrips.reduce((sum, item) => sum + item.net, 0);
  const totalGross = completedTrips.reduce((sum, item) => sum + item.gross, 0);
  const totalOrders = completedTrips.length;

  // 1. Ganancia Neta por Kilómetro Real
  const netPerKm = totalKm > 0 ? (totalNet / totalKm) : 0;
  document.getElementById('stat-net-per-km').innerText = `$${netPerKm.toFixed(2)}`;

  // 2. Rendimiento promedio por pedido
  const netPerOrder = totalOrders > 0 ? (totalNet / totalOrders) : 0;
  document.getElementById('stat-net-per-order').innerText = `$${netPerOrder.toFixed(2)}`;

  // 3. Gráfica Inteligente Coherente (Solo toma el Lunes o días activos de hoy)
  const maxBarHeight = 90;
  const scale = totalGross > 0 ? (maxBarHeight / totalGross) : 1;

  document.getElementById('bar-mon-gross').style.height = `${totalGross * scale}px`;
  document.getElementById('bar-mon-net').style.height = `${totalNet * scale}px`;
}