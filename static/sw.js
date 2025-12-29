// Service Worker for Homepage Dashboard
// Only caches static assets (JS, CSS) - does not intercept navigation or API requests
const STATIC_CACHE_NAME = 'homepage-static-v4'; // Bump version to force update

// Debug utility for service worker
// CRITICAL: Default to NO logging - only log when explicitly enabled via checkbox
let debugPrefsCache = {};
let debugPrefsLoaded = false;
let DEBUG_ENABLED = false; // Global flag - only set to true when 'sw' checkbox is checked

async function loadDebugPrefs() {
  if (debugPrefsLoaded) return debugPrefsCache;
  try {
    return new Promise((resolve) => {
      const request = indexedDB.open('homepage-debug', 1);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('prefs')) {
          db.createObjectStore('prefs');
        }
      };
      request.onsuccess = (event) => {
        const db = event.target.result;
        const transaction = db.transaction(['prefs'], 'readonly');
        const store = transaction.objectStore('prefs');
        const getRequest = store.get('debugPrefs');
        getRequest.onsuccess = () => {
          debugPrefsCache = getRequest.result || {};
          debugPrefsLoaded = true;
          resolve(debugPrefsCache);
        };
        getRequest.onerror = () => {
          debugPrefsCache = {};
          debugPrefsLoaded = true;
          resolve(debugPrefsCache);
        };
      };
      request.onerror = () => {
        debugPrefsCache = {};
        debugPrefsLoaded = true;
        resolve(debugPrefsCache);
      };
    });
  } catch (e) {
    debugPrefsCache = {};
    debugPrefsLoaded = true;
    return debugPrefsCache;
  }
}

function isDebugEnabled(module) {
  // CRITICAL: Always default to false - only return true if explicitly enabled
  // Double-check: if module is 'sw', also check global flag
  if (module === 'sw' && !DEBUG_ENABLED) {
    return false;
  }
  if (!debugPrefsLoaded) {
    return false;
  }
  if (!debugPrefsCache || typeof debugPrefsCache !== 'object') {
    return false;
  }
  // Only return true if the module is explicitly set to true
  const enabled = debugPrefsCache[module] === true;
  // Update global flag for 'sw' module
  if (module === 'sw') {
    DEBUG_ENABLED = enabled;
  }
  return enabled;
}

function debugLog(module, ...args) {
  // CRITICAL: Only log if explicitly enabled, default to silent
  // For 'sw' module, check global flag FIRST (fastest check)
  if (module === 'sw') {
    // Fast path: if global flag is false, exit immediately
    if (!DEBUG_ENABLED) {
      return; // Exit immediately - debug is disabled
    }
    // Double-check cache to be sure
    if (!debugPrefsLoaded || !debugPrefsCache || debugPrefsCache['sw'] !== true) {
      DEBUG_ENABLED = false; // Update flag if cache says disabled
      return; // Exit immediately
    }
  } else {
    // For other modules, check normally
    if (!isDebugEnabled(module)) {
      return; // Exit immediately if not enabled
    }
  }
  // Only log if we get here (explicitly enabled)
  console.log(`[${module}]`, ...args);
}

// Refresh debug prefs cache periodically and on message
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'DEBUG_PREFS_UPDATE') {
    const prefs = event.data.prefs;
    debugPrefsCache = (prefs && typeof prefs === 'object') ? prefs : {};
    debugPrefsLoaded = true;
    // Update global flag immediately
    DEBUG_ENABLED = debugPrefsCache['sw'] === true;
  }
});

// Load debug prefs on startup - initialize to empty object (no debug enabled by default)
// Start with debugPrefsLoaded = false so isDebugEnabled returns false until explicitly loaded
debugPrefsCache = {};
debugPrefsLoaded = false; // Start as false - will be set to true after loading
DEBUG_ENABLED = false; // Start with debug disabled
loadDebugPrefs().then((prefs) => {
  debugPrefsCache = (prefs && typeof prefs === 'object') ? prefs : {};
  debugPrefsLoaded = true;
  // Update global flag
  DEBUG_ENABLED = debugPrefsCache['sw'] === true;
}).catch(() => {
  // Ignore errors, keep default (no debug)
  debugPrefsCache = {};
  debugPrefsLoaded = true; // Set to true even on error so we don't keep trying
  DEBUG_ENABLED = false; // Ensure debug stays disabled on error
});

// Refresh cache every 2 seconds
setInterval(() => {
  debugPrefsLoaded = false;
  loadDebugPrefs().then((prefs) => {
    debugPrefsCache = (prefs && typeof prefs === 'object') ? prefs : {};
    debugPrefsLoaded = true;
    // Update global flag
    DEBUG_ENABLED = debugPrefsCache['sw'] === true;
  }).catch(() => {
    debugPrefsCache = {};
    debugPrefsLoaded = true;
    DEBUG_ENABLED = false;
  });
}, 2000);

// Assets to cache immediately on install (excluding main page - it uses network-first)
const STATIC_ASSETS = [
  '/static/js/core.js',
  '/static/js/graphs.js',
  '/static/js/app.js',
  '/static/js/layout.js',
  '/static/js/preferences.js',
  '/static/js/modules/system.js',
  '/static/js/modules/weather.js',
  '/static/js/modules/network.js',
  '/static/js/modules/search.js',
  '/static/js/modules/github.js',
  '/static/js/modules/rss.js',
  '/static/js/modules/quicklinks.js',
  '/static/js/modules/monitoring.js',
  '/static/js/modules/snmp.js',
  '/static/js/modules/calendar.js',
  '/static/js/modules/todo.js',
  '/static/js/modules/config.js',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  debugLog('sw', '[Service Worker] Installing...');
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then((cache) => {
      debugLog('sw', '[Service Worker] Caching static assets');
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        if (isDebugEnabled('sw')) {
          console.warn('[Service Worker] Failed to cache some assets:', err);
        }
        // Don't fail installation if some assets fail to cache
        return Promise.resolve();
      });
    })
  );
  // Force activation of new service worker
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  debugLog('sw', '[Service Worker] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== STATIC_CACHE_NAME) {
            debugLog('sw', '[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Take control of all pages immediately
  return self.clients.claim();
});

// Fetch event - only cache in background, never intercept requests
// This ensures the service worker never interferes with normal operation
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  debugLog('sw', 'Fetch intercepted:', request.method, url.pathname, request.mode);

  // Skip cross-origin requests
  if (url.origin !== location.origin) {
    debugLog('sw', 'Skipping cross-origin request');
    return;
  }

  // For navigation requests, try network first with timeout, fallback to cache if offline
  if (request.mode === 'navigate' || url.pathname === '/') {
    debugLog('sw', 'Handling navigation request');
    const fetchPromise = fetch(request).catch(err => {
      debugLog('sw', 'Navigation fetch error:', err.message);
      throw err;
    });
    
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Navigation timeout')), 2000)
    );
    
    event.respondWith(
      Promise.race([fetchPromise, timeoutPromise])
        .then((response) => {
          debugLog('sw', 'Navigation fetch succeeded:', response.status);
          // Cache successful HTML responses
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(STATIC_CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
              debugLog('sw', 'Cached navigation response');
            });
          }
          return response;
        })
        .catch((error) => {
          debugLog('sw', 'Navigation fetch failed/timeout, trying cache:', error.message);
          // Network failed - try cache immediately
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              debugLog('sw', 'Serving cached navigation response');
              return cachedResponse;
            }
            debugLog('sw', 'No cached navigation response available');
            // No cache - return a basic HTML page that will load scripts
            // This allows the page to load even when server is down
            return new Response('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Loading...</title></head><body><script>window.location.reload();</script></body></html>', {
              status: 200,
              headers: { 'Content-Type': 'text/html' }
            });
          });
        })
    );
    return;
  }

  // Don't intercept API requests - let them go through normally
  if (url.pathname.startsWith('/api/')) {
    debugLog('sw', 'Skipping API request:', url.pathname);
    return;
  }

  // Only cache static assets (JS, CSS files in /static/)
  if (!url.pathname.startsWith('/static/')) {
    debugLog('sw', 'Skipping non-static request:', url.pathname);
    return;
  }
  
  debugLog('sw', 'Caching static asset in background:', url.pathname);

  // Just cache successful responses in background
  // Never intercept - let all requests pass through normally
  // This way the service worker never interferes, even when server is down
  event.waitUntil(
    fetch(request.clone())
      .then((response) => {
        // Only cache successful responses
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          return caches.open(STATIC_CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
      })
      .catch(() => {
        // Ignore errors - we're just caching in background
        // The original request will handle its own errors
      })
  );
  
  // Don't call event.respondWith() - let the request pass through normally
  // This ensures the browser handles the request naturally
});

