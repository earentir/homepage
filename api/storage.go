package api

import (
	"sync"
	"time"
)

// StorageItem represents a stored item with version tracking.
type StorageItem struct {
	Value       interface{} `json:"value"`
	Version     int64       `json:"version"`
	LastModified time.Time  `json:"lastModified"`
}

// Storage provides thread-safe in-memory storage with version tracking.
type Storage struct {
	mu    sync.RWMutex
	items map[string]*StorageItem
}

// NewStorage creates a new storage instance.
func NewStorage() *Storage {
	return &Storage{
		items: make(map[string]*StorageItem),
	}
}

// Set stores a value with version tracking.
func (s *Storage) Set(key string, value interface{}, version int64) {
	s.mu.Lock()
	existing, exists := s.items[key]
	shouldUpdate := !exists || version > existing.Version
	var storedVersion int64
	if shouldUpdate {
		s.items[key] = &StorageItem{
			Value:        value,
			Version:      version,
			LastModified: time.Now(),
		}
		storedVersion = version
	} else {
		// Keep existing version if not updating
		storedVersion = existing.Version
	}
	s.mu.Unlock()

	// Broadcast update if data was actually updated
	if shouldUpdate {
		GetWSManager().BroadcastStorageUpdate(key, storedVersion)
	}
}

// Get retrieves a value by key.
func (s *Storage) Get(key string) (*StorageItem, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	item, exists := s.items[key]
	if !exists {
		return nil, false
	}

	// Return a copy to avoid race conditions
	return &StorageItem{
		Value:        item.Value,
		Version:      item.Version,
		LastModified: item.LastModified,
	}, true
}

// GetAll returns all stored items.
func (s *Storage) GetAll() map[string]*StorageItem {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make(map[string]*StorageItem)
	for k, v := range s.items {
		result[k] = &StorageItem{
			Value:        v.Value,
			Version:      v.Version,
			LastModified: v.LastModified,
		}
	}
	return result
}

// Delete removes a key from storage.
func (s *Storage) Delete(key string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.items, key)
}

// Global storage instance
var globalStorage = NewStorage()

// GetStorage returns the global storage instance.
func GetStorage() *Storage {
	return globalStorage
}
