// Layout system and drag-and-drop

/** Default modules per row when packing from DOM, overflow rows, and new rows (layout editor still allows 4+). */
const LAYOUT_DEFAULT_COLS = 3;

// Module configuration - loaded from backend API
let moduleConfig = {};

// Load module metadata from backend API
async function loadModuleMetadata() {
  try {
    const res = await fetch("/api/modules", {cache:"no-store"});
    if (res.ok) {
      const data = await res.json();
      if (data.modules && typeof data.modules === 'object') {
        // Convert backend format to frontend format (camelCase)
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

  // Fallback: use empty object if backend fails
  moduleConfig = {};
  window.moduleConfig = moduleConfig;
  return false;
}

let layoutConfig = {
  maxWidth: 80,
  rows: []
};

/** Bumped on every renderLayout; stale /api/layout/process responses must not overwrite newer edits. */
let layoutProcessGeneration = 0;

/**
 * Older saves omitted maxWidth; JSON then decoded as 0 on the server and overwrote the client with 0.
 * Keep maxWidth in 1–100 and rows as an array.
 * @param {number|string|undefined} prevMaxHint  Value to reuse when current maxWidth is invalid (e.g. before API merge).
 * @returns {boolean} true if layoutConfig was modified
 */
function ensureLayoutDefaults(prevMaxHint) {
  let changed = false;
  if (!layoutConfig || typeof layoutConfig !== 'object') {
    layoutConfig = { maxWidth: 80, rows: [] };
    return true;
  }
  const rawMw = layoutConfig.maxWidth;
  let mw = parseInt(rawMw, 10);
  if (isNaN(mw) || mw < 1 || mw > 100) {
    const hint = parseInt(prevMaxHint, 10);
    mw = !isNaN(hint) && hint >= 1 && hint <= 100 ? hint : 80;
    changed = true;
  }
  layoutConfig.maxWidth = mw;
  if (!Array.isArray(layoutConfig.rows)) {
    layoutConfig.rows = [{ cols: LAYOUT_DEFAULT_COLS, modules: [] }];
    changed = true;
  }
  return changed;
}

/** Ensure each row.cols is valid and modules[] length matches cols (fixes API/local mangling). */
function normalizeLayoutRowDimensions() {
  if (!layoutConfig || !Array.isArray(layoutConfig.rows)) return false;
  let changed = false;
  layoutConfig.rows.forEach(function(row) {
    if (!Array.isArray(row.modules)) {
      row.modules = [];
      changed = true;
    }
    let cols = parseInt(row.cols, 10);
    const mlen = row.modules.length;
    if (isNaN(cols) || cols < 1 || cols > 12) {
      cols = Math.min(12, Math.max(mlen || 1, 1));
      changed = true;
    }
    if (mlen > cols) {
      cols = Math.min(12, mlen);
      changed = true;
    }
    if (row.cols !== cols) {
      changed = true;
    }
    row.cols = cols;
    while (row.modules.length < cols) {
      row.modules.push(null);
      changed = true;
    }
    if (row.modules.length > cols) {
      row.modules = row.modules.slice(0, cols);
      changed = true;
    }
  });
  return changed;
}

function loadLayoutConfig() {
  try {
    const saved = window.loadFromStorage('layoutConfig');
    if (saved) {
      layoutConfig = saved;
    } else {
      initializeDefaultLayout();
    }
  } catch (e) {
    if (window.debugError) window.debugError('layout', 'Failed to load layout config:', e);
    initializeDefaultLayout();
  }
  const e = ensureLayoutDefaults();
  const n = normalizeLayoutRowDimensions();
  if (e || n) {
    saveLayoutConfig();
  }
}

function initializeDefaultLayout() {
  const grid = document.getElementById('moduleGrid');
  if (!grid) return;

  const cards = Array.from(grid.querySelectorAll('.card[data-module]'));
  layoutConfig.rows = [];
  let currentRow = { cols: LAYOUT_DEFAULT_COLS, modules: [] };

  cards.forEach((card) => {
    const moduleId = card.getAttribute('data-module');
    if (moduleId) {
      currentRow.modules.push(moduleId);
      if (card.classList.contains('span-6') || currentRow.modules.length >= LAYOUT_DEFAULT_COLS) {
        if (card.classList.contains('span-6')) {
          currentRow.cols = 2;
        }
        layoutConfig.rows.push(currentRow);
        currentRow = { cols: LAYOUT_DEFAULT_COLS, modules: [] };
      }
    }
  });

  if (currentRow.modules.length > 0) {
    layoutConfig.rows.push(currentRow);
  }

  if (layoutConfig.rows.length === 0) {
    layoutConfig.rows = [{ cols: LAYOUT_DEFAULT_COLS, modules: [] }];
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

/** Remove a module id from all layout slots (including split columns). Returns true if layout changed. */
function removeModuleFromLayout(moduleId) {
  if (!moduleId || !layoutConfig.rows) return false;
  let changed = false;
  layoutConfig.rows.forEach(row => {
    if (!row.modules) return;
    for (let i = 0; i < row.modules.length; i++) {
      const slot = row.modules[i];
      if (Array.isArray(slot)) {
        let touched = false;
        if (slot[0] === moduleId) {
          slot[0] = null;
          touched = true;
        }
        if (slot[1] === moduleId) {
          slot[1] = null;
          touched = true;
        }
        if (touched) {
          changed = true;
          if (!slot[0] && !slot[1]) {
            row.modules[i] = null;
          } else if (slot[0] && !slot[1]) {
            row.modules[i] = slot[0];
          } else if (!slot[0] && slot[1]) {
            row.modules[i] = slot[1];
          }
        }
      } else if (slot === moduleId) {
        row.modules[i] = null;
        changed = true;
      }
    }
  });
  return changed;
}

// Helper function to check if a module is enabled
function isModuleEnabled(moduleId) {
  if (!moduleId) return false;
  if (window.moduleConfig && window.moduleConfig[moduleId]) {
    return window.moduleConfig[moduleId].enabled !== false;
  }
  return true; // Default to enabled if not in config
}

// Clean up layout config: replace disabled modules with null, remove empty rows
function cleanupLayoutConfig() {
  if (!layoutConfig.rows || layoutConfig.rows.length === 0) return false;

  let changed = false;

  // SNMP: no layout slot when the card is not shown (module off or no enabled queries)
  if (typeof window.shouldSnmpOccupyLayout === 'function' && !window.shouldSnmpOccupyLayout()) {
    if (removeModuleFromLayout('snmp')) {
      changed = true;
    }
  }

  // Monitoring: no layout slot when the module is off or there are no services
  if (typeof window.shouldMonitoringOccupyLayout === 'function' && !window.shouldMonitoringOccupyLayout()) {
    if (removeModuleFromLayout('monitoring')) {
      changed = true;
    }
  }

  // First pass: replace disabled modules with null
  layoutConfig.rows.forEach(row => {
    for (let i = 0; i < row.modules.length; i++) {
      const moduleSlot = row.modules[i];

      if (Array.isArray(moduleSlot)) {
        // Split module - check each
        for (let j = 0; j < moduleSlot.length; j++) {
          if (moduleSlot[j] && !isModuleEnabled(moduleSlot[j])) {
            moduleSlot[j] = null;
            changed = true;
          }
        }
        // If both slots are null, convert to single null
        if (!moduleSlot[0] && !moduleSlot[1]) {
          row.modules[i] = null;
          changed = true;
        }
      } else if (moduleSlot && !isModuleEnabled(moduleSlot)) {
        row.modules[i] = null;
        changed = true;
      }
    }
  });

  // Second pass: remove rows where all modules are null
  const originalLength = layoutConfig.rows.length;
  layoutConfig.rows = layoutConfig.rows.filter(row => {
    return row.modules.some(m => {
      if (Array.isArray(m)) {
        return m.some(id => id !== null);
      }
      return m !== null;
    });
  });

  if (layoutConfig.rows.length !== originalLength) {
    changed = true;
  }

  // Ensure at least one row exists
  if (layoutConfig.rows.length === 0) {
    layoutConfig.rows = [
      { cols: LAYOUT_DEFAULT_COLS, modules: Array(LAYOUT_DEFAULT_COLS).fill(null) }
    ];
    changed = true;
  }

  return changed;
}

function renderLayout() {
  const grid = document.getElementById('moduleGrid');
  if (!grid) return;

  // Clean up layout config: remove disabled modules and empty rows
  if (cleanupLayoutConfig()) {
    saveLayoutConfig();
  }

  if (ensureLayoutDefaults()) {
    saveLayoutConfig();
  }

  // Collect ALL cards from the DOM before clearing
  // Look in grid first (before clearing), then in containers, then anywhere in the grid (in case they're in layout rows)
  const gridCards = Array.from(grid.querySelectorAll('.card[data-module]'));
  const githubContainer = document.getElementById('githubModulesContainer');
  const githubCards = githubContainer ? Array.from(githubContainer.querySelectorAll('.card[data-module]')) : [];
  const rssContainer = document.getElementById('rssModulesContainer');
  const rssCards = rssContainer ? Array.from(rssContainer.querySelectorAll('.card[data-module]')) : [];
  const diskContainer = document.getElementById('diskModulesContainer');
  const diskCards = diskContainer ? Array.from(diskContainer.querySelectorAll('.card[data-module]')) : [];
  const parkingLot = document.getElementById('layoutParkingLot');
  const parkedCards = parkingLot ? Array.from(parkingLot.querySelectorAll('.card[data-module]')) : [];

  // Combine and deduplicate by module ID (use first occurrence)
  // Also filter out disabled modules
  const allCards = [...gridCards, ...githubCards, ...rssCards, ...diskCards, ...parkedCards];
  const cardsMap = new Map();
  allCards.forEach(card => {
    const moduleId = card.getAttribute('data-module');
    if (moduleId && !cardsMap.has(moduleId)) {
      // Only include enabled modules
      const isEnabled = window.moduleConfig && window.moduleConfig[moduleId]
        ? window.moduleConfig[moduleId].enabled !== false
        : true; // Default to enabled if not in config
      if (isEnabled) {
        cardsMap.set(moduleId, card);
      }
    }
  });

  // Now clear the grid
  grid.innerHTML = '';
  grid.className = 'layout-grid';

  const processGen = ++layoutProcessGeneration;
  const processPayload = JSON.stringify(layoutConfig);

  // Process layout config using backend (removes disabled modules). Responses can arrive out of order;
  // never apply a result from an older render — that was resetting column counts and max width.
  (async () => {
    try {
      const res = await fetch('/api/layout/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: processPayload,
        cache: 'no-store'
      });
      if (processGen !== layoutProcessGeneration) {
        return;
      }
      if (res.ok) {
        const data = await res.json();
        if (processGen !== layoutProcessGeneration) {
          return;
        }
        if (data.layout) {
          const prevMax = layoutConfig.maxWidth;
          layoutConfig = data.layout;
          ensureLayoutDefaults(prevMax);
          normalizeLayoutRowDimensions();
          saveLayoutConfig();
        }
      }
    } catch (e) {
      if (window.debugError) window.debugError('layout', 'Error processing layout:', e);
    }
  })();

  layoutConfig.rows.forEach((row, rowIndex) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'layout-row';
    rowEl.dataset.rowIndex = rowIndex;
    rowEl.style.gridTemplateColumns = `repeat(${row.cols}, minmax(0, 1fr))`;

    for (let col = 0; col < row.cols; col++) {
      const colEl = document.createElement('div');
      colEl.className = 'layout-column';
      colEl.dataset.rowIndex = rowIndex;
      colEl.dataset.colIndex = col;

      const moduleSlot = row.modules[col];

      // Helper function to check if module is enabled
      const isModuleEnabled = (moduleId) => {
        if (!moduleId) return false;
        if (window.moduleConfig && window.moduleConfig[moduleId]) {
          return window.moduleConfig[moduleId].enabled !== false;
        }
        return true; // Default to enabled if not in config
      };

      // Check if this is a split column (array of two module IDs)
      if (Array.isArray(moduleSlot)) {
        colEl.classList.add('split-column');
        colEl.style.display = 'flex';
        colEl.style.flexDirection = 'column';
        colEl.style.gap = '8px';

        // Top module
        const topWrapper = document.createElement('div');
        topWrapper.className = 'split-slot split-slot-top';
        topWrapper.dataset.splitPosition = 'top';
        topWrapper.style.flex = '0 1 auto';

        if (moduleSlot[0] && isModuleEnabled(moduleSlot[0])) {
          const topCard = cardsMap.get(moduleSlot[0]);
          if (topCard) {
            topCard.style.height = 'auto';
            topWrapper.appendChild(topCard);
            cardsMap.delete(moduleSlot[0]);
          } else {
            topWrapper.classList.add('empty-split');
            topWrapper.innerHTML = '<div class="empty-column-hint" style="display:none;">Drop here (top)</div>';
          }
        } else {
          topWrapper.classList.add('empty-split');
          topWrapper.innerHTML = '<div class="empty-column-hint" style="display:none;">Drop here (top)</div>';
        }

        // Bottom module
        const bottomWrapper = document.createElement('div');
        bottomWrapper.className = 'split-slot split-slot-bottom';
        bottomWrapper.dataset.splitPosition = 'bottom';
        bottomWrapper.style.flex = '0 1 auto';

        if (moduleSlot[1] && isModuleEnabled(moduleSlot[1])) {
          const bottomCard = cardsMap.get(moduleSlot[1]);
          if (bottomCard) {
            bottomCard.style.height = 'auto';
            bottomWrapper.appendChild(bottomCard);
            cardsMap.delete(moduleSlot[1]);
          } else {
            bottomWrapper.classList.add('empty-split');
            bottomWrapper.innerHTML = '<div class="empty-column-hint" style="display:none;">Drop here (bottom)</div>';
          }
        } else {
          bottomWrapper.classList.add('empty-split');
          bottomWrapper.innerHTML = '<div class="empty-column-hint" style="display:none;">Drop here (bottom)</div>';
        }

        colEl.appendChild(topWrapper);
        colEl.appendChild(bottomWrapper);
      } else if (!moduleSlot) {
        colEl.classList.add('empty-column');
        colEl.innerHTML = '<div class="empty-column-hint" style="display: none;">Drop module here</div>';
      } else {
        // Check if module is enabled before placing it
        if (isModuleEnabled(moduleSlot)) {
          const card = cardsMap.get(moduleSlot);
          if (card) {
            colEl.appendChild(card);
            cardsMap.delete(moduleSlot);
          } else {
            colEl.classList.add('empty-column');
            colEl.innerHTML = '<div class="empty-column-hint" style="display: none;">Drop module here</div>';
          }
        } else {
          // Module is disabled, treat as empty column
          colEl.classList.add('empty-column');
          colEl.innerHTML = '<div class="empty-column-hint" style="display: none;">Drop module here</div>';
        }
      }

      rowEl.appendChild(colEl);
    }

    grid.appendChild(rowEl);
  });

  // Keep SNMP out of the grid and out of layout rows when the card is hidden (no queries / off)
  if (typeof window.shouldSnmpOccupyLayout === 'function' && !window.shouldSnmpOccupyLayout()) {
    const snmpCard = cardsMap.get('snmp');
    if (snmpCard) {
      let lot = document.getElementById('layoutParkingLot');
      if (!lot) {
        lot = document.createElement('div');
        lot.id = 'layoutParkingLot';
        lot.setAttribute('aria-hidden', 'true');
        lot.style.cssText =
          'display:none;width:0;height:0;overflow:hidden;position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none;';
        document.body.appendChild(lot);
      }
      lot.appendChild(snmpCard);
      cardsMap.delete('snmp');
    }
  }

  // Same for Monitoring when there are no monitors or the module is disabled
  if (typeof window.shouldMonitoringOccupyLayout === 'function' && !window.shouldMonitoringOccupyLayout()) {
    const monitoringCard = cardsMap.get('monitoring');
    if (monitoringCard) {
      let lot = document.getElementById('layoutParkingLot');
      if (!lot) {
        lot = document.createElement('div');
        lot.id = 'layoutParkingLot';
        lot.setAttribute('aria-hidden', 'true');
        lot.style.cssText =
          'display:none;width:0;height:0;overflow:hidden;position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none;';
        document.body.appendChild(lot);
      }
      lot.appendChild(monitoringCard);
      cardsMap.delete('monitoring');
    }
  }

  // Handle remaining modules that aren't in the layout config yet
  if (cardsMap.size > 0) {
    const remainingModules = Array.from(cardsMap.keys());

    // Add remaining modules to new rows (LAYOUT_DEFAULT_COLS per row) and render them immediately
    while (remainingModules.length > 0) {
      const newRow = { cols: LAYOUT_DEFAULT_COLS, modules: [] };
      for (let i = 0; i < LAYOUT_DEFAULT_COLS && remainingModules.length > 0; i++) {
        newRow.modules.push(remainingModules.shift());
      }
      // Fill remaining slots with null
      while (newRow.modules.length < LAYOUT_DEFAULT_COLS) {
        newRow.modules.push(null);
      }
      layoutConfig.rows.push(newRow);

      // Render this row immediately
      const rowEl = document.createElement('div');
      rowEl.className = 'layout-row';
      rowEl.dataset.rowIndex = layoutConfig.rows.length - 1;
      rowEl.style.gridTemplateColumns = `repeat(${newRow.cols}, minmax(0, 1fr))`;

      for (let col = 0; col < newRow.cols; col++) {
        const colEl = document.createElement('div');
        colEl.className = 'layout-column';
        colEl.dataset.rowIndex = layoutConfig.rows.length - 1;
        colEl.dataset.colIndex = col;

        const moduleId = newRow.modules[col];
        if (!moduleId) {
          colEl.classList.add('empty-column');
          colEl.innerHTML = '<div class="empty-column-hint" style="display: none;">Drop module here</div>';
        } else {
          const card = cardsMap.get(moduleId);
          if (card) {
            colEl.appendChild(card);
            cardsMap.delete(moduleId);
          } else {
            colEl.classList.add('empty-column');
            colEl.innerHTML = '<div class="empty-column-hint" style="display: none;">Drop module here</div>';
          }
        }

        rowEl.appendChild(colEl);
      }

      grid.appendChild(rowEl);
    }

    saveLayoutConfig();
  }

  const mainContainer = document.getElementById('mainContainer');
  if (mainContainer) {
    mainContainer.style.maxWidth = layoutConfig.maxWidth + '%';
  }

  // New .layout-column nodes need drop targets; callers often forget to re-bind after innerHTML rebuild.
  initDragAndDrop();

  // Adjust row heights after rendering
  requestAnimationFrame(() => {
    adjustRowHeights();
    // Also adjust after content loads
    setTimeout(() => adjustRowHeights(), 200);
    // Setup resize observer for dynamic content
    setupCardResizeObserver();
  });
}

function adjustRowHeights() {
  const rows = document.querySelectorAll('.layout-row');
  rows.forEach(row => {
    const columns = row.querySelectorAll('.layout-column');
    let maxHeight = 0;

    // First pass: find the tallest column
    columns.forEach(col => {
      if (col.classList.contains('split-column')) {
        // For split columns, measure total height needed
        const topSlot = col.querySelector('.split-slot-top');
        const bottomSlot = col.querySelector('.split-slot-bottom');
        let splitHeight = 0;

        // Temporarily set to auto to measure natural height
        const originalHeight = col.style.height;
        col.style.height = 'auto';

        if (topSlot) {
          const topCard = topSlot.querySelector('.card');
          if (topCard) {
            splitHeight += topCard.scrollHeight;
          } else if (topSlot.classList.contains('empty-split')) {
            splitHeight += 60; // min-height for empty split
          }
        }
        if (bottomSlot) {
          const bottomCard = bottomSlot.querySelector('.card');
          if (bottomCard) {
            splitHeight += bottomCard.scrollHeight;
          } else if (bottomSlot.classList.contains('empty-split')) {
            splitHeight += 60; // min-height for empty split
          }
        }
        if (topSlot && bottomSlot && (topSlot.querySelector('.card') || topSlot.classList.contains('empty-split')) &&
            (bottomSlot.querySelector('.card') || bottomSlot.classList.contains('empty-split'))) {
          splitHeight += 8; // gap
        }

        col.style.height = originalHeight;
        maxHeight = Math.max(maxHeight, splitHeight);
      } else {
        // Regular column - measure card height
        const card = col.querySelector('.card');
        if (card) {
          const originalColHeight = col.style.height;
          const originalCardHeight = card.style.height;
          // Reset both to auto to get natural content height
          col.style.height = 'auto';
          card.style.height = 'auto';
          maxHeight = Math.max(maxHeight, card.scrollHeight);
          col.style.height = originalColHeight;
          card.style.height = originalCardHeight;
        }
      }
    });

    // Second pass: set all columns to max height and adjust split slots
    if (maxHeight > 0) {
      columns.forEach(col => {
        if (col.classList.contains('split-column')) {
          // Set column to max height
          col.style.height = maxHeight + 'px';
          col.style.minHeight = maxHeight + 'px';

          const topSlot = col.querySelector('.split-slot-top');
          const bottomSlot = col.querySelector('.split-slot-bottom');
          const gap = 8;
          const availableHeight = maxHeight - gap;

          // Each slot should take at least 50% of available height
          // Use flex: 1 1 0 to make them equal by default, but allow growth
          if (topSlot && bottomSlot) {
            const halfHeight = availableHeight / 2;
            topSlot.style.flex = '1 1 0';
            topSlot.style.minHeight = `${halfHeight}px`;
            bottomSlot.style.flex = '1 1 0';
            bottomSlot.style.minHeight = `${halfHeight}px`;
          } else if (topSlot) {
            topSlot.style.flex = '1 1 auto';
          } else if (bottomSlot) {
            bottomSlot.style.flex = '1 1 auto';
          }
        } else {
          // Regular column - set to max height
          col.style.height = maxHeight + 'px';
          col.style.minHeight = maxHeight + 'px';
          const card = col.querySelector('.card');
          if (card) {
            card.style.height = '100%';
          }
        }
      });
    }
  });
}

// Observers to automatically adjust row heights when card content changes
let cardMutationObserver = null;
let heightAdjustDebounceTimer = null;

function debouncedAdjustRowHeights() {
  if (heightAdjustDebounceTimer) {
    clearTimeout(heightAdjustDebounceTimer);
  }
  heightAdjustDebounceTimer = setTimeout(() => {
    adjustRowHeights();
  }, 150);
}

function setupCardResizeObserver() {
  // Clean up existing observer
  if (cardMutationObserver) {
    cardMutationObserver.disconnect();
  }

  // Use MutationObserver to detect content changes within cards
  cardMutationObserver = new MutationObserver((mutations) => {
    // Only trigger if there are actual content changes
    const hasContentChange = mutations.some(mutation => {
      return mutation.type === 'childList' ||
             (mutation.type === 'characterData') ||
             (mutation.type === 'attributes' && mutation.attributeName === 'style');
    });
    if (hasContentChange) {
      debouncedAdjustRowHeights();
    }
  });

  // Observe the grid for content changes in cards
  const grid = document.getElementById('moduleGrid');
  if (grid) {
    cardMutationObserver.observe(grid, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }
}

function getModuleName(moduleId) {
  if (moduleConfig[moduleId]) {
    return moduleConfig[moduleId].name;
  }
  if (moduleId && moduleId.startsWith('github-')) {
    const githubModule = window.githubModules ? window.githubModules.find(m => m.id === moduleId) : null;
    if (githubModule) {
      return githubModule.name;
    }
  }
  if (moduleId && moduleId.startsWith('rss-')) {
    if (window.rssModules) {
      const rssModule = window.rssModules.find(m => m.id === moduleId);
      if (rssModule) {
        return rssModule.name || 'RSS Feed';
      }
    }
  }
  if (moduleId && moduleId.startsWith('disk-')) {
    if (window.diskModules) {
      const diskModule = window.diskModules.find(m => m.id === moduleId);
      if (diskModule) {
        return diskModule.mountPoint === '/' ? 'Disk' : `Disk ${diskModule.mountPoint}`;
      }
    }
  }
  return moduleId || 'Empty';
}

function renderLayoutEditor() {
  const editor = document.getElementById('layoutEditor');
  if (!editor) return;

  editor.innerHTML = '';

  // Helper function to check if module is enabled
  const isModuleEnabled = (moduleId) => {
    if (!moduleId) return false;
    if (window.moduleConfig && window.moduleConfig[moduleId]) {
      return window.moduleConfig[moduleId].enabled !== false;
    }
    return true; // Default to enabled if not in config
  };

  layoutConfig.rows.forEach((row, rowIndex) => {
    // Handle both regular and split modules - only show enabled ones
    const moduleNames = [];
    row.modules.forEach(m => {
      if (Array.isArray(m)) {
        // Split module - show both names, but only if enabled
        const names = m.filter(id => id && isModuleEnabled(id)).map(id => getModuleName(id));
        if (names.length > 0) {
          moduleNames.push(names.join('/'));
        }
      } else if (m && isModuleEnabled(m)) {
        moduleNames.push(getModuleName(m));
      }
    });
    const modulesText = moduleNames.length > 0 ? moduleNames.join(', ') : '(empty)';

    const rowEditor = document.createElement('div');
    rowEditor.className = 'layout-row-editor';
    rowEditor.innerHTML = `
      <div class="layout-row-controls">
        <span>Row ${rowIndex + 1}</span>
        <select class="row-cols-select" data-row="${rowIndex}">
          <option value="1" ${row.cols === 1 ? 'selected' : ''}>1 Column</option>
          <option value="2" ${row.cols === 2 ? 'selected' : ''}>2 Columns</option>
          <option value="3" ${row.cols === 3 ? 'selected' : ''}>3 Columns</option>
          <option value="4" ${row.cols === 4 ? 'selected' : ''}>4 Columns</option>
        </select>
        <button class="btn-small remove-row-btn" data-row="${rowIndex}"><i class="fas fa-trash"></i></button>
        <span style="margin-left: auto; color: var(--muted); font-size: 13px;">${modulesText}</span>
      </div>
    `;

    const colsSelect = rowEditor.querySelector('.row-cols-select');
    colsSelect.addEventListener('change', (e) => {
      const newCols = parseInt(e.target.value);
      layoutConfig.rows[rowIndex].cols = newCols;
      if (layoutConfig.rows[rowIndex].modules.length > newCols) {
        layoutConfig.rows[rowIndex].modules = layoutConfig.rows[rowIndex].modules.slice(0, newCols);
      } else {
        while (layoutConfig.rows[rowIndex].modules.length < newCols) {
          layoutConfig.rows[rowIndex].modules.push(null);
        }
      }
      saveLayoutConfig();
      renderLayout();
    });

    const removeBtn = rowEditor.querySelector('.remove-row-btn');
    removeBtn.addEventListener('click', () => {
      // Collect all module IDs from this row (handling split modules)
      const modules = [];
      layoutConfig.rows[rowIndex].modules.forEach(m => {
        if (Array.isArray(m)) {
          m.filter(id => id).forEach(id => modules.push(id));
        } else if (m) {
          modules.push(m);
        }
      });

      if (modules.length > 0 && rowIndex > 0) {
        const prevRow = layoutConfig.rows[rowIndex - 1];
        modules.forEach(m => {
          if (prevRow.modules.length < prevRow.cols) {
            prevRow.modules.push(m);
          }
        });
      }
      layoutConfig.rows.splice(rowIndex, 1);
      if (layoutConfig.rows.length === 0) {
        layoutConfig.rows = [{ cols: LAYOUT_DEFAULT_COLS, modules: [] }];
      }
      saveLayoutConfig();
      renderLayout();
      renderLayoutEditor();
    });

    editor.appendChild(rowEditor);
  });
}

async function fetchStorageKeyVersion(key) {
  try {
    const res = await fetch('/api/storage/get?key=' + encodeURIComponent(key), { cache: 'no-store' });
    if (!res.ok) return 0;
    const data = await res.json();
    if (!data) return 0;
    const v = parseInt(data.version, 10);
    return !isNaN(v) && v >= 0 ? v : 0;
  } catch (e) {
    return 0;
  }
}

function captureLayoutRowsFromDOM(grid) {
  const rows = [];
  if (!grid) return rows;
  grid.querySelectorAll(':scope > .layout-row').forEach(function(rowEl) {
    const colEls = rowEl.querySelectorAll(':scope > .layout-column');
    const n = colEls.length;
    if (n === 0) return;
    const modules = [];
    colEls.forEach(function(colEl) {
      if (colEl.classList.contains('split-column')) {
        const top = colEl.querySelector('.split-slot-top .card[data-module]');
        const bottom = colEl.querySelector('.split-slot-bottom .card[data-module]');
        const t = top ? top.getAttribute('data-module') : null;
        const b = bottom ? bottom.getAttribute('data-module') : null;
        if (t && b) {
          modules.push([t, b]);
        } else if (t) {
          modules.push(t);
        } else if (b) {
          modules.push(b);
        } else {
          modules.push(null);
        }
      } else {
        const card = colEl.querySelector(':scope > .card[data-module]');
        modules.push(card ? card.getAttribute('data-module') : null);
      }
    });
    rows.push({ cols: n, modules: modules });
  });
  return rows;
}

function normalizeCapturedLayoutRows(rows) {
  return rows.map(function(row) {
    const cols = Math.min(Math.max(parseInt(row.cols, 10) || row.modules.length || 1, 1), 12);
    let mods = Array.isArray(row.modules) ? row.modules.slice() : [];
    while (mods.length < cols) {
      mods.push(null);
    }
    if (mods.length > cols) {
      mods = mods.slice(0, cols);
    }
    return { cols: cols, modules: mods };
  });
}

function captureModuleOrderFromDOM() {
  const grid = document.getElementById('moduleGrid');
  if (!grid) return [];
  const order = [];
  grid.querySelectorAll(':scope > .layout-row').forEach(function(rowEl) {
    rowEl.querySelectorAll(':scope > .layout-column').forEach(function(colEl) {
      if (colEl.classList.contains('split-column')) {
        const top = colEl.querySelector('.split-slot-top .card[data-module]');
        const bottom = colEl.querySelector('.split-slot-bottom .card[data-module]');
        if (top) order.push(top.getAttribute('data-module'));
        if (bottom) order.push(bottom.getAttribute('data-module'));
      } else {
        const card = colEl.querySelector(':scope > .card[data-module]');
        if (card) order.push(card.getAttribute('data-module'));
      }
    });
  });
  return order;
}

/**
 * Clears local layoutConfig + moduleOrder (and *_meta), bumps version past the server,
 * saves the current grid from the DOM, re-renders. Fixes refresh restoring old column counts.
 */
async function resetLayoutStorageFromCurrentView() {
  const backendLayoutVer = await fetchStorageKeyVersion('layoutConfig');
  const backendOrderVer = await fetchStorageKeyVersion('moduleOrder');

  try {
    localStorage.removeItem('layoutConfig');
    localStorage.removeItem('layoutConfig_meta');
    localStorage.removeItem('moduleOrder');
    localStorage.removeItem('moduleOrder_meta');
  } catch (e) {
    if (window.debugError) window.debugError('layout', 'Could not remove layout keys:', e);
  }

  const grid = document.getElementById('moduleGrid');
  let rows = normalizeCapturedLayoutRows(captureLayoutRowsFromDOM(grid));
  if (rows.length === 0 && window.layoutSystem && typeof window.layoutSystem.getLayoutConfig === 'function') {
    const mem = window.layoutSystem.getLayoutConfig();
    if (mem && Array.isArray(mem.rows) && mem.rows.length) {
      try {
        rows = normalizeCapturedLayoutRows(JSON.parse(JSON.stringify(mem.rows)));
      } catch (e) {}
    }
  }
  if (rows.length === 0) {
    rows = [{ cols: LAYOUT_DEFAULT_COLS, modules: Array(LAYOUT_DEFAULT_COLS).fill(null) }];
  }

  let maxWidth = 80;
  const maxWidthSelect = document.getElementById('layoutMaxWidth');
  if (maxWidthSelect && maxWidthSelect.value) {
    const v = parseInt(maxWidthSelect.value, 10);
    if (!isNaN(v) && v >= 1 && v <= 100) {
      maxWidth = v;
    }
  } else if (typeof layoutConfig.maxWidth === 'number' && layoutConfig.maxWidth >= 1 && layoutConfig.maxWidth <= 100) {
    maxWidth = layoutConfig.maxWidth;
  }

  layoutConfig.maxWidth = maxWidth;
  layoutConfig.rows = rows;
  ensureLayoutDefaults();
  normalizeLayoutRowDimensions();

  const order = captureModuleOrderFromDOM();

  setStorageVersion('layoutConfig', backendLayoutVer);
  window.saveToStorage('layoutConfig', layoutConfig);

  setStorageVersion('moduleOrder', backendOrderVer);
  window.saveToStorage('moduleOrder', order);

  renderLayout();
  renderLayoutEditor();
  if (window.applyModuleVisibility) {
    window.applyModuleVisibility();
  }

  if (maxWidthSelect) {
    maxWidthSelect.value = String(layoutConfig.maxWidth);
  }

  if (window.popup && window.popup.alert) {
    await window.popup.alert(
      'Saved. Layout and module-order storage now match the current grid, with versions forced past the server copy so a refresh should not bring back old columns.',
      'Layout storage reset'
    );
  }
}

function bindLayoutMaxWidthSelectDelegated() {
  if (window._layoutMaxWidthDelegatedBound) return;
  window._layoutMaxWidthDelegatedBound = true;
  function applyFromSelect(sel) {
    if (!sel || sel.id !== 'layoutMaxWidth') return;
    const v = parseInt(sel.value, 10);
    const next = !isNaN(v) && v >= 1 && v <= 100 ? v : 80;
    layoutConfig.maxWidth = next;
    saveLayoutConfig();
    if (window.layoutSystem && window.layoutSystem.renderLayout) {
      window.layoutSystem.renderLayout();
    }
  }
  document.addEventListener('change', function(e) {
    if (e.target && e.target.id === 'layoutMaxWidth') applyFromSelect(e.target);
  });
  document.addEventListener('input', function(e) {
    if (e.target && e.target.id === 'layoutMaxWidth') applyFromSelect(e.target);
  });
}

function initLayoutEditor() {
  bindLayoutMaxWidthSelectDelegated();

  const addRowBtn = document.getElementById('addRowBtn');
  if (addRowBtn) {
    addRowBtn.addEventListener('click', () => {
      layoutConfig.rows.push({ cols: LAYOUT_DEFAULT_COLS, modules: [] });
      saveLayoutConfig();
      renderLayout();
      renderLayoutEditor();
    });
  }

  const maxWidthSelect = document.getElementById('layoutMaxWidth');
  if (maxWidthSelect) {
    ensureLayoutDefaults();
    maxWidthSelect.value = String(layoutConfig.maxWidth);
  }

  const wipeBtn = document.getElementById('wipeLayoutStorageBtn');
  if (wipeBtn && wipeBtn.dataset.layoutWipeBound !== '1') {
    wipeBtn.dataset.layoutWipeBound = '1';
    wipeBtn.addEventListener('click', async function() {
      const ok = await window.popup.confirm(
        'Clear saved layout and module-order for this site, then save exactly what is on the grid now (rows, column counts, modules)? Other local storage keys are left as-is. The new copy is pushed to the server with a higher version so it should not be overwritten on refresh.',
        'Reset layout storage'
      );
      if (!ok) return;
      wipeBtn.disabled = true;
      try {
        await resetLayoutStorageFromCurrentView();
      } catch (err) {
        if (window.debugError) window.debugError('layout', 'resetLayoutStorageFromCurrentView:', err);
        if (window.popup && window.popup.alert) {
          await window.popup.alert('Could not reset layout storage: ' + (err.message || String(err)), 'Error');
        }
      } finally {
        wipeBtn.disabled = false;
      }
    });
  }
}

// Drag and drop
let draggedElement = null;
let grid = null;
let leftDropZone = null;
let rightDropZone = null;
let pinnedModule = null;
let pinnedDropSuccess = false;

// Split column tracking
let splitHoverTimeout = null;
let splitActiveColumn = null;
let splitOverlay = null;

function createSplitOverlay(column) {
  // Remove existing overlay
  removeSplitOverlay();

  splitActiveColumn = column;
  splitOverlay = document.createElement('div');
  splitOverlay.className = 'split-overlay';
  splitOverlay.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    z-index: 100;
    pointer-events: auto;
  `;

  const topZone = document.createElement('div');
  topZone.className = 'split-zone split-top';
  topZone.style.cssText = `
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(100, 160, 120, 0.3);
    border: 2px dashed rgba(100, 160, 120, 0.8);
    border-bottom: 1px dashed rgba(100, 160, 120, 0.8);
    margin: 4px 4px 2px 4px;
    border-radius: 8px 8px 0 0;
    transition: background 0.2s;
  `;
  topZone.innerHTML = '<i class="fas fa-arrow-up" style="color: rgba(100, 160, 120, 0.8); font-size: 20px;"></i>';

  const bottomZone = document.createElement('div');
  bottomZone.className = 'split-zone split-bottom';
  bottomZone.style.cssText = `
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(100, 160, 120, 0.3);
    border: 2px dashed rgba(100, 160, 120, 0.8);
    border-top: 1px dashed rgba(100, 160, 120, 0.8);
    margin: 2px 4px 4px 4px;
    border-radius: 0 0 8px 8px;
    transition: background 0.2s;
  `;
  bottomZone.innerHTML = '<i class="fas fa-arrow-down" style="color: rgba(100, 160, 120, 0.8); font-size: 20px;"></i>';

  // Add drag handlers to zones
  [topZone, bottomZone].forEach(zone => {
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      zone.style.background = 'rgba(100, 160, 120, 0.5)';
    });

    zone.addEventListener('dragleave', (e) => {
      zone.style.background = 'rgba(100, 160, 120, 0.3)';
    });

    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (draggedElement) {
        const rowIndex = parseInt(column.dataset.rowIndex);
        const colIndex = parseInt(column.dataset.colIndex);
        const isTop = zone.classList.contains('split-top');
        const isPinnedClone = draggedElement.dataset.isPinnedClone === 'true';
        const moduleId = isPinnedClone
          ? (draggedElement.dataset.originalModuleId || draggedElement.getAttribute('data-module'))
          : draggedElement.getAttribute('data-module');

        // Get current module in this slot
        const currentModuleId = layoutConfig.rows[rowIndex]?.modules[colIndex];

        // Remove dragged module from its current position
        layoutConfig.rows.forEach(row => {
          for (let i = 0; i < row.modules.length; i++) {
            const mod = row.modules[i];
            if (Array.isArray(mod)) {
              const idx = mod.indexOf(moduleId);
              if (idx !== -1) {
                mod.splice(idx, 1);
                if (mod.length === 1) {
                  row.modules[i] = mod[0];
                } else if (mod.length === 0) {
                  row.modules[i] = null;
                }
              }
            } else if (mod === moduleId) {
              row.modules[i] = null;
            }
          }
        });

        // Create split array
        if (currentModuleId && !Array.isArray(currentModuleId)) {
          if (isTop) {
            layoutConfig.rows[rowIndex].modules[colIndex] = [moduleId, currentModuleId];
          } else {
            layoutConfig.rows[rowIndex].modules[colIndex] = [currentModuleId, moduleId];
          }
        } else if (Array.isArray(currentModuleId)) {
          if (isTop) {
            layoutConfig.rows[rowIndex].modules[colIndex] = [moduleId, currentModuleId[1] || null];
          } else {
            layoutConfig.rows[rowIndex].modules[colIndex] = [currentModuleId[0] || null, moduleId];
          }
        } else {
          layoutConfig.rows[rowIndex].modules[colIndex] = isTop ? [moduleId, null] : [null, moduleId];
        }

        if (isPinnedClone) {
          pinnedDropSuccess = true;
        }

        removeSplitOverlay();
        saveLayoutConfig();
        renderLayout();
        renderLayoutEditor();
      }
    });
  });

  splitOverlay.appendChild(topZone);
  splitOverlay.appendChild(bottomZone);

  // Position relative to the column (only if not already set)
  if (!column.style.position || column.style.position === 'static') {
    column.style.position = 'relative';
  }
  column.appendChild(splitOverlay);
}

function removeSplitOverlay() {
  if (splitOverlay && splitOverlay.parentNode) {
    splitOverlay.parentNode.removeChild(splitOverlay);
    // Reset column position if it was only set for the overlay
    if (splitActiveColumn && splitActiveColumn.style.position === 'relative') {
      // Check if column actually needs relative positioning (has split slots)
      const hasSplitSlots = splitActiveColumn.querySelector('.split-slot');
      if (!hasSplitSlots) {
        splitActiveColumn.style.position = '';
      }
    }
  }
  splitOverlay = null;
  splitActiveColumn = null;
  if (splitHoverTimeout) {
    clearTimeout(splitHoverTimeout);
    splitHoverTimeout = null;
  }
}

function startSplitTimer(column) {
  if (splitHoverTimeout) {
    clearTimeout(splitHoverTimeout);
  }
  splitHoverTimeout = setTimeout(() => {
    if (draggedElement && column) {
      createSplitOverlay(column);
    }
  }, 5000);
}

function cancelSplitTimer() {
  if (splitHoverTimeout) {
    clearTimeout(splitHoverTimeout);
    splitHoverTimeout = null;
  }
}

function createDropZones() {
  // Create left zone (disable module)
  if (!leftDropZone) {
    leftDropZone = document.createElement('div');
    leftDropZone.id = 'leftDropZone';
    leftDropZone.innerHTML = '<i class="fas fa-eye-slash"></i>';
    leftDropZone.style.cssText = `
      position: fixed;
      left: 0;
      top: 0;
      width: 80px;
      height: 100vh;
      background: linear-gradient(90deg, rgba(180,80,90,0.5) 0%, rgba(180,80,90,0) 100%);
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      color: #fff;
      font-size: 14px;
      font-weight: 600;
      z-index: 9999;
      transition: background 0.2s;
    `;
    document.body.appendChild(leftDropZone);

    leftDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      leftDropZone.style.background = 'linear-gradient(90deg, rgba(180,80,90,0.7) 0%, rgba(180,80,90,0.2) 100%)';
    });

    leftDropZone.addEventListener('dragleave', () => {
      leftDropZone.style.background = 'linear-gradient(90deg, rgba(180,80,90,0.5) 0%, rgba(180,80,90,0) 100%)';
    });

    leftDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (draggedElement) {
        const moduleId = draggedElement.getAttribute('data-module');
        if (moduleId) {
          // Disable the module in moduleVisibility
          const moduleVisibility = window.loadFromStorage('moduleVisibility', {});
          moduleVisibility[moduleId] = false;
          window.saveToStorage('moduleVisibility', moduleVisibility);

          // Also add to hiddenModules for compatibility
          const hiddenModules = window.loadFromStorage('hiddenModules', []);
          if (!hiddenModules.includes(moduleId)) {
            hiddenModules.push(moduleId);
            window.saveToStorage('hiddenModules', hiddenModules);
          }

          // Remove from layout
          layoutConfig.rows.forEach(row => {
            const idx = row.modules.indexOf(moduleId);
            if (idx !== -1) row.modules[idx] = null;
          });

          // Clear pinned module if this was it
          if (pinnedModule && pinnedModule.moduleId === moduleId) {
            pinnedModule.clone.remove();
            pinnedModule = null;
          }

          saveLayoutConfig();
          renderLayout();
          renderLayoutEditor();
          if (window.applyModuleVisibility) window.applyModuleVisibility();
        }
      }
      hideDropZones();
    });
  }

  // Create right zone (temporary pin)
  if (!rightDropZone) {
    rightDropZone = document.createElement('div');
    rightDropZone.id = 'rightDropZone';
    rightDropZone.innerHTML = '<i class="fas fa-thumbtack"></i>';
    rightDropZone.style.cssText = `
      position: fixed;
      right: 0;
      top: 0;
      width: 80px;
      height: 100vh;
      background: linear-gradient(270deg, rgba(100,160,120,0.5) 0%, rgba(100,160,120,0) 100%);
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      color: #fff;
      font-size: 14px;
      font-weight: 600;
      z-index: 9999;
      transition: background 0.2s;
    `;
    document.body.appendChild(rightDropZone);

    rightDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      rightDropZone.style.background = 'linear-gradient(270deg, rgba(100,160,120,0.7) 0%, rgba(100,160,120,0.2) 100%)';
    });

    rightDropZone.addEventListener('dragleave', () => {
      rightDropZone.style.background = 'linear-gradient(270deg, rgba(100,160,120,0.5) 0%, rgba(100,160,120,0) 100%)';
    });

    rightDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (draggedElement) {
        pinModule(draggedElement);
      }
      hideDropZones();
    });
  }
}

function pinModule(element) {
  // Remove any existing pinned module
  unpinModule();

  const moduleId = element.getAttribute('data-module');
  const clone = element.cloneNode(true);
  clone.id = 'pinnedModuleClone';
  clone.style.cssText = `
    position: fixed;
    right: 20px;
    top: 50%;
    transform: translateY(-50%);
    width: 300px;
    max-height: 80vh;
    overflow: hidden;
    z-index: 9998;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    border: 2px solid var(--accent);
  `;
  clone.dataset.dragInitialized = 'false';
  clone.dataset.isPinnedClone = 'true';
  clone.draggable = true;
  document.body.appendChild(clone);

  // Hide original from layout but keep it in DOM
  element.style.visibility = 'hidden';
  element.style.height = '0';
  element.style.overflow = 'hidden';
  element.style.margin = '0';
  element.style.padding = '0';
  element.style.border = 'none';

  pinnedModule = { original: element, clone: clone, moduleId: moduleId };
  pinnedDropSuccess = false;

  // Make clone draggable
  clone.addEventListener('dragstart', function(e) {
    draggedElement = clone; // Use clone as draggedElement
    draggedElement.dataset.originalModuleId = moduleId;
    clone.style.opacity = '0.5';
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', moduleId);
    pinnedDropSuccess = false;
    showDropZones();

    // Also highlight columns
    if (grid) {
      const emptyColumns = grid.querySelectorAll('.layout-column');
      emptyColumns.forEach(col => col.classList.add('dragging-active'));

      // Also highlight empty split slots
      const emptySplitSlots = grid.querySelectorAll('.split-slot.empty-split');
      emptySplitSlots.forEach(slot => slot.classList.add('dragging-active'));
    }
  });

  clone.addEventListener('dragend', function() {
    clone.style.opacity = '1';
    hideDropZones();

    // Remove column highlights
    if (grid) {
      const allColumns = Array.from(grid.querySelectorAll('.layout-column'));
      allColumns.forEach(c => {
        c.classList.remove('drag-over');
        c.classList.remove('dragging-active');
      });

      // Also remove from empty split slots
      const emptySplitSlots = grid.querySelectorAll('.split-slot.empty-split');
      emptySplitSlots.forEach(slot => {
        slot.classList.remove('drag-over');
        slot.classList.remove('dragging-active');
      });
    }

    if (pinnedDropSuccess) {
      // Successful drop - fully unpin
      unpinModule();
    } else {
      // Failed drop - keep pinned, restore clone visibility
      clone.style.opacity = '1';
    }

    draggedElement = null;
  });

  // Add close button to pinned module
  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '<i class="fas fa-times"></i>';
  closeBtn.style.cssText = `
    position: absolute;
    top: 5px;
    right: 35px;
    background: var(--accent);
    color: var(--bg);
    border: none;
    border-radius: 50%;
    width: 24px;
    height: 24px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
  `;
  closeBtn.onclick = () => unpinModule();
  clone.querySelector('h3')?.appendChild(closeBtn);
}

function unpinModule() {
  if (pinnedModule) {
    // Restore original element visibility
    pinnedModule.original.style.visibility = '';
    pinnedModule.original.style.height = '';
    pinnedModule.original.style.overflow = '';
    pinnedModule.original.style.margin = '';
    pinnedModule.original.style.padding = '';
    pinnedModule.original.style.border = '';
    pinnedModule.clone.remove();
    pinnedModule = null;
  }
}

function showDropZones() {
  createDropZones();
  leftDropZone.style.display = 'flex';
  rightDropZone.style.display = 'flex';
}

function hideDropZones() {
  if (leftDropZone) {
    leftDropZone.style.display = 'none';
    leftDropZone.style.background = 'linear-gradient(90deg, rgba(180,80,90,0.5) 0%, rgba(180,80,90,0) 100%)';
  }
  if (rightDropZone) {
    rightDropZone.style.display = 'none';
    rightDropZone.style.background = 'linear-gradient(270deg, rgba(100,160,120,0.5) 0%, rgba(100,160,120,0) 100%)';
  }
}

function loadModuleOrder() {
  if (!grid) return;
  const savedOrder = window.loadFromStorage('moduleOrder');
  if (!savedOrder) return;

  try {
    const order = savedOrder;
    const cards = Array.from(grid.querySelectorAll('.card[data-module]'));
    const moduleMap = new Map();
    cards.forEach(card => {
      const moduleId = card.getAttribute('data-module');
      if (moduleId) {
        moduleMap.set(moduleId, card);
      }
    });

    order.forEach(moduleId => {
      const card = moduleMap.get(moduleId);
      if (card) {
        grid.appendChild(card);
      }
    });
  } catch (e) {
    if (window.debugError) window.debugError('layout', 'Failed to load module order:', e);
  }
}

function saveModuleOrder() {
  if (!grid) return;
  const cards = Array.from(grid.querySelectorAll('.card[data-module]'));
  const order = cards.map(card => card.getAttribute('data-module')).filter(Boolean);
  window.saveToStorage('moduleOrder', order);
}

function findCardColumn(card) {
  let current = card.parentElement;
  while (current) {
    if (current.classList.contains('layout-column')) {
      return {
        rowIndex: parseInt(current.dataset.rowIndex),
        colIndex: parseInt(current.dataset.colIndex),
        column: current
      };
    }
    current = current.parentElement;
  }
  return null;
}

function initDragAndDrop() {
  if (!grid) {
    grid = document.getElementById('moduleGrid');
    if (!grid) return;
  }

  const gridCards = Array.from(grid.querySelectorAll('.card[data-module]'));
  const githubContainer = document.getElementById('githubModulesContainer');
  const githubCards = githubContainer ? Array.from(githubContainer.querySelectorAll('.card[data-module]')) : [];
  const rssContainer = document.getElementById('rssModulesContainer');
  const rssCards = rssContainer ? Array.from(rssContainer.querySelectorAll('.card[data-module]')) : [];
  const diskContainer = document.getElementById('diskModulesContainer');
  const diskCards = diskContainer ? Array.from(diskContainer.querySelectorAll('.card[data-module]')) : [];
  const cards = [...gridCards, ...githubCards, ...rssCards, ...diskCards];
  const columns = Array.from(grid.querySelectorAll('.layout-column'));

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
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/html', this.innerHTML);

      const emptyColumns = grid.querySelectorAll('.layout-column.empty-column');
      emptyColumns.forEach(col => col.classList.add('dragging-active'));

      // Also highlight empty split slots
      const emptySplitSlots = grid.querySelectorAll('.split-slot.empty-split');
      emptySplitSlots.forEach(slot => slot.classList.add('dragging-active'));

      // Show drop zones for disable/pin
      showDropZones();
    });

    card.addEventListener('dragend', function() {
      this.style.opacity = '1';
      const allCards = Array.from(document.querySelectorAll('.card[data-module]'));
      const allColumns = Array.from(grid.querySelectorAll('.layout-column'));
      allCards.forEach(c => c.classList.remove('drag-over'));
      allColumns.forEach(c => {
        c.classList.remove('drag-over');
        c.classList.remove('dragging-active');
      });
      draggedElement = null;

      // Hide drop zones
      hideDropZones();

      // Clean up split overlay
      removeSplitOverlay();
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
        // Check if this is a pinned module clone
        const isPinnedClone = draggedElement.dataset.isPinnedClone === 'true';
        const draggedModuleId = isPinnedClone
          ? (draggedElement.dataset.originalModuleId || draggedElement.getAttribute('data-module'))
          : draggedElement.getAttribute('data-module');
        const targetModuleId = this.getAttribute('data-module');
        const draggedPos = isPinnedClone ? null : findCardColumn(draggedElement);
        const targetPos = findCardColumn(this);

        if (draggedPos && targetPos) {
          if (layoutConfig.rows[draggedPos.rowIndex] && layoutConfig.rows[targetPos.rowIndex]) {
            layoutConfig.rows[draggedPos.rowIndex].modules[draggedPos.colIndex] = targetModuleId;
            layoutConfig.rows[targetPos.rowIndex].modules[targetPos.colIndex] = draggedModuleId;
            saveLayoutConfig();
            renderLayout();
            renderLayoutEditor();
          }
        } else if (!draggedPos && targetPos) {
          if (layoutConfig.rows[targetPos.rowIndex]) {
            layoutConfig.rows[targetPos.rowIndex].modules[targetPos.colIndex] = draggedModuleId;
            // Mark pinned drop as successful
            if (isPinnedClone) {
              pinnedDropSuccess = true;
            }
            saveLayoutConfig();
            renderLayout();
            renderLayoutEditor();
          }
        } else if (draggedPos && !targetPos) {
          if (layoutConfig.rows[draggedPos.rowIndex]) {
            layoutConfig.rows[draggedPos.rowIndex].modules[draggedPos.colIndex] = targetModuleId;
            layoutConfig.rows.forEach((row, rowIdx) => {
              if (rowIdx !== draggedPos.rowIndex) {
                const idx = row.modules.indexOf(draggedModuleId);
                if (idx !== -1) {
                  row.modules[idx] = null;
                }
              }
            });
            saveLayoutConfig();
            renderLayout();
            renderLayoutEditor();
          }
        } else if (!draggedPos && !targetPos) {
          if (window.renderGitHubModules) window.renderGitHubModules();
          if (window.renderRssModules) window.renderRssModules();
          if (window.renderDiskModules) window.renderDiskModules();
        }
      }

      return false;
    });
  });

  columns.forEach(column => {
    if (column.dataset.layoutColDndBound === '1') return;
    column.dataset.layoutColDndBound = '1';

    column.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (draggedElement) {
        this.classList.add('drag-over');
        // Split overlay only makes sense when the column already has a module (or split slots).
        if (
          !this.classList.contains('empty-column') &&
          splitActiveColumn !== this &&
          !splitHoverTimeout
        ) {
          startSplitTimer(this);
        }
      }
    });

    column.addEventListener('dragleave', function(e) {
      // Check if we're leaving to a child element (split overlay)
      const relatedTarget = e.relatedTarget;
      if (relatedTarget && this.contains(relatedTarget)) {
        return; // Don't cancel if moving to child
      }
      this.classList.remove('drag-over');
      if (splitActiveColumn === this) {
        removeSplitOverlay();
      } else {
        cancelSplitTimer();
      }
    });

    column.addEventListener('drop', function(e) {
      e.preventDefault();
      e.stopPropagation();

      if (draggedElement) {
        const rowIndex = parseInt(this.dataset.rowIndex);
        const colIndex = parseInt(this.dataset.colIndex);

        // Check if this is a pinned module clone
        const isPinnedClone = draggedElement.dataset.isPinnedClone === 'true';
        const moduleId = isPinnedClone
          ? (draggedElement.dataset.originalModuleId || draggedElement.getAttribute('data-module'))
          : draggedElement.getAttribute('data-module');

        const githubContainer = document.getElementById('githubModulesContainer');
        const rssContainer = document.getElementById('rssModulesContainer');
        const diskContainer = document.getElementById('diskModulesContainer');
        const isInGitHubContainer = githubContainer && githubContainer.contains(draggedElement);
        const isInRssContainer = rssContainer && rssContainer.contains(draggedElement);
        const isInDiskContainer = diskContainer && diskContainer.contains(draggedElement);

        // Remove module from its current position (handle both regular and split slots)
        layoutConfig.rows.forEach(row => {
          for (let i = 0; i < row.modules.length; i++) {
            const mod = row.modules[i];
            if (Array.isArray(mod)) {
              const idx = mod.indexOf(moduleId);
              if (idx !== -1) {
                mod[idx] = null;
                // If both slots are empty, convert to null
                if (!mod[0] && !mod[1]) {
                  row.modules[i] = null;
                }
              }
            } else if (mod === moduleId) {
              row.modules[i] = null;
            }
          }
        });

        if (layoutConfig.rows[rowIndex]) {
          const existingModuleId = layoutConfig.rows[rowIndex].modules[colIndex];
          layoutConfig.rows[rowIndex].modules[colIndex] = moduleId;

          if (existingModuleId && !isInGitHubContainer && !isInRssContainer && !isInDiskContainer && !isPinnedClone) {
            const draggedPos = findCardColumn(draggedElement);
            if (draggedPos && layoutConfig.rows[draggedPos.rowIndex]) {
              layoutConfig.rows[draggedPos.rowIndex].modules[draggedPos.colIndex] = existingModuleId;
            }
          }
        }

        // Mark pinned drop as successful
        if (isPinnedClone) {
          pinnedDropSuccess = true;
        }

        saveLayoutConfig();
        renderLayout();
        renderLayoutEditor();
      }

      this.classList.remove('drag-over');
      return false;
    });
  });

  // Handle split slots (for already-split columns)
  const splitSlots = grid.querySelectorAll('.split-slot');
  splitSlots.forEach(slot => {
    if (slot.dataset.layoutSlotDndBound === '1') return;
    slot.dataset.layoutSlotDndBound = '1';

    slot.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      if (draggedElement) {
        this.classList.add('drag-over');
      }
    });

    slot.addEventListener('dragleave', function() {
      this.classList.remove('drag-over');
    });

    slot.addEventListener('drop', function(e) {
      e.preventDefault();
      e.stopPropagation();
      this.classList.remove('drag-over');

      if (draggedElement) {
        const column = this.closest('.layout-column');
        const rowIndex = parseInt(column.dataset.rowIndex);
        const colIndex = parseInt(column.dataset.colIndex);
        const isTop = this.dataset.splitPosition === 'top';

        const isPinnedClone = draggedElement.dataset.isPinnedClone === 'true';
        const moduleId = isPinnedClone
          ? (draggedElement.dataset.originalModuleId || draggedElement.getAttribute('data-module'))
          : draggedElement.getAttribute('data-module');

        // Remove module from current position
        layoutConfig.rows.forEach(row => {
          for (let i = 0; i < row.modules.length; i++) {
            const mod = row.modules[i];
            if (Array.isArray(mod)) {
              const idx = mod.indexOf(moduleId);
              if (idx !== -1) {
                mod[idx] = null;
                if (!mod[0] && !mod[1]) {
                  row.modules[i] = null;
                }
              }
            } else if (mod === moduleId) {
              row.modules[i] = null;
            }
          }
        });

        // Place in split slot
        const currentSlot = layoutConfig.rows[rowIndex].modules[colIndex];
        if (Array.isArray(currentSlot)) {
          if (isTop) {
            currentSlot[0] = moduleId;
          } else {
            currentSlot[1] = moduleId;
          }
        }

        if (isPinnedClone) {
          pinnedDropSuccess = true;
        }

        saveLayoutConfig();
        renderLayout();
        renderLayoutEditor();
      }
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
}

function initLayout() {
  grid = document.getElementById('moduleGrid');
  if (!grid) {
    if (window.debugError) window.debugError('layout', 'moduleGrid not found');
    return;
  }

  bindLayoutMaxWidthSelectDelegated();

  loadLayoutConfig();
  loadModuleOrder();

  setTimeout(() => {
    renderLayout();
    renderLayoutEditor();
    initLayoutEditor();
    // Apply module visibility after layout is rendered
    if (window.applyModuleVisibility) {
      window.applyModuleVisibility();
    }
  }, 100);
}

// Expose to window
window.moduleConfig = moduleConfig;
window.loadModuleMetadata = loadModuleMetadata;
window.layoutSystem = {
  renderLayout,
  renderLayoutEditor,
  saveLayoutConfig,
  cleanupLayoutConfig,
  adjustRowHeights,
  removeModuleFromLayout,
  resetLayoutStorageFromCurrentView,
  getLayoutConfig: () => layoutConfig
};
window.initDragAndDrop = initDragAndDrop;
window.initLayout = initLayout;
window.cleanupLayoutConfig = cleanupLayoutConfig;
window.adjustRowHeights = adjustRowHeights;
