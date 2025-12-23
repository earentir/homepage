// Main application initialization

// Double-click refresh handlers
const refreshHandlers = {
  cpu: () => window.refreshCPU && window.refreshCPU(),
  ram: () => window.refreshRAM && window.refreshRAM(),
  disk: () => window.refreshDisk && window.refreshDisk(),
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

  setInterval(() => window.refresh && window.refresh(), 30000);
  setInterval(() => window.refreshCPU && window.refreshCPU(), window.timers.cpu.interval);
  setInterval(() => window.refreshRAM && window.refreshRAM(), window.timers.ram.interval);
  setInterval(() => window.refreshDisk && window.refreshDisk(), window.timers.disk.interval);
  setInterval(() => window.refreshGitHub && window.refreshGitHub(), window.timers.github.interval);
  setInterval(() => window.refreshWeather && window.refreshWeather(), window.timers.weather.interval);
  setInterval(() => window.refreshIP && window.refreshIP(), window.timers.ip.interval);
  setInterval(() => { if (window.refreshRss) window.refreshRss(); }, window.timers.rss.interval);
}

// Initial data load
function initialLoad() {
  if (window.refresh) window.refresh();
  if (window.refreshCPU) window.refreshCPU();
  if (window.refreshRAM) window.refreshRAM();
  if (window.refreshDisk) window.refreshDisk();
  if (window.refreshCPUInfo) window.refreshCPUInfo();
  if (window.refreshRAMInfo) window.refreshRAMInfo();
  if (window.refreshWeather) window.refreshWeather();
  if (window.refreshIP) window.refreshIP();
  if (window.refreshGitHub) window.refreshGitHub();
}

// Main initialization
function initApp() {
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
  if (window.initCalendar) window.initCalendar();
  if (window.initTodo) window.initTodo();

  // Init layout
  if (window.initLayout) window.initLayout();

  // Setup handlers
  setupTimerHandlers();
  setupIntervals();

  // Initial load
  initialLoad();
}

// Run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// Export
window.loadModulePrefs = loadModulePrefs;
window.saveModulePrefs = saveModulePrefs;
window.applyModuleVisibility = applyModuleVisibility;
