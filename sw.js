// ===== কাঠ CFT ক্যালকুলেটর — Service Worker (অফলাইন-ফার্স্ট) =====
// এই ফাইলটা index.html এর ঠিক একই ফোল্ডারে (root এ) রাখতে হবে,
// কারণ index.html এ './sw.js' পাথ দিয়ে রেজিস্টার করা আছে।

// অ্যাপ আপডেট করলে (নতুন কোড দিলে) এই ভার্সন নম্বরটা বাড়িয়ে দাও (v1 -> v2 ...),
// তাহলে পুরনো cache মুছে নতুন ফাইল লোড হবে। ভার্সন না বাড়ালে ইউজার পুরনো
// cache করা ভার্সনই দেখতে থাকবে, এমনকি ইন্টারনেট থাকলেও।
const CACHE_VERSION = 'v3';
const CACHE_NAME = 'kath-cft-calc-' + CACHE_VERSION;

// অ্যাপ শেল — এই ফাইলগুলো ছাড়া অ্যাপ চলবে না, তাই install এর সময়ই
// জোর করে cache করা হবে যাতে প্রথমবার নেট বন্ধ থাকলেও অ্যাপ খোলে।
const CORE_ASSETS = [
  './',
  './index.html'
];

// এই ফাইলগুলো থাকলে ভালো (icon, manifest), না থাকলেও install ব্যর্থ হবে না।
const OPTIONAL_ASSETS = [
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// ===== Install: app shell cache করো, সাথে সাথে activate করো =====
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // core assets — এগুলো cache না হলে অফলাইনে অ্যাপ খুলবে না, তাই await করা হচ্ছে
      await cache.addAll(CORE_ASSETS).catch((err) => {
        console.warn('[SW] core asset cache করতে সমস্যা:', err);
      });
      // optional assets — একটা fail করলেও বাকিগুলো cache হবে
      await Promise.allSettled(
        OPTIONAL_ASSETS.map((url) => cache.add(url))
      );
      return self.skipWaiting();
    })
  );
});

// ===== Activate: পুরনো cache পরিষ্কার করো, সাথে সাথে control নাও =====
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('kath-cft-calc-') && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ===== Fetch: Cache-First (অফলাইন-ফার্স্ট) + ব্যাকগ্রাউন্ডে আপডেট =====
// অ্যাপটা মূলত অফলাইনে চলার জন্য বানানো, তাই আগে cache থেকে সাথে সাথে
// রেসপন্স দেওয়া হয় (নেট থাকুক বা না থাকুক ইন্সট্যান্ট লোড), আর নেট থাকলে
// ব্যাকগ্রাউন্ডে নতুন ভার্সন এনে cache আপডেট করে রাখা হয় (পরের বার কাজে লাগবে)।
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // শুধু GET request handle করবো
  if (req.method !== 'GET') return;

  // ভিন্ন origin এর (যেমন CDN) রিকোয়েস্ট থাকলে ব্রাউজারের নিজের নিয়মেই যেতে দাও
  if (new URL(req.url).origin !== self.location.origin) return;

  // পেজ নেভিগেশন (যেমন সরাসরি URL খোলা / রিফ্রেশ) হলে সবসময় index.html দাও
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then((cached) => {
        // ব্যাকগ্রাউন্ডে নতুন ভার্সন এনে cache আপডেট করো (offline হলে চুপচাপ ignore)
        fetchAndUpdateCache(new Request('./index.html'));
        return cached || fetch(req).catch(() => caches.match('./index.html'));
      })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        // cache এ পাওয়া গেলে সাথে সাথে সেটাই দাও, ব্যাকগ্রাউন্ডে ফ্রেশ ভার্সন আনো
        fetchAndUpdateCache(req);
        return cached;
      }
      // cache এ না থাকলে নেটওয়ার্ক থেকে আনো এবং cache করে রাখো
      return fetch(req)
        .then((networkRes) => {
          const resClone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          return networkRes;
        })
        .catch(() => {
          return new Response('অফলাইন — এই রিসোর্সটি এখনো cache হয়নি।', {
            status: 503,
            statusText: 'Offline',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        });
    })
  );
});

// নেট থাকলে চুপচাপ ব্যাকগ্রাউন্ডে cache রিফ্রেশ করে রাখে, offline হলে কিছুই করে না
function fetchAndUpdateCache(req) {
  fetch(req)
    .then((res) => {
      if (res && res.ok) {
        caches.open(CACHE_NAME).then((cache) => cache.put(req, res));
      }
    })
    .catch(() => { /* অফলাইন — ঠিক আছে, cache থেকেই চলবে */ });
}
