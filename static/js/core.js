// Core utilities and timer management

// Timer management
const timers = {
  cpu: {interval: 5000, lastUpdate: 0, timer: null},
  ram: {interval: 5000, lastUpdate: 0, timer: null},
  disk: {interval: 15000, lastUpdate: 0, timer: null},
  github: {interval: 900000, lastUpdate: 0, timer: null},
  weather: {interval: 1800000, lastUpdate: 0, timer: null},
  ip: {interval: 7200000, lastUpdate: 0, timer: null},
  monitoring: {interval: 60000, lastUpdate: 0, timer: null},
  snmp: {interval: 60000, lastUpdate: 0, timer: null},
  rss: {interval: 300000, lastUpdate: 0, timer: null},
  general: {interval: 30000, lastUpdate: 0, timer: null}
};

function updateTimer(moduleName) {
  const timer = timers[moduleName];
  if (!timer) return;
  const elapsed = Date.now() - timer.lastUpdate;
  const remaining = Math.max(0, timer.interval - elapsed);
  const timerEl = document.getElementById(moduleName + "Timer");
  if (timerEl) {
    const seconds = Math.ceil(remaining / 1000);
    const percent = (elapsed / timer.interval) * 100;
    const percentClamped = Math.min(100, Math.max(0, percent));

    if (remaining > 0) {
      timerEl.title = "Next refresh in " + seconds + "s (double-click to refresh now)";
      timerEl.classList.remove("paused");
      timerEl.style.setProperty("--progress-percent", percentClamped + "%");
    } else {
      timerEl.title = "Ready to refresh (double-click to refresh now)";
      timerEl.classList.add("paused");
      timerEl.style.setProperty("--progress-percent", "100%");
    }
  }
}

function startTimer(moduleName) {
  const timer = timers[moduleName];
  if (!timer) return;
  timer.lastUpdate = Date.now();
  updateTimer(moduleName);
  if (timer.timer) clearInterval(timer.timer);
  timer.timer = setInterval(() => updateTimer(moduleName), 1000);
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(2) + " " + sizes[i];
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function fmtUptime(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  let parts = [];
  if (d) parts.push(d + "d");
  if (h) parts.push(h + "h");
  if (m) parts.push(m + "m");
  if (s || parts.length === 0) parts.push(s + "s");
  return parts.join(" ");
}

function isModalOpen() {
  const modals = document.querySelectorAll('.modal-overlay');
  for (const modal of modals) {
    if (modal.classList.contains('active') ||
        (modal.style.display && modal.style.display !== 'none')) {
      return true;
    }
  }
  return false;
}

// Fetch with timeout wrapper
function fetchWithTimeout(url, options = {}, timeout = 5000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.log('[Core] fetchWithTimeout: Aborting request to', url, 'after', timeout, 'ms');
    controller.abort();
  }, timeout);
  
  return fetch(url, {
    ...options,
    signal: controller.signal
  })
    .then((response) => {
      clearTimeout(timeoutId);
      console.log('[Core] fetchWithTimeout: Request succeeded to', url);
      return response;
    })
    .catch((error) => {
      clearTimeout(timeoutId);
      console.log('[Core] fetchWithTimeout: Request failed to', url, error.name, error.message);
      throw error;
    });
}

// Export to window
window.timers = timers;
window.updateTimer = updateTimer;
window.startTimer = startTimer;
window.formatBytes = formatBytes;
window.escapeHtml = escapeHtml;
window.fmtUptime = fmtUptime;
window.isModalOpen = isModalOpen;
window.fetchWithTimeout = fetchWithTimeout;
