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
  
  console.log('[WebSocket] Connecting to:', wsUrl);
  
  try {
    ws = new WebSocket(wsUrl);
    
    ws.onopen = function() {
      console.log('[WebSocket] Connected');
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
        console.log('[WebSocket] Message received:', data.type || 'unknown');
        
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
        }
      } catch (err) {
        console.error('[WebSocket] Error parsing message:', err);
      }
    };
    
    ws.onerror = function(error) {
      console.error('[WebSocket] Error:', error);
      // Error doesn't necessarily mean disconnect, but if connection fails immediately
      // we should still try to reconnect
    };
    
    ws.onclose = function(event) {
      console.log('[WebSocket] Disconnected, code:', event.code, 'reason:', event.reason);
      ws = null;
      
      if (onDisconnect) onDisconnect();
      if (onStatusChange) onStatusChange('offline');
      
      // Always attempt to reconnect - every 2 seconds
      reconnectAttempts++;
      console.log(`[WebSocket] Scheduling reconnect in ${RECONNECT_DELAY}ms (attempt ${reconnectAttempts})`);
      
      reconnectInterval = setTimeout(() => {
        console.log(`[WebSocket] Executing reconnect attempt ${reconnectAttempts}`);
        connect();
      }, RECONNECT_DELAY);
    };
    
    // Add a timeout to handle cases where connection hangs in CONNECTING state
    // If connection doesn't open or close within 5 seconds, force close and retry
    const connectionTimeout = setTimeout(() => {
      if (ws && ws.readyState === WebSocket.CONNECTING) {
        console.log('[WebSocket] Connection timeout - connection stuck in CONNECTING state');
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
    console.error('[WebSocket] Failed to create connection:', err);
    if (onStatusChange) onStatusChange('offline');
    
    // Retry connection after delay
    reconnectAttempts++;
    console.log(`[WebSocket] Scheduling retry in ${RECONNECT_DELAY}ms (attempt ${reconnectAttempts})`);
    reconnectInterval = setTimeout(() => {
      console.log(`[WebSocket] Executing retry attempt ${reconnectAttempts}`);
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

