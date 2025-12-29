// Search module: Search engines and history management

// Search engines
const engines = [
  {name: "Google", url: "https://www.google.com/search?q=%s", icon: "fab fa-google"},
  {name: "DuckDuckGo", url: "https://duckduckgo.com/?q=%s", icon: "fas fa-duck"},
  {name: "Bing", url: "https://www.bing.com/search?q=%s", icon: "fab fa-microsoft"},
  {name: "Perplexity", url: "https://www.perplexity.ai/search?q=%s", icon: "fas fa-brain"},
  {name: "GitHub", url: "https://github.com/search?q=%s", icon: "fab fa-github"},
  {name: "Stack Overflow", url: "https://stackoverflow.com/search?q=%s", icon: "fab fa-stack-overflow"},
  {name: "YouTube", url: "https://www.youtube.com/results?search_query=%s", icon: "fab fa-youtube"},
  {name: "Reddit", url: "https://www.reddit.com/search/?q=%s", icon: "fab fa-reddit"},
  {name: "Wikipedia", url: "https://en.wikipedia.org/w/index.php?search=%s", icon: "fab fa-wikipedia-w"}
];

let currentEngineIndex = 0;
let searchHistory = [];

// Load saved engine
try {
  const saved = localStorage.getItem('searchEngine');
  if (saved) {
    const idx = engines.findIndex(e => e.name === saved);
    if (idx >= 0) currentEngineIndex = idx;
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
  engines.forEach((e, i) => {
    const btn = document.createElement("button");
    btn.textContent = e.name;
    btn.onclick = function() {
      currentEngineIndex = i;
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

function goSearch() {
  const q = document.getElementById("q");
  const term = (q.value || "").trim();
  if (!term) return;
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
