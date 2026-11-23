const CACHE = 'paallijst-v1';
const BESTANDEN = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
  'js/app.js', 'js/domain.js', 'js/events.js', 'js/bestelling.js', 'js/tekst.js', 'js/pin.js', 'js/sync.js', 'js/store.js',
  'js/ui/html.js', 'js/ui/hoofdscherm.js', 'js/ui/krat.js', 'js/ui/overzicht.js', 'js/ui/pin.js', 'js/ui/instellingen.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BESTANDEN)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return; // POST naar Apps Script nooit cachen
  const url = new URL(e.request.url);
  if (url.origin !== location.origin && !url.host.endsWith('fonts.googleapis.com') && !url.host.endsWith('fonts.gstatic.com')) return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const kopie = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, kopie));
      return res;
    })),
  );
});
