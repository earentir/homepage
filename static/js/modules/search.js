// Search module: Search engines and history management

// Search engines - loaded from backend API
let engines = [];
let currentEngineIndex = 0;
let searchHistory = [];
let autocompleteItems = [];
let selectedAutocompleteIndex = -1;

// Load search engines from backend API
async function loadSearchEngines() {
  try {
    const res = await fetch("/api/search-engines", {cache:"no-store"});
    if (res.ok) {
      const data = await res.json();
      if (data.engines && Array.isArray(data.engines)) {
        // Convert backend format (Name, URL, Icon, Category) to frontend format (name, url, icon, category)
        engines = data.engines.map(e => ({
          name: e.name || e.Name,
          url: e.url || e.URL,
          icon: e.icon || e.Icon,
          category: e.category || e.Category
        }));
        window.engines = engines;
        return true;
      }
    }
  } catch (e) {
    if (window.debugError) window.debugError('search', 'Error loading search engines from backend:', e);
  }
  
  // Fallback: use empty array if backend fails
  engines = [];
  window.engines = engines;
  return false;
}

// Initialize search engines and load saved engine
async function initSearchEngines() {
  // Load engines from backend
  await loadSearchEngines();
  
  // Load saved engine
  try {
    const saved = window.loadFromStorage('searchEngine');
    if (saved && engines.length > 0) {
      // Check if saved engine is enabled
      let enabledEngines = [];
      try {
        const enabledSaved = window.loadFromStorage('enabledSearchEngines');
        if (enabledSaved) {
          enabledEngines = enabledSaved;
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
            window.saveToStorage('searchEngine', enabledEngines[0]);
          }
        }
      }
    }
  } catch (e) {}
}

function loadSearchHistory() {
  try {
    const stored = window.loadFromStorage('searchHistory');
    if (stored) {
      searchHistory = stored;
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
  window.saveToStorage('searchHistory', searchHistory);
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

async function clearSearchHistory() {
  const confirmed = await window.popup.confirm("Are you sure you want to clear all search history?", "Confirm Clear");
  if (confirmed) {
    searchHistory = [];
    saveSearchHistory();
    if (window.renderSearchHistory) {
      window.renderSearchHistory();
    }
  }
}

async function renderSearchHistory(filter = '') {
  const list = document.getElementById('searchHistoryList');
  if (!list) return;
  
  // Only render if the history tab is active
  const historyTab = document.getElementById('subtab-search-history');
  if (!historyTab || !historyTab.classList.contains('active')) {
    return;
  }

  // Reload search history to ensure it's up to date
  loadSearchHistory();

  // Use backend API for filtering
  let filtered = [];
  try {
    const response = await fetch(`/api/search/history/filter?filter=${encodeURIComponent(filter)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(searchHistory)
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.history && Array.isArray(data.history)) {
        filtered = data.history;
      }
    } else {
      if (window.debugError) window.debugError('search', 'Error filtering search history: HTTP ' + response.status);
    }
  } catch (e) {
    if (window.debugError) window.debugError('search', 'Error filtering search history:', e);
  }

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
    const saved = window.loadFromStorage('enabledSearchEngines');
    if (saved) {
      enabledEngines = saved;
    } else {
      // Default: all engines enabled - save this to localStorage
      enabledEngines = engines.map(e => e.name);
      window.saveToStorage('enabledSearchEngines', enabledEngines);
    }
  } catch (e) {
    // If error, default to all enabled
    enabledEngines = engines.map(e => e.name);
    window.saveToStorage('enabledSearchEngines', enabledEngines);
  }

  // Filter engines to only show enabled ones
  const enabledEnginesList = engines.filter(e => enabledEngines.includes(e.name));

  if (enabledEnginesList.length === 0) {
    // Fallback: if no engines enabled, show all and save to localStorage
    enabledEnginesList.push(...engines);
    enabledEngines = engines.map(e => e.name);
    window.saveToStorage('enabledSearchEngines', enabledEngines);
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
  enabledEnginesList.forEach((e) => {
    const category = e.category || "general";
    if (!enginesByCategory[category]) {
      enginesByCategory[category] = [];
    }
    enginesByCategory[category].push(e);
  });

  // Render each category
  Object.keys(categoryMap).forEach(categoryKey => {
    if (!enginesByCategory[categoryKey] || enginesByCategory[categoryKey].length === 0) {
      return;
    }

    // Create category header
    const categoryDiv = document.createElement("div");
    categoryDiv.className = "engine-category";
    const categoryHeader = document.createElement("div");
    categoryHeader.className = "engine-category-header";
    categoryHeader.textContent = categoryMap[categoryKey];
    categoryDiv.appendChild(categoryHeader);

    // Add engines for this category
    enginesByCategory[categoryKey].forEach((e) => {
      const originalIndex = engines.findIndex(eng => eng.name === e.name);
      const btn = document.createElement("button");
      btn.textContent = e.name;
      btn.onclick = function() {
        currentEngineIndex = originalIndex;
        updateEngineBtn();
        menu.style.display = "none";
        window.saveToStorage('searchEngine', e.name);
        document.getElementById("q").focus();
      };
      categoryDiv.appendChild(btn);
    });

    menu.appendChild(categoryDiv);
  });
}

function updateEngineBtn() {
  const btn = document.getElementById("engineBtn");
  if (btn) {
    btn.textContent = engines[currentEngineIndex].name + ' ▾';
  }
}

// Switch to a specific engine by name
function switchToEngine(engineName) {
  if (!engineName) return false;
  
  // Get enabled engines
  let enabledEngines = [];
  try {
    const enabledSaved = window.loadFromStorage('enabledSearchEngines');
    if (enabledSaved) {
      enabledEngines = enabledSaved;
    } else {
      enabledEngines = engines.map(e => e.name);
    }
  } catch (e) {
    enabledEngines = engines.map(e => e.name);
  }

  // Find engine by name (case-insensitive, partial match)
  const engineNameLower = engineName.toLowerCase();
  const engine = engines.find(e => {
    if (!enabledEngines.includes(e.name)) return false;
    return e.name.toLowerCase().startsWith(engineNameLower);
  });

  if (engine) {
    const idx = engines.findIndex(e => e.name === engine.name);
    if (idx >= 0) {
      currentEngineIndex = idx;
      updateEngineBtn();
      window.saveToStorage('searchEngine', engine.name);
      return true;
    }
  }
  return false;
}

// Get engine suggestions for autocomplete
function getEngineSuggestions(prefix) {
  if (!prefix) return [];
  
  let enabledEngines = [];
  try {
    const enabledSaved = window.loadFromStorage('enabledSearchEngines');
    if (enabledSaved) {
      enabledEngines = enabledSaved;
    } else {
      enabledEngines = engines.map(e => e.name);
    }
  } catch (e) {
    enabledEngines = engines.map(e => e.name);
  }

  const prefixLower = prefix.toLowerCase();
  return engines
    .filter(e => enabledEngines.includes(e.name))
    .filter(e => e.name.toLowerCase().startsWith(prefixLower))
    .map(e => e.name)
    .slice(0, 5); // Limit to 5 suggestions
}

// Get single-letter shortcuts for engines
function getEngineShortcuts() {
  // Common shortcuts: g=Google, y=YouTube, d=DuckDuckGo, etc.
  const shortcuts = {
    'g': 'Google',
    'y': 'YouTube',
    'd': 'DuckDuckGo',
    'b': 'Bing',
    'r': 'Reddit',
    'w': 'Wikipedia',
    's': 'Stack Overflow',
    'gh': 'GitHub',
    'a': 'Amazon',
    'p': 'Perplexity',
    'c': 'ChatGPT'
  };
  
  // Get enabled engines
  let enabledEngines = [];
  try {
    const enabledSaved = window.loadFromStorage('enabledSearchEngines');
    if (enabledSaved) {
      enabledEngines = enabledSaved;
    } else {
      enabledEngines = engines.map(e => e.name);
    }
  } catch (e) {
    enabledEngines = engines.map(e => e.name);
  }

  // Filter shortcuts to only include enabled engines
  const filtered = {};
  for (const [key, engineName] of Object.entries(shortcuts)) {
    if (enabledEngines.includes(engineName)) {
      filtered[key] = engineName;
    }
  }
  
  return filtered;
}

// Check if a string is a valid URL or IP address
// Client-side validation (fast, used for immediate feedback)
// Backend API is available at /api/utils/validate-url for server-side validation
function isValidUrlOrIpSync(input) {
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

// Async version that uses backend API (for server-side validation when needed)
async function isValidUrlOrIp(input) {
  const trimmed = input.trim();
  if (!trimmed) return false;

  try {
    const response = await fetch(`/api/utils/validate-url?input=${encodeURIComponent(trimmed)}`);
    if (response.ok) {
      const data = await response.json();
      if (data.valid !== undefined) {
        return data.valid;
      }
    }
  } catch (e) {
    if (window.debugError) window.debugError('search', 'Error validating URL:', e);
  }

  return false;
}

// Normalize URL - add http:// if no protocol is present
// Uses backend API if available, falls back to client-side normalization
function normalizeUrl(input) {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;

  // Client-side normalization (fast, used for immediate feedback)
  // Backend API is available at /api/utils/normalize-url for server-side validation
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

function hideAutocomplete() {
  const autocomplete = document.getElementById("searchAutocomplete");
  if (autocomplete) {
    autocomplete.style.display = "none";
  }
  selectedAutocompleteIndex = -1;
}

// Show engine suggestions in autocomplete
function showEngineSuggestions(suggestions, prefix) {
  const autocomplete = document.getElementById("searchAutocomplete");
  if (!autocomplete) return;

  autocomplete.innerHTML = '';
  autocompleteItems = [];

  suggestions.forEach((engineName, index) => {
    const engine = engines.find(e => e.name === engineName);
    if (!engine) return;

    const div = document.createElement('div');
    div.className = 'autocomplete-item';
    div.setAttribute('data-index', index);
    div.innerHTML = `
      <i class="${engine.icon || 'fas fa-search'}" style="margin-right: 8px; color: var(--muted);"></i>
      <span class="autocomplete-term">${window.escapeHtml ? window.escapeHtml(engineName) : engineName}</span>
      <span class="autocomplete-engine" style="color: var(--accent);">Switch engine</span>
    `;
    div.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (switchToEngine(engineName)) {
        const q = document.getElementById("q");
        if (q) {
          q.value = '';
          q.focus();
        }
        hideAutocomplete();
      }
    });
    div.addEventListener('mouseenter', () => {
      selectedAutocompleteIndex = index;
      updateAutocompleteSelection();
    });
    autocomplete.appendChild(div);
    
    // Add to autocompleteItems for keyboard navigation
    autocompleteItems.push({
      term: engineName,
      engine: engineName,
      type: 'engine-suggestion'
    });
  });

  selectedAutocompleteIndex = -1;
  showAutocomplete();
}

function showAutocomplete() {
  const autocomplete = document.getElementById("searchAutocomplete");
  if (autocomplete && autocompleteItems.length > 0) {
    autocomplete.style.display = "block";
    // Ensure it's visible
    autocomplete.style.visibility = "visible";
    autocomplete.style.opacity = "1";
  }
}

async function renderAutocomplete(filter = '') {
  const autocomplete = document.getElementById("searchAutocomplete");
  if (!autocomplete) return;

  const q = document.getElementById("q");
  if (!q) return;

  const term = (q.value || "").trim();
  
  if (!term) {
    hideAutocomplete();
    return;
  }

  // Reload search history to ensure it's up to date
  loadSearchHistory();

  if (!searchHistory || searchHistory.length === 0) {
    hideAutocomplete();
    return;
  }

  // Use backend API for autocomplete
  try {
    const response = await fetch(`/api/search/autocomplete?term=${encodeURIComponent(term)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(searchHistory)
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.suggestions && Array.isArray(data.suggestions)) {
        autocompleteItems = data.suggestions;
      } else {
        autocompleteItems = [];
      }
    } else {
      if (window.debugError) window.debugError('search', 'Error getting autocomplete: HTTP ' + response.status);
      autocompleteItems = [];
    }
  } catch (e) {
    if (window.debugError) window.debugError('search', 'Error getting autocomplete:', e);
    autocompleteItems = [];
  }

  if (autocompleteItems.length === 0) {
    hideAutocomplete();
    return;
  }

  autocomplete.innerHTML = '';
  autocompleteItems.forEach((item, index) => {
    if (!item || !item.term) return;
    
    const isDirectUrl = item.engine === "Direct URL" || isValidUrlOrIpSync(item.term);
    const isBookmark = item.engine === "Bookmark";
    let iconClass = 'fas fa-history';
    if (isDirectUrl) {
      iconClass = 'fas fa-link';
    } else if (isBookmark) {
      iconClass = 'fas fa-bookmark';
    }
    
    const div = document.createElement('div');
    div.className = 'autocomplete-item';
    div.setAttribute('data-index', index);
    div.innerHTML = `
      <i class="${iconClass}" style="margin-right: 8px; color: var(--muted);"></i>
      <span class="autocomplete-term">${window.escapeHtml ? window.escapeHtml(item.term) : item.term}</span>
      <span class="autocomplete-engine">${window.escapeHtml ? window.escapeHtml(item.engine || '') : (item.engine || '')}</span>
    `;
    div.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      selectAutocompleteItem(index, e);
    });
    div.addEventListener('mouseenter', () => {
      selectedAutocompleteIndex = index;
      updateAutocompleteSelection();
    });
    div.addEventListener('mousedown', (e) => {
      // Don't prevent default on Shift+Click for direct URLs or bookmarks
      if (!(e.shiftKey && (item.engine === "Direct URL" || item.engine === "Bookmark" || isValidUrlOrIpSync(item.term)))) {
        e.preventDefault(); // Prevent input from losing focus
      }
    });
    autocomplete.appendChild(div);
  });

  selectedAutocompleteIndex = -1;
  showAutocomplete();
  
  // Force a reflow to ensure visibility
  autocomplete.offsetHeight;
}

function updateAutocompleteSelection() {
  const autocomplete = document.getElementById("searchAutocomplete");
  if (!autocomplete) return;

  const items = autocomplete.querySelectorAll('.autocomplete-item');
  items.forEach((item, index) => {
    if (index === selectedAutocompleteIndex) {
      item.classList.add('selected');
    } else {
      item.classList.remove('selected');
    }
  });
}

function selectAutocompleteItem(index, event = null) {
  if (index < 0 || index >= autocompleteItems.length) return;

  const item = autocompleteItems[index];
  if (!item || !item.term) return;

  const q = document.getElementById("q");
  if (!q) return;

  const term = item.term;
  const isDirectUrl = item.engine === "Direct URL" || isValidUrlOrIpSync(term);
  const isBookmark = item.engine === "Bookmark";
  const shiftPressed = event && event.shiftKey;

  // Get preferences
  let directVisitUrls = true;
  let switchEngine = true;
  try {
    const directVisitSaved = window.loadFromStorage('directVisitUrlsFromSearch');
    if (directVisitSaved === null || directVisitSaved === undefined) {
      directVisitUrls = true;
    } else if (typeof directVisitSaved === 'boolean') {
      directVisitUrls = directVisitSaved;
    } else {
      directVisitUrls = directVisitSaved === 'true' || directVisitSaved === true;
    }
    
    const switchEngineSaved = window.loadFromStorage('switchEngineOnSelect');
    if (switchEngineSaved === null || switchEngineSaved === undefined) {
      switchEngine = true;
    } else if (typeof switchEngineSaved === 'boolean') {
      switchEngine = switchEngineSaved;
    } else {
      switchEngine = switchEngineSaved === 'true' || switchEngineSaved === true;
    }
  } catch (e) {
    // Use defaults
  }

  // Handle bookmarks - always navigate to bookmark URL
  if (isBookmark && item.timestamp) {
    // Use timestamp field which contains the bookmark URL
    hideAutocomplete();
    
    // Get same tab preference
    let sameTab = true;
    try {
      const saved = window.loadFromStorage('sameTabOnSearch');
      if (saved === null || saved === undefined) {
        sameTab = true;
      } else if (typeof saved === 'boolean') {
        sameTab = saved;
      } else {
        sameTab = saved === 'true' || saved === true;
      }
    } catch (e) {
      sameTab = true;
    }

    const url = normalizeUrl(item.timestamp);
    if (sameTab) {
      window.location.href = url;
    } else {
      window.open(url, "_blank", "noreferrer");
    }
    return;
  }

  // Handle direct URLs
  if (isDirectUrl) {
    // If preference is enabled OR Shift is pressed, visit directly
    if (directVisitUrls || shiftPressed) {
      hideAutocomplete();
      
      // Get same tab preference
      let sameTab = true;
      try {
        const saved = window.loadFromStorage('sameTabOnSearch');
        if (saved === null || saved === undefined) {
          sameTab = true;
        } else if (typeof saved === 'boolean') {
          sameTab = saved;
        } else {
          sameTab = saved === 'true' || saved === true;
        }
      } catch (e) {
        sameTab = true;
      }

      const url = normalizeUrl(term);
      if (sameTab) {
        window.location.href = url;
      } else {
        window.open(url, "_blank", "noreferrer");
      }
      return;
    }
    // Otherwise, just fill the search box (default behavior)
  } else {
    // For regular searches, switch engine if preference is enabled
    if (switchEngine && item.engine && item.engine !== "Direct URL" && item.engine !== "Bookmark") {
      const engineIndex = engines.findIndex(e => e.name === item.engine);
      if (engineIndex >= 0) {
        // Check if engine is enabled
        let enabledEngines = [];
        try {
          const enabledSaved = window.loadFromStorage('enabledSearchEngines');
          if (enabledSaved) {
            enabledEngines = enabledSaved;
          } else {
            enabledEngines = engines.map(e => e.name);
          }
        } catch (e) {
          enabledEngines = engines.map(e => e.name);
        }

        if (enabledEngines.includes(item.engine)) {
          currentEngineIndex = engineIndex;
          updateEngineBtn();
          window.saveToStorage('searchEngine', item.engine);
        }
      }
    }
  }

  // Fill the search box
  q.value = term;
  hideAutocomplete();
  q.focus();
}

function goSearch() {
  const q = document.getElementById("q");
  const term = (q.value || "").trim();
  if (!term) return;

  hideAutocomplete();

  // Get same tab preference (default: true)
  let sameTab = true;
  try {
    const saved = window.loadFromStorage('sameTabOnSearch');
    if (saved === null || saved === undefined) {
      sameTab = true;
    } else if (typeof saved === 'boolean') {
      sameTab = saved;
    } else {
      sameTab = saved === 'true' || saved === true;
    }
  } catch (e) {
    sameTab = true;
  }

  // Check if the input is a valid URL or IP address
  if (isValidUrlOrIpSync(term)) {
    // Navigate directly to the URL/IP
    const url = normalizeUrl(term);
    addToSearchHistory(term, "Direct URL");
    if (sameTab) {
      window.location.href = url;
    } else {
      window.open(url, "_blank", "noreferrer");
    }
    q.value = "";
    return;
  }

  // Otherwise, perform normal search
  const engine = engines[currentEngineIndex];
  addToSearchHistory(term, engine.name);
  const u = engine.url.replace("%s", encodeURIComponent(term));
  if (sameTab) {
    window.location.href = u;
  } else {
    window.open(u, "_blank", "noreferrer");
  }
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

async function initSearch() {
  // Load search engines from backend first
  await initSearchEngines();
  
  loadSearchHistory();

  const q = document.getElementById("q");
  const engineBtn = document.getElementById("engineBtn");
  const engineMenu = document.getElementById("engineMenu");

  if (q) {
    // Track state for @ and Tab completion
    let engineCompletionState = null; // {type: '@'|'tab', prefix: string, suggestions: []}
    
    // Handle input changes for autocomplete
    q.addEventListener('input', (e) => {
      const value = q.value;
      
      // Check for single-letter shortcut + space pattern (e.g., "y synergy")
      if (value.length > 2 && value[1] === ' ') {
        const shortcuts = getEngineShortcuts();
        const firstChar = value[0].toLowerCase();
        if (shortcuts[firstChar]) {
          // User typed shortcut + space + text, switch engine and keep the search term
          const searchTerm = value.substring(2);
          if (switchToEngine(shortcuts[firstChar])) {
            q.value = searchTerm;
            hideAutocomplete();
            engineCompletionState = null;
            // Trigger autocomplete for the search term
            setTimeout(() => {
              renderAutocomplete();
            }, 0);
          }
          return;
        }
      }
      
      // Check for @ engine selection
      if (value.startsWith('@')) {
        // Match @engineName or @engineName search term
        const match = value.match(/^@(\w+)(?:\s+(.+))?$/);
        if (match) {
          const engineName = match[1];
          const searchTerm = match[2] || '';
          
          // If there's a search term after the engine name, switch engine immediately
          if (searchTerm) {
            if (switchToEngine(engineName)) {
              q.value = searchTerm;
              hideAutocomplete();
              engineCompletionState = null;
              // Trigger autocomplete for the search term
              setTimeout(() => {
                renderAutocomplete();
              }, 0);
            }
            return;
          }
          
          // Otherwise, show suggestions as user types
          const suggestions = getEngineSuggestions(engineName);
          engineCompletionState = {type: '@', prefix: engineName, suggestions: suggestions};
          
          // Show engine suggestions in autocomplete
          if (suggestions.length > 0) {
            showEngineSuggestions(suggestions, engineName);
          } else {
            hideAutocomplete();
            engineCompletionState = null;
          }
        } else {
          // @ followed by something else, clear completion state
          engineCompletionState = null;
          setTimeout(() => {
            renderAutocomplete();
          }, 0);
        }
      } else {
        // Clear @ completion state if not starting with @
        engineCompletionState = null;
        // Small delay to ensure value is updated
        setTimeout(() => {
          renderAutocomplete();
        }, 0);
      }
    });

    // Show autocomplete on focus if there's text
    q.addEventListener('focus', (e) => {
      if (q.value && q.value.trim()) {
        setTimeout(() => {
          renderAutocomplete();
        }, 0);
      }
    });

    // Handle keyboard navigation
    q.addEventListener('keydown', (e) => {
      const autocomplete = document.getElementById("searchAutocomplete");
      const isAutocompleteVisible = autocomplete && autocomplete.style.display !== 'none' && autocompleteItems.length > 0;

      if (e.key === "Enter") {
        const value = q.value.trim();
        
        // Handle single-letter shortcut + space pattern (e.g., "y synergy")
        if (value.length > 2 && value[1] === ' ') {
          const shortcuts = getEngineShortcuts();
          const firstChar = value[0].toLowerCase();
          if (shortcuts[firstChar]) {
            const searchTerm = value.substring(2);
            e.preventDefault();
            if (switchToEngine(shortcuts[firstChar])) {
              q.value = searchTerm;
              hideAutocomplete();
              engineCompletionState = null;
              // Perform the search
              goSearch();
            }
            return;
          }
        }
        
        // Handle @ engine selection
        if (value.startsWith('@')) {
          const match = value.match(/^@(\w+)(?:\s+(.+))?$/);
          if (match) {
            const engineName = match[1];
            const searchTerm = match[2];
            
            // If there's a search term, switch engine and search
            if (searchTerm) {
              e.preventDefault();
              if (switchToEngine(engineName)) {
                q.value = searchTerm;
                hideAutocomplete();
                engineCompletionState = null;
                // Perform the search
                goSearch();
              }
              return;
            }
            
            // If no search term, just switch engine
            if (engineCompletionState && engineCompletionState.type === '@') {
              e.preventDefault();
              if (switchToEngine(engineName)) {
                q.value = '';
                q.focus();
                hideAutocomplete();
                engineCompletionState = null;
              }
              return;
            }
          }
        }
        
        // Handle engine suggestions from autocomplete
        if (isAutocompleteVisible && selectedAutocompleteIndex >= 0 && selectedAutocompleteIndex < autocompleteItems.length) {
          const item = autocompleteItems[selectedAutocompleteIndex];
          
          // Check if it's an engine suggestion
          if (item && item.type === 'engine-suggestion') {
            e.preventDefault();
            if (switchToEngine(item.engine)) {
              q.value = '';
              q.focus();
              hideAutocomplete();
              engineCompletionState = null;
            }
            return;
          }
          
          e.preventDefault();
          const isDirectUrl = item && (item.engine === "Direct URL" || isValidUrlOrIpSync(item.term));
          
          // For direct URLs, check if we should visit directly
          if (isDirectUrl) {
            let directVisitUrls = true;
            try {
              const directVisitSaved = window.loadFromStorage('directVisitUrlsFromSearch');
              if (directVisitSaved === null || directVisitSaved === undefined) {
                directVisitUrls = true;
              } else if (typeof directVisitSaved === 'boolean') {
                directVisitUrls = directVisitSaved;
              } else {
                directVisitUrls = directVisitSaved === 'true' || directVisitSaved === true;
              }
            } catch (err) {
              // Use default
            }
          
            if (directVisitUrls) {
              selectAutocompleteItem(selectedAutocompleteIndex, e);
              return;
            }
          }
          
          // For regular searches or direct URLs with preference disabled
          selectAutocompleteItem(selectedAutocompleteIndex, e);
          if (!isDirectUrl) {
            goSearch();
          }
        } else {
          goSearch();
        }
      } else if (e.key === "ArrowDown") {
        if (isAutocompleteVisible) {
          e.preventDefault();
          selectedAutocompleteIndex = (selectedAutocompleteIndex + 1) % autocompleteItems.length;
          updateAutocompleteSelection();
          // Scroll into view if needed
          const items = autocomplete.querySelectorAll('.autocomplete-item');
          if (items[selectedAutocompleteIndex]) {
            items[selectedAutocompleteIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }
        }
      } else if (e.key === "ArrowUp") {
        if (isAutocompleteVisible) {
          e.preventDefault();
          if (selectedAutocompleteIndex <= 0) {
            selectedAutocompleteIndex = autocompleteItems.length - 1;
          } else {
            selectedAutocompleteIndex--;
          }
          updateAutocompleteSelection();
          // Scroll into view if needed
          const items = autocomplete.querySelectorAll('.autocomplete-item');
          if (items[selectedAutocompleteIndex]) {
            items[selectedAutocompleteIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }
        }
      } else if (e.key === "Escape") {
        if (isAutocompleteVisible) {
          e.preventDefault();
          hideAutocomplete();
          engineCompletionState = null;
        }
      } else if (e.key === "Tab" && !e.shiftKey) {
        // Tab completion for engine names (only when not in @ mode)
        if (!engineCompletionState || engineCompletionState.type !== '@') {
          const value = q.value.trim();
          // Only handle Tab if there's text and it's not a URL/IP
          if (value && !value.startsWith('@') && !isValidUrlOrIpSync(value)) {
            const suggestions = getEngineSuggestions(value);
            if (suggestions.length === 1) {
              // Exact match - switch engine
              e.preventDefault();
              e.stopPropagation();
              if (switchToEngine(suggestions[0])) {
                q.value = '';
                q.focus();
                hideAutocomplete();
                engineCompletionState = null;
              }
            } else if (suggestions.length > 1) {
              // Multiple matches - show suggestions
              e.preventDefault();
              e.stopPropagation();
              engineCompletionState = {type: 'tab', prefix: value, suggestions: suggestions};
              showEngineSuggestions(suggestions, value);
            }
            // If no suggestions, let Tab work normally (tab out of field)
          }
        }
      }
    });

    // Hide autocomplete when clicking outside
    document.addEventListener('click', (e) => {
      const autocomplete = document.getElementById("searchAutocomplete");
      const searchbox = document.querySelector('.searchbox');
      if (autocomplete && searchbox && !searchbox.contains(e.target) && !autocomplete.contains(e.target)) {
        hideAutocomplete();
      }
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
    const saved = window.loadFromStorage('searchEngine');
    if (saved) {
      let enabledEngines = [];
      try {
        const enabledSaved = window.loadFromStorage('enabledSearchEngines');
        if (enabledSaved) {
          enabledEngines = enabledSaved;
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
          window.saveToStorage('searchEngine', enabledEngines[0]);
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
window.renderAutocomplete = renderAutocomplete;
window.hideAutocomplete = hideAutocomplete;
