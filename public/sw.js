// App-shell + asset cache so Butler opens instantly when installed.
// - Everything: network-first, fall back to cache when offline.
// - API calls: never cached (personalized, fresh).
// NOTE: previously used cache-first for /_next/static/, but in dev Next serves
// chunks at STABLE (non-hashed) paths, so cache-first froze old JS forever
// (that's what broke the session grading UI). Network-first is safe for both
// dev and prod (prod chunks are content-hashed, so the cache stays warm).
const CACHE = "butler-shell-v3";
const SHELL = ["/", "/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const path = new URL(req.url).pathname;

  // Never cache API calls — always fresh, personalized.
  if (path.startsWith("/api/")) return;

  // Everything (incl. JS chunks): network-first, fall back to cache offline.
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match("/")))
  );
});
