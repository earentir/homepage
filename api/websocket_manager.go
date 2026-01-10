package api

import (
	"sync"

	"github.com/gorilla/websocket"
)

// WSConnectionManager manages WebSocket connections for broadcasting.
type WSConnectionManager struct {
	mu          sync.RWMutex
	connections map[*websocket.Conn]bool
}

// NewWSConnectionManager creates a new WebSocket connection manager.
func NewWSConnectionManager() *WSConnectionManager {
	return &WSConnectionManager{
		connections: make(map[*websocket.Conn]bool),
	}
}

// Add adds a connection to the manager.
func (m *WSConnectionManager) Add(conn *websocket.Conn) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.connections[conn] = true
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
	defer m.mu.RUnlock()

	for conn := range m.connections {
		if err := conn.WriteJSON(message); err != nil {
			// Connection is dead, remove it
			m.mu.RUnlock()
			m.Remove(conn)
			m.mu.RLock()
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
