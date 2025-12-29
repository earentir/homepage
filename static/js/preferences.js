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
    // Populate scheme dropdown (needs to happen after schemeMenu is in DOM)
    populateSchemeDropdown();
    // Render lists when modal opens
    if (window.renderGitHubModuleList) window.renderGitHubModuleList();
    if (window.renderQuicklinksList) window.renderQuicklinksList();
    if (window.renderMonitorsList) window.renderMonitorsList();
    if (window.renderRssModuleList) window.renderRssModuleList();
    if (window.renderSnmpList) window.renderSnmpList();
    if (window.renderEventsPreferenceList) window.renderEventsPreferenceList();
    if (window.renderTodosPreferenceList) window.renderTodosPreferenceList();
    renderModuleList();
    // Initialize debug settings when modal opens
    initDebugSettings();
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

      // Render events list when calendar tab is opened
      if (tabName === 'calendar' && window.renderEventsPreferenceList) {
        window.renderEventsPreferenceList();
      }

      // Render todos list when todo tab is opened
      if (tabName === 'todo' && window.renderTodosPreferenceList) {
        window.renderTodosPreferenceList();
      }

      // Render disk module list when modules tab is opened
      if (tabName === 'modules' && window.renderDiskModuleList) {
        window.renderDiskModuleList();
      }

      // Initialize debug settings when debug tab is opened
      if (tabName === 'debug') {
        initDebugSettings();
      }
    });
  });

  // Theme selection
  initThemeSelection();

  // General settings
  initGeneralSettings();

  // Weather settings
  initWeatherSettings();

  // Search settings
  initSearchSettings();

  // Debug settings will be initialized when debug tab is opened
}

function initThemeSelection() {
  const templateSelect = document.getElementById('pref-template');
  const schemeSelect = document.getElementById('pref-scheme');

  // Set current values from localStorage
  const currentTemplate = localStorage.getItem('template') || document.documentElement.getAttribute('data-template') || 'nordic';
  const currentScheme = localStorage.getItem('scheme') || document.documentElement.getAttribute('data-scheme') || 'default';

  if (templateSelect) {
    templateSelect.value = currentTemplate;
    templateSelect.addEventListener('change', (e) => {
      localStorage.setItem('template', e.target.value);
      // Clear scheme when template changes (schemes are template-specific)
      localStorage.removeItem('scheme');
      location.reload();
    });
  }

  if (schemeSelect) {
    schemeSelect.addEventListener('change', (e) => {
      localStorage.setItem('scheme', e.target.value);
      location.reload();
    });
  }
}

// Populate scheme dropdown and set template value - called when modal opens
function populateSchemeDropdown() {
  const templateSelect = document.getElementById('pref-template');
  const schemeSelect = document.getElementById('pref-scheme');
  const currentTemplate = localStorage.getItem('template') || document.documentElement.getAttribute('data-template') || 'nordic';
  const currentScheme = localStorage.getItem('scheme') || document.documentElement.getAttribute('data-scheme') || 'default';

  // Set template value
  if (templateSelect) {
    templateSelect.value = currentTemplate;
  }

  if (!schemeSelect) return;

  // Always repopulate in case template changed
  const schemeMenu = document.getElementById('schemeMenu');
  if (schemeMenu) {
    const buttons = schemeMenu.querySelectorAll('button');
    if (buttons.length > 0) {
      schemeSelect.innerHTML = '';
      buttons.forEach(btn => {
        const option = document.createElement('option');
        option.value = btn.dataset.scheme;
        option.textContent = btn.textContent.trim();
        if (btn.dataset.scheme === currentScheme) {
          option.selected = true;
        }
        schemeSelect.appendChild(option);
      });
    }
  }

  // If still empty, show a message
  if (schemeSelect.options.length === 0) {
    const option = document.createElement('option');
    option.value = 'default';
    option.textContent = 'Default';
    option.selected = true;
    schemeSelect.appendChild(option);
  }
}

function initGeneralSettings() {
  // Page title
  const titleInput = document.getElementById('pref-title');
  const resetTitleBtn = document.getElementById('resetTitleBtn');
  const defaultTitle = 'LAN Index';

  if (titleInput) {
    // Load saved title or use default
    const savedTitle = localStorage.getItem('pageTitle');
    titleInput.value = savedTitle || defaultTitle;

    // Helper function to apply title
    const applyTitle = (title) => {
      if (!title) title = defaultTitle;
      document.title = title;
      const headerTitle = document.querySelector('.h-title');
      if (headerTitle) {
        headerTitle.textContent = title;
      }
      // Also update window function if available
      if (window.applyPageTitle) {
        window.applyPageTitle(title);
      }
    };

    // Apply title on load
    applyTitle(savedTitle || defaultTitle);

    // Save on change
    titleInput.addEventListener('change', () => {
      const title = titleInput.value.trim() || defaultTitle;
      titleInput.value = title;
      localStorage.setItem('pageTitle', title);
      applyTitle(title);
    });

    // Also update on input (for real-time preview)
    titleInput.addEventListener('input', () => {
      const title = titleInput.value.trim() || defaultTitle;
      applyTitle(title);
    });
  }

  if (resetTitleBtn) {
    resetTitleBtn.addEventListener('click', () => {
      if (titleInput) {
        titleInput.value = defaultTitle;
        localStorage.setItem('pageTitle', defaultTitle);
        document.title = defaultTitle;
        const headerTitle = document.querySelector('.h-title');
        if (headerTitle) {
          headerTitle.textContent = defaultTitle;
        }
        if (window.applyPageTitle) {
          window.applyPageTitle(defaultTitle);
        }
      }
    });
  }

  // Min bar width
  const minBarWidthInput = document.getElementById('pref-min-bar-width');
  if (minBarWidthInput) {
    // Load saved value or use current window value
    const saved = localStorage.getItem('minBarWidth');
    if (saved) {
      minBarWidthInput.value = parseInt(saved) || 10;
    } else if (window.minBarWidth) {
      minBarWidthInput.value = window.minBarWidth;
    }

    minBarWidthInput.addEventListener('change', () => {
      const val = Math.max(2, Math.min(50, parseInt(minBarWidthInput.value) || 10));
      minBarWidthInput.value = val;
      // Update the variable in graphs.js
      if (window.setMinBarWidth) window.setMinBarWidth(val);
      // Save to localStorage
      if (window.saveMinBarWidth) window.saveMinBarWidth();
      // Trim history and re-render graphs
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
      // Update the variable in graphs.js
      if (window.setShowFullBars) window.setShowFullBars(fullBarsCheckbox.checked);
      // Save to localStorage
      if (window.saveFullBarsPreference) window.saveFullBarsPreference();
      // Apply the class
      if (window.applyFullBarsClass) window.applyFullBarsClass();
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

  // Disk refresh interval
  const diskIntervalInput = document.getElementById('pref-disk-interval');
  if (diskIntervalInput && window.timers) {
    // Load saved value or use current timer value
    const saved = localStorage.getItem('diskInterval');
    if (saved) {
      diskIntervalInput.value = parseInt(saved) || 15;
      window.timers.disk.interval = parseInt(saved) * 1000 || 15000;
    } else {
      diskIntervalInput.value = window.timers.disk.interval / 1000;
    }

    diskIntervalInput.addEventListener('change', () => {
      const val = Math.max(5, Math.min(3600, parseInt(diskIntervalInput.value) || 15));
      diskIntervalInput.value = val;
      window.timers.disk.interval = val * 1000;
      localStorage.setItem('diskInterval', val.toString());
    });
  }

  // RSS refresh interval
  const rssIntervalInput = document.getElementById('pref-rss-interval');
  if (rssIntervalInput && window.timers) {
    // Load saved value or use current timer value
    const saved = localStorage.getItem('rssInterval');
    if (saved) {
      rssIntervalInput.value = parseInt(saved) || 300;
      window.timers.rss.interval = parseInt(saved) * 1000 || 300000;
    } else {
      rssIntervalInput.value = window.timers.rss.interval / 1000;
    }

    rssIntervalInput.addEventListener('change', () => {
      const val = Math.max(60, Math.min(86400, parseInt(rssIntervalInput.value) || 300));
      rssIntervalInput.value = val;
      window.timers.rss.interval = val * 1000;
      localStorage.setItem('rssInterval', val.toString());
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

function initWeatherSettings() {
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
      currentLocationDisplay.textContent = loc.name || 'Not set';
    } catch (e) {
      currentLocationDisplay.textContent = 'Not set';
    }
  }

  // Search function
  const performSearch = async () => {
    const query = weatherLocationInput.value.trim();
    if (!query) return;

    // Show loading state
    searchLocationBtn.disabled = true;
    const originalHTML = searchLocationBtn.innerHTML;
    searchLocationBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      const data = await res.json();

      // Check for error response
      if (data.error) {
        alert('Error: ' + data.error);
        return;
      }

      // Handle array response (API returns array directly)
      const results = Array.isArray(data) ? data : (data.results || []);

      if (results.length > 0) {
        locationResults.innerHTML = '';
        // Add a default empty option
        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = '-- Select a location --';
        locationResults.appendChild(emptyOption);

        results.slice(0, 5).forEach(result => {
          const option = document.createElement('option');
          option.value = JSON.stringify({
            name: result.name + ', ' + result.country,
            latitude: result.latitude,
            longitude: result.longitude
          });
          option.textContent = `${result.name}${result.admin1 ? ', ' + result.admin1 : ''}, ${result.country}`;
          locationResults.appendChild(option);
        });
        if (locationResultsRow) locationResultsRow.style.display = 'flex';
      } else {
        alert('No locations found for "' + query + '"');
      }
    } catch (e) {
      if (window.debugError) window.debugError('preferences', 'Error searching location:', e);
      alert('Error searching location: ' + e.message);
    } finally {
      searchLocationBtn.disabled = false;
      searchLocationBtn.innerHTML = originalHTML;
    }
  };

  if (searchLocationBtn && weatherLocationInput && locationResults) {
    searchLocationBtn.addEventListener('click', performSearch);

    // Allow Enter key to trigger search
    weatherLocationInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        performSearch();
      }
    });
  }

  if (setLocationBtn && locationResults && currentLocationDisplay) {
    setLocationBtn.addEventListener('click', () => {
      const selected = locationResults.value;
      if (!selected || selected === '') {
        alert('Please select a location from the dropdown');
        return;
      }

      try {
        localStorage.setItem('weatherLocation', selected);
        const loc = JSON.parse(selected);
        currentLocationDisplay.textContent = loc.name;

        // Hide the results row
        if (locationResultsRow) locationResultsRow.style.display = 'none';

        // Clear the search input
        if (weatherLocationInput) weatherLocationInput.value = '';

        // Refresh weather data
        if (window.refreshWeather) {
          window.refreshWeather();
        }
      } catch (e) {
        if (window.debugError) window.debugError('preferences', 'Error setting location:', e);
        alert('Error setting location: ' + e.message);
      }
    });

    // Also allow double-click on select option to set it
    locationResults.addEventListener('dblclick', () => {
      if (setLocationBtn && locationResults.value) {
        setLocationBtn.click();
      }
    });
  }

  // Weather provider
  const weatherProviderSelect = document.getElementById('pref-weather-provider');
  if (weatherProviderSelect) {
    const savedProvider = localStorage.getItem('weatherProvider') || 'openmeteo';
    weatherProviderSelect.value = savedProvider;
    weatherProviderSelect.addEventListener('change', () => {
      localStorage.setItem('weatherProvider', weatherProviderSelect.value);
      // Note: Provider change requires server restart with env var, this is just for UI reference
    });
  }

  // Weather API key
  const weatherApiKeyInput = document.getElementById('pref-weather-api-key');
  const toggleWeatherApiKey = document.getElementById('toggleWeatherApiKey');

  if (weatherApiKeyInput) {
    weatherApiKeyInput.value = localStorage.getItem('weatherApiKey') || '';
    weatherApiKeyInput.addEventListener('change', () => {
      localStorage.setItem('weatherApiKey', weatherApiKeyInput.value.trim());
      // Note: API key change requires server restart with env var, this is just for UI reference
    });
  }

  if (toggleWeatherApiKey && weatherApiKeyInput) {
    toggleWeatherApiKey.addEventListener('click', () => {
      const isPassword = weatherApiKeyInput.type === 'password';
      weatherApiKeyInput.type = isPassword ? 'text' : 'password';
      toggleWeatherApiKey.querySelector('i').className = isPassword ? 'fas fa-eye-slash' : 'fas fa-eye';
    });
  }
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

let debugSettingsInitialized = false;

function initDebugSettings() {
  const debugModules = ['sw', 'network', 'websocket', 'search', 'app', 'core', 'system', 'weather', 'github', 'rss', 'layout', 'preferences', 'config', 'calendar', 'todo', 'quicklinks'];

  // Load saved debug preferences
  try {
    const saved = localStorage.getItem('debugPrefs');
    const prefs = saved ? JSON.parse(saved) : {};
    debugModules.forEach(module => {
      const checkbox = document.getElementById(`debug-${module}`);
      if (checkbox) {
        checkbox.checked = prefs[module] === true;
      }
    });
  } catch (e) {
    // Don't use debugError here - it would create a circular dependency
    // console.error('Failed to load debug preferences:', e);
  }

  // Set up event listeners only once
  if (!debugSettingsInitialized) {
    debugSettingsInitialized = true;
    debugModules.forEach(module => {
      const checkbox = document.getElementById(`debug-${module}`);
      if (checkbox) {
      checkbox.addEventListener('change', () => {
        try {
          const prefs = JSON.parse(localStorage.getItem('debugPrefs') || '{}');
          prefs[module] = checkbox.checked;
          localStorage.setItem('debugPrefs', JSON.stringify(prefs));
          // Sync to IndexedDB for service worker
          if (window.syncDebugPrefsToIndexedDB) {
            window.syncDebugPrefsToIndexedDB();
          }
          // Notify service worker
          if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
              type: 'DEBUG_PREFS_UPDATE',
              prefs: prefs
            });
          }
        } catch (e) {
          // Don't use debugError here - it would create a circular dependency
          // console.error('Failed to save debug preferences:', e);
        }
      });
      }
    });
  }
}

// Run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPreferencesModal);
} else {
  initPreferencesModal();
}

// Apply page title to both document title and header
function applyPageTitle(title) {
  if (!title) title = 'LAN Index';

  // Update document title
  document.title = title;

  // Update header title
  const headerTitle = document.querySelector('.h-title');
  if (headerTitle) {
    headerTitle.textContent = title;
  }
}

// Export
window.initPreferencesModal = initPreferencesModal;
window.renderModuleList = renderModuleList;
window.applyPageTitle = applyPageTitle;
