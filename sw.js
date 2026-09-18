// Offline support. The shell is cached up front so the app opens with no
// network at all; trophy GIFs are cached lazily as they're earned, because
// pre-caching 30MB on first load would stall an iPad Air 2.
const SHELL = 'pokemaths-shell-v1'
const MEDIA = 'pokemaths-media-v1'
const SHELL_FILES = [
  './', './index.html', './app.js', './engine.js',
  './trophies.json', './manifest.webmanifest',
  './icon-180.png', './icon-192.png', './icon-512.png',
]

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL)
      // addAll rejects the whole batch if any one file 404s; tolerate that.
      .then((c) => Promise.allSettled(SHELL_FILES.map((f) => c.add(f))))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== SHELL && k !== MEDIA).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== location.origin) return          // let Google Fonts go to network

  if (url.pathname.includes('/trophies/')) {
    // Cache-first, then fill the cache on the way past.
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone()
      caches.open(MEDIA).then((c) => c.put(req, copy)).catch(() => {})
      return res
    })))
    return
  }
  // Shell: cache-first for instant launch, refresh in the background.
  e.respondWith(caches.match(req).then((hit) => {
    const net = fetch(req).then((res) => {
      const copy = res.clone()
      caches.open(SHELL).then((c) => c.put(req, copy)).catch(() => {})
      return res
    }).catch(() => hit)
    return hit || net
  }))
})
