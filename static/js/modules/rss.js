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
    if (window.debugError) window.debugError('rss', 'Error saving RSS cache:', e);
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

  // Get module settings
  const mod = rssModules.find(m => m.id === moduleId);
  const showTitle = mod && mod.showTitle !== undefined ? mod.showTitle : true;
  const showText = mod && mod.showText !== undefined ? mod.showText : true;
  const showDate = mod && mod.showDate !== undefined ? mod.showDate : true;

  let html = '';
  items.forEach(item => {
    // Build title with optional image preview on hover
    let titleHtml = '';
    if (showTitle) {
      if (item.image) {
        titleHtml = `<div style="font-weight:600; margin-bottom:8px; position:relative;" class="rss-title-hover">
          <a href="${item.link}" target="_blank" rel="noreferrer" style="color:var(--txt); text-decoration:none;">${item.title || 'Untitled'}</a>
          <div class="rss-image-preview" style="display:none; position:absolute; z-index:1000; left:0; top:100%; margin-top:8px; background:var(--bg); border:1px solid var(--border); border-radius:8px; padding:8px; box-shadow:0 4px 12px rgba(0,0,0,0.3);">
            <img src="${item.image}" style="max-width:300px; max-height:200px; border-radius:4px;" alt="">
          </div>
        </div>`;
      } else {
        titleHtml = `<div style="font-weight:600; margin-bottom:8px;"><a href="${item.link}" target="_blank" rel="noreferrer" style="color:var(--txt); text-decoration:none;">${item.title || 'Untitled'}</a></div>`;
      }
    }
    const textHtml = showText && item.description ? `<div style="color:var(--muted); font-size:0.9em; line-height:1.5; white-space:pre-wrap;">${item.description}</div>` : '';
    const dateHtml = showDate && item.pubDate ? `<div class="muted" style="font-size:0.85em; margin-top:4px;">${item.pubDate}</div>` : '';

    html += `
      <div style="margin-bottom:16px; padding-bottom:16px; border-bottom:1px solid var(--border);">
        ${titleHtml}
        ${textHtml}
        ${dateHtml}
      </div>
    `;
  });
  contentEl.innerHTML = html;

  // Add hover handlers for image previews
  contentEl.querySelectorAll('.rss-title-hover').forEach(el => {
    const preview = el.querySelector('.rss-image-preview');
    if (preview) {
      el.addEventListener('mouseenter', () => {
        preview.style.display = 'block';
      });
      el.addEventListener('mouseleave', () => {
        preview.style.display = 'none';
      });
    }
  });
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
    const maxItems = mod.maxItems || 5;
    const res = await fetch(`/api/rss?url=${encodeURIComponent(mod.url)}&count=${maxItems}`, {cache: "no-store"});
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

    // Limit items to maxItems
    const items = j.items.slice(0, maxItems);
    setCachedFeed(mod.id, items);
    renderRssContent(mod.id, items);
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
    if (window.debugError) window.debugError('rss', "Error refreshing RSS module:", err);
  }
}

async function refreshRss() {
  try {
    const promises = rssModules.filter(m => m.enabled).map(mod => refreshRssModule(mod));
    await Promise.all(promises);
    window.startTimer("rss");
  } catch(err) {
    if (window.debugError) window.debugError('rss', "Error refreshing RSS:", err);
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
  const mod = index >= 0 ? rssModules[index] : { id: 'rss-' + Date.now(), name: '', url: '', enabled: true, showTitle: true, showText: true, showDate: true, maxItems: 5 };
  const isNew = index < 0;

  // Ensure defaults for existing modules
  if (mod.showTitle === undefined) mod.showTitle = true;
  if (mod.showText === undefined) mod.showText = true;
  if (mod.showDate === undefined) mod.showDate = true;
  if (mod.maxItems === undefined) mod.maxItems = 5;

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
          <div class="pref-row">
            <label>Articles</label>
            <input type="number" id="rss-edit-max" value="${mod.maxItems || 5}" min="1" max="20" style="width:60px;">
          </div>
          <div class="pref-row" style="margin-top:10px;">
            <label>Show</label>
            <div style="display:flex; gap:15px;">
              <label style="display:flex; align-items:center; gap:5px; cursor:pointer;">
                <input type="checkbox" id="rss-edit-title" ${mod.showTitle ? 'checked' : ''}> Title
              </label>
              <label style="display:flex; align-items:center; gap:5px; cursor:pointer;">
                <input type="checkbox" id="rss-edit-text" ${mod.showText ? 'checked' : ''}> Text
              </label>
              <label style="display:flex; align-items:center; gap:5px; cursor:pointer;">
                <input type="checkbox" id="rss-edit-date" ${mod.showDate ? 'checked' : ''}> Date
              </label>
            </div>
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
    const maxItems = Math.max(1, Math.min(20, parseInt(document.getElementById('rss-edit-max').value) || 5));
    const showTitle = document.getElementById('rss-edit-title').checked;
    const showText = document.getElementById('rss-edit-text').checked;
    const showDate = document.getElementById('rss-edit-date').checked;

    if (!url) {
      alert('RSS Feed URL is required');
      return;
    }

    if (isNew) {
      rssModules.push({
        id: 'rss-' + Date.now(),
        name: name || 'RSS Feed',
        url: url,
        enabled: true,
        maxItems: maxItems,
        showTitle: showTitle,
        showText: showText,
        showDate: showDate
      });
    } else {
      rssModules[index].name = name || 'RSS Feed';
      rssModules[index].url = url;
      rssModules[index].maxItems = maxItems;
      rssModules[index].showTitle = showTitle;
      rssModules[index].showText = showText;
      rssModules[index].showDate = showDate;
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
