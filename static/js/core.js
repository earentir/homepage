// Core utilities and timer management

// Timer management (UI only - intervals are managed by backend via WebSocket)
const timers = {
  cpu: {interval: 5000, lastUpdate: 0, timer: null},
  ram: {interval: 5000, lastUpdate: 0, timer: null},
  disk: {interval: 15000, lastUpdate: 0, timer: null},
  github: {interval: 900000, lastUpdate: 0, timer: null},
  weather: {interval: 1800000, lastUpdate: 0, timer: null},
  ip: {interval: 7200000, lastUpdate: 0, timer: null},
  monitoring: {interval: 60000, lastUpdate: 0, timer: null},
  snmp: {interval: 60000, lastUpdate: 0, timer: null},
  rss: {interval: 300000, lastUpdate: 0, timer: null},
  general: {interval: 30000, lastUpdate: 0, timer: null}
};

function updateTimer(moduleName) {
  const timer = timers[moduleName];
  if (!timer) return;
  const elapsed = Date.now() - timer.lastUpdate;
  const remaining = Math.max(0, timer.interval - elapsed);
  const timerEl = document.getElementById(moduleName + "Timer");
  if (timerEl) {
    const seconds = Math.ceil(remaining / 1000);
    const percent = (elapsed / timer.interval) * 100;
    const percentClamped = Math.min(100, Math.max(0, percent));

    if (remaining > 0) {
      timerEl.title = "Next refresh in " + seconds + "s (double-click to refresh now)";
      timerEl.classList.remove("paused");
      timerEl.style.setProperty("--progress-percent", percentClamped + "%");
    } else {
      timerEl.title = "Ready to refresh (double-click to refresh now)";
      timerEl.classList.add("paused");
      timerEl.style.setProperty("--progress-percent", "100%");
    }
  }
}

// Start timer UI update (called when module is manually refreshed)
// Note: Timer intervals and refresh scheduling are managed by backend
function startTimer(moduleName) {
  const timer = timers[moduleName];
  if (!timer) return;
  timer.lastUpdate = Date.now();
  updateTimer(moduleName);
  if (timer.timer) clearInterval(timer.timer);
  timer.timer = setInterval(() => updateTimer(moduleName), 1000);
}

// Update timer status from WebSocket
function updateTimerStatus(timerStatus, timestamp) {
  if (!timerStatus) return;
  
  const now = timestamp ? timestamp * 1000 : Date.now();
  
  Object.keys(timerStatus).forEach(timerKey => {
    const status = timerStatus[timerKey];
    
    // Ensure timer exists
    if (!timers[timerKey]) {
      timers[timerKey] = {interval: 5000, lastUpdate: 0, timer: null};
    }
    
    const timer = timers[timerKey];
    
    // Update interval if it changed
    if (status.interval) {
      timer.interval = status.interval * 1000; // Convert to milliseconds
    }
    
    // Update lastUpdate based on elapsed time
    if (status.elapsed !== undefined && status.lastRefresh) {
      const lastRefreshMs = status.lastRefresh * 1000;
      timer.lastUpdate = now - (status.elapsed * 1000);
    }
    
    // Start the timer UI update interval if not already running
    if (!timer.timer) {
      timer.timer = setInterval(() => updateTimer(timerKey), 1000);
    }
    
    // Update the timer UI
    updateTimer(timerKey);
  });
}

// formatBytes and fmtUptime removed - backend always provides formatted values

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function isModalOpen() {
  const modals = document.querySelectorAll('.modal-overlay');
  for (const modal of modals) {
    if (modal.classList.contains('active') ||
        (modal.style.display && modal.style.display !== 'none')) {
      return true;
    }
  }
  return false;
}

// Fetch with timeout wrapper
function fetchWithTimeout(url, options = {}, timeout = 5000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    if (window.debugLog) window.debugLog('core', 'fetchWithTimeout: Aborting request to', url, 'after', timeout, 'ms');
    controller.abort();
  }, timeout);

  return fetch(url, {
    ...options,
    signal: controller.signal
  })
    .then((response) => {
      clearTimeout(timeoutId);
      if (window.debugLog) window.debugLog('core', 'fetchWithTimeout: Request succeeded to', url);
      return response;
    })
    .catch((error) => {
      clearTimeout(timeoutId);
      if (window.debugLog) window.debugLog('core', 'fetchWithTimeout: Request failed to', url, error.name, error.message);
      throw error;
    });
}

// Storage sync queue for failed backend syncs
const storageSyncQueue = [];
let storageSyncInProgress = false;

// Sync status tracking
let syncStatus = {
  state: 'idle', // 'idle', 'syncing', 'success', 'error', 'offline'
  lastSync: null,
  errorCount: 0,
  pendingCount: 0
};

// Update sync status indicator
function updateSyncStatusIndicator() {
  const statusEl = document.getElementById('syncStatus');
  if (!statusEl) return;

  const iconEl = statusEl.querySelector('.sync-icon');
  const textEl = statusEl.querySelector('.sync-text');

  if (!iconEl) return;

  // Hide text element, only show icon
  if (textEl) {
    textEl.style.display = 'none';
  }

  statusEl.style.display = 'inline-flex';
  statusEl.style.alignItems = 'center';
  statusEl.style.cursor = 'help';

  let tooltip = '';
  let iconClass = '';
  let iconColor = '';

  switch (syncStatus.state) {
    case 'syncing':
      iconClass = 'sync-icon fas fa-sync fa-spin';
      iconColor = 'var(--accent)';
      tooltip = 'Syncing data to backend...';
      break;
    case 'success':
      iconClass = 'sync-icon fas fa-check-circle';
      iconColor = 'var(--success, #10b981)';
      tooltip = 'Data synced to backend successfully';
      // Hide after 2 seconds
      setTimeout(() => {
        if (syncStatus.state === 'success') {
          syncStatus.state = 'idle';
          updateSyncStatusIndicator();
        }
      }, 2000);
      break;
    case 'error':
      iconClass = 'sync-icon fas fa-exclamation-circle';
      iconColor = 'var(--error, #ef4444)';
      tooltip = `Sync error (${syncStatus.errorCount} failed). Data is saved locally and will sync when connection is restored.`;
      break;
    case 'offline':
      iconClass = 'sync-icon fas fa-wifi';
      iconColor = 'var(--warn, #f59e0b)';
      tooltip = 'Offline. Data is saved locally and will sync when connection is restored.';
      break;
    case 'idle':
    default:
      if (syncStatus.pendingCount > 0) {
        iconClass = 'sync-icon fas fa-clock';
        iconColor = 'var(--muted)';
        tooltip = `${syncStatus.pendingCount} sync operation(s) pending`;
      } else {
        // Show synced icon when idle (data is synced)
        iconClass = 'sync-icon fas fa-cloud-check';
        iconColor = 'var(--muted)';
        tooltip = 'Data synced to backend. All preferences and settings are backed up on the server.';
      }
      break;
  }

  iconEl.className = iconClass;
  iconEl.style.color = iconColor;
  statusEl.title = tooltip;
  
  // Only hide if idle with no pending operations (but we show the synced icon)
  if (syncStatus.state === 'idle' && syncStatus.pendingCount === 0) {
    // Keep it visible to show sync status
    statusEl.style.display = 'inline-flex';
  }
}

// Storage version metadata (tracks lastModified timestamp for each key)
function getStorageVersion(key) {
  try {
    const metaKey = key + '_meta';
    const meta = localStorage.getItem(metaKey);
    if (meta) {
      const parsed = JSON.parse(meta);
      return parsed.version || 0;
    }
  } catch (e) {
    if (window.debugError) window.debugError('core', 'Error getting storage version:', key, e);
  }
  return 0;
}

function setStorageVersion(key, version) {
  try {
    const metaKey = key + '_meta';
    const meta = {
      version: version,
      lastModified: Date.now()
    };
    localStorage.setItem(metaKey, JSON.stringify(meta));
  } catch (e) {
    if (window.debugError) window.debugError('core', 'Error setting storage version:', key, e);
  }
}

// Sync single key to backend (async, non-blocking)
function syncToBackend(key, value, version) {
  // Skip sync if backend sync is disabled
  const syncDisabled = window.loadFromStorage('backendSyncDisabled');
  if (syncDisabled === 'true' || syncDisabled === true) {
    return;
  }

  // Update status
  syncStatus.pendingCount++;
  if (syncStatus.state === 'idle') {
    syncStatus.state = 'syncing';
    updateSyncStatusIndicator();
  }

  const syncData = {
    key: key,
    value: value,
    version: version,
    timestamp: Date.now()
  };

  // Try to sync immediately
  fetch('/api/storage/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(syncData)
  })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      if (window.debugLog) window.debugLog('core', 'Synced to backend:', key, 'version:', version);
      // Update local version if backend returned a new version
      if (data.version && data.version > version) {
        setStorageVersion(key, data.version);
      }
      
      // Update status
      syncStatus.pendingCount = Math.max(0, syncStatus.pendingCount - 1);
      syncStatus.lastSync = Date.now();
      syncStatus.errorCount = 0;
      syncStatus.state = syncStatus.pendingCount > 0 ? 'syncing' : 'success';
      updateSyncStatusIndicator();
    })
    .catch(error => {
      if (window.debugError) window.debugError('core', 'Failed to sync to backend:', key, error);
      
      // Update status
      syncStatus.pendingCount = Math.max(0, syncStatus.pendingCount - 1);
      syncStatus.errorCount++;
      syncStatus.state = 'error';
      updateSyncStatusIndicator();
      
      // Queue for retry
      storageSyncQueue.push({ key, value, version, retries: 0 });
      // Try to process queue
      processStorageSyncQueue();
    });
}

// Process sync queue (retry failed syncs)
function processStorageSyncQueue() {
  if (storageSyncInProgress || storageSyncQueue.length === 0) {
    if (storageSyncQueue.length === 0 && syncStatus.pendingCount === 0) {
      syncStatus.state = syncStatus.errorCount > 0 ? 'error' : 'success';
      updateSyncStatusIndicator();
    }
    return;
  }

  storageSyncInProgress = true;
  syncStatus.state = 'syncing';
  updateSyncStatusIndicator();

  const item = storageSyncQueue.shift();

  // Max 3 retries
  if (item.retries >= 3) {
    if (window.debugError) window.debugError('core', 'Max retries reached for:', item.key);
    syncStatus.errorCount++;
    storageSyncInProgress = false;
    processStorageSyncQueue(); // Process next item
    return;
  }

  item.retries++;
  const syncData = {
    key: item.key,
    value: item.value,
    version: item.version,
    timestamp: Date.now()
  };

  fetch('/api/storage/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(syncData)
  })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      if (window.debugLog) window.debugLog('core', 'Retry sync succeeded:', item.key);
      syncStatus.errorCount = Math.max(0, syncStatus.errorCount - 1);
      syncStatus.lastSync = Date.now();
      storageSyncInProgress = false;
      processStorageSyncQueue(); // Process next item
    })
    .catch(error => {
      if (window.debugError) window.debugError('core', 'Retry sync failed:', item.key, error);
      syncStatus.errorCount++;
      // Re-queue with delay
      setTimeout(() => {
        storageSyncQueue.push(item);
        storageSyncInProgress = false;
        processStorageSyncQueue();
      }, 5000 * item.retries); // Exponential backoff
    });
}

// localStorage helpers with JSON support and backend sync
function saveToStorage(key, value) {
  try {
    // Save to localStorage first (immediate, local-first)
    // Always JSON stringify for consistency (handles objects, arrays, booleans, numbers, null)
    // Only store plain strings as-is to avoid double-stringifying
    if (typeof value === 'string') {
      localStorage.setItem(key, value);
    } else {
      // Object, array, boolean, number, null - JSON stringify
      localStorage.setItem(key, JSON.stringify(value));
    }

    // Update version (increment)
    const currentVersion = getStorageVersion(key);
    const newVersion = currentVersion + 1;
    setStorageVersion(key, newVersion);

    // Sync to backend (async, non-blocking)
    syncToBackend(key, value, newVersion);
  } catch (e) {
    if (window.debugError) window.debugError('core', 'Error saving to localStorage:', key, e);
  }
}

function loadFromStorage(key, defaultValue = null) {
  try {
    const value = localStorage.getItem(key);
    if (value === null) return defaultValue;
    // Try to parse as JSON, if fails return as string
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  } catch (e) {
    if (window.debugError) window.debugError('core', 'Error loading from localStorage:', key, e);
    return defaultValue;
  }
}

// Check backend for newer version and update if needed
async function syncFromBackend(key) {
  try {
    const response = await fetch(`/api/storage/get?key=${encodeURIComponent(key)}`);
    if (!response.ok) {
      return false; // Backend doesn't have this key or error
    }

    const data = await response.json();
    if (!data || !data.value) {
      return false; // No data from backend
    }

    const localVersion = getStorageVersion(key);
    const backendVersion = data.version || 0;

    // If backend has newer version, update localStorage
    if (backendVersion > localVersion) {
      if (window.debugLog) window.debugLog('core', 'Updating from backend:', key, 'local:', localVersion, 'backend:', backendVersion);
      
      // Use saveToStorage to maintain version tracking, but don't sync back (avoid loop)
      // Temporarily disable sync for this update
      const wasDisabled = window.loadFromStorage('backendSyncDisabled');
      if (!wasDisabled) {
        window.saveToStorage('backendSyncDisabled', 'true');
      }
      
      // Save to localStorage using our wrapper (but sync is disabled)
      if (typeof data.value === 'string') {
        localStorage.setItem(key, data.value);
      } else {
        localStorage.setItem(key, JSON.stringify(data.value));
      }
      
      // Update version
      setStorageVersion(key, backendVersion);
      
      // Re-enable sync if it wasn't disabled
      if (!wasDisabled) {
        localStorage.removeItem('backendSyncDisabled');
      }
      
      return true; // Updated
    }

    return false; // No update needed
  } catch (e) {
    if (window.debugError) window.debugError('core', 'Error syncing from backend:', key, e);
    return false;
  }
}

// Sync all keys from backend on initialization
async function syncAllFromBackend() {
  try {
    syncStatus.state = 'syncing';
    updateSyncStatusIndicator();

    const response = await fetch('/api/storage/get-all');
    if (!response.ok) {
      syncStatus.state = 'offline';
      updateSyncStatusIndicator();
      return;
    }

    const data = await response.json();
    if (!data || !data.items) {
      syncStatus.state = 'success';
      syncStatus.lastSync = Date.now();
      updateSyncStatusIndicator();
      return;
    }

    let updatedCount = 0;
    for (const item of data.items) {
      const localVersion = getStorageVersion(item.key);
      const backendVersion = item.version || 0;

      if (backendVersion > localVersion) {
        if (window.debugLog) window.debugLog('core', 'Updating from backend:', item.key);
        
        // Temporarily disable sync to avoid sync loop
        const wasDisabled = window.loadFromStorage('backendSyncDisabled');
        if (!wasDisabled) {
          window.saveToStorage('backendSyncDisabled', 'true');
        }
        
        // Save to localStorage
        if (typeof item.value === 'string') {
          localStorage.setItem(item.key, item.value);
        } else {
          localStorage.setItem(item.key, JSON.stringify(item.value));
        }
        
        // Update version
        setStorageVersion(item.key, backendVersion);
        
        // Re-enable sync if it wasn't disabled
        if (!wasDisabled) {
          localStorage.removeItem('backendSyncDisabled');
        }
        
        updatedCount++;
      }
    }

    if (updatedCount > 0 && window.debugLog) {
      window.debugLog('core', 'Synced', updatedCount, 'keys from backend');
    }

    syncStatus.state = 'success';
    syncStatus.lastSync = Date.now();
    syncStatus.errorCount = 0;
    updateSyncStatusIndicator();
  } catch (e) {
    if (window.debugError) window.debugError('core', 'Error syncing all from backend:', e);
    syncStatus.state = 'offline';
    syncStatus.errorCount++;
    updateSyncStatusIndicator();
  }
}

// Array manipulation helpers
function moveArrayItemUp(array, index) {
  if (index <= 0 || index >= array.length) return false;
  const temp = array[index];
  array[index] = array[index - 1];
  array[index - 1] = temp;
  return true;
}

function moveArrayItemDown(array, index) {
  if (index < 0 || index >= array.length - 1) return false;
  const temp = array[index];
  array[index] = array[index + 1];
  array[index + 1] = temp;
  return true;
}

function moveArrayItem(array, fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= array.length || toIndex < 0 || toIndex >= array.length) {
    return false;
  }
  const item = array.splice(fromIndex, 1)[0];
  array.splice(toIndex, 0, item);
  return true;
}

// Drag and drop setup for module lists
// Uses a shared draggedIndex variable stored on the list element
function setupDragAndDrop(item, index, array, onMove, onUpdate) {
  const list = item.closest('.module-list') || item.parentElement;
  if (!list._draggedIndex) {
    list._draggedIndex = null;
  }

  item.addEventListener('dragstart', (e) => {
    list._draggedIndex = index;
    item.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', item.innerHTML);
  });

  item.addEventListener('dragend', (e) => {
    item.classList.remove('dragging');
    if (list) {
      list.querySelectorAll('.module-item').forEach(i => {
        i.classList.remove('drag-over');
      });
    }
    list._draggedIndex = null;
  });

  item.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (list._draggedIndex !== null && list._draggedIndex !== index) {
      item.classList.add('drag-over');
    }
  });

  item.addEventListener('dragleave', (e) => {
    item.classList.remove('drag-over');
  });

  item.addEventListener('drop', (e) => {
    e.preventDefault();
    item.classList.remove('drag-over');
    if (list._draggedIndex !== null && list._draggedIndex !== index) {
      if (onMove) {
        onMove(list._draggedIndex, index);
      } else if (moveArrayItem(array, list._draggedIndex, index)) {
        if (onUpdate) onUpdate();
      }
    }
  });
}

// Setup move up/down buttons for module items
function setupMoveButtons(item, index, arrayLength, upBtnClass, downBtnClass, onMoveUp, onMoveDown) {
  const canMoveUp = index > 0;
  const canMoveDown = index < arrayLength - 1;

  const upBtn = item.querySelector('.' + upBtnClass);
  const downBtn = item.querySelector('.' + downBtnClass);

  if (upBtn && canMoveUp) {
    upBtn.addEventListener('click', () => {
      if (onMoveUp) onMoveUp(index);
    });
  }

  if (downBtn && canMoveDown) {
    downBtn.addEventListener('click', () => {
      if (onMoveDown) onMoveDown(index);
    });
  }
}

// Generic module list item renderer
function createModuleListItem(config) {
  const {
    index,
    icon = 'fa-circle',
    title,
    description = '',
    canMoveUp = false,
    canMoveDown = false,
    moveUpBtnClass = 'move-up-btn',
    moveDownBtnClass = 'move-down-btn',
    editBtnClass = 'edit-btn',
    deleteBtnClass = 'delete-btn',
    customContent = '',
    draggable = true
  } = config;

  const dragHandle = draggable ? `
    <div class="module-icon drag-handle" style="cursor: grab; color: var(--muted);" title="Drag to reorder">
      <i class="fas fa-grip-vertical"></i>
    </div>` : '';

  return `
    ${dragHandle}
    <div class="module-icon"><i class="fas ${icon}"></i></div>
    <div class="module-info">
      <div class="module-name">${title}</div>
      ${description ? `<div class="module-desc">${description}</div>` : ''}
    </div>
    <div class="module-controls">
      <button class="btn-small ${moveUpBtnClass}" data-index="${index}" ${!canMoveUp ? 'disabled' : ''} title="Move up">
        <i class="fas fa-arrow-up"></i>
      </button>
      <button class="btn-small ${moveDownBtnClass}" data-index="${index}" ${!canMoveDown ? 'disabled' : ''} title="Move down">
        <i class="fas fa-arrow-down"></i>
      </button>
      ${editBtnClass ? `<button class="btn-small ${editBtnClass}" data-index="${index}"><i class="fas fa-edit"></i></button>` : ''}
      ${deleteBtnClass ? `<button class="btn-small ${deleteBtnClass}" data-index="${index}"><i class="fas fa-trash"></i></button>` : ''}
      ${customContent}
    </div>
  `;
}

// Debug logging utility
function isDebugEnabled(module) {
  try {
    const debugPrefs = window.loadFromStorage('debugPrefs', {});
    return debugPrefs[module] === true;
  } catch (e) {
    return false;
  }
}

function debugLog(module, ...args) {
  if (isDebugEnabled(module)) {
    console.log(`[${module}]`, ...args);
  }
}

function debugError(module, ...args) {
  if (isDebugEnabled(module)) {
    console.error(`[${module}]`, ...args);
  }
}

// Sync debug preferences to IndexedDB for service worker access
function syncDebugPrefsToIndexedDB() {
  try {
    const debugPrefs = window.loadFromStorage('debugPrefs', {});
    const request = indexedDB.open('homepage-debug', 1);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('prefs')) {
        db.createObjectStore('prefs');
      }
    };
    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction(['prefs'], 'readwrite');
      const store = transaction.objectStore('prefs');
      store.put(debugPrefs, 'debugPrefs');
    };
  } catch (e) {
    // Ignore errors
  }
}

// Initialize IndexedDB and sync on load
if (typeof indexedDB !== 'undefined') {
  syncDebugPrefsToIndexedDB();
  // Also sync when debug preferences change
  const originalSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function(key, value) {
    originalSetItem.call(this, key, value);
    if (key === 'debugPrefs') {
      syncDebugPrefsToIndexedDB();
    }
  };
}

// Export to window
window.timers = timers;
window.updateTimer = updateTimer;
window.startTimer = startTimer;
window.updateTimerStatus = updateTimerStatus;
// formatBytes and fmtUptime removed - backend always provides formatted values
window.escapeHtml = escapeHtml;
window.isModalOpen = isModalOpen;
window.fetchWithTimeout = fetchWithTimeout;
window.saveToStorage = saveToStorage;
window.loadFromStorage = loadFromStorage;
window.syncFromBackend = syncFromBackend;
window.syncAllFromBackend = syncAllFromBackend;
window.getStorageVersion = getStorageVersion;
window.updateSyncStatusIndicator = updateSyncStatusIndicator;
window.moveArrayItemUp = moveArrayItemUp;
window.moveArrayItemDown = moveArrayItemDown;
window.moveArrayItem = moveArrayItem;
window.setupDragAndDrop = setupDragAndDrop;
window.setupMoveButtons = setupMoveButtons;
window.createModuleListItem = createModuleListItem;
window.isDebugEnabled = isDebugEnabled;
window.debugLog = debugLog;
window.debugError = debugError;
window.syncDebugPrefsToIndexedDB = syncDebugPrefsToIndexedDB;
