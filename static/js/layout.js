// Layout system and drag-and-drop (flat columns + per-module span)

const LAYOUT_MIN_COLS = 1;
const LAYOUT_MAX_COLS = 4;
const LAYOUT_DEFAULT_COLS = 3;

let moduleConfig = {};
let grid = null;
let draggedElement = null;

let layoutConfig = {
  maxWidth: 80,
  columns: LAYOUT_DEFAULT_COLS,
  modules: []
};

let moduleHeightModes = {};
let moduleHeightObserver = null;
let moduleResizeObserver = null;
let moduleHeightDebounceTimer = null;

const MODULE_HEIGHT_MODE_AUTO = 'auto';
const MODULE_HEIGHT_MODE_ONE_X = 'oneX';
const MODULE_HEIGHT_MODE_DOUBLE = 'double';
const MODULE_HEIGHT_MODE_FIT = 'fit';
const UNIVERSAL_CARD_DEFAULT_HEIGHT = 230;

async function loadModuleMetadata() {
  try {
    const res = await fetch("/api/modules", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      if (data.modules && typeof data.modules === 'object') {
        const converted = {};
        Object.keys(data.modules).forEach(key => {
          const mod = data.modules[key];
          converted[key] = {
            name: mod.name || mod.Name,
            icon: mod.icon || mod.Icon,
            desc: mod.desc || mod.Desc,
            hasTimer: mod.hasTimer !== undefined ? mod.hasTimer : (mod.HasTimer !== undefined ? mod.HasTimer : false),
            timerKey: mod.timerKey || mod.TimerKey,
            defaultInterval: mod.defaultInterval || mod.DefaultInterval,
            enabled: mod.enabled !== undefined ? mod.enabled : (mod.Enabled !== undefined ? mod.Enabled : true)
          };
        });
        moduleConfig = converted;
        window.moduleConfig = moduleConfig;
        return true;
      }
    }
  } catch (e) {
    if (window.debugError) window.debugError('layout', 'Error loading module metadata from backend:', e);
  }
  moduleConfig = {};
  window.moduleConfig = moduleConfig;
  return false;
}

function clampInt(v, min, max, fallback) {
  const n = parseInt(v, 10);
  if (isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function getDefaultSpanForCard(card) {
  if (!card) return 1;
  if (card.classList.contains('span-6')) return 2;
  return 1;
}

function normalizeLayoutConfig() {
  let changed = false;
  if (!layoutConfig || typeof layoutConfig !== 'object') {
    layoutConfig = { maxWidth: 80, columns: LAYOUT_DEFAULT_COLS, modules: [] };
    return true;
  }

  const mw = clampInt(layoutConfig.maxWidth, 1, 100, 80);
  if (layoutConfig.maxWidth !== mw) changed = true;
  layoutConfig.maxWidth = mw;

  const cols = clampInt(layoutConfig.columns, LAYOUT_MIN_COLS, LAYOUT_MAX_COLS, LAYOUT_DEFAULT_COLS);
  if (layoutConfig.columns !== cols) changed = true;
  layoutConfig.columns = cols;

  if (!Array.isArray(layoutConfig.modules)) {
    layoutConfig.modules = [];
    changed = true;
  }

  const normalizedModules = [];
  const seen = new Set();
  layoutConfig.modules.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const id = typeof entry.id === 'string' ? entry.id.trim() : '';
    if (!id || seen.has(id)) return;
    const span = clampInt(entry.span, 1, LAYOUT_MAX_COLS, 1);
    normalizedModules.push({ id, span });
    seen.add(id);
  });
  if (normalizedModules.length !== layoutConfig.modules.length) changed = true;
  layoutConfig.modules = normalizedModules;
  return changed;
}

function migrateLegacyRowsToModules(saved) {
  if (!saved || typeof saved !== 'object') return null;
  if (Array.isArray(saved.modules)) return saved;
  if (!Array.isArray(saved.rows)) return null;

  const modules = [];
  const seen = new Set();
  saved.rows.forEach(row => {
    if (!row || !Array.isArray(row.modules)) return;
    row.modules.forEach(slot => {
      if (Array.isArray(slot)) {
        slot.forEach(id => {
          if (typeof id === 'string' && id && !seen.has(id)) {
            modules.push({ id, span: 1 });
            seen.add(id);
          }
        });
      } else if (typeof slot === 'string' && slot && !seen.has(slot)) {
        modules.push({ id: slot, span: 1 });
        seen.add(slot);
      }
    });
  });

  return {
    maxWidth: saved.maxWidth,
    columns: LAYOUT_DEFAULT_COLS,
    modules
  };
}

function buildDefaultLayoutFromDom() {
  const cards = Array.from(document.querySelectorAll('#moduleGrid .card[data-module]'));
  const modules = [];
  const seen = new Set();
  cards.forEach(card => {
    const id = card.getAttribute('data-module');
    if (!id || seen.has(id)) return;
    modules.push({ id, span: getDefaultSpanForCard(card) });
    seen.add(id);
  });
  return {
    maxWidth: 80,
    columns: LAYOUT_DEFAULT_COLS,
    modules
  };
}

function loadLayoutConfig() {
  try {
    const saved = window.loadFromStorage('layoutConfig');
    if (saved) {
      layoutConfig = migrateLegacyRowsToModules(saved) || saved;
    } else {
      layoutConfig = buildDefaultLayoutFromDom();
    }
  } catch (e) {
    if (window.debugError) window.debugError('layout', 'Failed to load layout config:', e);
    layoutConfig = buildDefaultLayoutFromDom();
  }
  if (normalizeLayoutConfig()) {
    saveLayoutConfig();
  }
}

function saveLayoutConfig() {
  (async () => {
    try {
      if (window.alignLocalStorageVersionWithBackendKey) {
        await window.alignLocalStorageVersionWithBackendKey('layoutConfig');
      }
    } catch (e) {
      if (window.debugError) window.debugError('layout', 'Version align before layout save:', e);
    }
    try {
      window.saveToStorage('layoutConfig', layoutConfig);
    } catch (e) {
      if (window.debugError) window.debugError('layout', 'Failed to save layout config:', e);
    }
  })();
}

function loadModuleHeightModes() {
  try {
    const saved = window.loadFromStorage('moduleHeightModes');
    if (saved && typeof saved === 'object') {
      moduleHeightModes = saved;
    }
  } catch (e) {
    moduleHeightModes = {};
  }
}

function saveModuleHeightModes() {
  try {
    window.saveToStorage('moduleHeightModes', moduleHeightModes);
  } catch (e) {}
}

function getModuleHeightMode(moduleId) {
  const mode = moduleHeightModes[moduleId];
  if (
    mode === MODULE_HEIGHT_MODE_ONE_X ||
    mode === MODULE_HEIGHT_MODE_DOUBLE ||
    mode === MODULE_HEIGHT_MODE_AUTO ||
    mode === MODULE_HEIGHT_MODE_FIT
  ) {
    return mode;
  }
  // Backward compatibility with older stored value.
  if (mode === 'default') return MODULE_HEIGHT_MODE_ONE_X;
  return MODULE_HEIGHT_MODE_AUTO;
}

function setModuleHeightMode(moduleId, mode) {
  if (!moduleId) return;
  let normalized = mode;
  if (normalized === 'default') normalized = MODULE_HEIGHT_MODE_ONE_X;
  const nextMode = (
    normalized === MODULE_HEIGHT_MODE_ONE_X ||
    normalized === MODULE_HEIGHT_MODE_DOUBLE ||
    normalized === MODULE_HEIGHT_MODE_AUTO ||
    normalized === MODULE_HEIGHT_MODE_FIT
  ) ? normalized : MODULE_HEIGHT_MODE_AUTO;
  moduleHeightModes[moduleId] = nextMode;
  saveModuleHeightModes();
}

function ensureCardBodyWrapper(card) {
  if (!card) return null;
  let body = card.querySelector(':scope > .card-body-scroll');
  if (body) return body;
  const children = Array.from(card.children);
  const header = children.find(el => el.tagName === 'H3');
  body = document.createElement('div');
  body.className = 'card-body-scroll';
  children.forEach(child => {
    if (child !== header) {
      body.appendChild(child);
    }
  });
  card.appendChild(body);
  return body;
}

function getCardNaturalHeight(card, body) {
  if (!card || !body) return 0;
  const prevCardHeight = card.style.height;
  const prevCardMinHeight = card.style.minHeight;
  const prevCardMaxHeight = card.style.maxHeight;
  const prevBodyOverflowY = body.style.overflowY;
  const prevBodyOverflowX = body.style.overflowX;
  const prevBodyHeight = body.style.height;
  const prevBodyMaxHeight = body.style.maxHeight;
  const prevBodyFlex = body.style.flex;

  // Measure unconstrained "natural" height.
  card.style.height = 'auto';
  card.style.minHeight = '0px';
  card.style.maxHeight = 'none';
  body.style.overflowY = 'visible';
  body.style.overflowX = 'visible';
  body.style.height = 'auto';
  body.style.maxHeight = 'none';
  body.style.flex = '0 0 auto';

  // Force layout and then read full content height.
  const natural = Math.ceil(card.scrollHeight);

  // Restore styles before normal sizing pass continues.
  card.style.height = prevCardHeight;
  card.style.minHeight = prevCardMinHeight;
  card.style.maxHeight = prevCardMaxHeight;
  body.style.overflowY = prevBodyOverflowY;
  body.style.overflowX = prevBodyOverflowX;
  body.style.height = prevBodyHeight;
  body.style.maxHeight = prevBodyMaxHeight;
  body.style.flex = prevBodyFlex;

  return natural;
}

function getCardDefaultHeight(card, moduleId, naturalHeight) {
  return UNIVERSAL_CARD_DEFAULT_HEIGHT;
}

function applyModuleHeightForCard(card) {
  if (!card) return;
  const moduleId = card.getAttribute('data-module');
  if (!moduleId) return;
  const body = ensureCardBodyWrapper(card);
  if (!body) return;
  const naturalHeight = getCardNaturalHeight(card, body);
  const defaultHeight = getCardDefaultHeight(card, moduleId, naturalHeight);
  const maxHeight = defaultHeight * 2;
  const mode = getModuleHeightMode(moduleId);

  if (mode === MODULE_HEIGHT_MODE_FIT) {
    // True content-fit mode: do not set a measured fixed height.
    card.style.height = 'auto';
    card.style.minHeight = '0px';
    card.style.maxHeight = 'none';
    body.style.flex = '0 0 auto';
    body.style.overflowY = 'visible';
    body.style.overflowX = 'visible';
  } else {
    let targetHeight = naturalHeight;
    if (mode === MODULE_HEIGHT_MODE_ONE_X) {
      targetHeight = defaultHeight;
    } else if (mode === MODULE_HEIGHT_MODE_DOUBLE) {
      targetHeight = maxHeight;
    } else {
      targetHeight = Math.min(Math.max(naturalHeight, defaultHeight), maxHeight);
    }
    card.style.height = targetHeight + 'px';
    card.style.minHeight = defaultHeight + 'px';
    card.style.maxHeight = maxHeight + 'px';
    body.style.flex = '';
    // Todo keeps its own internal scroll container (#nextTodosList).
    if (moduleId === 'todo') {
      body.style.overflowY = 'hidden';
    } else {
      body.style.overflowY = naturalHeight > targetHeight ? 'auto' : 'hidden';
    }
    body.style.overflowX = 'hidden';
  }
}

function applyModuleHeights() {
  const cards = document.querySelectorAll('.card[data-module]');
  cards.forEach(card => applyModuleHeightForCard(card));
  applyPackedLayout();
}

function debouncedApplyModuleHeights() {
  if (moduleHeightDebounceTimer) {
    clearTimeout(moduleHeightDebounceTimer);
  }
  moduleHeightDebounceTimer = setTimeout(() => {
    applyModuleHeights();
  }, 120);
}

function applyPackedLayout() {
  if (!grid) {
    grid = document.getElementById('moduleGrid');
  }
  if (!grid) return;
  const slots = Array.from(grid.querySelectorAll(':scope > .layout-slot'));
  const cols = clampInt(layoutConfig.columns, LAYOUT_MIN_COLS, LAYOUT_MAX_COLS, LAYOUT_DEFAULT_COLS);
  const gap = 16;
  const gridWidth = grid.clientWidth;
  if (!gridWidth || slots.length === 0) return;

  const colWidth = (gridWidth - (cols - 1) * gap) / cols;
  const colHeights = Array(cols).fill(0);

  slots.forEach(slot => {
    const card = slot.querySelector(':scope > .card[data-module]');
    if (!card) return;
    const span = Math.min(cols, Math.max(1, clampInt(slot.dataset.span, 1, LAYOUT_MAX_COLS, 1)));

    let bestCol = 0;
    let bestY = Number.POSITIVE_INFINITY;
    for (let start = 0; start <= cols - span; start++) {
      const y = Math.max(...colHeights.slice(start, start + span));
      if (y < bestY) {
        bestY = y;
        bestCol = start;
      }
    }

    const x = bestCol * (colWidth + gap);
    const width = colWidth * span + gap * (span - 1);
    const height = Math.ceil(card.getBoundingClientRect().height);

    slot.style.position = 'absolute';
    slot.style.left = x + 'px';
    slot.style.top = bestY + 'px';
    slot.style.width = width + 'px';
    slot.style.height = height + 'px';

    const nextY = bestY + height + gap;
    for (let c = bestCol; c < bestCol + span; c++) {
      colHeights[c] = nextY;
    }
  });

  const tallest = Math.max(...colHeights, 0);
  grid.style.height = Math.max(0, tallest - gap) + 'px';
}

function setupModuleHeightObserver() {
  if (moduleHeightObserver) {
    moduleHeightObserver.disconnect();
  }
  if (moduleResizeObserver) {
    moduleResizeObserver.disconnect();
  }
  moduleHeightObserver = new MutationObserver(() => {
    debouncedApplyModuleHeights();
  });
  const gridEl = document.getElementById('moduleGrid');
  if (gridEl) {
    moduleHeightObserver.observe(gridEl, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['style', 'class']
    });
  }

  if (typeof ResizeObserver !== 'undefined') {
    moduleResizeObserver = new ResizeObserver(() => {
      debouncedApplyModuleHeights();
    });
    const cards = document.querySelectorAll('.card[data-module]');
    cards.forEach(card => {
      moduleResizeObserver.observe(card);
      const body = card.querySelector(':scope > .card-body-scroll');
      if (body) moduleResizeObserver.observe(body);
    });
  }
}

function getAllKnownModuleIds() {
  const ids = new Set();
  const cards = document.querySelectorAll('.card[data-module]');
  cards.forEach(card => {
    const moduleId = card.getAttribute('data-module');
    if (moduleId) ids.add(moduleId);
  });
  if (window.moduleConfig) {
    Object.keys(window.moduleConfig).forEach(id => ids.add(id));
  }
  return Array.from(ids);
}

function renderModuleHeightModesEditor() {
  const list = document.getElementById('moduleHeightModesList');
  if (!list) return;
  const moduleIds = getAllKnownModuleIds();
  moduleIds.sort((a, b) => getModuleName(a).localeCompare(getModuleName(b)));
  list.innerHTML = '';
  moduleIds.forEach(moduleId => {
    const row = document.createElement('div');
    row.className = 'pref-row';
    row.innerHTML = `
      <label>${getModuleName(moduleId)}</label>
      <select class="module-height-mode-select" data-module="${moduleId}">
        <option value="${MODULE_HEIGHT_MODE_AUTO}">Auto</option>
        <option value="${MODULE_HEIGHT_MODE_ONE_X}">1x</option>
        <option value="${MODULE_HEIGHT_MODE_DOUBLE}">2x</option>
        <option value="${MODULE_HEIGHT_MODE_FIT}">Fit</option>
      </select>
    `;
    const select = row.querySelector('select');
    select.value = getModuleHeightMode(moduleId);
    select.addEventListener('change', () => {
      setModuleHeightMode(moduleId, select.value);
      applyModuleHeights();
    });
    list.appendChild(row);
  });
}

function bindModuleHeightModeBulkControls() {
  const modeSelect = document.getElementById('moduleHeightModeAll');
  const applyBtn = document.getElementById('applyModuleHeightModeAllBtn');
  if (!modeSelect || !applyBtn || applyBtn.dataset.bound === '1') return;
  applyBtn.dataset.bound = '1';

  applyBtn.addEventListener('click', () => {
    const mode = modeSelect.value;
    const moduleIds = getAllKnownModuleIds();
    moduleIds.forEach(moduleId => {
      setModuleHeightMode(moduleId, mode);
    });
    renderModuleHeightModesEditor();
    applyModuleHeights();
  });
}

function getModuleHeightModeSelectHtml(moduleId) {
  const mode = getModuleHeightMode(moduleId);
  const span = getModuleSpan(moduleId);
  return `
    <div class="module-layout-controls">
      <select class="module-height-mode-select" data-module="${moduleId}" title="Card height mode">
        <option value="${MODULE_HEIGHT_MODE_AUTO}" ${mode === MODULE_HEIGHT_MODE_AUTO ? 'selected' : ''}>Auto</option>
        <option value="${MODULE_HEIGHT_MODE_ONE_X}" ${mode === MODULE_HEIGHT_MODE_ONE_X ? 'selected' : ''}>1x</option>
        <option value="${MODULE_HEIGHT_MODE_DOUBLE}" ${mode === MODULE_HEIGHT_MODE_DOUBLE ? 'selected' : ''}>2x</option>
        <option value="${MODULE_HEIGHT_MODE_FIT}" ${mode === MODULE_HEIGHT_MODE_FIT ? 'selected' : ''}>Fit</option>
      </select>
      <select class="module-span-select" data-module="${moduleId}" title="Card span">
        <option value="1" ${span === 1 ? 'selected' : ''}>Span 1</option>
        <option value="2" ${span === 2 ? 'selected' : ''}>Span 2</option>
        <option value="3" ${span === 3 ? 'selected' : ''}>Span 3</option>
        <option value="4" ${span === 4 ? 'selected' : ''}>Span 4</option>
      </select>
    </div>
  `;
}

/** Remove a module id from all layout slots (including split columns). Returns true if layout changed. */
function removeModuleFromLayout(moduleId) {
  if (!moduleId || !Array.isArray(layoutConfig.modules)) return false;
  const before = layoutConfig.modules.length;
  layoutConfig.modules = layoutConfig.modules.filter(entry => entry && entry.id !== moduleId);
  return before !== layoutConfig.modules.length;
}

// Helper function to check if a module is enabled
function isModuleEnabled(moduleId) {
  if (!moduleId) return false;
  if (window.moduleConfig && window.moduleConfig[moduleId]) {
    return window.moduleConfig[moduleId].enabled !== false;
  }
  return true; // Default to enabled if not in config
}

// Clean up layout config: remove disabled/non-visible modules
function cleanupLayoutConfig() {
  if (!Array.isArray(layoutConfig.modules)) return false;
  let changed = false;
  if (typeof window.shouldSnmpOccupyLayout === 'function' && !window.shouldSnmpOccupyLayout()) {
    if (removeModuleFromLayout('snmp')) {
      changed = true;
    }
  }
  if (typeof window.shouldMonitoringOccupyLayout === 'function' && !window.shouldMonitoringOccupyLayout()) {
    if (removeModuleFromLayout('monitoring')) {
      changed = true;
    }
  }
  const before = layoutConfig.modules.length;
  layoutConfig.modules = layoutConfig.modules.filter(entry => {
    return entry && entry.id && isModuleEnabled(entry.id);
  });
  if (before !== layoutConfig.modules.length) changed = true;
  return changed;
}

function renderLayout() {
  const gridEl = document.getElementById('moduleGrid');
  if (!gridEl) return;
  grid = gridEl;

  if (normalizeLayoutConfig()) saveLayoutConfig();
  if (cleanupLayoutConfig()) saveLayoutConfig();

  const allCards = Array.from(document.querySelectorAll('.card[data-module]'));
  const cardsMap = new Map();
  allCards.forEach(card => {
    const id = card.getAttribute('data-module');
    if (!id || cardsMap.has(id)) return;
    const enabled = window.moduleConfig && window.moduleConfig[id] ? window.moduleConfig[id].enabled !== false : true;
    if (enabled) cardsMap.set(id, card);
  });

  // Ensure layout includes all currently enabled cards.
  const present = new Set(layoutConfig.modules.map(m => m.id));
  cardsMap.forEach((card, id) => {
    if (!present.has(id)) {
      layoutConfig.modules.push({ id, span: getDefaultSpanForCard(card) });
    }
  });

  grid.innerHTML = '';
  grid.className = 'layout-grid';

  layoutConfig.modules.forEach(entry => {
    if (!entry || !entry.id) return;
    const card = cardsMap.get(entry.id);
    if (!card) return;
    const span = Math.min(layoutConfig.columns, Math.max(1, clampInt(entry.span, 1, LAYOUT_MAX_COLS, 1)));
    const slot = document.createElement('div');
    slot.className = 'layout-slot';
    slot.dataset.module = entry.id;
    slot.dataset.span = String(span);
    slot.innerHTML = `
      <div class="insert-drop-zone insert-before" data-target="${entry.id}" data-where="before"></div>
      <div class="insert-drop-zone insert-after" data-target="${entry.id}" data-where="after"></div>
    `;
    card.style.height = 'auto';
    slot.appendChild(card);
    grid.appendChild(slot);
    cardsMap.delete(entry.id);
  });

  // Fallback append for anything that still exists.
  cardsMap.forEach((card, id) => {
    const slot = document.createElement('div');
    slot.className = 'layout-slot';
    slot.dataset.module = id;
    slot.dataset.span = '1';
    slot.innerHTML = `
      <div class="insert-drop-zone insert-before" data-target="${id}" data-where="before"></div>
      <div class="insert-drop-zone insert-after" data-target="${id}" data-where="after"></div>
    `;
    grid.appendChild(slot);
    slot.appendChild(card);
    if (!layoutConfig.modules.some(m => m.id === id)) {
      layoutConfig.modules.push({ id, span: 1 });
    }
  });

  const mainContainer = document.getElementById('mainContainer');
  if (mainContainer) mainContainer.style.maxWidth = layoutConfig.maxWidth + '%';

  saveLayoutConfig();
  initDragAndDrop();
  requestAnimationFrame(() => {
    applyModuleHeights();
    setTimeout(() => applyModuleHeights(), 200);
    setupModuleHeightObserver();
    renderModuleHeightModesEditor();
  });
}

function adjustRowHeights() {
  applyModuleHeights();
}

function setupCardResizeObserver() {
  setupModuleHeightObserver();
}

function getModuleName(moduleId) {
  if (moduleConfig[moduleId]) return moduleConfig[moduleId].name;
  if (moduleId && moduleId.startsWith('github-')) {
    const m = window.githubModules ? window.githubModules.find(x => x.id === moduleId) : null;
    if (m) return m.name;
  }
  if (moduleId && moduleId.startsWith('rss-')) {
    const m = window.rssModules ? window.rssModules.find(x => x.id === moduleId) : null;
    if (m) return m.name || 'RSS Feed';
  }
  if (moduleId && moduleId.startsWith('disk-')) {
    const m = window.diskModules ? window.diskModules.find(x => x.id === moduleId) : null;
    if (m) return m.mountPoint === '/' ? 'Disk' : `Disk ${m.mountPoint}`;
  }
  return moduleId || 'Empty';
}

function setModuleSpan(moduleId, span) {
  const entry = layoutConfig.modules.find(m => m.id === moduleId);
  if (!entry) return;
  entry.span = clampInt(span, 1, LAYOUT_MAX_COLS, 1);
}

function getModuleSpan(moduleId) {
  const entry = layoutConfig.modules.find(m => m.id === moduleId);
  if (!entry) return 1;
  return clampInt(entry.span, 1, LAYOUT_MAX_COLS, 1);
}

function renderLayoutEditor() {
  const editor = document.getElementById('layoutEditor');
  if (!editor) return;
  editor.innerHTML = '';

  const ids = layoutConfig.modules.map(m => m.id).filter(Boolean);
  ids.sort((a, b) => getModuleName(a).localeCompare(getModuleName(b)));

  ids.forEach(moduleId => {
    const entry = layoutConfig.modules.find(m => m.id === moduleId);
    if (!entry) return;
    const row = document.createElement('div');
    row.className = 'layout-row-editor';
    row.innerHTML = `
      <div class="layout-row-controls">
        <span>${getModuleName(moduleId)}</span>
        <select class="module-span-select" data-module="${moduleId}" title="Module span">
          <option value="1" ${entry.span === 1 ? 'selected' : ''}>Span 1</option>
          <option value="2" ${entry.span === 2 ? 'selected' : ''}>Span 2</option>
          <option value="3" ${entry.span === 3 ? 'selected' : ''}>Span 3</option>
          <option value="4" ${entry.span === 4 ? 'selected' : ''}>Span 4</option>
        </select>
      </div>
    `;
    const select = row.querySelector('.module-span-select');
    select.addEventListener('change', (e) => {
      setModuleSpan(moduleId, parseInt(e.target.value, 10));
      saveLayoutConfig();
      renderLayout();
      renderLayoutEditor();
    });
    editor.appendChild(row);
  });

  renderModuleHeightModesEditor();
}

function bindLayoutMaxWidthSelectDelegated() {
  if (window._layoutMaxWidthDelegatedBound) return;
  window._layoutMaxWidthDelegatedBound = true;
  function applyFromSelect(sel) {
    if (!sel || sel.id !== 'layoutMaxWidth') return;
    layoutConfig.maxWidth = clampInt(sel.value, 1, 100, 80);
    saveLayoutConfig();
    renderLayout();
  }
  document.addEventListener('change', function(e) {
    if (e.target && e.target.id === 'layoutMaxWidth') applyFromSelect(e.target);
  });
  document.addEventListener('input', function(e) {
    if (e.target && e.target.id === 'layoutMaxWidth') applyFromSelect(e.target);
  });
}

function bindLayoutColumnsSelectDelegated() {
  if (window._layoutColumnsDelegatedBound) return;
  window._layoutColumnsDelegatedBound = true;
  function applyFromSelect(sel) {
    if (!sel || sel.id !== 'layoutColumns') return;
    layoutConfig.columns = clampInt(sel.value, LAYOUT_MIN_COLS, LAYOUT_MAX_COLS, LAYOUT_DEFAULT_COLS);
    // Clamp spans to selected columns.
    layoutConfig.modules.forEach(entry => {
      entry.span = Math.min(layoutConfig.columns, clampInt(entry.span, 1, LAYOUT_MAX_COLS, 1));
    });
    saveLayoutConfig();
    renderLayout();
    renderLayoutEditor();
  }
  document.addEventListener('change', function(e) {
    if (e.target && e.target.id === 'layoutColumns') applyFromSelect(e.target);
  });
}

function initLayoutEditor() {
  bindLayoutMaxWidthSelectDelegated();
  bindLayoutColumnsSelectDelegated();

  const maxWidthSelect = document.getElementById('layoutMaxWidth');
  if (maxWidthSelect) maxWidthSelect.value = String(layoutConfig.maxWidth);

  const colsSelect = document.getElementById('layoutColumns');
  if (colsSelect) colsSelect.value = String(layoutConfig.columns);
}

function bindModuleSpanSelectDelegated() {
  if (window._moduleSpanDelegatedBound) return;
  window._moduleSpanDelegatedBound = true;
  document.addEventListener('change', function(e) {
    const sel = e.target;
    if (!sel || !sel.classList || !sel.classList.contains('module-span-select')) return;
    const moduleId = sel.getAttribute('data-module');
    if (!moduleId) return;
    setModuleSpan(moduleId, parseInt(sel.value, 10));
    saveLayoutConfig();
    renderLayout();
    if (window.layoutSystem && window.layoutSystem.renderLayoutEditor) {
      window.layoutSystem.renderLayoutEditor();
    }
  });
}

function reorderByModuleId(sourceId, targetId) {
  if (!sourceId || !targetId || sourceId === targetId) return false;
  const srcIndex = layoutConfig.modules.findIndex(m => m.id === sourceId);
  const dstIndex = layoutConfig.modules.findIndex(m => m.id === targetId);
  if (srcIndex === -1 || dstIndex === -1) return false;
  const [item] = layoutConfig.modules.splice(srcIndex, 1);
  const nextIndex = srcIndex < dstIndex ? dstIndex : dstIndex;
  layoutConfig.modules.splice(nextIndex, 0, item);
  return true;
}

function swapModulePositions(sourceId, targetId) {
  if (!sourceId || !targetId || sourceId === targetId) return false;
  const srcIndex = layoutConfig.modules.findIndex(m => m.id === sourceId);
  const dstIndex = layoutConfig.modules.findIndex(m => m.id === targetId);
  if (srcIndex === -1 || dstIndex === -1) return false;
  const tmp = layoutConfig.modules[srcIndex];
  layoutConfig.modules[srcIndex] = layoutConfig.modules[dstIndex];
  layoutConfig.modules[dstIndex] = tmp;
  return true;
}

function insertModuleRelative(sourceId, targetId, placeBefore) {
  if (!sourceId || !targetId || sourceId === targetId) return false;
  const srcIndex = layoutConfig.modules.findIndex(m => m.id === sourceId);
  const dstIndex = layoutConfig.modules.findIndex(m => m.id === targetId);
  if (srcIndex === -1 || dstIndex === -1) return false;
  const [item] = layoutConfig.modules.splice(srcIndex, 1);
  const targetIndexAfterRemoval = layoutConfig.modules.findIndex(m => m.id === targetId);
  if (targetIndexAfterRemoval === -1) return false;
  const insertIndex = placeBefore ? targetIndexAfterRemoval : targetIndexAfterRemoval + 1;
  layoutConfig.modules.splice(insertIndex, 0, item);
  return true;
}

function clearDragOrderOverlay() {
  if (!grid) return;
  const badges = grid.querySelectorAll('.drag-order-badge');
  badges.forEach(b => b.remove());
}

function renderDragOrderOverlay() {
  if (!grid) return;
  clearDragOrderOverlay();
  const slots = Array.from(grid.querySelectorAll(':scope > .layout-slot'));
  const gridRect = grid.getBoundingClientRect();
  const slotWithPos = slots
    .map((slot, domIndex) => {
      const card = slot.querySelector(':scope > .card[data-module]');
      if (!card) return null;
      const rect = slot.getBoundingClientRect();
      const style = window.getComputedStyle(card);
      const visible =
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        rect.width > 1 &&
        rect.height > 1;
      if (!visible) return null;
      return {
        slot,
        domIndex,
        top: rect.top - gridRect.top,
        left: rect.left - gridRect.left
      };
    })
    .filter(Boolean);

  // Visual reading order: top-to-bottom, then left-to-right.
  // Small tolerance avoids unstable ordering from sub-pixel/rounding noise.
  const TOP_TOLERANCE_PX = 4;
  slotWithPos.sort((a, b) => {
    const dy = a.top - b.top;
    if (Math.abs(dy) > TOP_TOLERANCE_PX) return dy;
    const dx = a.left - b.left;
    if (Math.abs(dx) > 1) return dx;
    return a.domIndex - b.domIndex;
  });

  slotWithPos.forEach((entry, idx) => {
    const badge = document.createElement('div');
    badge.className = 'drag-order-badge';
    badge.textContent = String(idx + 1);
    entry.slot.appendChild(badge);
  });
}

function initDragAndDrop() {
  if (!grid) grid = document.getElementById('moduleGrid');
  if (!grid) return;
  const cards = Array.from(grid.querySelectorAll('.card[data-module]'));
  cards.forEach(card => {
    if (card.dataset.dragInitialized === 'true') return;
    card.dataset.dragInitialized = 'true';

    card.addEventListener('dragstart', function(e) {
      const target = e.target;
      if (target.classList.contains('drag-handle') || target.closest('.drag-handle')) {
        // Allow dragging
      } else if (target.classList.contains('timer-circle') ||
          target.closest('.timer-circle') ||
          target.tagName === 'A' ||
          target.closest('a') ||
          target.tagName === 'BUTTON' ||
          target.closest('button')) {
        e.preventDefault();
        return false;
      }

      draggedElement = this;
      this.style.opacity = '0.5';
      grid.classList.add('dragging-active');
      renderDragOrderOverlay();
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', this.getAttribute('data-module') || '');
    });

    card.addEventListener('dragend', function() {
      this.style.opacity = '1';
      grid.classList.remove('dragging-active');
      const allCards = Array.from(grid.querySelectorAll('.card[data-module]'));
      allCards.forEach(c => c.classList.remove('drag-over'));
      const allZones = Array.from(grid.querySelectorAll('.insert-drop-zone'));
      allZones.forEach(z => z.classList.remove('drag-over'));
      clearDragOrderOverlay();
      draggedElement = null;
    });

    card.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (draggedElement && this !== draggedElement) {
        this.classList.add('drag-over');
      }
      return false;
    });

    card.addEventListener('dragleave', function() {
      this.classList.remove('drag-over');
    });

    card.addEventListener('drop', function(e) {
      e.preventDefault();
      e.stopPropagation();
      this.classList.remove('drag-over');

      if (draggedElement && this !== draggedElement) {
        const draggedModuleId = draggedElement.getAttribute('data-module');
        const targetModuleId = this.getAttribute('data-module');
        if (swapModulePositions(draggedModuleId, targetModuleId)) {
          saveLayoutConfig();
          renderLayout();
          renderLayoutEditor();
        }
      }

      return false;
    });
  });

  const timerCircles = grid.querySelectorAll('.timer-circle');
  timerCircles.forEach(timer => {
    if (timer.dataset.layoutTimerDndGuard === '1') return;
    timer.dataset.layoutTimerDndGuard = '1';

    timer.addEventListener('mousedown', function(e) {
      e.stopPropagation();
    });
    timer.addEventListener('dragstart', function(e) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    });
  });

  const insertZones = Array.from(grid.querySelectorAll('.insert-drop-zone'));
  insertZones.forEach(zone => {
    if (zone.dataset.layoutInsertBound === '1') return;
    zone.dataset.layoutInsertBound = '1';

    zone.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.stopPropagation();
      if (!draggedElement) return;
      this.classList.add('drag-over');
      e.dataTransfer.dropEffect = 'move';
    });

    zone.addEventListener('dragleave', function() {
      this.classList.remove('drag-over');
    });

    zone.addEventListener('drop', function(e) {
      e.preventDefault();
      e.stopPropagation();
      this.classList.remove('drag-over');
      if (!draggedElement) return;
      const sourceId = draggedElement.getAttribute('data-module');
      const targetId = this.dataset.target;
      const where = this.dataset.where;
      if (!sourceId || !targetId || !where) return;
      if (insertModuleRelative(sourceId, targetId, where === 'before')) {
        saveLayoutConfig();
        renderLayout();
        renderLayoutEditor();
      }
    });
  });
}

function initLayout() {
  grid = document.getElementById('moduleGrid');
  if (!grid) {
    if (window.debugError) window.debugError('layout', 'moduleGrid not found');
    return;
  }

  bindLayoutMaxWidthSelectDelegated();
  loadModuleHeightModes();
  bindModuleSpanSelectDelegated();

  loadLayoutConfig();
  setTimeout(() => {
    renderLayout();
    renderLayoutEditor();
    initLayoutEditor();
    // Apply module visibility after layout is rendered
    if (window.applyModuleVisibility) {
      window.applyModuleVisibility();
    }
  }, 100);

  if (!window._layoutPackedResizeBound) {
    window._layoutPackedResizeBound = true;
    let resizeDebounce = null;
    window.addEventListener('resize', () => {
      if (resizeDebounce) clearTimeout(resizeDebounce);
      resizeDebounce = setTimeout(() => {
        applyPackedLayout();
      }, 80);
    });
  }
}

// Expose to window
window.moduleConfig = moduleConfig;
window.loadModuleMetadata = loadModuleMetadata;
window.layoutSystem = {
  renderLayout,
  renderLayoutEditor,
  renderModuleHeightModesEditor,
  getModuleHeightMode,
  setModuleHeightMode,
  getModuleHeightModeSelectHtml,
  getModuleSpan,
  applyModuleHeights,
  saveLayoutConfig,
  cleanupLayoutConfig,
  adjustRowHeights,
  removeModuleFromLayout,
  getLayoutConfig: () => layoutConfig
};
window.initDragAndDrop = initDragAndDrop;
window.initLayout = initLayout;
window.cleanupLayoutConfig = cleanupLayoutConfig;
window.adjustRowHeights = adjustRowHeights;
