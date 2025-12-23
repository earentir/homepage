// RSS module

const defaultRssModules = [];

let rssModules = [];
try {
  const saved = localStorage.getItem('rssModules');
  if (saved) {
    rssModules = JSON.parse(saved);
  } else {
    rssModules = defaultRssModules;
  }
} catch (e) {
  rssModules = defaultRssModules;
}

function saveRssModules() {
  localStorage.setItem('rssModules', JSON.stringify(rssModules));
}

// RSS feed cache functions
function getRssCache() {
  try {
    const cache = localStorage.getItem('rssFeedCache');
    return cache ? JSON.parse(cache) : {};
  } catch (e) {
    return {};
  }
}

function saveRssCache(cache) {
  try {
    localStorage.setItem('rssFeedCache', JSON.stringify(cache));
  } catch (e) {
    console.error('Error saving RSS cache:', e);
  }
}

function getCachedFeed(moduleId) {
  const cache = getRssCache();
  const cached = cache[moduleId];
  if (cached) {
    const cacheAge = Date.now() - cached.timestamp;
    const maxAge = 10 * 60 * 1000; // 10 minutes
    if (cacheAge < maxAge) {
      return cached.data;
    }
    delete cache[moduleId];
    saveRssCache(cache);
  }
  return null;
}

function setCachedFeed(moduleId, data) {
  const cache = getRssCache();
  cache[moduleId] = {
    data: data,
    timestamp: Date.now()
  };
  saveRssCache(cache);
}

function renderRssContent(moduleId, items) {
  const contentEl = document.getElementById(`rss-content-${moduleId}`);
  if (!contentEl) return;

  if (!items || items.length === 0) {
    contentEl.innerHTML = '<div class="muted">No items found</div>';
    return;
  }

  let html = '';
  items.forEach(item => {
    const dateHtml = item.pubDate ? `<div class="muted" style="font-size:0.85em; margin-top:4px;">${item.pubDate}</div>` : '';
    html += `
      <div style="margin-bottom:16px; padding-bottom:16px; border-bottom:1px solid var(--border);">
        <div style="font-weight:600; margin-bottom:8px;"><a href="${item.link}" target="_blank" rel="noreferrer" style="color:var(--txt); text-decoration:none;">${item.title || 'Untitled'}</a></div>
        <div style="color:var(--muted); font-size:0.9em; line-height:1.5; white-space:pre-wrap;">${item.description || ''}</div>
        ${dateHtml}
      </div>
    `;
  });
  contentEl.innerHTML = html;
}

function renderRssModules() {
  const container = document.getElementById('rssModulesContainer');
  if (!container) return;
  container.innerHTML = '';

  const layoutConfig = window.layoutSystem ? window.layoutSystem.getLayoutConfig() : null;
  const modulesInLayout = new Set();
  if (layoutConfig) {
    layoutConfig.rows.forEach(row => {
      row.modules.forEach(moduleId => {
        if (moduleId && moduleId.startsWith('rss-')) {
          modulesInLayout.add(moduleId);
        }
      });
    });
  }

  rssModules.forEach((mod, index) => {
    if (!mod.enabled) return;
    if (modulesInLayout.has(mod.id)) return;

    const card = document.createElement('div');
    card.className = 'card span-6';
    card.setAttribute('data-module', mod.id);
    card.setAttribute('draggable', 'true');

    const hasTimer = index === 0;
    const timerHtml = hasTimer ? '<div class="timer-circle" id="rssTimer" title="Double-click to refresh"></div>' : '';

    card.innerHTML = `
      <h3><i class="fas fa-rss"></i> ${mod.name || 'RSS Feed'}<div class="header-icons"><a href="${mod.url}" target="_blank" rel="noreferrer"><i class="fas fa-external-link-alt"></i></a>${timerHtml}<i class="fas fa-grip-vertical drag-handle" title="Drag to reorder"></i></div></h3>
      <div id="rss-content-${mod.id}">Loading...</div>
    `;
    container.appendChild(card);

    const cachedData = getCachedFeed(mod.id);
    if (cachedData) {
      renderRssContent(mod.id, cachedData);
    }
  });

  if (window.initDragAndDrop) {
    setTimeout(() => window.initDragAndDrop(), 50);
  }

  refreshRss();
}

async function refreshRssModule(mod) {
  try {
    const res = await fetch(`/api/rss?url=${encodeURIComponent(mod.url)}`, {cache: "no-store"});
    const j = await res.json();

    const contentEl = document.getElementById(`rss-content-${mod.id}`);
    if (!contentEl) return;

    if (j.error) {
      contentEl.innerHTML = `<div class="error">Error: ${j.error}</div>`;
      return;
    }

    if (!j.items || j.items.length === 0) {
      contentEl.innerHTML = '<div class="muted">No items found</div>';
      return;
    }

    setCachedFeed(mod.id, j.items);
    renderRssContent(mod.id, j.items);
  } catch(err) {
    const contentEl = document.getElementById(`rss-content-${mod.id}`);
    if (contentEl) {
      const cachedData = getCachedFeed(mod.id);
      if (cachedData) {
        renderRssContent(mod.id, cachedData);
      } else {
        contentEl.innerHTML = `<div class="error">Error loading feed</div>`;
      }
    }
    console.error("Error refreshing RSS module:", err);
  }
}

async function refreshRss() {
  try {
    const promises = rssModules.filter(m => m.enabled).map(mod => refreshRssModule(mod));
    await Promise.all(promises);
    window.startTimer("rss");
  } catch(err) {
    console.error("Error refreshing RSS:", err);
  }
}

function renderRssModuleList() {
  const list = document.getElementById('rssModuleList');
  if (!list) return;
  list.innerHTML = '';

  rssModules.forEach((mod, index) => {
    const item = document.createElement('div');
    item.className = 'module-item' + (mod.enabled ? '' : ' disabled');
    item.innerHTML = `
      <div class="module-icon"><i class="fas fa-rss"></i></div>
      <div class="module-info">
        <div class="module-name">${mod.name || 'RSS Feed'}</div>
        <div class="module-desc">${mod.url || 'No URL'}</div>
      </div>
      <div class="module-controls">
        <button class="btn-small edit-rss-btn" data-index="${index}"><i class="fas fa-edit"></i></button>
        <button class="btn-small delete-rss-btn" data-index="${index}"><i class="fas fa-trash"></i></button>
        <input type="checkbox" ${mod.enabled ? 'checked' : ''} data-index="${index}" title="Enable/disable">
      </div>
    `;
    list.appendChild(item);

    const checkbox = item.querySelector('input[type="checkbox"]');
    checkbox.addEventListener('change', () => {
      rssModules[index].enabled = checkbox.checked;
      item.classList.toggle('disabled', !checkbox.checked);
      saveRssModules();
      renderRssModules();
    });

    const editBtn = item.querySelector('.edit-rss-btn');
    editBtn.addEventListener('click', () => {
      showRssEditDialog(index);
    });

    const deleteBtn = item.querySelector('.delete-rss-btn');
    deleteBtn.addEventListener('click', () => {
      if (confirm(`Delete RSS module "${mod.name || 'RSS Feed'}"?`)) {
        rssModules.splice(index, 1);
        saveRssModules();
        renderRssModuleList();
        renderRssModules();
      }
    });
  });
}

function showRssEditDialog(index) {
  const mod = index >= 0 ? rssModules[index] : { id: 'rss-' + Date.now(), name: '', url: '', enabled: true };
  const isNew = index < 0;

  const dialog = document.createElement('div');
  dialog.className = 'modal-overlay active';
  dialog.innerHTML = `
    <div class="modal" style="max-width:500px;">
      <div class="modal-header">
        <h2><i class="fas fa-rss"></i> ${isNew ? 'Add' : 'Edit'} RSS Module</h2>
        <button class="modal-close rss-dialog-close"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-content">
        <div class="pref-section">
          <div class="pref-row">
            <label>Name</label>
            <input type="text" id="rss-edit-name" placeholder="RSS Feed Name" value="${mod.name || ''}">
          </div>
          <div class="pref-row">
            <label>RSS Feed URL</label>
            <input type="text" id="rss-edit-url" placeholder="https://example.com/feed.xml" value="${mod.url || ''}">
          </div>
        </div>
        <div style="margin-top:20px; display:flex; justify-content:flex-end; gap:10px;">
          <button class="btn-small rss-dialog-close">Cancel</button>
          <button class="btn-small" id="rss-save">Save</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(dialog);

  function closeDialog() {
    dialog.remove();
  }

  dialog.querySelectorAll('.rss-dialog-close').forEach(btn => {
    btn.addEventListener('click', closeDialog);
  });

  document.getElementById('rss-save').addEventListener('click', () => {
    const name = document.getElementById('rss-edit-name').value.trim();
    const url = document.getElementById('rss-edit-url').value.trim();

    if (!url) {
      alert('RSS Feed URL is required');
      return;
    }

    if (isNew) {
      rssModules.push({
        id: 'rss-' + Date.now(),
        name: name || 'RSS Feed',
        url: url,
        enabled: true
      });
    } else {
      rssModules[index].name = name || 'RSS Feed';
      rssModules[index].url = url;
    }

    saveRssModules();
    window.rssModules = rssModules;
    renderRssModuleList();
    renderRssModules();
    refreshRss();
    closeDialog();
  });
}

function initRss() {
  const addBtn = document.getElementById('addRssBtn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      showRssEditDialog(-1);
    });
  }

  const prefsBtn = document.getElementById('prefsBtn');
  if (prefsBtn) {
    prefsBtn.addEventListener('click', () => {
      renderRssModuleList();
    });
  }

  renderRssModules();
}

// Export to window
window.rssModules = rssModules;
window.saveRssModules = saveRssModules;
window.renderRssModules = renderRssModules;
window.refreshRss = refreshRss;
window.renderRssModuleList = renderRssModuleList;
window.initRss = initRss;
