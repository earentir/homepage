// Search module: Search engines and history management

// Search engines
const engines = [
  {name: "Google", url: "https://www.google.com/search?q=%s", icon: "fab fa-google"},
  {name: "DuckDuckGo", url: "https://duckduckgo.com/?q=%s", icon: "fas fa-duck"},
  {name: "Bing", url: "https://www.bing.com/search?q=%s", icon: "fab fa-microsoft"},
  {name: "Brave", url: "https://search.brave.com/search?q=%s", icon: "fas fa-shield-alt"},
  {name: "Yandex", url: "https://yandex.com/search/?text=%s", icon: "fab fa-yandex"},
  {name: "Startpage", url: "https://www.startpage.com/sp/search?query=%s", icon: "fas fa-search"},
  {name: "Ecosia", url: "https://www.ecosia.org/search?q=%s", icon: "fas fa-leaf"},
  {name: "Qwant", url: "https://www.qwant.com/?q=%s", icon: "fas fa-search"},
  {name: "SearXNG", url: "https://searx.org/search?q=%s", icon: "fas fa-search"},
  {name: "Perplexity", url: "https://www.perplexity.ai/search?q=%s", icon: "fas fa-brain"},
  {name: "GitHub", url: "https://github.com/search?q=%s", icon: "fab fa-github"},
  {name: "Stack Overflow", url: "https://stackoverflow.com/search?q=%s", icon: "fab fa-stack-overflow"},
  {name: "YouTube", url: "https://www.youtube.com/results?search_query=%s", icon: "fab fa-youtube"},
  {name: "Reddit", url: "https://www.reddit.com/search/?q=%s", icon: "fab fa-reddit"},
  {name: "Wikipedia", url: "https://en.wikipedia.org/w/index.php?search=%s", icon: "fab fa-wikipedia-w"},
  {name: "Skroutz", url: "https://www.skroutz.gr/search?keyphrase=%s", icon: "fas fa-shopping-bag"}
];

let currentEngineIndex = 0;
let searchHistory = [];

// Load saved engine
try {
  const saved = localStorage.getItem('searchEngine');
  if (saved) {
    // Check if saved engine is enabled
    let enabledEngines = [];
    try {
      const enabledSaved = localStorage.getItem('enabledSearchEngines');
      if (enabledSaved) {
        enabledEngines = JSON.parse(enabledSaved);
      } else {
        // Default: all engines enabled
        enabledEngines = engines.map(e => e.name);
      }
    } catch (e) {
      enabledEngines = engines.map(e => e.name);
    }
    
    // If saved engine is enabled, use it
    if (enabledEngines.includes(saved)) {
      const idx = engines.findIndex(e => e.name === saved);
      if (idx >= 0) currentEngineIndex = idx;
    } else {
      // Otherwise, use first enabled engine
      if (enabledEngines.length > 0) {
        const firstEnabled = engines.findIndex(e => e.name === enabledEngines[0]);
        if (firstEnabled >= 0) {
          currentEngineIndex = firstEnabled;
          localStorage.setItem('searchEngine', enabledEngines[0]);
        }
      }
    }
  }
} catch (e) {}

function loadSearchHistory() {
  try {
    const stored = localStorage.getItem('searchHistory');
    if (stored) {
      searchHistory = JSON.parse(stored);
    }
  } catch (e) {
    if (window.debugError) {
      window.debugError('search', "Error loading search history:", e);
    }
    searchHistory = [];
  }
}

function saveSearchHistory() {
  if (searchHistory.length > 100) {
    searchHistory = searchHistory.slice(-100);
  }
  localStorage.setItem('searchHistory', JSON.stringify(searchHistory));
}

function addToSearchHistory(term, engineName) {
  searchHistory = searchHistory.filter(item => !(item.term === term && item.engine === engineName));
  searchHistory.push({
    term: term,
    engine: engineName,
    timestamp: new Date().toISOString()
  });
  saveSearchHistory();
  if (window.renderSearchHistory) {
    window.renderSearchHistory();
  }
}

function removeFromSearchHistory(index) {
  if (index >= 0 && index < searchHistory.length) {
    searchHistory.splice(index, 1);
    saveSearchHistory();
    if (window.renderSearchHistory) {
      window.renderSearchHistory();
    }
  }
}

function clearSearchHistory() {
  if (confirm("Are you sure you want to clear all search history?")) {
    searchHistory = [];
    saveSearchHistory();
    if (window.renderSearchHistory) {
      window.renderSearchHistory();
    }
  }
}

function renderSearchHistory(filter = '') {
  const list = document.getElementById('searchHistoryList');
  if (!list) return;

  const filterLower = filter.toLowerCase();
  const filtered = filterLower
    ? searchHistory.filter(item => item.term.toLowerCase().includes(filterLower))
    : searchHistory;

  if (filtered.length === 0) {
    list.innerHTML = '<div class="small" style="color:var(--muted);padding:10px;">No search history</div>';
    return;
  }

  list.innerHTML = '';
  // Show in reverse order (newest first)
  [...filtered].reverse().forEach((item, displayIndex) => {
    const actualIndex = searchHistory.indexOf(item);
    const div = document.createElement('div');
    div.className = 'module-item';
    div.innerHTML = `
      <div class="module-icon"><i class="fas fa-search"></i></div>
      <div class="module-info">
        <div class="module-name">${window.escapeHtml(item.term)}</div>
        <div class="module-desc">${item.engine} • ${new Date(item.timestamp).toLocaleString()}</div>
      </div>
      <div class="module-controls">
        <button class="btn-small delete-search-btn" data-index="${actualIndex}"><i class="fas fa-trash"></i></button>
      </div>
    `;
    list.appendChild(div);

    const deleteBtn = div.querySelector('.delete-search-btn');
    deleteBtn.addEventListener('click', () => {
      removeFromSearchHistory(actualIndex);
    });
  });
}

function renderEngines() {
  const menu = document.getElementById("engineMenu");
  if (!menu) return;
  menu.innerHTML = "";
  
  // Always get enabled engines from localStorage (single source of truth)
  let enabledEngines = [];
  try {
    const saved = localStorage.getItem('enabledSearchEngines');
    if (saved) {
      enabledEngines = JSON.parse(saved);
    } else {
      // Default: all engines enabled - save this to localStorage
      enabledEngines = engines.map(e => e.name);
      localStorage.setItem('enabledSearchEngines', JSON.stringify(enabledEngines));
    }
  } catch (e) {
    // If error, default to all enabled
    enabledEngines = engines.map(e => e.name);
    localStorage.setItem('enabledSearchEngines', JSON.stringify(enabledEngines));
  }
  
  // Filter engines to only show enabled ones
  const enabledEnginesList = engines.filter(e => enabledEngines.includes(e.name));
  
  if (enabledEnginesList.length === 0) {
    // Fallback: if no engines enabled, show all and save to localStorage
    enabledEnginesList.push(...engines);
    enabledEngines = engines.map(e => e.name);
    localStorage.setItem('enabledSearchEngines', JSON.stringify(enabledEngines));
  }
  
  enabledEnginesList.forEach((e) => {
    const originalIndex = engines.findIndex(eng => eng.name === e.name);
    const btn = document.createElement("button");
    btn.textContent = e.name;
    btn.onclick = function() {
      currentEngineIndex = originalIndex;
      updateEngineBtn();
      menu.style.display = "none";
      localStorage.setItem('searchEngine', e.name);
      document.getElementById("q").focus();
    };
    menu.appendChild(btn);
  });
}

function updateEngineBtn() {
  const btn = document.getElementById("engineBtn");
  if (btn) {
    btn.textContent = engines[currentEngineIndex].name + ' ▾';
  }
}

// Check if a string is a valid URL or IP address
function isValidUrlOrIp(input) {
  const trimmed = input.trim();
  if (!trimmed) return false;
  
  // Check for IPv4 address (with optional port)
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/;
  if (ipv4Regex.test(trimmed)) {
    const parts = trimmed.split(':');
    const ipParts = parts[0].split('.');
    // Validate IP range (0-255)
    const isValidIp = ipParts.every(part => {
      const num = parseInt(part, 10);
      return num >= 0 && num <= 255;
    });
    // Validate port if present (1-65535)
    if (parts.length > 1) {
      const port = parseInt(parts[1], 10);
      if (port < 1 || port > 65535) return false;
    }
    return isValidIp;
  }
  
  // Check for URL (with or without protocol)
  // Match domain patterns: domain.tld, subdomain.domain.tld, etc.
  // Also match localhost
  const urlPattern = /^(https?:\/\/)?([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(:\d+)?(\/.*)?$|^localhost(:\d+)?(\/.*)?$/i;
  if (urlPattern.test(trimmed)) {
    return true;
  }
  
  // Check for URLs with IP and port
  const urlWithIpPattern = /^https?:\/\/(\d{1,3}\.){3}\d{1,3}(:\d+)?(\/.*)?$/;
  if (urlWithIpPattern.test(trimmed)) {
    return true;
  }
  
  return false;
}

// Normalize URL - add http:// if no protocol is present
function normalizeUrl(input) {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  
  // If it already has a protocol, return as is
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  
  // If it starts with //, add http:
  if (trimmed.startsWith('//')) {
    return 'http:' + trimmed;
  }
  
  // Otherwise, add http://
  return 'http://' + trimmed;
}

function goSearch() {
  const q = document.getElementById("q");
  const term = (q.value || "").trim();
  if (!term) return;
  
  // Check if the input is a valid URL or IP address
  if (isValidUrlOrIp(term)) {
    // Navigate directly to the URL/IP
    const url = normalizeUrl(term);
    addToSearchHistory(term, "Direct URL");
    window.open(url, "_blank", "noreferrer");
    q.value = "";
    return;
  }
  
  // Otherwise, perform normal search
  const engine = engines[currentEngineIndex];
  addToSearchHistory(term, engine.name);
  const u = engine.url.replace("%s", encodeURIComponent(term));
  window.open(u, "_blank", "noreferrer");
  q.value = "";
}

// Global keyboard shortcuts handler (only add once)
let keyboardShortcutsInitialized = false;

function handleKeyboardShortcut(e) {
  // Ignore if modifier keys are pressed (Ctrl, Alt, Meta)
  if (e.ctrlKey || e.altKey || e.metaKey) {
    return;
  }

  // Don't capture keys when modal is open (preferences)
  if (window.isModalOpen && window.isModalOpen()) {
    return;
  }

  // Check if we're in an input field
  const activeElement = document.activeElement;
  if (activeElement) {
    const tag = activeElement.tagName.toLowerCase();
    const isInput = tag === 'input' || tag === 'textarea' || tag === 'select';
    const isContentEditable = activeElement.isContentEditable || activeElement.getAttribute('contenteditable') === 'true';
    
    // Don't capture when in any input field or contentEditable element
    if (isInput || isContentEditable) {
      return;
    }
  }

  // Handle "/" key to focus search
  if (e.key === "/") {
    e.preventDefault();
    e.stopPropagation();
    const q = document.getElementById("q");
    if (q) {
      q.focus();
      q.select();
    }
    return;
  }

  // Handle "E" key to open engine menu
  if (e.key.toLowerCase() === "e") {
    e.preventDefault();
    e.stopPropagation();
    const engineMenu = document.getElementById("engineMenu");
    if (engineMenu) {
      engineMenu.style.display = engineMenu.style.display === "block" ? "none" : "block";
    }
    return;
  }
}

function initKeyboardShortcuts() {
  if (keyboardShortcutsInitialized) return;
  
  // Ensure DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initKeyboardShortcuts, { once: true });
    return;
  }
  
  keyboardShortcutsInitialized = true;
  
  // Add listener to window - use capture phase to catch early
  // Also try without capture as fallback for better compatibility
  window.addEventListener('keydown', handleKeyboardShortcut, true);
  
  if (window.debugLog) {
    window.debugLog('search', 'Keyboard shortcuts initialized');
  }
}

// Force initialization on multiple events to ensure it works on all platforms
(function() {
  function tryInit() {
    if (!keyboardShortcutsInitialized) {
      initKeyboardShortcuts();
    }
  }
  
  // Try on various events to ensure it initializes
  if (document.readyState === 'complete') {
    tryInit();
  } else {
    window.addEventListener('load', tryInit, { once: true });
    document.addEventListener('DOMContentLoaded', tryInit, { once: true });
  }
  
  // Final fallback - try after a short delay
  setTimeout(tryInit, 100);
})();

function initSearch() {
  loadSearchHistory();

  const q = document.getElementById("q");
  const engineBtn = document.getElementById("engineBtn");
  const engineMenu = document.getElementById("engineMenu");

  if (q) {
    q.addEventListener('keydown', (e) => {
      if (e.key === "Enter") goSearch();
    });
    // Focus the search box when page loads
    // Use requestAnimationFrame to ensure it happens after render
    requestAnimationFrame(() => {
      q.focus();
    });
  }

  if (engineBtn && engineMenu) {
    engineBtn.onclick = function(e) {
      e.stopPropagation();
      engineMenu.style.display = (engineMenu.style.display === "block") ? "none" : "block";
    };

    document.addEventListener("click", function(ev) {
      if (!engineBtn.contains(ev.target) && !engineMenu.contains(ev.target)) {
        engineMenu.style.display = "none";
      }
    });
  }

  // Initialize keyboard shortcuts
  initKeyboardShortcuts();
  
  // Fallback: ensure it's initialized after DOM is fully ready
  if (document.readyState !== 'complete') {
    window.addEventListener('load', initKeyboardShortcuts, { once: true });
  }

  renderEngines();
  updateEngineBtn();
  
  // Validate current engine is still enabled
  try {
    const saved = localStorage.getItem('searchEngine');
    if (saved) {
      let enabledEngines = [];
      try {
        const enabledSaved = localStorage.getItem('enabledSearchEngines');
        if (enabledSaved) {
          enabledEngines = JSON.parse(enabledSaved);
        } else {
          enabledEngines = engines.map(e => e.name);
        }
      } catch (e) {
        enabledEngines = engines.map(e => e.name);
      }
      
      if (!enabledEngines.includes(saved) && enabledEngines.length > 0) {
        // Current engine is disabled, switch to first enabled
        const firstEnabled = engines.findIndex(e => e.name === enabledEngines[0]);
        if (firstEnabled >= 0) {
          currentEngineIndex = firstEnabled;
          localStorage.setItem('searchEngine', enabledEngines[0]);
          updateEngineBtn();
        }
      }
    }
  } catch (e) {}
}

// Export to window
window.engines = engines;
window.searchHistory = searchHistory;
window.loadSearchHistory = loadSearchHistory;
window.saveSearchHistory = saveSearchHistory;
window.addToSearchHistory = addToSearchHistory;
window.removeFromSearchHistory = removeFromSearchHistory;
window.clearSearchHistory = clearSearchHistory;
window.renderSearchHistory = renderSearchHistory;
window.renderEngines = renderEngines;
window.goSearch = goSearch;
window.initSearch = initSearch;
