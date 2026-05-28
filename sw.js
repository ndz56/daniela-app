// Service Worker - אסטרטגיה: network-first ל-HTML/JS/CSS (תמיד חדש אם יש אינטרנט)
// cache-first לאייקונים וספריות חיצוניות
const CACHE = 'daniela-v14';

const NETWORK_FIRST = ['index.html', 'app.js', 'styles.css', 'manifest.json', 'sw.js', '/'];

self.addEventListener('install', e => {
  // לא ממתינים להפעלה - מיד פעיל
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    // מחיקת קאשים ישנים
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    // השתלטות על כל הלקוחות הפתוחים
    await self.clients.claim();
    // הודעה ללקוחות שיש גרסה חדשה
    const clients = await self.clients.matchAll();
    clients.forEach(c => c.postMessage({ type: 'SW_UPDATED', version: CACHE }));
  })());
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // לא לטפל בבקשות חיצוניות

  const path = url.pathname.split('/').pop() || '/';
  const isNetworkFirst = NETWORK_FIRST.includes(path) || url.pathname.endsWith('/');

  if (isNetworkFirst) {
    e.respondWith(networkFirst(e.request));
  } else {
    e.respondWith(cacheFirst(e.request));
  }
});

async function networkFirst(req) {
  try {
    const fresh = await fetch(req, { cache: 'no-store' });
    if (fresh && fresh.status === 200) {
      const clone = fresh.clone();
      caches.open(CACHE).then(c => c.put(req, clone));
    }
    return fresh;
  } catch {
    const cached = await caches.match(req);
    if (cached) return cached;
    throw new Error('No network and no cache');
  }
}

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.status === 200) {
      const clone = fresh.clone();
      caches.open(CACHE).then(c => c.put(req, clone));
    }
    return fresh;
  } catch {
    throw new Error('Failed and not cached');
  }
}
