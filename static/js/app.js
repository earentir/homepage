// Main application initialization

// Double-click refresh handlers
const refreshHandlers = {
  cpu: () => window.refreshCPU && window.refreshCPU(),
  ram: () => window.refreshRAM && window.refreshRAM(),
  disk: () => window.refreshAllDisks && window.refreshAllDisks(),
  github: () => window.refreshGitHub && window.refreshGitHub(true), // Force refresh on double-click
  weather: () => window.refreshWeather && window.refreshWeather(),
  ip: () => window.refreshIP && window.refreshIP(),
  monitoring: () => window.refreshMonitoring && window.refreshMonitoring(),
  snmp: () => window.refreshSnmp && window.refreshSnmp(),
  rss: () => window.refreshRss && window.refreshRss()
};

function setupTimerHandlers() {
  Object.keys(refreshHandlers).forEach(key => {
    const timerEl = document.getElementById(key + 'Timer');
    if (timerEl) {
      timerEl.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        refreshHandlers[key]();
      });
    }
  });
}

// Module prefs loading/saving
function loadModulePrefs() {
  try {
    const saved = localStorage.getItem('modulePrefs');
    if (saved) {
      const prefs = JSON.parse(saved);
      Object.keys(prefs).forEach(key => {
        if (window.moduleConfig && window.moduleConfig[key]) {
          window.moduleConfig[key].enabled = prefs[key].enabled;
        }
        if (prefs[key].interval && window.timers && window.timers[key]) {
          window.timers[key].interval = prefs[key].interval * 1000;
        }
      });
    }
  } catch (e) {
    console.error('Failed to load module prefs:', e);
  }
}

function saveModulePrefs() {
  try {
    const prefs = {};
    if (window.moduleConfig) {
      Object.keys(window.moduleConfig).forEach(key => {
        prefs[key] = {
          enabled: window.moduleConfig[key].enabled,
          interval: window.timers && window.timers[key] ? window.timers[key].interval / 1000 : undefined
        };
      });
    }
    localStorage.setItem('modulePrefs', JSON.stringify(prefs));
  } catch (e) {
    console.error('Failed to save module prefs:', e);
  }
}

function applyModuleVisibility() {
  if (!window.moduleConfig) return;
  let needsRerender = false;
  Object.keys(window.moduleConfig).forEach(key => {
    const card = document.querySelector(`[data-module="${key}"]`);
    if (card) {
      const wasVisible = card.style.display !== 'none';
      const shouldBeVisible = window.moduleConfig[key].enabled;
      card.style.display = shouldBeVisible ? '' : 'none';
      // If visibility changed, we need to re-render layout
      if (wasVisible !== shouldBeVisible) {
        needsRerender = true;
      }
    }
  });
  // Re-render layout if visibility changed
  if (needsRerender && window.initLayout) {
    setTimeout(() => {
      if (window.layoutSystem && window.layoutSystem.renderLayout) {
        window.layoutSystem.renderLayout();
      }
    }, 0);
  }
}

// Set up refresh intervals
function setupIntervals() {
  if (!window.timers) return;

  // Status refresh - only if WebSocket is not connected (fallback)
  setInterval(() => {
    // Only poll via HTTP if WebSocket is not connected
    if (!window.wsIsConnected || !window.wsIsConnected()) {
      if (window.refresh) window.refresh();
    }
  }, 30000);
  
  // CPU and RAM - only if WebSocket is not connected (WebSocket handles these in real-time)
  setInterval(() => {
    if (!window.wsIsConnected || !window.wsIsConnected()) {
      if (window.refreshCPU) window.refreshCPU();
      if (window.refreshRAM) window.refreshRAM();
    }
  }, window.timers.cpu.interval);
  
  // Other modules continue to use HTTP polling
  setInterval(() => window.refreshAllDisks && window.refreshAllDisks(), window.timers.disk.interval);
  setInterval(() => window.refreshGitHub && window.refreshGitHub(), window.timers.github.interval);
  setInterval(() => window.refreshWeather && window.refreshWeather(), window.timers.weather.interval);
  setInterval(() => window.refreshIP && window.refreshIP(), window.timers.ip.interval);
  setInterval(() => { if (window.refreshRss) window.refreshRss(); }, window.timers.rss.interval);
}

// Initial data load
function initialLoad() {
  console.log('[App] initialLoad() called');
  // Start status check first but don't block on it
  if (window.refresh) {
    console.log('[App] Calling window.refresh()');
    window.refresh().catch(err => {
      // Status check failed - will be handled by refresh() itself
      console.log("[App] Initial status check failed, will retry:", err);
    });
  } else {
    console.log('[App] window.refresh() not available');
  }
  
  console.log('[App] Loading other modules');
  // Load other data - these are independent
  if (window.refreshCPU) { console.log('[App] Calling refreshCPU'); window.refreshCPU(); }
  if (window.refreshRAM) { console.log('[App] Calling refreshRAM'); window.refreshRAM(); }
  if (window.renderDiskModules) { console.log('[App] Calling renderDiskModules'); window.renderDiskModules(); }
  if (window.refreshCPUInfo) { console.log('[App] Calling refreshCPUInfo'); window.refreshCPUInfo(); }
  if (window.refreshRAMInfo) { console.log('[App] Calling refreshRAMInfo'); window.refreshRAMInfo(); }
  if (window.refreshFirmwareInfo) { console.log('[App] Calling refreshFirmwareInfo'); window.refreshFirmwareInfo(); }
  if (window.refreshSystemInfo) { console.log('[App] Calling refreshSystemInfo'); window.refreshSystemInfo(); }
  if (window.refreshBaseboardInfo) { console.log('[App] Calling refreshBaseboardInfo'); window.refreshBaseboardInfo(); }
  if (window.refreshWeather) { console.log('[App] Calling refreshWeather'); window.refreshWeather(); }
  if (window.refreshIP) { console.log('[App] Calling refreshIP'); window.refreshIP(); }
  if (window.refreshGitHub) { console.log('[App] Calling refreshGitHub'); window.refreshGitHub(); }
  console.log('[App] initialLoad() completed');
}

// Main initialization
function initApp() {
  console.log('[App] initApp() called, readyState:', document.readyState);
  loadModulePrefs();
  applyModuleVisibility();

  // Init search
  if (window.initSearch) window.initSearch();

  // Init graphs
  if (window.applyFullBarsClass) window.applyFullBarsClass();
  if (window.initGraphs) window.initGraphs();

  // Init modules
  if (window.initGitHub) window.initGitHub();
  if (window.renderGitHubModules) window.renderGitHubModules();
  if (window.initQuicklinks) window.initQuicklinks();
  if (window.initMonitoring) window.initMonitoring();
  if (window.initSnmp) window.initSnmp();
  if (window.initRss) window.initRss();
  if (window.initDisk) window.initDisk();
  if (window.initCalendar) window.initCalendar();
  if (window.initTodo) window.initTodo();

  // Init layout
  if (window.initLayout) window.initLayout();

  // Setup handlers
  setupTimerHandlers();
  setupIntervals();

  // Initialize WebSocket for real-time status detection
  if (window.initWebSocket) {
    window.initWebSocket();
  }

  // Initial load
  initialLoad();
}

// Run when DOM is ready
console.log('[App] Script loaded, readyState:', document.readyState);
if (document.readyState === 'loading') {
  console.log('[App] Waiting for DOMContentLoaded');
  document.addEventListener('DOMContentLoaded', function() {
    console.log('[App] DOMContentLoaded fired');
    initApp();
  });
} else {
  console.log('[App] DOM already ready, calling initApp immediately');
  initApp();
}

// Export
window.loadModulePrefs = loadModulePrefs;
window.saveModulePrefs = saveModulePrefs;
window.applyModuleVisibility = applyModuleVisibility;
