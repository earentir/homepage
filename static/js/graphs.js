// Graph rendering and history management

// Graph configuration
let minBarWidth = 10;
const barGap = 2;
const graphMaxHeight = 26;

// Full bars preference
let showFullBars = false;

// History arrays
let cpuHistory = [];
let ramHistory = [];
let diskHistory = {};

// Load preferences from localStorage
(function() {
  try {
    const saved = localStorage.getItem('minBarWidth');
    if (saved) {
      const parsed = parseInt(saved);
      if (parsed >= 2 && parsed <= 50) {
        minBarWidth = parsed;
      }
    }
  } catch (e) {}

  try {
    showFullBars = localStorage.getItem('showFullBars') === 'true';
  } catch (e) {}

  try {
    const saved = localStorage.getItem('cpuHistory');
    if (saved) cpuHistory = JSON.parse(saved);
  } catch (e) { cpuHistory = []; }

  try {
    const saved = localStorage.getItem('ramHistory');
    if (saved) ramHistory = JSON.parse(saved);
  } catch (e) { ramHistory = []; }

  try {
    const saved = localStorage.getItem('diskHistory');
    if (saved) diskHistory = JSON.parse(saved);
  } catch (e) { diskHistory = {}; }
})();

function saveMinBarWidth() {
  try {
    localStorage.setItem('minBarWidth', minBarWidth.toString());
  } catch (e) {}
}

function saveFullBarsPreference() {
  try {
    localStorage.setItem('showFullBars', showFullBars.toString());
  } catch (e) {}
}

function applyFullBarsClass() {
  const graphs = document.querySelectorAll('.cpu-graph, .usage-graph');
  graphs.forEach(g => {
    if (showFullBars) {
      g.classList.add('full-bars');
    } else {
      g.classList.remove('full-bars');
    }
  });
}

function saveCpuHistory() {
  try {
    localStorage.setItem('cpuHistory', JSON.stringify(cpuHistory));
  } catch (e) {}
}

function saveRamHistory() {
  try {
    localStorage.setItem('ramHistory', JSON.stringify(ramHistory));
  } catch (e) {}
}

function saveDiskHistory() {
  try {
    localStorage.setItem('diskHistory', JSON.stringify(diskHistory));
  } catch (e) {}
}

function trimHistoryArrays() {
  const graph = document.getElementById("cpuGraph");
  if (!graph) return false;

  const containerWidth = graph.clientWidth - 6;
  if (containerWidth <= 0) return false;

  const maxBars = Math.floor((containerWidth + barGap) / (minBarWidth + barGap));
  if (maxBars <= 0) return true;

  if (cpuHistory.length > maxBars) {
    cpuHistory = cpuHistory.slice(-maxBars);
    saveCpuHistory();
  }
  if (ramHistory.length > maxBars) {
    ramHistory = ramHistory.slice(-maxBars);
    saveRamHistory();
  }
  // Trim all disk histories
  Object.keys(diskHistory).forEach(key => {
    if (diskHistory[key].length > maxBars) {
      diskHistory[key] = diskHistory[key].slice(-maxBars);
      saveDiskHistory(key);
    }
  });
  return true;
}

function renderGraphBars(graph, history) {
  if (!graph || history.length === 0) return;

  // Ensure full-bars class is on the graph container
  if (showFullBars) {
    graph.classList.add('full-bars');
  } else {
    graph.classList.remove('full-bars');
  }

  while (graph.children.length < history.length) {
    const bar = document.createElement("div");
    bar.className = "bar";
    graph.appendChild(bar);
  }

  for (let i = 0; i < history.length; i++) {
    const pct = history[i] / 100;
    const bar = graph.children[i];
    if (showFullBars) {
      bar.style.height = graphMaxHeight + "px";
      bar.style.setProperty('--fill-pct', (pct * 100) + '%');
    } else {
      const height = Math.max(2, pct * graphMaxHeight);
      bar.style.height = height + "px";
      bar.style.removeProperty('--fill-pct');
    }
  }
}

function updateGraph(graphId, history, saveFunc, usage) {
  const graph = document.getElementById(graphId);

  // Always save history even if graph doesn't exist yet
  if (graph) {
    const containerWidth = graph.clientWidth - 6;
    const newBarCount = history.length + 1;
    const barWidthIfAdded = (containerWidth - (barGap * (newBarCount - 1))) / newBarCount;

    if (barWidthIfAdded < minBarWidth && history.length > 0) {
      history.shift();
    }
  } else {
    // No graph yet - just trim to reasonable max
    const maxDefault = 100;
    if (history.length >= maxDefault) {
      history.shift();
    }
  }

  history.push(usage);
  saveFunc();

  if (!graph) return;

  while (graph.children.length < history.length) {
    const bar = document.createElement("div");
    bar.className = "bar";
    graph.appendChild(bar);
  }

  while (graph.children.length > history.length) {
    graph.removeChild(graph.firstChild);
  }

  // Ensure full-bars class is on the graph container
  if (showFullBars) {
    graph.classList.add('full-bars');
  } else {
    graph.classList.remove('full-bars');
  }

  for (let i = 0; i < history.length; i++) {
    const pct = history[i] / 100;
    const bar = graph.children[i];
    if (showFullBars) {
      bar.style.height = graphMaxHeight + "px";
      bar.style.setProperty('--fill-pct', (pct * 100) + '%');
    } else {
      const height = Math.max(2, pct * graphMaxHeight);
      bar.style.height = height + "px";
      bar.style.removeProperty('--fill-pct');
    }
  }
}

function renderCpuGraph() {
  renderGraphBars(document.getElementById("cpuGraph"), cpuHistory);
}

function updateCpuGraph(usage) {
  updateGraph("cpuGraph", cpuHistory, saveCpuHistory, usage);
}

function renderRamGraph() {
  renderGraphBars(document.getElementById("ramGraph"), ramHistory);
}

function updateRamGraph(usage) {
  updateGraph("ramGraph", ramHistory, saveRamHistory, usage);
}

function renderDiskGraph(mountKey) {
  const key = mountKey || "default";
  const graphId = "diskGraph_" + key;
  const graph = document.getElementById(graphId);
  if (!graph) return;
  const history = diskHistory[key] || [];
  renderGraphBars(graph, history);
  // Ensure full-bars class is applied if needed
  if (showFullBars) {
    graph.classList.add('full-bars');
  } else {
    graph.classList.remove('full-bars');
  }
}

function updateDiskGraph(usage, mountKey) {
  const key = mountKey || "default";
  const graphId = "diskGraph_" + key;

  // Initialize history for this disk if it doesn't exist
  if (!diskHistory[key]) {
    diskHistory[key] = [];
    // Try to load from localStorage
    try {
      const saved = localStorage.getItem('diskHistory');
      if (saved) {
        const allHistory = JSON.parse(saved);
        if (allHistory[key]) {
          diskHistory[key] = allHistory[key];
        }
      }
    } catch (e) {}
  }

  updateGraph(graphId, diskHistory[key], () => saveDiskHistory(key), usage);
}

function initGraphs() {
  const graphsReady = trimHistoryArrays();
  renderCpuGraph();
  renderRamGraph();

  // Render all disk graphs
  if (window.diskModules) {
    window.diskModules.forEach(mod => {
      if (mod.enabled && mod.mountPoint) {
        const key = mod.mountPoint.replace(/[^a-zA-Z0-9]/g, '_');
        renderDiskGraph(key);
      }
    });
  }

  // Apply full-bars class to all graphs (including disk graphs)
  applyFullBarsClass();

  const hasDiskHistory = Object.keys(diskHistory).length > 0 && Object.values(diskHistory).some(h => h.length > 0);
  if (!graphsReady && (cpuHistory.length > 0 || ramHistory.length > 0 || hasDiskHistory)) {
    setTimeout(initGraphs, 100);
  }
}

// Export to window
window.minBarWidth = minBarWidth;
window.showFullBars = showFullBars;
window.cpuHistory = cpuHistory;
window.ramHistory = ramHistory;
window.diskHistory = diskHistory;
window.saveMinBarWidth = saveMinBarWidth;
window.saveFullBarsPreference = saveFullBarsPreference;
window.applyFullBarsClass = applyFullBarsClass;
window.trimHistoryArrays = trimHistoryArrays;
window.renderCpuGraph = renderCpuGraph;
window.updateCpuGraph = updateCpuGraph;
window.renderRamGraph = renderRamGraph;
window.updateRamGraph = updateRamGraph;
window.renderDiskGraph = renderDiskGraph;
window.updateDiskGraph = updateDiskGraph;
window.initGraphs = initGraphs;

// Make setters for preferences
window.setMinBarWidth = function(val) { minBarWidth = val; window.minBarWidth = val; };
window.setShowFullBars = function(val) { showFullBars = val; window.showFullBars = val; };
