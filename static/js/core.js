// Core utilities and timer management

// Timer management
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

function startTimer(moduleName) {
  const timer = timers[moduleName];
  if (!timer) return;
  timer.lastUpdate = Date.now();
  updateTimer(moduleName);
  if (timer.timer) clearInterval(timer.timer);
  timer.timer = setInterval(() => updateTimer(moduleName), 1000);
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(2) + " " + sizes[i];
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function fmtUptime(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  let parts = [];
  if (d) parts.push(d + "d");
  if (h) parts.push(h + "h");
  if (m) parts.push(m + "m");
  if (s || parts.length === 0) parts.push(s + "s");
  return parts.join(" ");
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

// localStorage helpers with JSON support
function saveToStorage(key, value) {
  try {
    if (typeof value === 'object' || Array.isArray(value)) {
      localStorage.setItem(key, JSON.stringify(value));
    } else {
      localStorage.setItem(key, value);
    }
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
    const debugPrefs = JSON.parse(localStorage.getItem('debugPrefs') || '{}');
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
    const debugPrefs = JSON.parse(localStorage.getItem('debugPrefs') || '{}');
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
window.formatBytes = formatBytes;
window.escapeHtml = escapeHtml;
window.fmtUptime = fmtUptime;
window.isModalOpen = isModalOpen;
window.fetchWithTimeout = fetchWithTimeout;
window.saveToStorage = saveToStorage;
window.loadFromStorage = loadFromStorage;
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
