// ===== কাঠ CFT ক্যালকুলেটর — Service Worker =====
// ভার্সন বাড়ালে (CACHE_VERSION) পুরনো cache মুছে নতুন ফাইল লোড হবে
// এবং index.html এর controllerchange লিসেনার পেজ অটো-রিলোড করবে।
const CACHE_VERSION = 'v1';
const CACHE_NAME = 'kathcft-cache-' + CACHE_VERSION;

// অফলাইনে চালানোর জন্য প্রয়োজনীয় সব ফাইল (App Shell)
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// ===== INSTALL: নতুন ফাইল cache করো, সাথে সাথেই activate হওয়ার জন্য skipWaiting =====
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    }).then(() => self.skipWaiting())
  );
});

// ===== ACTIVATE: পুরনো cache ভার্সন মুছে ফেলো, সাথে সাথেই সব ক্লায়েন্ট claim করো =====
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key.startsWith('kathcft-cache-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// ===== FETCH =====
// HTML (নেভিগেশন): Network-First — অনলাইন থাকলে সবসময় সর্বশেষ ভার্সন,
//                    অফলাইনে গেলে cache থেকে সার্ভ হবে।
// অন্য সব (CSS/JS/ছবি/manifest): Cache-First — দ্রুত লোড, offline-safe,
//                    ব্যাকগ্রাউন্ডে নতুন ভার্সন থাকলে সেটাও cache-এ আপডেট হয়ে যাবে।
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // শুধু GET রিকোয়েস্ট handle করবো
  if (req.method !== 'GET') return;

  // শুধু নিজের origin এর রিকোয়েস্ট handle করবো (বাইরের API/CDN নয়)
  if (new URL(req.url).origin !== self.location.origin) return;

  const isNavigation = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isNavigation) {
    // ---- Network First (HTML) ----
    event.respondWith(
      fetch(req)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          return response;
        })
        .catch(() => {
          return caches.match(req).then((cached) => {
            return cached || caches.match('./index.html');
          });
        })
    );
  } else {
    // ---- Cache First (static assets), সাথে ব্যাকগ্রাউন্ড রিভ্যালিডেট ----
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchPromise = fetch(req).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return response;
        }).catch(() => cached);

        return cached || fetchPromise;
      })
    );
  }
});

// ===== MESSAGE: চাইলে পেজ থেকে ম্যানুয়ালি skipWaiting ট্রিগার করা যাবে =====
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
