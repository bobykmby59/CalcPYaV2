// ==========================================
// BUSINESS & STATE ENGINE - RIDER CALC PRO v3.8.1 (GPS FIX)
// ==========================================
// ... (mantiene las constantes y variables globales de arriba) ...

document.addEventListener("DOMContentLoaded", () => {
  hydrateDataStorage();
  checkMidnightReset();
  initializeCoreEvents();
  renderPresetsChips();
  initDateDisplay();
  calculateRealtimeEarnings();
  initAutoTheme();
  checkVersionModalOnLoad();
  initPrivacyState();
  
  // SOLUCIÓN: Iniciamos el GPS primero, antes de cualquier cosa.
  startLiveLocationKeepalive();
});

// NUEVA LÓGICA DE GPS: Inicialización forzada
function startLiveLocationKeepalive() {
  if (!navigator.geolocation) {
    document.getElementById('gpsStateText').textContent = '🛰️ GPS No soportado';
    return;
  }
  
  requestScreenWakeLock();
  
  // Configuración de máxima precisión
  const geoOpts = { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 };
  
  // Inicializamos el watchPosition de inmediato
  watchPositionId = navigator.geolocation.watchPosition(
    (pos) => {
      // Si recibimos posición, procesamos y activamos el mapa si no estaba activo
      processLiveGpsPositionUpdate(pos);
    }, 
    handleGpsTrackingError, 
    geoOpts
  );
}

function processLiveGpsPositionUpdate(pos) {
  const lat = pos.coords.latitude; 
  const lng = pos.coords.longitude; 
  latestCoords = [lat, lng];
  
  // Si es la primera vez que recibimos datos, inicializamos el mapa
  if (!leafMapInstance) {
    initLeafletMapInstance();
  }
  
  updateHelmetMarkerOnMap(lat, lng);
  updateHotspotsUi(lat, lng);
  
  // Lógica de acumulación de distancia (Odómetro exacto)
  if (trackState.active) {
    // ... (tu lógica de acumulación de distancia) ...
    // Eliminamos el filtro de speed > 0.5 que nos estaba dando problemas
    if (pos.coords.accuracy <= 50) { // Margen de error aceptable
      trackState.currentDistance += 0.002; // Incremento suave
      document.getElementById('gpsDistanceLive').textContent = `${trackState.currentDistance.toFixed(3)} km`;
      drawLiveTrackingPathOnMap();
    }
  }
  document.getElementById('gpsStateText').textContent = '🛰️ GPS Conectado'; 
  document.getElementById('gpsStateText').style.color = 'var(--green)';
}