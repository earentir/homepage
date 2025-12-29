// Layout system and drag-and-drop

// Module configuration
const moduleConfig = {
  status: { name: 'Status', icon: 'fa-server', desc: 'System status and uptime', hasTimer: false, enabled: true },
  network: { name: 'Network', icon: 'fa-network-wired', desc: 'LAN and public IP addresses', hasTimer: true, timerKey: 'ip', defaultInterval: 7200, enabled: true },
  weather: { name: 'Weather', icon: 'fa-cloud-sun', desc: 'Current weather and forecast', hasTimer: true, timerKey: 'weather', defaultInterval: 1800, enabled: true },
  cpu: { name: 'CPU', icon: 'fa-microchip', desc: 'CPU usage with history graph', hasTimer: true, timerKey: 'cpu', defaultInterval: 5, enabled: true },
  cpuid: { name: 'CPU Info', icon: 'fa-info-circle', desc: 'CPU model and specifications', hasTimer: false, enabled: true },
  ram: { name: 'RAM', icon: 'fa-memory', desc: 'Memory usage with history graph', hasTimer: true, timerKey: 'ram', defaultInterval: 5, enabled: true },
  raminfo: { name: 'RAM Info', icon: 'fa-memory', desc: 'SMBIOS RAM module information', hasTimer: false, enabled: true },
  firmware: { name: 'Firmware', icon: 'fa-microchip', desc: 'BIOS/Firmware information', hasTimer: false, enabled: true },
  systeminfo: { name: 'System', icon: 'fa-desktop', desc: 'SMBIOS System information', hasTimer: false, enabled: true },
  baseboard: { name: 'Baseboard', icon: 'fa-server', desc: 'SMBIOS Baseboard information', hasTimer: false, enabled: true },
  disk: { name: 'Disk', icon: 'fa-hdd', desc: 'Disk usage with history graph', hasTimer: true, timerKey: 'disk', defaultInterval: 15, enabled: true },
  links: { name: 'Quick Links', icon: 'fa-link', desc: 'Quick access links', hasTimer: false, enabled: true },
  monitoring: { name: 'Monitoring', icon: 'fa-heartbeat', desc: 'Service health monitoring', hasTimer: true, timerKey: 'monitoring', defaultInterval: 60, enabled: true },
  snmp: { name: 'SNMP', icon: 'fa-network-wired', desc: 'SNMP device queries', hasTimer: true, timerKey: 'snmp', defaultInterval: 60, enabled: true },
  calendar: { name: 'Calendar', icon: 'fa-calendar-alt', desc: 'Month calendar view', hasTimer: false, enabled: true },
  weekcalendar: { name: 'Week Calendar', icon: 'fa-calendar-week', desc: 'Week view with events', hasTimer: false, enabled: true },
  events: { name: 'Upcoming Events', icon: 'fa-calendar-check', desc: 'Next 5 upcoming events', hasTimer: false, enabled: true },
  todo: { name: 'Todo', icon: 'fa-tasks', desc: 'Next 5 todos', hasTimer: false, enabled: true }
};

let layoutConfig = {
  maxWidth: 80,
  rows: []
};

function loadLayoutConfig() {
  try {
    const saved = localStorage.getItem('layoutConfig');
    if (saved) {
      layoutConfig = JSON.parse(saved);
    } else {
      initializeDefaultLayout();
    }
  } catch (e) {
    if (window.debugError) window.debugError('layout', 'Failed to load layout config:', e);
    initializeDefaultLayout();
  }
}

function initializeDefaultLayout() {
  const grid = document.getElementById('moduleGrid');
  if (!grid) return;

  const cards = Array.from(grid.querySelectorAll('.card[data-module]'));
  layoutConfig.rows = [];
  let currentRow = { cols: 3, modules: [] };

  cards.forEach((card) => {
    const moduleId = card.getAttribute('data-module');
    if (moduleId) {
      currentRow.modules.push(moduleId);
      if (card.classList.contains('span-6') || currentRow.modules.length >= 3) {
        if (card.classList.contains('span-6')) {
          currentRow.cols = 2;
        }
        layoutConfig.rows.push(currentRow);
        currentRow = { cols: 3, modules: [] };
      }
    }
  });

  if (currentRow.modules.length > 0) {
    layoutConfig.rows.push(currentRow);
  }

  if (layoutConfig.rows.length === 0) {
    layoutConfig.rows = [{ cols: 3, modules: [] }];
  }
}

function saveLayoutConfig() {
  try {
    localStorage.setItem('layoutConfig', JSON.stringify(layoutConfig));
  } catch (e) {
    if (window.debugError) window.debugError('layout', 'Failed to save layout config:', e);
  }
}

function renderLayout() {
  const grid = document.getElementById('moduleGrid');
  if (!grid) return;

  // Collect ALL cards from the DOM before clearing
  // Look in grid first (before clearing), then in containers, then anywhere in the grid (in case they're in layout rows)
  const gridCards = Array.from(grid.querySelectorAll('.card[data-module]'));
  const githubContainer = document.getElementById('githubModulesContainer');
  const githubCards = githubContainer ? Array.from(githubContainer.querySelectorAll('.card[data-module]')) : [];
  const rssContainer = document.getElementById('rssModulesContainer');
  const rssCards = rssContainer ? Array.from(rssContainer.querySelectorAll('.card[data-module]')) : [];
  const diskContainer = document.getElementById('diskModulesContainer');
  const diskCards = diskContainer ? Array.from(diskContainer.querySelectorAll('.card[data-module]')) : [];

  // Combine and deduplicate by module ID (use first occurrence)
  const allCards = [...gridCards, ...githubCards, ...rssCards, ...diskCards];
  const cardsMap = new Map();
  allCards.forEach(card => {
    const moduleId = card.getAttribute('data-module');
    if (moduleId && !cardsMap.has(moduleId)) {
      cardsMap.set(moduleId, card);
    }
  });

  // Now clear the grid
  grid.innerHTML = '';
  grid.className = 'layout-grid';

  layoutConfig.rows.forEach((row, rowIndex) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'layout-row';
    rowEl.dataset.rowIndex = rowIndex;
    rowEl.style.gridTemplateColumns = `repeat(${row.cols}, 1fr)`;

    for (let col = 0; col < row.cols; col++) {
      const colEl = document.createElement('div');
      colEl.className = 'layout-column';
      colEl.dataset.rowIndex = rowIndex;
      colEl.dataset.colIndex = col;

      const moduleSlot = row.modules[col];

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
        topWrapper.style.overflow = 'hidden';

        if (moduleSlot[0]) {
          const topCard = cardsMap.get(moduleSlot[0]);
          if (topCard) {
            topCard.style.height = 'auto';
            topCard.style.overflow = 'hidden';
            topWrapper.appendChild(topCard);
            cardsMap.delete(moduleSlot[0]);
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
        bottomWrapper.style.overflow = 'hidden';

        if (moduleSlot[1]) {
          const bottomCard = cardsMap.get(moduleSlot[1]);
          if (bottomCard) {
            bottomCard.style.height = 'auto';
            bottomCard.style.overflow = 'hidden';
            bottomWrapper.appendChild(bottomCard);
            cardsMap.delete(moduleSlot[1]);
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
        const card = cardsMap.get(moduleSlot);
        if (card) {
          colEl.appendChild(card);
          cardsMap.delete(moduleSlot);
        } else {
          colEl.classList.add('empty-column');
          colEl.innerHTML = '<div class="empty-column-hint" style="display: none;">Drop module here</div>';
        }
      }

      rowEl.appendChild(colEl);
    }

    grid.appendChild(rowEl);
  });

  // Handle remaining modules that aren't in the layout config yet
  if (cardsMap.size > 0) {
    const remainingModules = Array.from(cardsMap.keys());

    // Add remaining modules to new rows (3 modules per row) and render them immediately
    while (remainingModules.length > 0) {
      const newRow = { cols: 3, modules: [] };
      for (let i = 0; i < 3 && remainingModules.length > 0; i++) {
        newRow.modules.push(remainingModules.shift());
      }
      // Fill remaining slots with null
      while (newRow.modules.length < 3) {
        newRow.modules.push(null);
      }
      layoutConfig.rows.push(newRow);

      // Render this row immediately
      const rowEl = document.createElement('div');
      rowEl.className = 'layout-row';
      rowEl.dataset.rowIndex = layoutConfig.rows.length - 1;
      rowEl.style.gridTemplateColumns = `repeat(${newRow.cols}, 1fr)`;

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

  layoutConfig.rows.forEach((row, rowIndex) => {
    // Handle both regular and split modules
    const moduleNames = [];
    row.modules.forEach(m => {
      if (Array.isArray(m)) {
        // Split module - show both names
        const names = m.filter(id => id).map(id => getModuleName(id));
        if (names.length > 0) {
          moduleNames.push(names.join('/'));
        }
      } else if (m) {
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
      initDragAndDrop();
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
        layoutConfig.rows = [{ cols: 3, modules: [] }];
      }
      saveLayoutConfig();
      renderLayout();
      renderLayoutEditor();
      initDragAndDrop();
    });

    editor.appendChild(rowEditor);
  });
}

function initLayoutEditor() {
  const addRowBtn = document.getElementById('addRowBtn');
  if (addRowBtn) {
    addRowBtn.addEventListener('click', () => {
      layoutConfig.rows.push({ cols: 3, modules: [] });
      saveLayoutConfig();
      renderLayout();
      renderLayoutEditor();
      initDragAndDrop();
    });
  }

  const maxWidthSelect = document.getElementById('layoutMaxWidth');
  if (maxWidthSelect) {
    maxWidthSelect.value = layoutConfig.maxWidth;
    maxWidthSelect.addEventListener('change', (e) => {
      layoutConfig.maxWidth = parseInt(e.target.value);
      saveLayoutConfig();
      renderLayout();
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
        setTimeout(() => initDragAndDrop(), 50);
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
          const moduleVisibility = JSON.parse(localStorage.getItem('moduleVisibility') || '{}');
          moduleVisibility[moduleId] = false;
          localStorage.setItem('moduleVisibility', JSON.stringify(moduleVisibility));

          // Also add to hiddenModules for compatibility
          const hiddenModules = JSON.parse(localStorage.getItem('hiddenModules') || '[]');
          if (!hiddenModules.includes(moduleId)) {
            hiddenModules.push(moduleId);
            localStorage.setItem('hiddenModules', JSON.stringify(hiddenModules));
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
          setTimeout(() => initDragAndDrop(), 50);
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
  const savedOrder = localStorage.getItem('moduleOrder');
  if (!savedOrder) return;

  try {
    const order = JSON.parse(savedOrder);
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
  localStorage.setItem('moduleOrder', JSON.stringify(order));
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
            setTimeout(() => initDragAndDrop(), 50);
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
            setTimeout(() => initDragAndDrop(), 50);
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
            setTimeout(() => initDragAndDrop(), 50);
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
    column.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (draggedElement) {
        this.classList.add('drag-over');
        // Start split timer if not already active for this column
        if (splitActiveColumn !== this && !splitHoverTimeout) {
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
        setTimeout(() => initDragAndDrop(), 50);
      }

      this.classList.remove('drag-over');
      return false;
    });
  });

  // Handle split slots (for already-split columns)
  const splitSlots = grid.querySelectorAll('.split-slot');
  splitSlots.forEach(slot => {
    slot.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      if (draggedElement) {
        this.style.background = 'rgba(100, 160, 120, 0.3)';
        this.style.outline = '2px dashed rgba(100, 160, 120, 0.8)';
      }
    });

    slot.addEventListener('dragleave', function() {
      this.style.background = '';
      this.style.outline = '';
    });

    slot.addEventListener('drop', function(e) {
      e.preventDefault();
      e.stopPropagation();
      this.style.background = '';
      this.style.outline = '';

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
        setTimeout(() => initDragAndDrop(), 50);
      }
    });
  });

  const timerCircles = grid.querySelectorAll('.timer-circle');
  timerCircles.forEach(timer => {
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

  loadLayoutConfig();
  loadModuleOrder();

  setTimeout(() => {
    renderLayout();
    renderLayoutEditor();
    initLayoutEditor();
    initDragAndDrop();
    // Apply module visibility after layout is rendered
    if (window.applyModuleVisibility) {
      window.applyModuleVisibility();
    }
  }, 100);
}

// Expose to window
window.moduleConfig = moduleConfig;
window.layoutSystem = {
  renderLayout,
  renderLayoutEditor,
  saveLayoutConfig,
  getLayoutConfig: () => layoutConfig
};
window.initDragAndDrop = initDragAndDrop;
window.initLayout = initLayout;
