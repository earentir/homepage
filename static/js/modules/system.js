// System modules: CPU, RAM, Disk, CPU Info

async function refreshCPU() {
  try {
    const res = await fetch("/api/system", {cache:"no-store"});
    const j = await res.json();
    if (j.cpu && j.cpu.usage !== undefined) {
      const usage = j.cpu.usage.toFixed(1);
      document.getElementById("cpuUsage").textContent = usage + "%";
      // Cores are fetched from cpuid API, not system API
      window.updateCpuGraph(parseFloat(usage));
    }
    window.startTimer("cpu");
  } catch(err) {
    console.error("Error refreshing CPU:", err);
  }
}

async function refreshRAM() {
  try {
    const res = await fetch("/api/system", {cache:"no-store"});
    const j = await res.json();
    if (j.ram && j.ram.percent !== undefined) {
      const total = window.formatBytes(j.ram.total);
      const used = window.formatBytes(j.ram.used);
      const available = window.formatBytes(j.ram.available);
      const percent = j.ram.percent;

      document.getElementById("ramSummary").textContent = total + " / " + used + " / " + available;
      document.getElementById("ramPercent").textContent = percent.toFixed(1) + "%";
      window.updateRamGraph(percent);
    }
    window.startTimer("ram");
  } catch(err) {
    console.error("Error refreshing RAM:", err);
  }
}

async function refreshDisk() {
  try {
    const res = await fetch("/api/system", {cache:"no-store"});
    const j = await res.json();
    if (j.disk && j.disk.percent !== undefined) {
      const total = window.formatBytes(j.disk.total);
      const used = window.formatBytes(j.disk.used);
      const free = window.formatBytes(j.disk.free);
      const percent = j.disk.percent;

      document.getElementById("diskSummary").textContent = total + " / " + used + " / " + free;
      document.getElementById("diskPercent").textContent = percent.toFixed(1) + "%";
      window.updateDiskGraph(percent);
    }
    window.startTimer("disk");
  } catch(err) {
    console.error("Error refreshing Disk:", err);
  }
}

async function refreshCPUInfo() {
  try {
    const res = await fetch("/api/cpuid", {cache:"no-store"});
    const j = await res.json();

    const el = document.getElementById("cpuidContent");
    if (!el) return;

    let html = '';

    // CPU Name
    if (j.name) {
      html += `<div class="kv"><div class="k">CPU</div><div class="v mono">${j.name}</div></div>`;
    }

    // Cores
    if (j.physicalCores !== undefined || j.virtualCores !== undefined) {
      const physical = j.physicalCores || 'N/A';
      const virtual = j.virtualCores || 'N/A';
      html += `<div class="kv"><div class="k">Cores</div><div class="v mono">${physical} physical / ${virtual} virtual</div></div>`;
    }

    // Speed
    let speedParts = [];
    if (j.speedMin) speedParts.push('Min: ' + j.speedMin.toFixed(2) + ' GHz');
    if (j.speedMax) speedParts.push('Max: ' + j.speedMax.toFixed(2) + ' GHz');
    if (j.speedCurrent) speedParts.push('Current: ' + j.speedCurrent.toFixed(2) + ' GHz');
    if (speedParts.length > 0) {
      html += `<div class="kv"><div class="k">Speed</div><div class="v mono">${speedParts.join(", ")}</div></div>`;
    }

    // Cache info (array format)
    if (j.cache && j.cache.length > 0) {
      let cacheHtml = '';
      j.cache.forEach((c, idx) => {
        const style = idx === 0 ? ' style="border-top:1px solid var(--border); padding-top:12px;"' : '';
        const sizeStr = c.sizeKB >= 1024 ? (c.sizeKB / 1024).toFixed(1) + ' MB' : c.sizeKB + ' KB';
        const label = 'L' + c.level + (c.type ? ' ' + c.type : '');
        cacheHtml += `<div class="kv"${style}><div class="k">${label}</div><div class="v mono">${sizeStr}</div></div>`;
      });
      html += cacheHtml;
    }

    el.innerHTML = html || '<div class="muted">No CPU info available</div>';
  } catch(err) {
    console.error("Error refreshing CPU Info:", err);
  }
}

// Export to window
window.refreshCPU = refreshCPU;
window.refreshRAM = refreshRAM;
window.refreshDisk = refreshDisk;
window.refreshCPUInfo = refreshCPUInfo;
