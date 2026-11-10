/* Debt Tracker service worker.
   - The app page is network-first: a new index.html shows up on the next launch, with no
     need to touch this file. If the network is down or slow, the saved copy opens instead.
   - The other files (manifest, icon) are cache-first.
   - Only same-origin GETs are handled. The ledger lives in IndexedDB and never passes
     through here.
   Bump CACHE only if the list of files in SHELL changes. */
const CACHE = "debt-tracker-v3";
const PAGE = "index.html";
const SHELL = [PAGE, "manifest.json", "apple-touch-icon.png"];
const PAGE_TIMEOUT_MS = 3000;

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      /* cache:"reload" skips the HTTP cache, so install never stores a stale copy. */
      .then(c => Promise.all(SHELL.map(u => c.add(new Request(u, {cache: "reload"})))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Newest page if the network answers in time, otherwise the saved one. */
async function freshPage(){
  const cache = await caches.open(CACHE);
  const saved = await cache.match(PAGE);
  const fromNet = fetch(PAGE, {cache: "no-store"}).then(res => {
    if(res.ok) cache.put(PAGE, res.clone());
    return res.ok ? res : Promise.reject(new Error("bad response"));
  });
  if(!saved) return fromNet;
  fromNet.catch(() => {});                       // a late failure after the timeout is fine
  const timeout = new Promise(r => setTimeout(() => r(saved), PAGE_TIMEOUT_MS));
  return Promise.race([fromNet.catch(() => saved), timeout]);
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if(req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  if(req.mode === "navigate"){
    e.respondWith(freshPage());
    return;
  }
  e.respondWith(
    caches.match(req, {ignoreSearch: true}).then(hit => hit || fetch(req))
  );
});
