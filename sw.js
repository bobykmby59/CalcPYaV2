// ============================================================
// Rider Calc — Service Worker
// Estrategia: Cache-first para assets, Network-first para tiles del mapa
// ============================================================

const CACHE_NAME = 'rider-calc-v1';
const CACHE_ASSETS = [
  '/',
  '/index.html',
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
];

// ── INSTALL: precachear assets esenciales ────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Intentar cachear cada asset individualmente para no fallar todo
      return Promise.allSettled(
        CACHE_ASSETS.map(url =>
          cache.add(url).catch(err => console.warn('No se pudo cachear:', url, err))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: limpiar caches viejos ──────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: estrategia según tipo de request ──────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Tiles de OpenStreetMap — Network first, fallback a cache
  // (los tiles cambian, queremos siempre los más frescos si hay red)
  if(url.hostname.includes('tile.openstreetmap.org')){
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Fonts y Leaflet externos — Cache first
  if(
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('unpkg.com')
  ){
    event.respondWith(
      caches.match(event.request).then(cached => {
        if(cached) return cached;
        return fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // App principal (index.html y assets locales) — Cache first con revalidación
  if(url.origin === self.location.origin){
    event.respondWith(
      caches.match(event.request).then(cached => {
        const fetchPromise = fetch(event.request).then(response => {
          if(response && response.status === 200){
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => null);

        // Devolver cache inmediatamente si existe, actualizar en background
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Default: intentar red, fallback a cache
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// ── BACKGROUND SYNC: guardar pedidos pendientes ──────────────
// (por si se agrega un pedido sin conexión)
self.addEventListener('message', event => {
  if(event.data && event.data.type === 'SKIP_WAITING'){
    self.skipWaiting();
  }
});
