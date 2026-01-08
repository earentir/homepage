// Search module: Search engines and history management

// Search engines organized by category
const engines = [
  // General Search Engines
  {name: "Google", url: "https://www.google.com/search?q=%s", icon: "fab fa-google", category: "general"},
  {name: "DuckDuckGo", url: "https://duckduckgo.com/?q=%s", icon: "fas fa-duck", category: "general"},
  {name: "Bing", url: "https://www.bing.com/search?q=%s", icon: "fab fa-microsoft", category: "general"},
  {name: "Brave", url: "https://search.brave.com/search?q=%s", icon: "fas fa-shield-alt", category: "general"},
  {name: "Startpage", url: "https://www.startpage.com/sp/search?query=%s", icon: "fas fa-search", category: "general"},
  {name: "Ecosia", url: "https://www.ecosia.org/search?q=%s", icon: "fas fa-leaf", category: "general"},
  {name: "Qwant", url: "https://www.qwant.com/?q=%s", icon: "fas fa-search", category: "general"},
  {name: "SearXNG", url: "https://searx.org/search?q=%s", icon: "fas fa-search", category: "general"},
  {name: "Wikipedia", url: "https://en.wikipedia.org/w/index.php?search=%s", icon: "fab fa-wikipedia-w", category: "general"},
  
  // LLM / AI Search
  {name: "Perplexity", url: "https://www.perplexity.ai/search?q=%s", icon: "fas fa-brain", category: "llm"},
  {name: "ChatGPT", url: "https://chat.openai.com/?q=%s", icon: "fas fa-robot", category: "llm"},
  {name: "DeepSeek", url: "https://www.deepseek.com/chat?q=%s", icon: "fas fa-brain", category: "llm"},
  {name: "Kimi", url: "https://kimi.moonshot.cn/search?q=%s", icon: "fas fa-sparkles", category: "llm"},
  {name: "Claude", url: "https://claude.ai/chat?q=%s", icon: "fas fa-comments", category: "llm"},
  
  // Social
  {name: "Reddit", url: "https://www.reddit.com/search/?q=%s", icon: "fab fa-reddit", category: "social"},
  
  // Media
  {name: "YouTube", url: "https://www.youtube.com/results?search_query=%s", icon: "fab fa-youtube", category: "media"},
  {name: "Genius", url: "https://genius.com/search?q=%s", icon: "fas fa-music", category: "media"},
  {name: "AZLyrics", url: "https://search.azlyrics.com/search.php?q=%s", icon: "fas fa-music", category: "media"},
  {name: "Lyrics.com", url: "https://www.lyrics.com/lyrics/%s", icon: "fas fa-music", category: "media"},
  
  // Shopping
  {name: "Skroutz", url: "https://www.skroutz.gr/search?keyphrase=%s", icon: "fas fa-shopping-bag", category: "shopping"},
  {name: "Amazon", url: "https://www.amazon.com/s?k=%s", icon: "fab fa-amazon", category: "shopping"},
  {name: "eBay", url: "https://www.ebay.com/sch/i.html?_nkw=%s", icon: "fab fa-ebay", category: "shopping"},
  
  // Maps
  {name: "Google Maps", url: "https://www.google.com/maps/search/%s", icon: "fas fa-map-marker-alt", category: "maps"},
  {name: "OpenStreetMap", url: "https://www.openstreetmap.org/search?query=%s", icon: "fas fa-map", category: "maps"},
  
  // Development
  {name: "GitHub", url: "https://github.com/search?q=%s", icon: "fab fa-github", category: "development"},
  {name: "Stack Overflow", url: "https://stackoverflow.com/search?q=%s", icon: "fab fa-stack-overflow", category: "development"}
];

let currentEngineIndex = 0;
let searchHistory = [];
let autocompleteItems = [];
let selectedAutocompleteIndex = -1;

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
        localStorage.setItem('searchEngine', e.name);
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

function hideAutocomplete() {
  const autocomplete = document.getElementById("searchAutocomplete");
  if (autocomplete) {
    autocomplete.style.display = "none";
  }
  selectedAutocompleteIndex = -1;
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

function renderAutocomplete(filter = '') {
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

  const filterLower = term.toLowerCase();
  autocompleteItems = searchHistory.filter(item => 
    item && item.term && item.term.toLowerCase().includes(filterLower)
  );

  // Remove duplicates and reverse to show newest first
  const uniqueItems = [];
  const seen = new Set();
  for (let i = autocompleteItems.length - 1; i >= 0; i--) {
    const item = autocompleteItems[i];
    if (!item || !item.term) continue;
    const key = item.term.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      uniqueItems.push(item);
    }
  }
  autocompleteItems = uniqueItems.slice(0, 10); // Limit to 10 items

  if (autocompleteItems.length === 0) {
    hideAutocomplete();
    return;
  }

  autocomplete.innerHTML = '';
  autocompleteItems.forEach((item, index) => {
    if (!item || !item.term) return;
    
    const isDirectUrl = item.engine === "Direct URL" || isValidUrlOrIp(item.term);
    const iconClass = isDirectUrl ? 'fas fa-link' : 'fas fa-history';
    
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
      // Don't prevent default on Shift+Click for direct URLs
      if (!(e.shiftKey && (item.engine === "Direct URL" || isValidUrlOrIp(item.term)))) {
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
  const isDirectUrl = item.engine === "Direct URL" || isValidUrlOrIp(term);
  const shiftPressed = event && event.shiftKey;

  // Get preferences
  let directVisitUrls = true;
  let switchEngine = true;
  try {
    const directVisitSaved = localStorage.getItem('directVisitUrlsFromSearch');
    directVisitUrls = directVisitSaved === null ? true : directVisitSaved === 'true';
    const switchEngineSaved = localStorage.getItem('switchEngineOnSelect');
    switchEngine = switchEngineSaved === null ? true : switchEngineSaved === 'true';
  } catch (e) {
    // Use defaults
  }

  // Handle direct URLs
  if (isDirectUrl) {
    // If preference is enabled OR Shift is pressed, visit directly
    if (directVisitUrls || shiftPressed) {
      hideAutocomplete();
      
      // Get same tab preference
      let sameTab = true;
      try {
        const saved = localStorage.getItem('sameTabOnSearch');
        sameTab = saved === null ? true : saved === 'true';
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
    if (switchEngine && item.engine && item.engine !== "Direct URL") {
      const engineIndex = engines.findIndex(e => e.name === item.engine);
      if (engineIndex >= 0) {
        // Check if engine is enabled
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

        if (enabledEngines.includes(item.engine)) {
          currentEngineIndex = engineIndex;
          updateEngineBtn();
          localStorage.setItem('searchEngine', item.engine);
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
    const saved = localStorage.getItem('sameTabOnSearch');
    sameTab = saved === null ? true : saved === 'true';
  } catch (e) {
    sameTab = true;
  }

  // Check if the input is a valid URL or IP address
  if (isValidUrlOrIp(term)) {
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

function initSearch() {
  loadSearchHistory();

  const q = document.getElementById("q");
  const engineBtn = document.getElementById("engineBtn");
  const engineMenu = document.getElementById("engineMenu");

  if (q) {
    // Handle input changes for autocomplete
    q.addEventListener('input', (e) => {
      // Small delay to ensure value is updated
      setTimeout(() => {
        renderAutocomplete();
      }, 0);
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
        if (isAutocompleteVisible && selectedAutocompleteIndex >= 0 && selectedAutocompleteIndex < autocompleteItems.length) {
          e.preventDefault();
          const item = autocompleteItems[selectedAutocompleteIndex];
          const isDirectUrl = item && (item.engine === "Direct URL" || isValidUrlOrIp(item.term));
          
          // For direct URLs, check if we should visit directly
          if (isDirectUrl) {
            let directVisitUrls = true;
            try {
              const directVisitSaved = localStorage.getItem('directVisitUrlsFromSearch');
              directVisitUrls = directVisitSaved === null ? true : directVisitSaved === 'true';
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
window.renderAutocomplete = renderAutocomplete;
window.hideAutocomplete = hideAutocomplete;
