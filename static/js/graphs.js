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
let diskHistory = [];

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
  } catch (e) { diskHistory = []; }
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
  if (diskHistory.length > maxBars) {
    diskHistory = diskHistory.slice(-maxBars);
    saveDiskHistory();
  }
  return true;
}

function renderGraphBars(graph, history) {
  if (!graph || history.length === 0) return;

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
  if (!graph) return;

  const containerWidth = graph.clientWidth - 6;
  const newBarCount = history.length + 1;
  const barWidthIfAdded = (containerWidth - (barGap * (newBarCount - 1))) / newBarCount;

  if (barWidthIfAdded < minBarWidth && history.length > 0) {
    history.shift();
  }

  history.push(usage);
  saveFunc();

  while (graph.children.length < history.length) {
    const bar = document.createElement("div");
    bar.className = "bar";
    graph.appendChild(bar);
  }

  while (graph.children.length > history.length) {
    graph.removeChild(graph.firstChild);
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

function renderDiskGraph() {
  renderGraphBars(document.getElementById("diskGraph"), diskHistory);
}

function updateDiskGraph(usage) {
  updateGraph("diskGraph", diskHistory, saveDiskHistory, usage);
}

function initGraphs() {
  const graphsReady = trimHistoryArrays();
  renderCpuGraph();
  renderRamGraph();
  renderDiskGraph();
  if (!graphsReady && (cpuHistory.length > 0 || ramHistory.length > 0 || diskHistory.length > 0)) {
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
