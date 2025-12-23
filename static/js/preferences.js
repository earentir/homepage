// Preferences modal management

function initPreferencesModal() {
  const openBtn = document.getElementById('prefsBtn');
  const closeBtn = document.getElementById('prefsClose');
  const modal = document.getElementById('prefsModal');
  const tabs = document.querySelectorAll('.modal-tab');
  const tabContents = document.querySelectorAll('.tab-content');

  if (!modal || !openBtn) return;

  // Open modal
  openBtn.addEventListener('click', () => {
    modal.classList.add('active');
    // Render lists when modal opens
    if (window.renderGitHubModuleList) window.renderGitHubModuleList();
    if (window.renderQuicklinksList) window.renderQuicklinksList();
    if (window.renderMonitorsList) window.renderMonitorsList();
    if (window.renderRssModuleList) window.renderRssModuleList();
    if (window.renderSnmpList) window.renderSnmpList();
    renderModuleList();
  });

  // Close modal
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.classList.remove('active');
    });
  }

  // Close on overlay click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('active');
    }
  });

  // Tab switching
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;

      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      tab.classList.add('active');
      const content = document.getElementById('tab-' + tabName);
      if (content) content.classList.add('active');

      // Render search history when search tab is opened
      if (tabName === 'search' && window.renderSearchHistory) {
        window.renderSearchHistory();
      }

      // Render layout editor when layout tab is opened
      if (tabName === 'layout' && window.layoutSystem && window.layoutSystem.renderLayoutEditor) {
        window.layoutSystem.renderLayoutEditor();
      }
    });
  });

  // Theme selection
  initThemeSelection();

  // General settings
  initGeneralSettings();

  // Search settings
  initSearchSettings();
}

function initThemeSelection() {
  const templateSelect = document.getElementById('pref-template');
  const schemeSelect = document.getElementById('pref-scheme');

  // Set current values
  const currentTemplate = localStorage.getItem('template') || document.documentElement.getAttribute('data-template') || 'nordic';
  const currentScheme = localStorage.getItem('scheme') || document.documentElement.getAttribute('data-scheme') || 'default';

  if (templateSelect) {
    templateSelect.value = currentTemplate;
    templateSelect.addEventListener('change', (e) => {
      const template = e.target.value;
      localStorage.setItem('template', template);
      // Reload page with new template
      const url = new URL(window.location.href);
      url.searchParams.set('template', template);
      window.location.href = url.toString();
    });
  }

  // Populate scheme dropdown from hidden menu
  if (schemeSelect) {
    const schemeMenu = document.getElementById('schemeMenu');
    if (schemeMenu) {
      const buttons = schemeMenu.querySelectorAll('button');
      schemeSelect.innerHTML = '';
      buttons.forEach(btn => {
        const option = document.createElement('option');
        option.value = btn.dataset.scheme;
        option.textContent = btn.textContent;
        if (btn.dataset.scheme === currentScheme) {
          option.selected = true;
        }
        schemeSelect.appendChild(option);
      });
    }

    schemeSelect.addEventListener('change', (e) => {
      const scheme = e.target.value;
      localStorage.setItem('scheme', scheme);
      const url = new URL(window.location.href);
      url.searchParams.set('scheme', scheme);
      window.location.href = url.toString();
    });
  }
}

function initGeneralSettings() {
  // Min bar width
  const minBarWidthInput = document.getElementById('pref-min-bar-width');
  if (minBarWidthInput) {
    const saved = localStorage.getItem('minBarWidth');
    if (saved) {
      minBarWidthInput.value = parseInt(saved) || 10;
    }
    minBarWidthInput.addEventListener('change', () => {
      const val = Math.max(2, Math.min(50, parseInt(minBarWidthInput.value) || 10));
      minBarWidthInput.value = val;
      localStorage.setItem('minBarWidth', val);
      if (window.saveMinBarWidth) window.saveMinBarWidth();
      if (window.trimHistoryArrays) window.trimHistoryArrays();
      if (window.renderCpuGraph) window.renderCpuGraph();
      if (window.renderRamGraph) window.renderRamGraph();
      if (window.renderDiskGraph) window.renderDiskGraph();
    });
  }

  // Full bars toggle
  const fullBarsCheckbox = document.getElementById('pref-full-bars');
  if (fullBarsCheckbox) {
    const saved = localStorage.getItem('showFullBars');
    fullBarsCheckbox.checked = saved === 'true';
    fullBarsCheckbox.addEventListener('change', () => {
      localStorage.setItem('showFullBars', fullBarsCheckbox.checked);
      if (window.saveFullBarsPreference) window.saveFullBarsPreference();
      if (window.applyFullBarsClass) window.applyFullBarsClass();
    });
  }

  // Weather location search
  const weatherLocationInput = document.getElementById('pref-weather-location');
  const searchLocationBtn = document.getElementById('searchLocationBtn');
  const locationResultsRow = document.getElementById('locationResultsRow');
  const locationResults = document.getElementById('pref-location-results');
  const setLocationBtn = document.getElementById('setLocationBtn');
  const currentLocationDisplay = document.getElementById('currentLocationDisplay');

  // Show current location
  const savedLocation = localStorage.getItem('weatherLocation');
  if (savedLocation && currentLocationDisplay) {
    try {
      const loc = JSON.parse(savedLocation);
      currentLocationDisplay.textContent = loc.name || 'Set';
    } catch (e) {
      currentLocationDisplay.textContent = 'Not set';
    }
  }

  if (searchLocationBtn && weatherLocationInput && locationResults) {
    searchLocationBtn.addEventListener('click', async () => {
      const query = weatherLocationInput.value.trim();
      if (!query) return;

      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
        const data = await res.json();

        if (data.results && data.results.length > 0) {
          locationResults.innerHTML = '';
          data.results.slice(0, 5).forEach(result => {
            const option = document.createElement('option');
            option.value = JSON.stringify({
              name: result.name + ', ' + result.country,
              latitude: result.latitude,
              longitude: result.longitude
            });
            option.textContent = `${result.name}, ${result.admin1 || ''}, ${result.country}`;
            locationResults.appendChild(option);
          });
          if (locationResultsRow) locationResultsRow.style.display = 'flex';
        }
      } catch (e) {
        console.error('Error searching location:', e);
      }
    });
  }

  if (setLocationBtn && locationResults && currentLocationDisplay) {
    setLocationBtn.addEventListener('click', () => {
      const selected = locationResults.value;
      if (selected) {
        localStorage.setItem('weatherLocation', selected);
        try {
          const loc = JSON.parse(selected);
          currentLocationDisplay.textContent = loc.name;
        } catch (e) {}
        if (locationResultsRow) locationResultsRow.style.display = 'none';
        if (window.refreshWeather) window.refreshWeather();
      }
    });
  }

  // GitHub token
  const githubTokenInput = document.getElementById('pref-github-token');
  const toggleGithubToken = document.getElementById('toggleGithubToken');

  if (githubTokenInput) {
    githubTokenInput.value = localStorage.getItem('githubToken') || '';
    githubTokenInput.addEventListener('change', () => {
      localStorage.setItem('githubToken', githubTokenInput.value.trim());
      if (window.refreshGitHub) window.refreshGitHub();
    });
  }

  if (toggleGithubToken && githubTokenInput) {
    toggleGithubToken.addEventListener('click', () => {
      const isPassword = githubTokenInput.type === 'password';
      githubTokenInput.type = isPassword ? 'text' : 'password';
      toggleGithubToken.querySelector('i').className = isPassword ? 'fas fa-eye-slash' : 'fas fa-eye';
    });
  }

  // Clear cache button
  const clearCacheBtn = document.getElementById('clearCacheBtn');
  if (clearCacheBtn) {
    clearCacheBtn.addEventListener('click', () => {
      if (confirm('Clear all cached data? This will reset history graphs and module preferences.')) {
        localStorage.removeItem('cpuHistory');
        localStorage.removeItem('ramHistory');
        localStorage.removeItem('diskHistory');
        localStorage.removeItem('faviconCache');
        localStorage.removeItem('rssCache');
        alert('Cache cleared. Refresh the page to see changes.');
      }
    });
  }

  // Reset order button
  const resetOrderBtn = document.getElementById('resetOrderBtn');
  if (resetOrderBtn) {
    resetOrderBtn.addEventListener('click', () => {
      if (confirm('Reset module layout to default?')) {
        localStorage.removeItem('layoutConfig');
        location.reload();
      }
    });
  }
}

function renderModuleList() {
  const moduleList = document.getElementById('moduleList');
  if (!moduleList || !window.moduleConfig) return;

  moduleList.innerHTML = '';

  Object.keys(window.moduleConfig).forEach(key => {
    const mod = window.moduleConfig[key];
    const item = document.createElement('div');
    item.className = 'module-item';
    item.innerHTML = `
      <div class="module-icon"><i class="fas ${mod.icon}"></i></div>
      <div class="module-info">
        <div class="module-name">${mod.name}</div>
        <div class="module-desc">${mod.desc}</div>
      </div>
      <div class="module-controls">
        ${mod.hasTimer ? `<input type="number" class="interval-input" data-module="${key}" value="${window.timers && window.timers[mod.timerKey] ? window.timers[mod.timerKey].interval / 1000 : mod.defaultInterval}" min="1" max="86400" style="width:60px;">s` : ''}
        <input type="checkbox" class="module-toggle" data-module="${key}" ${mod.enabled ? 'checked' : ''}>
      </div>
    `;
    moduleList.appendChild(item);
  });

  // Handle toggle changes
  moduleList.querySelectorAll('.module-toggle').forEach(toggle => {
    toggle.addEventListener('change', () => {
      const key = toggle.dataset.module;
      if (window.moduleConfig[key]) {
        window.moduleConfig[key].enabled = toggle.checked;
        if (window.saveModulePrefs) window.saveModulePrefs();
        if (window.applyModuleVisibility) window.applyModuleVisibility();
      }
    });
  });

  // Handle interval changes
  moduleList.querySelectorAll('.interval-input').forEach(input => {
    input.addEventListener('change', () => {
      const key = input.dataset.module;
      const mod = window.moduleConfig[key];
      if (mod && mod.hasTimer && window.timers && window.timers[mod.timerKey]) {
        const val = Math.max(1, parseInt(input.value) || mod.defaultInterval);
        input.value = val;
        window.timers[mod.timerKey].interval = val * 1000;
        if (window.saveModulePrefs) window.saveModulePrefs();
      }
    });
  });
}

function initSearchSettings() {
  const searchFilterInput = document.getElementById('searchHistoryFilter');
  const clearHistoryBtn = document.getElementById('clearSearchHistoryBtn');

  if (searchFilterInput) {
    searchFilterInput.addEventListener('input', () => {
      if (window.renderSearchHistory) {
        window.renderSearchHistory(searchFilterInput.value);
      }
    });
  }

  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', () => {
      if (window.clearSearchHistory) window.clearSearchHistory();
    });
  }
}

// Run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPreferencesModal);
} else {
  initPreferencesModal();
}

// Export
window.initPreferencesModal = initPreferencesModal;
window.renderModuleList = renderModuleList;
