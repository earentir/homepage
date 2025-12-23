// Network module: IP refresh, client detection

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
      if (lanIpsEl) lanIpsEl.textContent = ips.join(", ");
      if (lanPtrEl) lanPtrEl.textContent = ptrs.length > 0 ? ptrs.join(", ") : "";
    } else {
      if (lanIpsEl) lanIpsEl.textContent = "—";
      if (lanPtrEl) lanPtrEl.textContent = "";
    }

    // Display Public IP with PTR
    if (j.public && j.public.ip) {
      document.getElementById("pubIp").textContent = j.public.ip;
      document.getElementById("pubPtr").textContent = j.public.ptr || "";
      document.getElementById("pubIpErr").textContent = "";
    } else {
      document.getElementById("pubIp").textContent = "—";
      document.getElementById("pubPtr").textContent = "";
      document.getElementById("pubIpErr").textContent = (j.public && j.public.error) || "";
    }

    window.startTimer("ip");
  } catch(err) {
    console.error("Error refreshing IP:", err);
  }
}

async function refresh() {
  try {
    const res = await fetch("/api/summary", {cache:"no-store"});
    const j = await res.json();

    const isLocal = j.client && j.client.isLocal;

    const statusTitle = document.getElementById("statusTitle");
    const serverInfoDiv = document.getElementById("serverInfo");
    const clientInfoDiv = document.getElementById("clientInfo");

    if (isLocal) {
      if (statusTitle) statusTitle.textContent = "Status";
      if (serverInfoDiv) serverInfoDiv.style.display = "block";
      if (clientInfoDiv) clientInfoDiv.style.display = "none";

      document.getElementById("host").textContent = j.server.hostname;
      document.getElementById("uptime").textContent = window.fmtUptime(j.server.uptimeSec);
      document.getElementById("time").textContent = j.server.time;
    } else {
      if (statusTitle) statusTitle.textContent = "Client Status";
      if (serverInfoDiv) serverInfoDiv.style.display = "none";
      if (clientInfoDiv) clientInfoDiv.style.display = "block";

      if (j.client) {
        const clientIPEl = document.getElementById("clientIP");
        const clientHostnameEl = document.getElementById("clientHostname");
        if (clientIPEl) clientIPEl.textContent = j.client.ip || "—";
        if (clientHostnameEl) clientHostnameEl.textContent = j.client.hostname || "—";
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
    document.getElementById("statusText").textContent = "Degraded";
  }
}

// Export to window
window.detectClientInfo = detectClientInfo;
window.refreshIP = refreshIP;
window.refresh = refresh;
