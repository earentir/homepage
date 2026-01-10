package api

import (
	"sync"

	"github.com/gorilla/websocket"
)

// connWithMutex wraps a WebSocket connection with its own mutex for thread-safe writes.
type connWithMutex struct {
	conn *websocket.Conn
	mu   sync.Mutex
}

// WSConnectionManager manages WebSocket connections for broadcasting.
type WSConnectionManager struct {
	mu          sync.RWMutex
	connections map[*websocket.Conn]*connWithMutex
}

// NewWSConnectionManager creates a new WebSocket connection manager.
func NewWSConnectionManager() *WSConnectionManager {
	return &WSConnectionManager{
		connections: make(map[*websocket.Conn]*connWithMutex),
	}
}

// Add adds a connection to the manager.
func (m *WSConnectionManager) Add(conn *websocket.Conn) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.connections[conn] = &connWithMutex{
		conn: conn,
	}
}

// Remove removes a connection from the manager.
func (m *WSConnectionManager) Remove(conn *websocket.Conn) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.connections, conn)
}

// Broadcast sends a message to all connected clients.
func (m *WSConnectionManager) Broadcast(message map[string]interface{}) {
	m.mu.RLock()
	// Create a copy of connections to iterate over while holding the lock
	conns := make([]*connWithMutex, 0, len(m.connections))
	for _, cwm := range m.connections {
		conns = append(conns, cwm)
	}
	m.mu.RUnlock()

	// Now iterate and write to each connection (without holding the main lock)
	for _, cwm := range conns {
		cwm.mu.Lock()
		err := cwm.conn.WriteJSON(message)
		cwm.mu.Unlock()

		if err != nil {
			// Connection is dead, remove it
			m.Remove(cwm.conn)
		}
	}
}

// BroadcastStorageUpdate broadcasts a storage update notification.
func (m *WSConnectionManager) BroadcastStorageUpdate(key string, version int64) {
	m.Broadcast(map[string]interface{}{
		"type":    "storage-update",
		"key":     key,
		"version": version,
	})
}

// Global WebSocket connection manager
var wsManager = NewWSConnectionManager()

// GetWSManager returns the global WebSocket connection manager.
func GetWSManager() *WSConnectionManager {
	return wsManager
}
