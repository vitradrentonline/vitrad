const CACHE_NAME = 'vitrad-v1';
const ASSETS = [
  '/', '/index.html',
  '/styles.css', '/script.js'
  // اگر فایل‌های ضروری دیگری داری (لوگو، فونت، صفحه‌های اصلی) اینجا اضافه کن
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(ASSETS);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : null)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  e.respondWith((async () => {
    const cached = await caches.match(e.request);
    return cached || fetch(e.request);
  })());
});
