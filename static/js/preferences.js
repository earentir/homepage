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
    if (window.renderMonitorModuleList) window.renderMonitorModuleList();
    if (window.renderRssModuleList) window.renderRssModuleList();
    if (window.renderSnmpModuleList) window.renderSnmpModuleList();
    if (window.renderEventsPreferenceList) window.renderEventsPreferenceList();
    if (window.renderTodosPreferenceList) window.renderTodosPreferenceList();
    if (window.renderCalendarModuleList) window.renderCalendarModuleList();
    if (window.renderTodoModuleList) window.renderTodoModuleList();
    if (window.initICSCalendars) window.initICSCalendars();
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

      // Initialize search tab sub-tabs
      if (tabName === 'search') {
        // Initialize sub-tabs for search tab
        initSearchSubTabs();
        // Render search engines when settings sub-tab is active
        const activeSubTab = document.querySelector('#tab-search .sub-tab.active');
        if (activeSubTab && activeSubTab.dataset.subtab === 'search-settings') {
          if (window.renderSearchEngines) window.renderSearchEngines();
        } else if (activeSubTab && activeSubTab.dataset.subtab === 'search-history') {
          if (window.renderSearchHistory) window.renderSearchHistory();
        }
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

      // Render module lists when modules tab is opened
      if (tabName === 'modules') {
        if (window.renderDiskModuleList) window.renderDiskModuleList();
        if (window.renderCalendarModuleList) window.renderCalendarModuleList();
        if (window.renderTodoModuleList) window.renderTodoModuleList();
        if (window.renderMonitorModuleList) window.renderMonitorModuleList();
        if (window.renderSnmpModuleList) window.renderSnmpModuleList();
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
  const currentTemplate = window.loadFromStorage('template') || document.documentElement.getAttribute('data-template') || 'nordic';
  const currentScheme = window.loadFromStorage('scheme') || document.documentElement.getAttribute('data-scheme') || 'default';

  if (templateSelect) {
    templateSelect.value = currentTemplate;
    templateSelect.addEventListener('change', (e) => {
      const newTemplate = e.target.value;
      window.saveToStorage('template', newTemplate);
      // Clear scheme when template changes (schemes are template-specific)
      localStorage.removeItem('scheme'); // Use direct removeItem for removal
      // Reload to apply the new template
      location.reload();
    });
  }

  if (schemeSelect) {
    schemeSelect.addEventListener('change', (e) => {
      window.saveToStorage('scheme', e.target.value);
      location.reload();
    });
  }
}

// Populate scheme dropdown for a specific template
function populateSchemeDropdownForTemplate(templateName) {
  const schemeSelect = document.getElementById('pref-scheme');
  if (!schemeSelect) return;

  // Fetch schemes from API for the specified template
  fetch(`/api/schemes?template=${encodeURIComponent(templateName)}`)
    .then(response => {
      if (!response.ok) {
        throw new Error('Failed to fetch schemes');
      }
      return response.json();
    })
    .then(schemes => {
      schemeSelect.innerHTML = '';
      schemes.forEach(scheme => {
        const option = document.createElement('option');
        option.value = scheme.name;
        option.textContent = scheme.display;
        schemeSelect.appendChild(option);
      });

      // Select the first scheme (usually "default") or the first available
      if (schemeSelect.options.length > 0) {
        schemeSelect.value = schemeSelect.options[0].value;
      }

      // If still empty, show a message
      if (schemeSelect.options.length === 0) {
        const option = document.createElement('option');
        option.value = 'default';
        option.textContent = 'Default';
        option.selected = true;
        schemeSelect.appendChild(option);
      }
    })
    .catch(error => {
      console.error('Error fetching schemes:', error);
      // Fallback: try to read from schemeMenu if API fails
      const schemeMenu = document.getElementById('schemeMenu');
      if (schemeMenu) {
        const buttons = schemeMenu.querySelectorAll('button');
        if (buttons.length > 0) {
          schemeSelect.innerHTML = '';
          buttons.forEach(btn => {
            const option = document.createElement('option');
            option.value = btn.dataset.scheme;
            option.textContent = btn.textContent.trim();
            schemeSelect.appendChild(option);
          });
        }
      }
      // If still empty, show default
      if (schemeSelect.options.length === 0) {
        const option = document.createElement('option');
        option.value = 'default';
        option.textContent = 'Default';
        option.selected = true;
        schemeSelect.appendChild(option);
      }
    });
}

// Populate scheme dropdown and set template value - called when modal opens
function populateSchemeDropdown() {
  const templateSelect = document.getElementById('pref-template');
  const schemeSelect = document.getElementById('pref-scheme');
  const currentTemplate = window.loadFromStorage('template') || document.documentElement.getAttribute('data-template') || 'nordic';
  const currentScheme = window.loadFromStorage('scheme') || document.documentElement.getAttribute('data-scheme') || 'default';

  // Set template value
  if (templateSelect) {
    templateSelect.value = currentTemplate;
  }

  if (!schemeSelect) return;

  // Fetch schemes from API for the current template
  fetch(`/api/schemes?template=${encodeURIComponent(currentTemplate)}`)
    .then(response => {
      if (!response.ok) {
        throw new Error('Failed to fetch schemes');
      }
      return response.json();
    })
    .then(schemes => {
      schemeSelect.innerHTML = '';
      schemes.forEach(scheme => {
        const option = document.createElement('option');
        option.value = scheme.name;
        option.textContent = scheme.display;
        if (scheme.name === currentScheme) {
          option.selected = true;
        }
        schemeSelect.appendChild(option);
      });

      // If still empty, show a message
      if (schemeSelect.options.length === 0) {
        const option = document.createElement('option');
        option.value = 'default';
        option.textContent = 'Default';
        option.selected = true;
        schemeSelect.appendChild(option);
      }
    })
    .catch(error => {
      console.error('Error fetching schemes:', error);
      // Fallback: try to read from schemeMenu if API fails
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
      // If still empty, show default
      if (schemeSelect.options.length === 0) {
        const option = document.createElement('option');
        option.value = 'default';
        option.textContent = 'Default';
        option.selected = true;
        schemeSelect.appendChild(option);
      }
    });
}

function initGeneralSettings() {
  // Page title
  const titleInput = document.getElementById('pref-title');
  const resetTitleBtn = document.getElementById('resetTitleBtn');
  const defaultTitle = 'LAN Index';

  if (titleInput) {
    // Load saved title or use default
    const savedTitle = window.loadFromStorage('pageTitle');
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
      window.saveToStorage('pageTitle', title);
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
        window.saveToStorage('pageTitle', defaultTitle);
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
    const saved = window.loadFromStorage('minBarWidth');
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
      // Trim history and re-render graphs (async, fire and forget)
      if (window.trimHistoryArrays) window.trimHistoryArrays();
      if (window.renderCpuGraph) window.renderCpuGraph();
      if (window.renderRamGraph) window.renderRamGraph();
      if (window.renderDiskGraph) window.renderDiskGraph();
    });
  }

  // Full bars toggle
  const fullBarsCheckbox = document.getElementById('pref-full-bars');
  const colorizeBgCheckbox = document.getElementById('pref-colorize-bg');
  
  function updateColorizeCheckboxState() {
    if (colorizeBgCheckbox) {
      colorizeBgCheckbox.disabled = !fullBarsCheckbox.checked;
      if (!fullBarsCheckbox.checked && colorizeBgCheckbox.checked) {
        colorizeBgCheckbox.checked = false;
        if (window.setColorizeBackground) window.setColorizeBackground(false);
        if (window.saveColorizeBackgroundPreference) window.saveColorizeBackgroundPreference();
      }
    }
  }
  
  if (fullBarsCheckbox) {
    const saved = window.loadFromStorage('showFullBars');
    if (typeof saved === 'boolean') {
      fullBarsCheckbox.checked = saved;
    } else {
      fullBarsCheckbox.checked = saved === 'true' || saved === true;
    }
    fullBarsCheckbox.addEventListener('change', () => {
      // Update the variable in graphs.js
      if (window.setShowFullBars) window.setShowFullBars(fullBarsCheckbox.checked);
      // Save to localStorage
      if (window.saveFullBarsPreference) window.saveFullBarsPreference();
      // Update colorize checkbox state
      updateColorizeCheckboxState();
      // Apply the class
      if (window.applyFullBarsClass) window.applyFullBarsClass();
    });
  }

  // Colorize background toggle
  if (colorizeBgCheckbox) {
    const saved = window.loadFromStorage('colorizeBackground');
    if (typeof saved === 'boolean') {
      colorizeBgCheckbox.checked = saved;
    } else {
      colorizeBgCheckbox.checked = saved === 'true' || saved === true;
    }
    colorizeBgCheckbox.disabled = !fullBarsCheckbox || !fullBarsCheckbox.checked;
    colorizeBgCheckbox.addEventListener('change', () => {
      if (fullBarsCheckbox && fullBarsCheckbox.checked) {
        // Update the variable in graphs.js
        if (window.setColorizeBackground) window.setColorizeBackground(colorizeBgCheckbox.checked);
        // Save to localStorage
        if (window.saveColorizeBackgroundPreference) window.saveColorizeBackgroundPreference();
        // Apply the class
        if (window.applyFullBarsClass) window.applyFullBarsClass();
      }
    });
    // Initial state update
    updateColorizeCheckboxState();
  }

  // GitHub token
  const githubTokenInput = document.getElementById('pref-github-token');
  const toggleGithubToken = document.getElementById('toggleGithubToken');

  if (githubTokenInput) {
    githubTokenInput.value = window.loadFromStorage('githubToken') || '';
    githubTokenInput.addEventListener('change', () => {
      window.saveToStorage('githubToken', githubTokenInput.value.trim());
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
    clearCacheBtn.addEventListener('click', async () => {
      const confirmed = await window.popup.confirm('Clear all cached data? This will reset history graphs and module preferences.', 'Confirm Clear');
      if (confirmed) {
        localStorage.removeItem('cpuHistory');
        localStorage.removeItem('ramHistory');
        localStorage.removeItem('diskHistory');
        localStorage.removeItem('faviconCache');
        localStorage.removeItem('rssCache');
        await window.popup.alert('Cache cleared. Refresh the page to see changes.', 'Cache Cleared');
      }
    });
  }

  // Reset order button
  const resetOrderBtn = document.getElementById('resetOrderBtn');
  if (resetOrderBtn) {
    resetOrderBtn.addEventListener('click', async () => {
      const confirmed = await window.popup.confirm('Reset module layout to default?', 'Confirm Reset');
      if (confirmed) {
        localStorage.removeItem('layoutConfig');
        location.reload();
      }
    });
  }

  // Disk refresh interval
  const diskIntervalInput = document.getElementById('pref-disk-interval');
  if (diskIntervalInput && window.timers) {
    // Load saved value or use current timer value
    const saved = window.loadFromStorage('diskInterval');
    if (saved !== null && saved !== undefined) {
      const interval = typeof saved === 'number' ? saved : parseInt(saved);
      diskIntervalInput.value = interval || 15;
      window.timers.disk.interval = interval * 1000 || 15000;
    } else {
      diskIntervalInput.value = window.timers.disk.interval / 1000;
    }

    diskIntervalInput.addEventListener('change', () => {
      const val = Math.max(5, Math.min(3600, parseInt(diskIntervalInput.value) || 15));
      diskIntervalInput.value = val;
      window.timers.disk.interval = val * 1000;
      // Save as number
      window.saveToStorage('diskInterval', val);
    });
  }

  // RSS refresh interval
  const rssIntervalInput = document.getElementById('pref-rss-interval');
  if (rssIntervalInput && window.timers) {
    // Load saved value or use current timer value
    const saved = window.loadFromStorage('rssInterval');
    if (saved !== null && saved !== undefined) {
      const interval = typeof saved === 'number' ? saved : parseInt(saved);
      rssIntervalInput.value = interval || 300;
      window.timers.rss.interval = interval * 1000 || 300000;
    } else {
      rssIntervalInput.value = window.timers.rss.interval / 1000;
    }

    rssIntervalInput.addEventListener('change', () => {
      const val = Math.max(60, Math.min(86400, parseInt(rssIntervalInput.value) || 300));
      rssIntervalInput.value = val;
      window.timers.rss.interval = val * 1000;
      // Save as number
      window.saveToStorage('rssInterval', val);
    });
  }
}

function renderModuleList() {
  const moduleList = document.getElementById('moduleList');
  if (!moduleList || !window.moduleConfig) return;

  moduleList.innerHTML = '';

  // Exclude calendar, todo, rss, snmp, and monitoring modules from the main module list (they have their own sections)
  const excludedModules = ['calendar', 'events', 'weekcalendar', 'todo', 'rss', 'snmp', 'monitoring'];

  Object.keys(window.moduleConfig).forEach(key => {
    // Skip excluded modules
    if (excludedModules.includes(key)) return;

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
        // Clean up layout when module is disabled
        if (!toggle.checked && window.cleanupLayoutConfig) {
          if (window.cleanupLayoutConfig()) {
            if (window.layoutSystem) {
              window.layoutSystem.saveLayoutConfig();
              window.layoutSystem.renderLayout();
              window.layoutSystem.renderLayoutEditor();
            }
          }
        }
      }
    });
  });

  // Handle interval changes
  // Note: Changes are saved to localStorage and synced to backend, which manages refresh scheduling
  moduleList.querySelectorAll('.interval-input').forEach(input => {
    input.addEventListener('change', () => {
      const key = input.dataset.module;
      const mod = window.moduleConfig[key];
      if (mod && mod.hasTimer && window.timers && window.timers[mod.timerKey]) {
        const val = Math.max(1, parseInt(input.value) || mod.defaultInterval);
        input.value = val;
        // Update local timer for immediate UI feedback (backend will sync and update via WebSocket)
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
  const savedLocation = window.loadFromStorage('weatherLocation');
  if (savedLocation && currentLocationDisplay) {
    try {
      const loc = typeof savedLocation === 'string' ? JSON.parse(savedLocation) : savedLocation;
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
        await window.popup.alert('Error: ' + data.error, 'Error');
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
        await window.popup.alert('No locations found for "' + query + '"', 'No Results');
      }
    } catch (e) {
      if (window.debugError) window.debugError('preferences', 'Error searching location:', e);
      await window.popup.alert('Error searching location: ' + e.message, 'Error');
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
    setLocationBtn.addEventListener('click', async () => {
      const selected = locationResults.value;
      if (!selected || selected === '') {
        await window.popup.alert('Please select a location from the dropdown', 'Input Required');
        return;
      }

      try {
        const loc = JSON.parse(selected);
        window.saveToStorage('weatherLocation', loc);
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
        await window.popup.alert('Error setting location: ' + e.message, 'Error');
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
    const savedProvider = window.loadFromStorage('weatherProvider') || 'openmeteo';
    weatherProviderSelect.value = savedProvider;
    weatherProviderSelect.addEventListener('change', () => {
      window.saveToStorage('weatherProvider', weatherProviderSelect.value);
      // Note: Provider change requires server restart with env var, this is just for UI reference
    });
  }

  // Weather API key
  const weatherApiKeyInput = document.getElementById('pref-weather-api-key');
  const toggleWeatherApiKey = document.getElementById('toggleWeatherApiKey');

  if (weatherApiKeyInput) {
    weatherApiKeyInput.value = window.loadFromStorage('weatherApiKey') || '';
    weatherApiKeyInput.addEventListener('change', () => {
      window.saveToStorage('weatherApiKey', weatherApiKeyInput.value.trim());
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

function initSearchSubTabs() {
  const subTabs = document.querySelectorAll('#tab-search .sub-tab');
  const subTabContents = document.querySelectorAll('#tab-search .sub-tab-content');

  // Only add event listeners once
  if (subTabs.length > 0 && !subTabs[0].hasAttribute('data-initialized')) {
    subTabs.forEach(subTab => {
      subTab.setAttribute('data-initialized', 'true');
      subTab.addEventListener('click', () => {
        const targetSubTab = subTab.dataset.subtab;

        // Remove active class from all sub-tabs and sub-tab contents
        subTabs.forEach(t => t.classList.remove('active'));
        subTabContents.forEach(c => c.classList.remove('active'));

        // Add active class to clicked sub-tab
        subTab.classList.add('active');

        // Show corresponding sub-tab content
        const targetContent = document.getElementById('subtab-' + targetSubTab);
        if (targetContent) {
          targetContent.classList.add('active');
        }

        // Render content based on which sub-tab is opened
        if (targetSubTab === 'search-settings') {
          if (window.renderSearchEngines) window.renderSearchEngines();
        } else if (targetSubTab === 'search-history') {
          if (window.renderSearchHistory) window.renderSearchHistory();
        }
      });
    });
  }

  // Ensure initial state is correct - render content for active sub-tab
  const activeSubTab = document.querySelector('#tab-search .sub-tab.active');
  if (activeSubTab) {
    const targetSubTab = activeSubTab.dataset.subtab;
    if (targetSubTab === 'search-settings') {
      if (window.renderSearchEngines) window.renderSearchEngines();
    } else if (targetSubTab === 'search-history') {
      // Set up history listeners
      const searchFilterInput = document.getElementById('searchHistoryFilter');
      const clearHistoryBtn = document.getElementById('clearSearchHistoryBtn');
      
      if (searchFilterInput && !searchFilterInput.hasAttribute('data-listener-attached')) {
        searchFilterInput.setAttribute('data-listener-attached', 'true');
        searchFilterInput.addEventListener('input', () => {
          if (window.renderSearchHistory) {
            window.renderSearchHistory(searchFilterInput.value);
          }
        });
      }

      if (clearHistoryBtn && !clearHistoryBtn.hasAttribute('data-listener-attached')) {
        clearHistoryBtn.setAttribute('data-listener-attached', 'true');
        clearHistoryBtn.addEventListener('click', () => {
          if (window.clearSearchHistory) window.clearSearchHistory();
        });
      }
      
      if (window.renderSearchHistory) window.renderSearchHistory();
    }
  }
}

function initSearchSettings() {
  const sameTabCheckbox = document.getElementById('pref-same-tab-search');
  const switchEngineCheckbox = document.getElementById('pref-switch-engine');
  const directVisitUrlsCheckbox = document.getElementById('pref-direct-visit-urls');

  // Same tab preference
  if (sameTabCheckbox) {
    // Load saved preference (default: true)
    const saved = window.loadFromStorage('sameTabOnSearch');
    if (saved === null || saved === undefined) {
      sameTabCheckbox.checked = true;
    } else if (typeof saved === 'boolean') {
      sameTabCheckbox.checked = saved;
    } else {
      sameTabCheckbox.checked = saved === 'true' || saved === true;
    }
    
    sameTabCheckbox.addEventListener('change', () => {
      // Save as boolean
      window.saveToStorage('sameTabOnSearch', sameTabCheckbox.checked);
    });
  }

  // Switch engine preference
  if (switchEngineCheckbox) {
    // Load saved preference (default: true)
    const saved = window.loadFromStorage('switchEngineOnSelect');
    if (saved === null || saved === undefined) {
      switchEngineCheckbox.checked = true;
    } else if (typeof saved === 'boolean') {
      switchEngineCheckbox.checked = saved;
    } else {
      switchEngineCheckbox.checked = saved === 'true' || saved === true;
    }
    
    switchEngineCheckbox.addEventListener('change', () => {
      // Save as boolean
      window.saveToStorage('switchEngineOnSelect', switchEngineCheckbox.checked);
    });
  }

  // Direct visit URLs preference
  if (directVisitUrlsCheckbox) {
    // Load saved preference (default: true)
    const saved = window.loadFromStorage('directVisitUrlsFromSearch');
    if (saved === null || saved === undefined) {
      directVisitUrlsCheckbox.checked = true;
    } else if (typeof saved === 'boolean') {
      directVisitUrlsCheckbox.checked = saved;
    } else {
      directVisitUrlsCheckbox.checked = saved === 'true' || saved === true;
    }
    
    directVisitUrlsCheckbox.addEventListener('change', () => {
      // Save as boolean
      window.saveToStorage('directVisitUrlsFromSearch', directVisitUrlsCheckbox.checked);
    });
  }

  // Initialize search engines list
  if (window.renderSearchEngines) {
    window.renderSearchEngines();
  }
}

function renderSearchEngines() {
  const container = document.getElementById('searchEnginesList');
  if (!container) {
    if (window.debugError) window.debugError('preferences', 'Missing searchEnginesList container');
    return;
  }

  // Wait a bit if window.engines is not yet available (script loading timing)
  if (!window.engines || !Array.isArray(window.engines) || window.engines.length === 0) {
    if (window.debugError) window.debugError('preferences', 'window.engines not available, retrying...', { engines: window.engines });
    setTimeout(renderSearchEngines, 100);
    return;
  }

  container.innerHTML = '';

  // Load enabled engines from localStorage - DO NOT auto-add new ones
  let enabledEngines = [];
  try {
    const saved = window.loadFromStorage('enabledSearchEngines');
    if (saved) {
      enabledEngines = saved;
    } else {
      // Only set default if nothing is saved
      enabledEngines = window.engines.map(e => e.name);
      window.saveToStorage('enabledSearchEngines', enabledEngines);
    }
  } catch (e) {
    // If error, default to all enabled
    enabledEngines = window.engines.map(e => e.name);
    window.saveToStorage('enabledSearchEngines', enabledEngines);
  }

  // Render ALL engines - log the count for debugging
  const engineCount = window.engines ? window.engines.length : 0;
  if (window.debugLog) window.debugLog('preferences', `Rendering ${engineCount} search engines:`, window.engines ? window.engines.map(e => e.name) : []);
  
  if (!window.engines || engineCount === 0) {
    container.innerHTML = '<div class="small" style="color:var(--muted);">No search engines available</div>';
    return;
  }
  
  // Group engines by category
  const categoryMap = {
    "general": "General",
    "llm": "LLM / AI",
    "social": "Social",
    "media": "Media",
    "shopping": "Shopping",
    "maps": "Maps",
    "development": "Development"
  };

  const enginesByCategory = {};
  window.engines.forEach((engine) => {
    if (!engine || !engine.name) return;
    const category = engine.category || "general";
    if (!enginesByCategory[category]) {
      enginesByCategory[category] = [];
    }
    enginesByCategory[category].push(engine);
  });

  // Render each category
  Object.keys(categoryMap).forEach(categoryKey => {
    if (!enginesByCategory[categoryKey] || enginesByCategory[categoryKey].length === 0) {
      return;
    }

    // Create category container
    const categoryDiv = document.createElement('div');
    categoryDiv.style.marginBottom = '16px';
    
    // Category header
    const categoryHeader = document.createElement('div');
    categoryHeader.style.fontSize = '11px';
    categoryHeader.style.fontWeight = '600';
    categoryHeader.style.textTransform = 'uppercase';
    categoryHeader.style.letterSpacing = '0.5px';
    categoryHeader.style.color = 'var(--muted)';
    categoryHeader.style.marginBottom = '8px';
    categoryHeader.textContent = categoryMap[categoryKey];
    categoryDiv.appendChild(categoryHeader);

    // Category engines container
    const categoryEnginesDiv = document.createElement('div');
    categoryEnginesDiv.style.display = 'grid';
    categoryEnginesDiv.style.gridTemplateColumns = 'repeat(auto-fill, minmax(200px, 1fr))';
    categoryEnginesDiv.style.gap = '12px';
    categoryEnginesDiv.style.maxWidth = '100%';

    // Render engines for this category
    enginesByCategory[categoryKey].forEach((engine) => {
      const isEnabled = enabledEngines.includes(engine.name);
      const item = document.createElement('div');
      item.style.display = 'flex';
      item.style.alignItems = 'center';
      item.style.gap = '8px';
      item.style.padding = '8px';
      item.style.border = '1px solid var(--border)';
      item.style.borderRadius = '6px';
      item.innerHTML = `
        <input type="checkbox" id="engine-${engine.name}" data-engine="${engine.name}" ${isEnabled ? 'checked' : ''} style="cursor:pointer;">
        <label for="engine-${engine.name}" style="cursor:pointer; flex:1; display:flex; align-items:center; gap:8px; margin:0;">
          <i class="${engine.icon}" style="color:var(--accent);"></i>
          <span>${window.escapeHtml ? window.escapeHtml(engine.name) : engine.name}</span>
        </label>
      `;
      categoryEnginesDiv.appendChild(item);

      // Add event listener
      const checkbox = item.querySelector(`input[data-engine="${engine.name}"]`);
      if (!checkbox) {
        if (window.debugError) window.debugError('preferences', `Could not find checkbox for engine: ${engine.name}`);
        return;
      }
      checkbox.addEventListener('change', () => {
        // Get current enabled engines from all checkboxes
        let enabled = [];
        const allCheckboxes = container.querySelectorAll('input[type="checkbox"][data-engine]');
        allCheckboxes.forEach(cb => {
          if (cb.checked) {
            enabled.push(cb.dataset.engine);
          }
        });

        // Ensure at least one engine is enabled
        if (enabled.length === 0) {
          checkbox.checked = true;
          enabled.push(engine.name);
        }

        // Save all engine statuses to localStorage
        window.saveToStorage('enabledSearchEngines', enabled);
        
        // Update the engines dropdown immediately
        if (window.renderEngines) {
          window.renderEngines();
        }
        
        // If current engine was disabled, switch to first enabled engine
        const currentEngine = window.loadFromStorage('searchEngine');
        if (!enabled.includes(currentEngine)) {
          if (enabled.length > 0) {
            window.saveToStorage('searchEngine', enabled[0]);
            if (window.updateEngineBtn) {
              window.updateEngineBtn();
            }
          }
        }
      });
    });

    categoryDiv.appendChild(categoryEnginesDiv);
    container.appendChild(categoryDiv);
  });
}

// Render calendar modules list in preferences
function renderCalendarModuleList() {
  const list = document.getElementById('calendarModuleList');
  if (!list || !window.moduleConfig) return;

  list.innerHTML = '';

  // Filter calendar-related modules
  const calendarModules = ['calendar', 'events', 'weekcalendar'];
  const foundModules = [];

  calendarModules.forEach(key => {
    if (window.moduleConfig[key]) {
      foundModules.push({ key, mod: window.moduleConfig[key] });
    }
  });

  if (foundModules.length === 0) {
    list.innerHTML = '<div class="small" style="color:var(--muted);padding:10px;">No calendar modules available</div>';
    return;
  }

  foundModules.forEach(({ key, mod }) => {
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
    list.appendChild(item);

    // Handle toggle changes
    const toggle = item.querySelector('.module-toggle');
    toggle.addEventListener('change', () => {
      if (window.moduleConfig[key]) {
        window.moduleConfig[key].enabled = toggle.checked;
        if (window.saveModulePrefs) window.saveModulePrefs();
        if (window.applyModuleVisibility) window.applyModuleVisibility();
        // Clean up layout when module is disabled
        if (!toggle.checked && window.cleanupLayoutConfig) {
          if (window.cleanupLayoutConfig()) {
            if (window.layoutSystem) {
              window.layoutSystem.saveLayoutConfig();
              window.layoutSystem.renderLayout();
              window.layoutSystem.renderLayoutEditor();
            }
          }
        }
      }
    });

    // Handle interval changes
    const intervalInput = item.querySelector('.interval-input');
    if (intervalInput) {
      intervalInput.addEventListener('change', () => {
        if (window.moduleConfig[key] && window.moduleConfig[key].hasTimer && window.timers && window.timers[mod.timerKey]) {
          const val = Math.max(1, parseInt(intervalInput.value) || mod.defaultInterval);
          intervalInput.value = val;
          window.timers[mod.timerKey].interval = val * 1000;
          if (window.saveModulePrefs) window.saveModulePrefs();
        }
      });
    }
  });
}

// Render todo modules list in preferences
function renderTodoModuleList() {
  const list = document.getElementById('todoModuleList');
  if (!list || !window.moduleConfig) return;

  list.innerHTML = '';

  // Filter todo-related modules
  const todoModules = ['todo'];
  const foundModules = [];

  todoModules.forEach(key => {
    if (window.moduleConfig[key]) {
      foundModules.push({ key, mod: window.moduleConfig[key] });
    }
  });

  if (foundModules.length === 0) {
    list.innerHTML = '<div class="small" style="color:var(--muted);padding:10px;">No todo modules available</div>';
    return;
  }

  foundModules.forEach(({ key, mod }) => {
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
    list.appendChild(item);

    // Handle toggle changes
    const toggle = item.querySelector('.module-toggle');
    toggle.addEventListener('change', () => {
      if (window.moduleConfig[key]) {
        window.moduleConfig[key].enabled = toggle.checked;
        if (window.saveModulePrefs) window.saveModulePrefs();
        if (window.applyModuleVisibility) window.applyModuleVisibility();
        // Clean up layout when module is disabled
        if (!toggle.checked && window.cleanupLayoutConfig) {
          if (window.cleanupLayoutConfig()) {
            if (window.layoutSystem) {
              window.layoutSystem.saveLayoutConfig();
              window.layoutSystem.renderLayout();
              window.layoutSystem.renderLayoutEditor();
            }
          }
        }
      }
    });

    // Handle interval changes
    const intervalInput = item.querySelector('.interval-input');
    if (intervalInput) {
      intervalInput.addEventListener('change', () => {
        if (window.moduleConfig[key] && window.moduleConfig[key].hasTimer && window.timers && window.timers[mod.timerKey]) {
          const val = Math.max(1, parseInt(intervalInput.value) || mod.defaultInterval);
          intervalInput.value = val;
          window.timers[mod.timerKey].interval = val * 1000;
          if (window.saveModulePrefs) window.saveModulePrefs();
        }
      });
    }
  });
}

// Export
window.renderSearchEngines = renderSearchEngines;
window.renderCalendarModuleList = renderCalendarModuleList;
window.renderTodoModuleList = renderTodoModuleList;

let debugSettingsInitialized = false;

function initDebugSettings() {
  const debugModules = ['sw', 'network', 'websocket', 'search', 'app', 'core', 'system', 'weather', 'github', 'rss', 'layout', 'preferences', 'config', 'calendar', 'todo', 'quicklinks', 'timer', 'bookmarks'];

  // Load saved debug preferences
  try {
    const saved = window.loadFromStorage('debugPrefs');
    const prefs = saved || {};
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
          const prefs = window.loadFromStorage('debugPrefs', {});
          prefs[module] = checkbox.checked;
          window.saveToStorage('debugPrefs', prefs);
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
