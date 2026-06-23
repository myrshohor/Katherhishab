const CACHE_NAME = 'kath-cft-v39';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Install: সব ফাইল ক্যাশে রাখো
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate: সব পুরনো ক্যাশ মুছে দাও, সাথে সাথে নতুন SW নাও
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: সবসময় Network থেকে নাও, offline এ Cache
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  // Firebase এবং external requests সরাসরি network এ পাঠাও
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseClone);
        });
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then(cached => {
          return cached || caches.match('./index.html');
        });
      })
  );
});
