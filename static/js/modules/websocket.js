// WebSocket module for real-time server status detection

let ws = null;
let reconnectInterval = null;
let reconnectAttempts = 0;
const RECONNECT_DELAY = 2000; // 2 seconds - fixed delay, keep trying forever

// Callbacks
let onStatusChange = null;
let onConnect = null;
let onDisconnect = null;

function connect() {
  // Clear any existing reconnect interval
  if (reconnectInterval) {
    clearTimeout(reconnectInterval);
    reconnectInterval = null;
  }
  
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;
  
  if (window.debugLog) window.debugLog('websocket', 'Connecting to:', wsUrl);
  
  try {
    ws = new WebSocket(wsUrl);
    
    ws.onopen = function() {
      if (window.debugLog) window.debugLog('websocket', 'Connected');
      reconnectAttempts = 0;
      // Clear any pending reconnect
      if (reconnectInterval) {
        clearTimeout(reconnectInterval);
        reconnectInterval = null;
      }
      if (onConnect) onConnect();
      if (onStatusChange) onStatusChange('online');
    };
    
    ws.onmessage = function(event) {
      try {
        const data = JSON.parse(event.data);
        if (window.debugLog) window.debugLog('websocket', 'Message received:', data.type || 'unknown');
        
        if (data.type === 'status' && data.status === 'online') {
          if (onStatusChange) onStatusChange('online', data);
        } else if (data.type === 'ping') {
          // Ping received, connection is alive
          if (onStatusChange) onStatusChange('online', data);
        } else if (data.type === 'system') {
          // System metrics update received
          if (window.onWebSocketUpdate) {
            window.onWebSocketUpdate('system', data);
          }
        } else if (data.type === 'storage-update') {
          // Storage update notification - fetch updated data from backend
          if (window.debugLog) window.debugLog('websocket', 'Storage update received for:', data.key);
          if (data.key && window.syncFromBackend) {
            window.syncFromBackend(data.key).then(updated => {
              if (updated && window.debugLog) {
                window.debugLog('websocket', 'Updated storage from backend:', data.key);
              }
              // Trigger any update handlers if needed
              if (updated && window.onStorageUpdate) {
                window.onStorageUpdate(data.key);
              }
              
              // Reload module settings based on which key was updated
              if (updated) {
                // Quicklinks settings
                if (data.key === 'quicklinksIconsOnly' || data.key === 'quicklinksEqualSize' || data.key === 'quicklinks' || data.key === 'quicklinksLayout') {
                  if (window.reloadQuicklinksSettings) {
                    window.reloadQuicklinksSettings();
                  }
                }
                // Module preferences
                if (data.key === 'modulePrefs') {
                  if (window.loadModulePrefs) {
                    window.loadModulePrefs();
                    if (window.applyModuleVisibility) {
                      window.applyModuleVisibility();
                    }
                  }
                }
                // Layout config
                if (data.key === 'layoutConfig' || data.key === 'moduleOrder') {
                  if (window.loadLayoutConfig) {
                    window.loadLayoutConfig();
                    if (window.renderLayout) {
                      window.renderLayout();
                    }
                  }
                }
                // Graph settings
                if (data.key === 'showFullBars' || data.key === 'colorizeBackground' || data.key === 'minBarWidth') {
                  if (window.initGraphs) {
                    window.initGraphs();
                  }
                }
                // Search settings
                if (data.key === 'searchHistory' || data.key === 'enabledSearchEngines' || data.key === 'searchEngine') {
                  if (window.initSearch) {
                    window.initSearch();
                  }
                }
                // Calendar/Todo
                if (data.key === 'calendarEvents' || data.key === 'calendarSettings') {
                  if (window.initCalendar) {
                    window.initCalendar();
                  }
                }
                if (data.key === 'todos') {
                  if (window.initTodo) {
                    window.initTodo();
                  }
                }
                // Monitoring/SNMP
                if (data.key === 'monitors' || data.key === 'monitorInterval') {
                  if (window.initMonitoring) {
                    window.initMonitoring();
                  }
                }
                if (data.key === 'snmpQueries' || data.key === 'snmpLastValues') {
                  if (window.initSnmp) {
                    window.initSnmp();
                  }
                }
                // Module configs
                if (data.key === 'githubModules') {
                  if (window.renderGitHubModules) {
                    window.renderGitHubModules();
                  }
                }
                if (data.key === 'rssModules') {
                  if (window.initRss) {
                    window.initRss();
                  }
                }
                if (data.key === 'diskModules') {
                  if (window.initDisk) {
                    window.initDisk();
                  }
                }
              }
            });
          }
        }
      } catch (err) {
        if (window.debugError) window.debugError('websocket', 'Error parsing message:', err);
      }
    };
    
    ws.onerror = function(error) {
      if (window.debugError) window.debugError('websocket', 'Error:', error);
      // Error doesn't necessarily mean disconnect, but if connection fails immediately
      // we should still try to reconnect
    };
    
    ws.onclose = function(event) {
      if (window.debugLog) window.debugLog('websocket', 'Disconnected, code:', event.code, 'reason:', event.reason);
      ws = null;
      
      if (onDisconnect) onDisconnect();
      if (onStatusChange) onStatusChange('offline');
      
      // Always attempt to reconnect - every 2 seconds
      reconnectAttempts++;
      if (window.debugLog) window.debugLog('websocket', `Scheduling reconnect in ${RECONNECT_DELAY}ms (attempt ${reconnectAttempts})`);
      
      reconnectInterval = setTimeout(() => {
        if (window.debugLog) window.debugLog('websocket', `Executing reconnect attempt ${reconnectAttempts}`);
        connect();
      }, RECONNECT_DELAY);
    };
    
    // Add a timeout to handle cases where connection hangs in CONNECTING state
    // If connection doesn't open or close within 5 seconds, force close and retry
    const connectionTimeout = setTimeout(() => {
      if (ws && ws.readyState === WebSocket.CONNECTING) {
        if (window.debugLog) window.debugLog('websocket', 'Connection timeout - connection stuck in CONNECTING state');
        ws.close();
      }
    }, 5000);
    
    // Clear timeout if connection opens
    const originalOnOpen = ws.onopen;
    ws.onopen = function() {
      clearTimeout(connectionTimeout);
      if (originalOnOpen) originalOnOpen.call(this);
    };
    
  } catch (err) {
    if (window.debugError) window.debugError('websocket', 'Failed to create connection:', err);
    if (onStatusChange) onStatusChange('offline');
    
    // Retry connection after delay
    reconnectAttempts++;
    if (window.debugLog) window.debugLog('websocket', `Scheduling retry in ${RECONNECT_DELAY}ms (attempt ${reconnectAttempts})`);
    reconnectInterval = setTimeout(() => {
      if (window.debugLog) window.debugLog('websocket', `Executing retry attempt ${reconnectAttempts}`);
      connect();
    }, RECONNECT_DELAY);
  }
}

function disconnect() {
  if (reconnectInterval) {
    clearTimeout(reconnectInterval);
    reconnectInterval = null;
  }
  
  if (ws) {
    ws.close();
    ws = null;
  }
}

function isConnected() {
  return ws && ws.readyState === WebSocket.OPEN;
}

// Global update handler
window.onWebSocketUpdate = null;

// Export to window
window.wsConnect = connect;
window.wsDisconnect = disconnect;
window.wsIsConnected = isConnected;
window.wsOnStatusChange = function(callback) { onStatusChange = callback; };
window.wsOnConnect = function(callback) { onConnect = callback; };
window.wsOnDisconnect = function(callback) { onDisconnect = callback; };
window.wsOnUpdate = function(callback) { window.onWebSocketUpdate = callback; };

