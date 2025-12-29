// Quicklinks module

const defaultQuicklinks = [
  { id: 'ql-1', title: 'Router', url: 'http://192.168.1.1', icon: 'fa-network-wired' }
];

let quicklinks = [];
let quicklinksLayout = 1;

// Load from localStorage
(function() {
  try {
    const saved = localStorage.getItem('quicklinks');
    if (saved) {
      quicklinks = JSON.parse(saved);
    } else {
      quicklinks = defaultQuicklinks;
    }
  } catch (e) {
    quicklinks = defaultQuicklinks;
  }

  try {
    const savedLayout = localStorage.getItem('quicklinksLayout');
    if (savedLayout) {
      quicklinksLayout = parseInt(savedLayout) || 1;
    }
  } catch (e) {}
})();

function saveQuicklinks() {
  try {
    localStorage.setItem('quicklinks', JSON.stringify(quicklinks));
  } catch (e) {}
}

function saveQuicklinksLayout(cols) {
  quicklinksLayout = cols;
  try {
    localStorage.setItem('quicklinksLayout', cols.toString());
  } catch (e) {}
}

function updateLayoutButtons() {
  const buttons = document.querySelectorAll('.layout-btn');
  buttons.forEach(btn => {
    const cols = parseInt(btn.dataset.cols);
    btn.classList.toggle('active', cols === quicklinksLayout);
  });
}

// Favicon cache
function getFaviconCache() {
  try {
    const cache = localStorage.getItem('faviconCache');
    return cache ? JSON.parse(cache) : {};
  } catch (e) {
    return {};
  }
}

function saveFaviconCache(cache) {
  try {
    localStorage.setItem('faviconCache', JSON.stringify(cache));
  } catch (e) {}
}

async function fetchAndCacheFavicon(url) {
  const cache = getFaviconCache();
  const cacheKey = new URL(url).origin;

  if (cache[cacheKey] && cache[cacheKey].expires > Date.now()) {
    return cache[cacheKey].data;
  }

  try {
    const res = await fetch('/api/favicon?url=' + encodeURIComponent(url));
    const data = await res.json();

    if (data.favicon) {
      cache[cacheKey] = {
        data: data.favicon,
        expires: Date.now() + (7 * 24 * 60 * 60 * 1000)
      };
      saveFaviconCache(cache);
      return data.favicon;
    }
  } catch (e) {
    if (window.debugError) window.debugError('quicklinks', 'Error fetching favicon:', e);
  }

  return null;
}

function renderQuicklinks() {
  const container = document.getElementById('quicklinksContainer');
  if (!container) return;

  if (quicklinks.length === 0) {
    container.innerHTML = '<div class="small" style="color:var(--muted);">Add links in Preferences → Quicklinks</div>';
    return;
  }

  container.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'quicklinks-grid cols-' + quicklinksLayout;

  quicklinks.forEach(link => {
    const item = document.createElement('div');
    item.className = 'ql-item';

    const a = document.createElement('a');
    a.href = link.url;
    a.target = '_blank';
    a.rel = 'noreferrer';

    if (link.icon) {
      a.innerHTML = '<span class="ql-icon"><i class="fas ' + link.icon + '"></i></span><span class="ql-title">' + link.title + '</span>';
    } else {
      const cache = getFaviconCache();
      try {
        const cacheKey = new URL(link.url).origin;
        if (cache[cacheKey] && cache[cacheKey].expires > Date.now()) {
          a.innerHTML = '<span class="ql-icon"><img src="' + cache[cacheKey].data + '" width="14" height="14"></span><span class="ql-title">' + link.title + '</span>';
        } else {
          const iconSpan = document.createElement('span');
          iconSpan.className = 'ql-icon';
          iconSpan.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
          const titleSpan = document.createElement('span');
          titleSpan.className = 'ql-title';
          titleSpan.textContent = link.title;
          a.appendChild(iconSpan);
          a.appendChild(titleSpan);

          fetchAndCacheFavicon(link.url).then(favicon => {
            if (favicon) {
              iconSpan.innerHTML = '<img src="' + favicon + '" width="14" height="14">';
            } else {
              iconSpan.innerHTML = '<i class="fas fa-link"></i>';
            }
          });
        }
      } catch (e) {
        a.innerHTML = '<span class="ql-icon"><i class="fas fa-link"></i></span><span class="ql-title">' + link.title + '</span>';
      }
    }

    item.appendChild(a);
    grid.appendChild(item);
  });

  container.appendChild(grid);
}

function moveQuicklinkUp(index) {
  if (window.moveArrayItemUp && window.moveArrayItemUp(quicklinks, index)) {
    saveQuicklinks();
    renderQuicklinksList();
    renderQuicklinks();
  }
}

function moveQuicklinkDown(index) {
  if (window.moveArrayItemDown && window.moveArrayItemDown(quicklinks, index)) {
    saveQuicklinks();
    renderQuicklinksList();
    renderQuicklinks();
  }
}

function moveQuicklink(fromIndex, toIndex) {
  if (window.moveArrayItem && window.moveArrayItem(quicklinks, fromIndex, toIndex)) {
    saveQuicklinks();
    renderQuicklinksList();
    renderQuicklinks();
  }
}

function renderQuicklinksList() {
  const list = document.getElementById('quicklinksList');
  if (!list) return;
  list.innerHTML = '';

  if (quicklinks.length === 0) {
    list.innerHTML = '<div class="small" style="color:var(--muted);padding:10px;">No quicklinks yet. Click "Add" to create one.</div>';
    return;
  }

  quicklinks.forEach((link, index) => {
    const item = document.createElement('div');
    item.className = 'module-item';
    item.draggable = true;
    item.dataset.index = index;
    const canMoveUp = index > 0;
    const canMoveDown = index < quicklinks.length - 1;
    item.innerHTML = `
      <div class="module-icon drag-handle" style="cursor: grab; color: var(--muted);" title="Drag to reorder">
        <i class="fas fa-grip-vertical"></i>
      </div>
      <div class="module-icon"><i class="fas ${link.icon || 'fa-link'}"></i></div>
      <div class="module-info">
        <div class="module-name">${link.title}</div>
        <div class="module-desc">${link.url}</div>
      </div>
      <div class="module-controls">
        <button class="btn-small move-ql-up-btn" data-index="${index}" ${!canMoveUp ? 'disabled' : ''} title="Move up">
          <i class="fas fa-arrow-up"></i>
        </button>
        <button class="btn-small move-ql-down-btn" data-index="${index}" ${!canMoveDown ? 'disabled' : ''} title="Move down">
          <i class="fas fa-arrow-down"></i>
        </button>
        <button class="btn-small edit-ql-btn" data-index="${index}"><i class="fas fa-edit"></i></button>
        <button class="btn-small delete-ql-btn" data-index="${index}"><i class="fas fa-trash"></i></button>
      </div>
    `;
    list.appendChild(item);

    // Setup drag and drop using common function
    if (window.setupDragAndDrop) {
      window.setupDragAndDrop(item, index, quicklinks, (fromIndex, toIndex) => {
        moveQuicklink(fromIndex, toIndex);
      }, () => {
        saveQuicklinks();
        renderQuicklinksList();
        renderQuicklinks();
      });
    }

    // Setup move buttons using common function
    if (window.setupMoveButtons) {
      window.setupMoveButtons(item, index, quicklinks.length,
        'move-ql-up-btn', 'move-ql-down-btn',
        () => moveQuicklinkUp(index),
        () => moveQuicklinkDown(index)
      );
    }

    item.querySelector('.edit-ql-btn').addEventListener('click', () => {
      editQuicklink(index);
    });

    item.querySelector('.delete-ql-btn').addEventListener('click', () => {
      if (confirm('Delete quicklink "' + link.title + '"?')) {
        quicklinks.splice(index, 1);
        saveQuicklinks();
        renderQuicklinksList();
        renderQuicklinks();
      }
    });
  });
}

function editQuicklink(index) {
  const link = index >= 0 ? quicklinks[index] : { id: 'ql-' + Date.now(), title: '', url: '', icon: '' };
  const isNew = index < 0;

  const titleInput = document.getElementById('ql-title');
  const urlInput = document.getElementById('ql-url');
  const iconInput = document.getElementById('ql-icon');
  const form = document.getElementById('quicklinkForm');

  if (titleInput) titleInput.value = link.title || '';
  if (urlInput) urlInput.value = link.url || '';
  if (iconInput) iconInput.value = link.icon || '';
  if (form) {
    form.style.display = 'block';
    form.dataset.editIndex = isNew ? '-1' : index;
  }
}

function initQuicklinks() {
  // Layout buttons
  document.querySelectorAll('.layout-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const cols = parseInt(btn.dataset.cols);
      saveQuicklinksLayout(cols);
      updateLayoutButtons();
      renderQuicklinks();
    });
  });

  // Observe modal for layout button updates
  const prefsModal = document.getElementById('prefsModal');
  if (prefsModal) {
    const observer = new MutationObserver(() => {
      if (prefsModal.classList.contains('active')) {
        updateLayoutButtons();
      }
    });
    observer.observe(prefsModal, { attributes: true, attributeFilter: ['class'] });
  }

  // Add button
  const addBtn = document.getElementById('addQuicklinkBtn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      editQuicklink(-1);
    });
  }

  // Cancel button
  const cancelBtn = document.getElementById('ql-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      document.getElementById('quicklinkForm').style.display = 'none';
    });
  }

  // Save button
  const saveBtn = document.getElementById('ql-save');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const title = document.getElementById('ql-title').value.trim();
      const url = document.getElementById('ql-url').value.trim();
      const icon = document.getElementById('ql-icon').value.trim();
      const form = document.getElementById('quicklinkForm');
      const editIndex = parseInt(form.dataset.editIndex);

      if (!title || !url) {
        alert('Please enter a title and URL');
        return;
      }

      const link = {
        id: editIndex >= 0 ? quicklinks[editIndex].id : 'ql-' + Date.now(),
        title,
        url,
        icon
      };

      if (editIndex >= 0) {
        quicklinks[editIndex] = link;
      } else {
        quicklinks.push(link);
      }

      saveQuicklinks();
      renderQuicklinksList();
      renderQuicklinks();
      form.style.display = 'none';
    });
  }

  renderQuicklinks();
}

// Export to window
window.quicklinks = quicklinks;
window.saveQuicklinks = saveQuicklinks;
window.renderQuicklinks = renderQuicklinks;
window.renderQuicklinksList = renderQuicklinksList;
window.initQuicklinks = initQuicklinks;
