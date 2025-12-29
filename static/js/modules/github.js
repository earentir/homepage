// GitHub module

const defaultGitHubModules = [
  { id: 'github-1', accountType: 'user', displayType: 'repos', name: 'Earentir', url: 'https://github.com/Earentir', enabled: true },
  { id: 'github-2', accountType: 'org', displayType: 'repos', name: 'network-plane', url: 'https://github.com/network-plane', enabled: true }
];

const githubDisplayTypes = {
  repos: { name: 'Repositories', icon: 'fa-folder', desc: 'Show recent repositories' },
  prs: { name: 'Pull Requests', icon: 'fa-code-branch', desc: 'Show open pull requests' },
  commits: { name: 'Commits', icon: 'fa-code-commit', desc: 'Show recent commits' },
  stats: { name: 'Stats', icon: 'fa-chart-bar', desc: 'Show repository statistics' },
  issues: { name: 'Issues', icon: 'fa-exclamation-circle', desc: 'Show open issues' }
};

let githubModules = [];
try {
  const saved = localStorage.getItem('githubModules');
  if (saved) {
    githubModules = JSON.parse(saved);
  } else {
    githubModules = defaultGitHubModules;
  }
} catch (e) {
  githubModules = defaultGitHubModules;
}

function saveGitHubModules() {
  localStorage.setItem('githubModules', JSON.stringify(githubModules));
}

// GitHub data cache functions
function getGitHubCache() {
  try {
    const cache = localStorage.getItem('githubDataCache');
    return cache ? JSON.parse(cache) : {};
  } catch (e) {
    return {};
  }
}

function saveGitHubCache(cache) {
  try {
    localStorage.setItem('githubDataCache', JSON.stringify(cache));
  } catch (e) {
    if (window.debugError) window.debugError('github', 'Error saving GitHub cache:', e);
  }
}

function getCachedGitHubData(moduleId, displayType) {
  const cacheKey = `${moduleId}-${displayType}`;
  const cache = getGitHubCache();
  const cached = cache[cacheKey];
  if (cached) {
    const cacheAge = Date.now() - cached.timestamp;
    const timer = window.timers && window.timers.github;
    const maxAge = timer ? timer.interval : 900000; // Default 15 minutes
    if (cacheAge < maxAge) {
      return cached.data;
    }
    delete cache[cacheKey];
    saveGitHubCache(cache);
  }
  return null;
}

function setCachedGitHubData(moduleId, displayType, data) {
  const cacheKey = `${moduleId}-${displayType}`;
  const cache = getGitHubCache();
  cache[cacheKey] = {
    data: data,
    timestamp: Date.now()
  };
  saveGitHubCache(cache);
}

function renderGitHubContent(moduleId, displayType, data, maxItems) {
  const container = document.getElementById("content-" + moduleId);
  const countEl = document.getElementById("count-" + moduleId);
  const errEl = document.getElementById("err-" + moduleId);
  const limit = maxItems || 5;

  if (!container) return;

  if (data.error) {
    container.innerHTML = "";
    if (errEl) errEl.textContent = data.error;
    if (countEl) countEl.textContent = "Error";
    return;
  }

  container.innerHTML = "";
  if (errEl) errEl.textContent = "";

  if (displayType === 'repos') {
    renderReposList(container, countEl, data, limit);
  } else if (displayType === 'prs') {
    renderPRsList(container, countEl, data, limit);
  } else if (displayType === 'commits') {
    renderCommitsList(container, countEl, data, limit);
  } else if (displayType === 'issues') {
    renderIssuesList(container, countEl, data, limit);
  } else if (displayType === 'stats') {
    renderStats(container, countEl, data);
  } else {
    renderReposList(container, countEl, data, limit);
  }
}

function renderReposList(container, countEl, data, maxItems) {
  const limit = maxItems || 5;
  if (data.repos && data.repos.length > 0) {
    if (countEl) countEl.textContent = (data.total || data.repos.length) + " repositories";
    data.repos.slice(0, limit).forEach((repo) => {
      const item = document.createElement("div");
      item.className = "repo-item";
      const name = document.createElement("div");
      name.className = "repo-name";
      const link = document.createElement("a");
      link.href = repo.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.innerHTML = '<i class="fab fa-github"></i> ' + repo.fullName;
      name.appendChild(link);
      item.appendChild(name);
      if (repo.description) {
        const desc = document.createElement("div");
        desc.className = "repo-desc";
        desc.textContent = repo.description;
        item.appendChild(desc);
      }
      const meta = document.createElement("div");
      meta.className = "repo-meta";
      if (repo.stars > 0) {
        const stars = document.createElement("span");
        stars.innerHTML = '<i class="fas fa-star"></i> ' + repo.stars;
        meta.appendChild(stars);
      }
      if (repo.language) {
        const lang = document.createElement("span");
        lang.innerHTML = '<i class="fas fa-code"></i> ' + repo.language;
        meta.appendChild(lang);
      }
      if (repo.updated) {
        const updated = document.createElement("span");
        updated.innerHTML = '<i class="fas fa-clock"></i> ' + repo.updated;
        meta.appendChild(updated);
      }
      item.appendChild(meta);
      container.appendChild(item);
    });
  } else {
    container.innerHTML = '<div class="small">No repositories found.</div>';
    if (countEl) countEl.textContent = "0 repositories";
  }
}

function renderPRsList(container, countEl, data, maxItems) {
  const limit = maxItems || 5;
  if (data.items && data.items.length > 0) {
    if (countEl) countEl.textContent = (data.total || data.items.length) + " pull requests";
    data.items.slice(0, limit).forEach((pr) => {
      const item = document.createElement("div");
      item.className = "repo-item";
      item.innerHTML = `
        <div class="repo-name"><a href="${pr.url}" target="_blank" rel="noreferrer"><i class="fas fa-code-branch"></i> ${pr.title}</a></div>
        <div class="repo-meta">
          <span><i class="fas fa-user"></i> ${pr.user || 'Unknown'}</span>
          <span><i class="fas fa-clock"></i> ${pr.created || ''}</span>
          <span class="badge-${pr.state || 'open'}">${pr.state || 'open'}</span>
        </div>
      `;
      container.appendChild(item);
    });
  } else {
    container.innerHTML = '<div class="small">No pull requests found.</div>';
    if (countEl) countEl.textContent = "0 pull requests";
  }
}

function renderCommitsList(container, countEl, data, maxItems) {
  const limit = maxItems || 5;
  if (data.items && data.items.length > 0) {
    if (countEl) countEl.textContent = (data.items.length) + " recent commits";
    data.items.slice(0, limit).forEach((commit) => {
      const item = document.createElement("div");
      item.className = "repo-item";
      item.innerHTML = `
        <div class="repo-name"><a href="${commit.url}" target="_blank" rel="noreferrer"><i class="fas fa-code-commit"></i> ${commit.message}</a></div>
        <div class="repo-meta">
          <span><i class="fas fa-user"></i> ${commit.author || 'Unknown'}</span>
          <span><i class="fas fa-clock"></i> ${commit.date || ''}</span>
        </div>
      `;
      container.appendChild(item);
    });
  } else {
    container.innerHTML = '<div class="small">No commits found.</div>';
    if (countEl) countEl.textContent = "0 commits";
  }
}

function renderIssuesList(container, countEl, data, maxItems) {
  const limit = maxItems || 5;
  if (data.items && data.items.length > 0) {
    if (countEl) countEl.textContent = (data.total || data.items.length) + " issues";
    data.items.slice(0, limit).forEach((issue) => {
      const item = document.createElement("div");
      item.className = "repo-item";
      item.innerHTML = `
        <div class="repo-name"><a href="${issue.url}" target="_blank" rel="noreferrer"><i class="fas fa-exclamation-circle"></i> ${issue.title}</a></div>
        <div class="repo-meta">
          <span><i class="fas fa-user"></i> ${issue.user || 'Unknown'}</span>
          <span><i class="fas fa-clock"></i> ${issue.created || ''}</span>
          <span class="badge-${issue.state || 'open'}">${issue.state || 'open'}</span>
        </div>
      `;
      container.appendChild(item);
    });
  } else {
    container.innerHTML = '<div class="small">No issues found.</div>';
    if (countEl) countEl.textContent = "0 issues";
  }
}

function renderStats(container, countEl, data) {
  if (data.stats) {
    if (countEl) countEl.textContent = "Repository stats";
    container.innerHTML = `
      <div class="kv"><div class="k">Stars</div><div class="v">${data.stats.stars || 0}</div></div>
      <div class="kv"><div class="k">Forks</div><div class="v">${data.stats.forks || 0}</div></div>
      <div class="kv"><div class="k">Watchers</div><div class="v">${data.stats.watchers || 0}</div></div>
      <div class="kv"><div class="k">Open Issues</div><div class="v">${data.stats.openIssues || 0}</div></div>
      <div class="kv"><div class="k">Language</div><div class="v">${data.stats.language || 'N/A'}</div></div>
    `;
  } else {
    container.innerHTML = '<div class="small">No stats available.</div>';
    if (countEl) countEl.textContent = "No stats";
  }
}

async function refreshGitHubModule(mod, forceRefresh = false) {
  try {
    const displayType = mod.displayType || 'repos';
    const accountType = mod.accountType || mod.type || 'user';

    // Check if we should use cached data (unless forced refresh)
    if (!forceRefresh) {
      const timer = window.timers && window.timers.github;
      let shouldUseCache = false;

      if (timer && timer.lastUpdate > 0) {
        // Timer has been started, check if it has expired
        const elapsed = Date.now() - timer.lastUpdate;
        if (elapsed < timer.interval) {
          // Timer hasn't expired, use cached data if available
          shouldUseCache = true;
        }
      } else {
        // Timer not started yet, use cached data if available (for initial load)
        shouldUseCache = true;
      }

      if (shouldUseCache) {
        const cachedData = getCachedGitHubData(mod.id, displayType);
        if (cachedData) {
          renderGitHubContent(mod.id, displayType, cachedData, mod.maxItems || 5);
          return;
        }
      }
    }

    // Fetch from API (timer expired or forced refresh or no cache)
    const githubToken = localStorage.getItem('githubToken') || '';
    const maxItems = mod.maxItems || 5;
    let url = "/api/github/" + displayType + "?name=" + encodeURIComponent(mod.name) + "&type=" + accountType + "&count=" + maxItems;
    if (githubToken) url += "&token=" + encodeURIComponent(githubToken);
    const res = await fetch(url, {cache:"no-store"});
    const data = await res.json();

    // Store in cache
    setCachedGitHubData(mod.id, displayType, data);
    renderGitHubContent(mod.id, displayType, data, maxItems);
  } catch(err) {
    if (window.debugError) window.debugError('github', "Error refreshing GitHub module " + mod.id + ":", err);
    // Try to use cached data on error
    const cachedData = getCachedGitHubData(mod.id, displayType);
    if (cachedData) {
      renderGitHubContent(mod.id, displayType, cachedData, mod.maxItems || 5);
    } else {
      const errEl = document.getElementById("err-" + mod.id);
      if (errEl) errEl.textContent = "Error loading data";
    }
  }
}

async function refreshGitHub(forceRefresh = false) {
  try {
    const promises = githubModules.filter(m => m.enabled).map(mod => refreshGitHubModule(mod, forceRefresh));
    await Promise.all(promises);
    window.startTimer("github");
  } catch(err) {
    if (window.debugError) window.debugError('github', "Error refreshing GitHub:", err);
  }
}

function renderGitHubModules() {
  const container = document.getElementById('githubModulesContainer');
  if (!container) return;
  container.innerHTML = '';

  const layoutConfig = window.layoutSystem ? window.layoutSystem.getLayoutConfig() : null;
  const modulesInLayout = new Set();
  if (layoutConfig) {
    layoutConfig.rows.forEach(row => {
      row.modules.forEach(moduleId => {
        if (moduleId && (moduleId.startsWith('github-') || moduleId.startsWith('rss-'))) {
          modulesInLayout.add(moduleId);
        }
      });
    });
  }

  githubModules.forEach((mod, index) => {
    if (!mod.enabled) return;
    if (modulesInLayout.has(mod.id)) return;

    const displayType = mod.displayType || 'repos';
    const typeInfo = githubDisplayTypes[displayType] || githubDisplayTypes.repos;

    const card = document.createElement('div');
    card.className = 'card span-6';
    card.setAttribute('data-module', mod.id);
    card.setAttribute('draggable', 'true');

    const hasTimer = index === 0;
    const timerHtml = hasTimer ? '<div class="timer-circle" id="githubTimer" title="Double-click to refresh"></div>' : '';
    const titleSuffix = displayType !== 'repos' ? ' - ' + typeInfo.name : '';

    card.innerHTML = `
      <h3><i class="fab fa-github"></i> ${mod.name}${titleSuffix}<div class="header-icons"><a href="${mod.url}" target="_blank" rel="noreferrer"><i class="fas fa-external-link-alt"></i></a>${timerHtml}<i class="fas fa-grip-vertical drag-handle" title="Drag to reorder"></i></div></h3>
      <div class="small" style="margin-bottom:8px; color:var(--muted);"><i class="fas ${typeInfo.icon}"></i> <span id="count-${mod.id}">—</span></div>
      <div id="content-${mod.id}">
        <div class="small">Loading...</div>
      </div>
      <div class="small" id="err-${mod.id}"></div>
    `;

    container.appendChild(card);

    // Load cached data on initial render
    const cachedData = getCachedGitHubData(mod.id, displayType);
    if (cachedData) {
      renderGitHubContent(mod.id, displayType, cachedData, mod.maxItems || 5);
    }
  });

  if (window.initDragAndDrop) {
    setTimeout(() => window.initDragAndDrop(), 50);
  }
}

function renderGitHubModuleList() {
  const list = document.getElementById('githubModuleList');
  if (!list) return;
  list.innerHTML = '';

  githubModules.forEach((mod, index) => {
    const accountType = mod.accountType || mod.type || 'user';
    const displayType = mod.displayType || 'repos';
    const displayInfo = githubDisplayTypes[displayType] || githubDisplayTypes.repos;
    const accountLabel = accountType === 'org' ? 'Organization' : (accountType === 'repo' ? 'Repository' : 'User');

    const item = document.createElement('div');
    item.className = 'module-item' + (mod.enabled ? '' : ' disabled');
    item.innerHTML = `
      <div class="module-icon"><i class="fab fa-github"></i></div>
      <div class="module-info">
        <div class="module-name">${mod.name}</div>
        <div class="module-desc">${accountLabel} • ${displayInfo.name}</div>
      </div>
      <div class="module-controls">
        <button class="btn-small edit-github-btn" data-index="${index}"><i class="fas fa-edit"></i></button>
        <button class="btn-small delete-github-btn" data-index="${index}"><i class="fas fa-trash"></i></button>
        <input type="checkbox" ${mod.enabled ? 'checked' : ''} data-index="${index}" title="Enable/disable">
      </div>
    `;
    list.appendChild(item);

    // Enable/disable handler
    const checkbox = item.querySelector('input[type="checkbox"]');
    checkbox.addEventListener('change', () => {
      githubModules[index].enabled = checkbox.checked;
      item.classList.toggle('disabled', !checkbox.checked);
      saveGitHubModules();
      renderGitHubModules();
    });

    // Edit button
    const editBtn = item.querySelector('.edit-github-btn');
    editBtn.addEventListener('click', () => {
      showGitHubEditDialog(index);
    });

    // Delete button
    const deleteBtn = item.querySelector('.delete-github-btn');
    deleteBtn.addEventListener('click', () => {
      if (confirm('Delete GitHub module "' + mod.name + '"?')) {
        githubModules.splice(index, 1);
        saveGitHubModules();
        renderGitHubModuleList();
        renderGitHubModules();
      }
    });
  });
}

function showGitHubEditDialog(index) {
  const mod = index >= 0 ? githubModules[index] : { id: 'github-' + Date.now(), type: 'user', name: '', url: '', enabled: true, maxItems: 5 };
  const isNew = index < 0;

  // Ensure default for existing modules
  if (mod.maxItems === undefined) mod.maxItems = 5;

  const dialog = document.createElement('div');
  dialog.className = 'modal-overlay active';
  dialog.innerHTML = `
    <div class="modal" style="max-width:400px;">
      <div class="modal-header">
        <h2><i class="fab fa-github"></i> ${isNew ? 'Add' : 'Edit'} GitHub Module</h2>
        <button class="modal-close github-dialog-close"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-content">
        <div class="pref-section">
          <div class="pref-row">
            <label>GitHub URL</label>
            <input type="text" id="github-edit-url" placeholder="https://github.com/username or https://github.com/user/repo" value="${mod.url || ''}" style="flex:1;">
          </div>
          <div class="pref-row">
            <label>Account Type</label>
            <select id="github-edit-account-type">
              <option value="user" ${(mod.accountType || mod.type) === 'user' ? 'selected' : ''}>User</option>
              <option value="org" ${(mod.accountType || mod.type) === 'org' ? 'selected' : ''}>Organization</option>
              <option value="repo" ${(mod.accountType || mod.type) === 'repo' ? 'selected' : ''}>Repository</option>
            </select>
          </div>
          <div class="pref-row">
            <label>Display</label>
            <select id="github-edit-display-type">
              <option value="repos" ${(mod.displayType || 'repos') === 'repos' ? 'selected' : ''}>Repositories</option>
              <option value="prs" ${mod.displayType === 'prs' ? 'selected' : ''}>Pull Requests</option>
              <option value="commits" ${mod.displayType === 'commits' ? 'selected' : ''}>Commits</option>
              <option value="issues" ${mod.displayType === 'issues' ? 'selected' : ''}>Issues</option>
              <option value="stats" ${mod.displayType === 'stats' ? 'selected' : ''}>Stats</option>
            </select>
          </div>
          <div class="pref-row">
            <label>Items</label>
            <input type="number" id="github-edit-max" value="${mod.maxItems || 5}" min="1" max="20" style="width:60px;">
          </div>
        </div>
        <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:20px;">
          <button class="btn-small github-dialog-cancel">Cancel</button>
          <button class="btn-small github-dialog-save" style="background:var(--accent); color:var(--bg);"><i class="fas fa-check"></i> Save</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(dialog);

  const urlInput = dialog.querySelector('#github-edit-url');
  const accountTypeSelect = dialog.querySelector('#github-edit-account-type');
  const displayTypeSelect = dialog.querySelector('#github-edit-display-type');
  const closeBtn = dialog.querySelector('.github-dialog-close');
  const cancelBtn = dialog.querySelector('.github-dialog-cancel');
  const saveBtn = dialog.querySelector('.github-dialog-save');

  function closeDialog() {
    dialog.remove();
  }

  closeBtn.addEventListener('click', closeDialog);
  cancelBtn.addEventListener('click', closeDialog);
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) closeDialog();
  });

  // Auto-detect type from URL
  urlInput.addEventListener('input', () => {
    const url = urlInput.value.trim();
    const parts = url.replace('https://github.com/', '').split('/').filter(p => p);
    if (parts.length >= 2) {
      accountTypeSelect.value = 'repo';
    } else if (parts.length === 1) {
      // Could be user or org - default to user
      accountTypeSelect.value = 'user';
    }
  });

  saveBtn.addEventListener('click', () => {
    const url = urlInput.value.trim();
    if (!url) {
      alert('Please enter a GitHub URL');
      return;
    }

    // Extract name from URL
    const parts = url.replace('https://github.com/', '').replace(/\/$/, '').split('/').filter(p => p);
    if (parts.length === 0) {
      alert('Invalid GitHub URL');
      return;
    }

    const name = accountTypeSelect.value === 'repo' ? parts.join('/') : parts[0];

    const maxItems = Math.max(1, Math.min(20, parseInt(document.getElementById('github-edit-max').value) || 5));

    if (isNew) {
      githubModules.push({
        id: 'github-' + Date.now(),
        accountType: accountTypeSelect.value,
        displayType: displayTypeSelect.value,
        name: name,
        url: url.startsWith('https://') ? url : 'https://github.com/' + name,
        enabled: true,
        maxItems: maxItems
      });
    } else {
      githubModules[index].url = url.startsWith('https://') ? url : 'https://github.com/' + name;
      githubModules[index].accountType = accountTypeSelect.value;
      githubModules[index].displayType = displayTypeSelect.value;
      githubModules[index].name = name;
      githubModules[index].maxItems = maxItems;
    }

    saveGitHubModules();
    renderGitHubModuleList();
    renderGitHubModules();
    refreshGitHub();
    closeDialog();
  });
}

function initGitHub() {
  const addBtn = document.getElementById('addGitHubBtn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      showGitHubEditDialog(-1);
    });
  }
}

// Export to window
window.githubModules = githubModules;
window.githubDisplayTypes = githubDisplayTypes;
window.saveGitHubModules = saveGitHubModules;
window.renderGitHubModules = renderGitHubModules;
window.refreshGitHub = refreshGitHub;
window.refreshGitHubModule = refreshGitHubModule;
window.renderGitHubModuleList = renderGitHubModuleList;
window.showGitHubEditDialog = showGitHubEditDialog;
window.initGitHub = initGitHub;
