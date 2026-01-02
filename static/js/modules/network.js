// Network module: IP refresh, client detection

// Helper function to copy text to clipboard
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    // Fallback for older browsers
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      return true;
    } catch (e) {
      return false;
    }
  }
}

// Helper function to create a clickable element that copies to clipboard
function createClickableElement(text, className = '') {
  const span = document.createElement('span');
  span.textContent = text;
  span.className = className;
  span.style.cursor = 'pointer';
  span.title = 'Click to copy';
  span.addEventListener('click', async () => {
    if (await copyToClipboard(text)) {
      // Visual feedback - briefly change opacity
      const originalOpacity = span.style.opacity;
      span.style.opacity = '0.6';
      setTimeout(() => {
        span.style.opacity = originalOpacity || '';
      }, 200);
    }
  });
  return span;
}

// Helper function to render comma-separated list of clickable items
function renderClickableList(container, items, separator = ', ') {
  if (!container) return;
  
  // Clear container
  container.innerHTML = '';
  
  if (!items || items.length === 0) {
    container.textContent = '—';
    return;
  }
  
  items.forEach((item, index) => {
    if (item) {
      const clickable = createClickableElement(item);
      container.appendChild(clickable);
      if (index < items.length - 1) {
        container.appendChild(document.createTextNode(separator));
      }
    }
  });
}

function detectClientInfo() {
  const ua = navigator.userAgent;
  let os = 'Unknown';
  let browser = 'Unknown';

  // Detect OS
  if (ua.includes('Windows NT 10')) os = 'Windows 10/11';
  else if (ua.includes('Windows NT 6.3')) os = 'Windows 8.1';
  else if (ua.includes('Windows NT 6.2')) os = 'Windows 8';
  else if (ua.includes('Windows NT 6.1')) os = 'Windows 7';
  else if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS X')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

  // Detect Browser
  if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/')) browser = 'Chrome';
  else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('Opera') || ua.includes('OPR/')) browser = 'Opera';

  // Get timezone
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown';

  return { os, browser, timezone };
}

async function refreshIP() {
  try {
    const summaryRes = await fetch("/api/summary", {cache:"no-store"});
    const summary = await summaryRes.json();
    const isLocal = summary.client && summary.client.isLocal;

    const res = await fetch("/api/ip", {cache:"no-store"});
    const j = await res.json();

    // Update label based on whether it's local or remote
    const lanIpLabel = document.getElementById("lanIpLabel");
    const networkNote = document.getElementById("networkNote");
    if (lanIpLabel) {
      if (isLocal) {
        lanIpLabel.textContent = "LAN IPs";
        if (networkNote) networkNote.textContent = "";
      } else {
        lanIpLabel.textContent = "Client IP";
        if (networkNote) networkNote.textContent = "Note: Showing client's IP. Server LAN IPs are not shown when accessed remotely.";
      }
    }

    // Display LAN IPs with PTR records
    const lanIpsEl = document.getElementById("lanIps");
    const lanPtrEl = document.getElementById("lanPtr");
    if (j.network && j.network.hostIps && j.network.hostIps.length > 0) {
      const ips = j.network.hostIps.map(ipInfo => ipInfo.ip);
      const ptrs = j.network.hostIps.map(ipInfo => ipInfo.ptr).filter(p => p);
      renderClickableList(lanIpsEl, ips);
      if (ptrs.length > 0) {
        renderClickableList(lanPtrEl, ptrs);
      } else {
        if (lanPtrEl) lanPtrEl.textContent = "";
      }
    } else {
      if (lanIpsEl) lanIpsEl.textContent = "—";
      if (lanPtrEl) lanPtrEl.textContent = "";
    }

    // Display Public IP with PTR
    const pubIpEl = document.getElementById("pubIp");
    const pubPtrEl = document.getElementById("pubPtr");
    if (j.public && j.public.ip) {
      if (pubIpEl) {
        pubIpEl.innerHTML = '';
        pubIpEl.appendChild(createClickableElement(j.public.ip));
      }
      if (pubPtrEl) {
        if (j.public.ptr) {
          pubPtrEl.innerHTML = '';
          pubPtrEl.appendChild(createClickableElement(j.public.ptr));
        } else {
          pubPtrEl.textContent = "";
        }
      }
      document.getElementById("pubIpErr").textContent = "";
    } else {
      if (pubIpEl) pubIpEl.textContent = "—";
      if (pubPtrEl) pubPtrEl.textContent = "";
      document.getElementById("pubIpErr").textContent = (j.public && j.public.error) || "";
    }

    window.startTimer("ip");
  } catch(err) {
    if (window.debugError) window.debugError('network', "Error refreshing IP:", err);
  }
}

// Track offline state (managed by WebSocket)
let isOffline = false;

// Initialize WebSocket connection for status detection
function initWebSocket() {
  if (window.debugLog) window.debugLog('network', 'Initializing WebSocket connection');

  // Set up status change handler
  if (window.wsOnStatusChange) {
    window.wsOnStatusChange(function(status, data) {
      if (window.debugLog) window.debugLog('network', 'WebSocket status changed:', status, 'isOffline was:', isOffline);
      const statusTextEl = document.getElementById("statusText");
      const pulseEl = document.querySelector(".pulse");

      if (status === 'online') {
        const wasOffline = isOffline;
        isOffline = false;
        if (window.debugLog) window.debugLog('network', 'Setting online status, wasOffline:', wasOffline);
        setOnlineStatus(statusTextEl, pulseEl);

        // If we have server data from WebSocket, update it immediately
        if (data && data.server) {
          updateServerInfo(data.server);
        }

        // Refresh full data when server comes back online (only if we were offline)
        if (wasOffline) {
          if (window.debugLog) window.debugLog('network', 'Server is back online, refreshing data');
          refresh();
        }
      } else if (status === 'offline') {
        isOffline = true;
        if (window.debugLog) window.debugLog('network', 'Setting offline status');
        setOfflineStatus(statusTextEl, pulseEl);
        // Still try to refresh - WebSocket might reconnect soon
        if (window.debugLog) window.debugLog('network', 'Server is offline, but will keep trying to refresh');
      }
    });
  }

  // Set up WebSocket data update handler
  if (window.wsOnUpdate) {
    window.wsOnUpdate(function(type, data) {
      if (window.debugLog) window.debugLog('network', 'WebSocket update received:', type);
      if (type === 'system') {
        // Update system metrics in real-time
        if (data.system) {
          updateSystemMetrics(data.system);
        }
        if (data.server) {
          updateServerInfo(data.server);
        }
      }
    });
  }

  // Set up connect handler to refresh immediately on reconnect
  if (window.wsOnConnect) {
    window.wsOnConnect(function() {
      if (window.debugLog) window.debugLog('network', 'WebSocket connected, refreshing data');
      refresh();
    });
  }

  // Connect WebSocket
  if (window.wsConnect) {
    window.wsConnect();
  }
}

async function refresh() {
  if (window.debugLog) window.debugLog('network', 'refresh() called, isOffline:', isOffline);
  const statusTextEl = document.getElementById("statusText");
  const pulseEl = document.querySelector(".pulse");

  // If WebSocket is connected, skip HTTP polling - WebSocket handles real-time updates
  if (window.wsIsConnected && window.wsIsConnected()) {
    if (window.debugLog) window.debugLog('network', 'WebSocket is connected, skipping HTTP refresh');
    return;
  }

  // Only use HTTP as fallback when WebSocket is disconnected
  if (window.debugLog) window.debugLog('network', 'WebSocket not connected, using HTTP fallback');

  try {
    if (window.debugLog) window.debugLog('network', 'Starting fetch to /api/summary');
    // Use fetchWithTimeout if available, otherwise use regular fetch
    let res;
    if (window.fetchWithTimeout) {
      if (window.debugLog) window.debugLog('network', 'Using fetchWithTimeout');
      res = await window.fetchWithTimeout("/api/summary", {cache:"no-store"}, 10000); // Increased timeout to 10s
    } else {
      if (window.debugLog) window.debugLog('network', 'Using AbortController fallback');
      // Fallback: use AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        if (window.debugLog) window.debugLog('network', 'Timeout triggered, aborting');
        controller.abort();
      }, 10000); // Increased timeout to 10s
      try {
        res = await fetch("/api/summary", {cache:"no-store", signal: controller.signal});
        clearTimeout(timeoutId);
        if (window.debugLog) window.debugLog('network', 'Fetch completed:', res.status);
      } catch (err) {
        clearTimeout(timeoutId);
        if (window.debugLog) window.debugLog('network', 'Fetch error:', err.message);
        throw err;
      }
    }

    // Check if response is successful
    if (!res.ok) {
      // Server returned an error status
      if (window.debugLog) window.debugLog('network', 'Server returned error status:', res.status);
      // WebSocket will detect this and update status
      return;
    }

    const j = await res.json();
    if (window.debugLog) window.debugLog('network', 'Successfully fetched status, server is online, isOffline:', isOffline);

    const isLocal = j.client && j.client.isLocal;

    const statusTitle = document.getElementById("statusTitle");
    const serverInfoDiv = document.getElementById("serverInfo");
    const clientInfoDiv = document.getElementById("clientInfo");

    // Update offline flag on successful fetch
    isOffline = false;
    setOnlineStatus(statusTextEl, pulseEl);

    if (isLocal) {
      if (statusTitle) statusTitle.textContent = "Status";
      if (serverInfoDiv) serverInfoDiv.style.display = "block";
      if (clientInfoDiv) clientInfoDiv.style.display = "none";

      document.getElementById("host").textContent = j.server.hostname;
      document.getElementById("uptime").textContent = window.fmtUptime(j.server.uptimeSec);
      document.getElementById("time").textContent = j.server.time;

      // Convert server time to UTC
      if (j.server.time) {
        try {
          const serverTime = new Date(j.server.time);
          const utcTime = serverTime.toISOString();
          document.getElementById("utcTime").textContent = utcTime;
        } catch(e) {
          document.getElementById("utcTime").textContent = "—";
        }
      } else {
        document.getElementById("utcTime").textContent = "—";
      }
    } else {
      if (statusTitle) statusTitle.textContent = "Client Status";
      if (serverInfoDiv) serverInfoDiv.style.display = "none";
      if (clientInfoDiv) clientInfoDiv.style.display = "block";

      if (j.client) {
        const clientIPEl = document.getElementById("clientIP");
        const clientHostnameEl = document.getElementById("clientHostname");
        if (clientIPEl) {
          if (j.client.ip) {
            clientIPEl.innerHTML = '';
            clientIPEl.appendChild(createClickableElement(j.client.ip));
          } else {
            clientIPEl.textContent = "—";
          }
        }
        if (clientHostnameEl) {
          if (j.client.hostname) {
            clientHostnameEl.innerHTML = '';
            clientHostnameEl.appendChild(createClickableElement(j.client.hostname));
          } else {
            clientHostnameEl.textContent = "—";
          }
        }
      }

      const client = detectClientInfo();
      const clientOSEl = document.getElementById("clientOS");
      const clientBrowserEl = document.getElementById("clientBrowser");
      const clientTimezoneEl = document.getElementById("clientTimezone");
      if (clientOSEl) clientOSEl.textContent = client.os;
      if (clientBrowserEl) clientBrowserEl.textContent = client.browser;
      if (clientTimezoneEl) clientTimezoneEl.textContent = client.timezone;
    }

    document.getElementById("subtitle").textContent =
      j.server.os + "/" + j.server.arch + " • " + j.server.goVersion;

  } catch(err) {
    // Network error, timeout, or fetch failed (server is down/unreachable)
    if (window.debugLog) window.debugLog('network', 'Fetch failed:', err.name, err.message);
    // WebSocket will detect disconnection and update status automatically
    // No need for retry mechanism - WebSocket handles reconnection
  }
}

function setOfflineStatus(statusTextEl, pulseEl) {
  isOffline = true;
  if (statusTextEl) statusTextEl.textContent = "Offline";
  if (pulseEl) {
    pulseEl.style.background = "var(--bad, #ef4444)";
    pulseEl.style.boxShadow = "0 0 0 0 rgba(239, 68, 68, 0.7)";
  }
}

function setOnlineStatus(statusTextEl, pulseEl) {
  isOffline = false;
  if (statusTextEl) statusTextEl.textContent = "Online";
  if (pulseEl) {
    pulseEl.style.background = "";
    pulseEl.style.boxShadow = "";
  }
}

function updateServerInfo(server) {
  if (!server) return;

  // Update server time and uptime if available
  if (server.time) {
    const timeEl = document.getElementById("time");
    if (timeEl) {
      try {
        const serverTime = new Date(server.time);
        timeEl.textContent = serverTime.toLocaleTimeString();

        // Update UTC time
        const utcTimeEl = document.getElementById("utcTime");
        if (utcTimeEl) {
          utcTimeEl.textContent = serverTime.toISOString();
        }
      } catch(e) {
        if (window.debugError) window.debugError('network', 'Error updating server time:', e);
      }
    }
  }

  if (server.uptimeSec !== undefined) {
    const uptimeEl = document.getElementById("uptime");
    if (uptimeEl && window.fmtUptime) {
      uptimeEl.textContent = window.fmtUptime(server.uptimeSec);
    }
  }
}

function updateSystemMetrics(system) {
  if (!system) return;

  // Update CPU usage
  if (system.cpu && system.cpu.usage !== undefined) {
    const cpuUsageEl = document.getElementById("cpuUsage");
    if (cpuUsageEl) {
      cpuUsageEl.textContent = system.cpu.usage.toFixed(1) + '%';
    }
    // Update CPU graph if available
    if (window.updateCpuGraph) {
      window.updateCpuGraph(system.cpu.usage);
    }
    // Reset CPU timer when data is updated
    if (window.startTimer) {
      window.startTimer("cpu");
    }
  }

  // Update RAM usage
  if (system.ram) {
    const ramSummaryEl = document.getElementById("ramSummary");
    if (ramSummaryEl && system.ram.total && system.ram.used && system.ram.available && system.ram.percent !== undefined) {
      if (window.formatBytes) {
        const total = window.formatBytes(system.ram.total);
        const used = window.formatBytes(system.ram.used);
        const free = window.formatBytes(system.ram.available);
        const usedPercent = system.ram.percent;
        const freePercent = 100 - usedPercent;
        
        // Format: "31.1GB / 19.52(62%)GB / 11.56(38%)GB"
        ramSummaryEl.textContent = 
          total + ' / ' + used + '(' + usedPercent.toFixed(0) + '%) / ' + free + '(' + freePercent.toFixed(0) + '%)';
      }
    }
    // Update RAM graph if available
    if (window.updateRamGraph && system.ram.percent !== undefined) {
      window.updateRamGraph(system.ram.percent);
    }
    // Reset RAM timer when data is updated
    if (window.startTimer) {
      window.startTimer("ram");
    }
  }

  // Update disk usage (root filesystem)
  if (system.disk && system.disk.percent !== undefined) {
    const safeMount = '/'.replace(/[^a-zA-Z0-9]/g, '_');
    const summaryEl = document.getElementById("diskSummary_" + safeMount);
    if (summaryEl && window.formatBytes) {
      const total = window.formatBytes(system.disk.total || 0);
      const used = window.formatBytes(system.disk.used || 0);
      const free = window.formatBytes(system.disk.free || 0);
      const usedPercent = system.disk.percent;
      const freePercent = 100 - usedPercent;
      
      // Format: "31.1GB / 19.52(62%)GB / 11.56(38%)GB"
      summaryEl.textContent = 
        total + ' / ' + used + '(' + usedPercent.toFixed(0) + '%) / ' + free + '(' + freePercent.toFixed(0) + '%)';
    }
    // Update disk graph if available
    if (window.updateDiskGraph) {
      window.updateDiskGraph(system.disk.percent, safeMount);
    }
  }
}

// Export to window
window.detectClientInfo = detectClientInfo;
window.refreshIP = refreshIP;
window.refresh = refresh;
window.initWebSocket = initWebSocket;
