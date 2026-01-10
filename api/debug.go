package api

import (
	"log"
	"sync"
)

// DebugLogger provides debug logging controlled by user preferences
type DebugLogger struct {
	mu    sync.RWMutex
	prefs map[string]bool
}

// NewDebugLogger creates a new debug logger
func NewDebugLogger() *DebugLogger {
	return &DebugLogger{
		prefs: make(map[string]bool),
	}
}

// UpdatePrefs updates debug preferences from storage
func (dl *DebugLogger) UpdatePrefs() {
	storage := GetStorage()
	item, exists := storage.Get("debugPrefs")
	if !exists {
		dl.mu.Lock()
		dl.prefs = make(map[string]bool)
		dl.mu.Unlock()
		return
	}

	prefs, ok := item.Value.(map[string]interface{})
	if !ok {
		dl.mu.Lock()
		dl.prefs = make(map[string]bool)
		dl.mu.Unlock()
		return
	}

	dl.mu.Lock()
	dl.prefs = make(map[string]bool)
	for key, val := range prefs {
		if enabled, ok := val.(bool); ok {
			dl.prefs[key] = enabled
		}
	}
	dl.mu.Unlock()
}

// IsEnabled checks if debug logging is enabled for a module
func (dl *DebugLogger) IsEnabled(module string) bool {
	dl.mu.RLock()
	defer dl.mu.RUnlock()
	return dl.prefs[module] == true
}

// Logf logs a formatted debug message if the module is enabled
func (dl *DebugLogger) Logf(module string, format string, args ...interface{}) {
	if dl.IsEnabled(module) {
		log.Printf("[%s] "+format, append([]interface{}{module}, args...)...)
	}
}

// Global debug logger instance
var globalDebugLogger = NewDebugLogger()

// GetDebugLogger returns the global debug logger
func GetDebugLogger() *DebugLogger {
	return globalDebugLogger
}
