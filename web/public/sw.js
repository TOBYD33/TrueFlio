// public/sw.js
// TrueFlow service worker — app-shell offline caching + Web Push handling.
//
// Deliberately does NOT precache a manifest of hashed Next.js build assets
// (fragile without a build-time integration, and this project has none) —
// instead uses runtime caching: static/immutable assets go cache-first,
// everything else is network-first with a cache fallback for offline.
//
// CRITICAL RULE (per the build ticket): /api/* and any Supabase request are
// NEVER cached and NEVER served from cache. Transactions, invoices, client
// balances — anything financial — must always be a live network fetch, or
// fail naturally offline rather than silently show stale data. Only the
// app shell (HTML navigation + static JS/CSS/icons) is cache-eligible.

const SHELL_CACHE = 'trueflow-shell-v1'
const RUNTIME_CACHE = 'trueflow-runtime-v1'
const CURRENT_CACHES = [SHELL_CACHE, RUNTIME_CACHE]

const SHELL_URLS = ['/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png']

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !CURRENT_CACHES.includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

function isNeverCache(url) {
  // API routes and Supabase's own domain — always live, never cached,
  // never served from cache even as an offline fallback.
  return url.pathname.startsWith('/api/') || url.hostname.endsWith('.supabase.co')
}

function isImmutableAsset(url) {
  // Next.js content-hashes these — safe to cache-first forever.
  return url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')
}

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin && !url.hostname.endsWith('.supabase.co')) return
  if (isNeverCache(url)) return // let it hit the network exactly as if there were no service worker

  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(res => {
        const clone = res.clone()
        caches.open(RUNTIME_CACHE).then(cache => cache.put(request, clone))
        return res
      }))
    )
    return
  }

  // Navigation (HTML) and everything else static — network-first, so a
  // logged-in user always sees the current page when online, with a
  // cached fallback only when genuinely offline. Never falls back to
  // cache for anything under /api/ (already excluded above).
  event.respondWith(
    fetch(request)
      .then(res => {
        const clone = res.clone()
        caches.open(RUNTIME_CACHE).then(cache => cache.put(request, clone))
        return res
      })
      .catch(() => caches.match(request).then(cached => cached || caches.match('/home')))
  )
})

// ── Web Push ────────────────────────────────────────────────────────────
// Payload shape sent from web/lib/notifications.ts — mirrors the same
// title/body/link fields already used for in-app + desktop notifications,
// so this is one more delivery channel for the same underlying event, not
// a parallel notification system.
self.addEventListener('push', event => {
  if (!event.data) return
  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'TrueFlow', body: event.data.text() }
  }

  const title = payload.title || 'TrueFlow'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { link: payload.link || '/home' },
      tag: payload.tag || undefined,
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const link = event.notification.data?.link || '/home'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(link)
          return client.focus()
        }
      }
      return self.clients.openWindow(link)
    })
  )
})
