---
name: sw-versioning
description: Service worker cache versioning system for the Moon Lamp PWA. Use when modifying sw.js, adding new files to the cache, understanding how version bumps work, or debugging PWA update/cache issues. Covers the __VERSION__ token, version.json, and the GitHub Actions automation.
---

# Service Worker Cache Versioning

## How Versioning Works
1. `version.json` contains `{"version": "x.y"}` — the single source of truth
2. `sw.js` uses `moon-lamp-v__VERSION__` as the cache name — `__VERSION__` is a placeholder
3. The GitHub Actions workflow (`.github/workflows/update_service_worker_version.yml`) automatically replaces `__VERSION__` with the value from `version.json` on every push

**Never manually edit the `__VERSION__` token** — it is replaced at CI/CD time. The token appears in `sw.js`, `js/app.js`, and `js/ui.js` and all three are substituted by the workflow. The token is literal text in source files.

## Cache Name Pattern
```js
const CACHE_NAME = 'moon-lamp-v__VERSION__';
// After CI substitution: 'moon-lamp-v4.13'
```

## Files That Are Cached
All files listed in `filesToCache` in `sw.js`. When adding new JS or CSS files:
1. Add the file path to the `filesToCache` array in `sw.js`
2. The path is relative (e.g., `'js/my-new-module.js'`, `'css/my-style.css'`)

## Cache Busting on Install
The install event fetches with `?v=<CACHE_NAME>` appended to force fresh files from the server even if the browser has a cached copy. Files are stored under their non-query-string URL.

## Special Caching Rules
- `sw.js` itself is **never cached** (listed in `neverCache`) — always fetched fresh
- `version.json` bypasses cache when fetched with a query string (for explicit cache-bust checks)
- All other files: serve from cache first, fall back to network

## Update Flow
1. User visits the PWA → browser checks `sw.js` for changes
2. New `sw.js` installs in background (waiting state)
3. Old SW remains active until user reloads or sends `SKIP_WAITING` message
4. App sends `{ type: 'SKIP_WAITING' }` via `postMessage` after user confirms update
5. On activate: old cache (different name) is deleted, `clients.claim()` takes over

## Bumping the Version
To release a new version:
1. Edit `version.json`: `{"version": "x.y+1"}`
2. Commit and push — GitHub Actions updates `sw.js` automatically

## Checking Current Version
```js
// In browser console, check the active SW cache name:
caches.keys().then(console.log);
```

## SW Message Listener
```js
// In sw.js — triggers immediate activation
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
// On activate, SW posts { type: 'ACTIVATION_COMPLETE' } to all clients
```

## base path detection
The SW detects its own base path dynamically — works for both localhost and GitHub Pages:
```js
const swPath = self.location.pathname;
const BASE_PATH = swPath.substring(0, swPath.lastIndexOf('/') + 1);
```
All cached URLs are prefixed with `BASE_PATH` so they resolve correctly under the `/moon_phase_lamp_PWA/` subpath.
