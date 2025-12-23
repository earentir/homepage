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
  disk: { name: 'Disk', icon: 'fa-hdd', desc: 'Disk usage with history graph', hasTimer: true, timerKey: 'disk', defaultInterval: 15, enabled: true },
  links: { name: 'Quick Links', icon: 'fa-link', desc: 'Quick access links', hasTimer: false, enabled: true },
  monitoring: { name: 'Monitoring', icon: 'fa-heartbeat', desc: 'Service health monitoring', hasTimer: true, timerKey: 'monitoring', defaultInterval: 60, enabled: true },
  snmp: { name: 'SNMP', icon: 'fa-network-wired', desc: 'SNMP device queries', hasTimer: true, timerKey: 'snmp', defaultInterval: 60, enabled: true },
  rss: { name: 'RSS', icon: 'fa-rss', desc: 'RSS feed reader', hasTimer: true, timerKey: 'rss', defaultInterval: 300, enabled: true },
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
    console.error('Failed to load layout config:', e);
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
    console.error('Failed to save layout config:', e);
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

  // Combine and deduplicate by module ID (use first occurrence)
  const allCards = [...gridCards, ...githubCards, ...rssCards];
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

      const moduleId = row.modules[col];
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
  return moduleId || 'Empty';
}

function renderLayoutEditor() {
  const editor = document.getElementById('layoutEditor');
  if (!editor) return;

  editor.innerHTML = '';

  layoutConfig.rows.forEach((row, rowIndex) => {
    const moduleNames = row.modules
      .filter(m => m !== null)
      .map(m => getModuleName(m));
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
      const modules = layoutConfig.rows[rowIndex].modules.filter(m => m);
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
    console.error('Failed to load module order:', e);
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
  const cards = [...gridCards, ...githubCards, ...rssCards];
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
        const draggedPos = findCardColumn(draggedElement);
        const targetPos = findCardColumn(this);

        if (draggedPos && targetPos) {
          if (layoutConfig.rows[draggedPos.rowIndex] && layoutConfig.rows[targetPos.rowIndex]) {
            layoutConfig.rows[draggedPos.rowIndex].modules[draggedPos.colIndex] = targetModuleId;
            layoutConfig.rows[targetPos.rowIndex].modules[targetPos.colIndex] = draggedModuleId;
            saveLayoutConfig();
            renderLayout();
            setTimeout(() => initDragAndDrop(), 50);
          }
        } else if (!draggedPos && targetPos) {
          if (layoutConfig.rows[targetPos.rowIndex]) {
            layoutConfig.rows[targetPos.rowIndex].modules[targetPos.colIndex] = draggedModuleId;
            saveLayoutConfig();
            renderLayout();
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
            setTimeout(() => initDragAndDrop(), 50);
          }
        } else if (!draggedPos && !targetPos) {
          if (window.renderGitHubModules) window.renderGitHubModules();
          if (window.renderRssModules) window.renderRssModules();
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
      }
    });

    column.addEventListener('dragleave', function() {
      this.classList.remove('drag-over');
    });

    column.addEventListener('drop', function(e) {
      e.preventDefault();
      e.stopPropagation();

      if (draggedElement) {
        const rowIndex = parseInt(this.dataset.rowIndex);
        const colIndex = parseInt(this.dataset.colIndex);
        const moduleId = draggedElement.getAttribute('data-module');

        const githubContainer = document.getElementById('githubModulesContainer');
        const rssContainer = document.getElementById('rssModulesContainer');
        const isInGitHubContainer = githubContainer && githubContainer.contains(draggedElement);
        const isInRssContainer = rssContainer && rssContainer.contains(draggedElement);

        layoutConfig.rows.forEach(row => {
          const idx = row.modules.indexOf(moduleId);
          if (idx !== -1) {
            row.modules[idx] = null;
          }
        });

        if (layoutConfig.rows[rowIndex]) {
          const existingModuleId = layoutConfig.rows[rowIndex].modules[colIndex];
          layoutConfig.rows[rowIndex].modules[colIndex] = moduleId;

          if (existingModuleId && !isInGitHubContainer && !isInRssContainer) {
            const draggedPos = findCardColumn(draggedElement);
            if (draggedPos && layoutConfig.rows[draggedPos.rowIndex]) {
              layoutConfig.rows[draggedPos.rowIndex].modules[draggedPos.colIndex] = existingModuleId;
            }
          }
        }

        saveLayoutConfig();
        renderLayout();
        setTimeout(() => initDragAndDrop(), 50);
      }

      this.classList.remove('drag-over');
      return false;
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
    console.error('moduleGrid not found');
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
