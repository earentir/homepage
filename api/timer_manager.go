package api

import (
	"sync"
	"time"
)

// TimerInfo tracks timer state for a module
type TimerInfo struct {
	Interval    int64     // Interval in seconds
	LastRefresh time.Time // When the module was last refreshed
	Enabled     bool      // Whether the module is enabled
}

// TimerManager manages refresh timers for all modules
type TimerManager struct {
	mu      sync.RWMutex
	timers  map[string]*TimerInfo // key is timerKey (e.g., "cpu", "ram", "ip")
	stopCh  chan struct{}
	running bool
}

// NewTimerManager creates a new timer manager
func NewTimerManager() *TimerManager {
	return &TimerManager{
		timers:  make(map[string]*TimerInfo),
		stopCh:  make(chan struct{}),
		running: false,
	}
}

// Start starts the timer manager
func (tm *TimerManager) Start() {
	tm.mu.Lock()
	if tm.running {
		tm.mu.Unlock()
		return
	}
	tm.running = true
	tm.mu.Unlock()

	// Load initial preferences
	tm.loadPreferences()

	// Start ticker to check timers every second
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

		// Also check for preference changes periodically
		prefTicker := time.NewTicker(5 * time.Second)
		defer prefTicker.Stop()

		// Update debug preferences on startup
		GetDebugLogger().UpdatePrefs()

		for {
			select {
			case <-tm.stopCh:
				return
			case <-ticker.C:
				tm.checkTimers()
			case <-prefTicker.C:
				tm.loadPreferences()
				// Also update debug preferences periodically
				GetDebugLogger().UpdatePrefs()
			}
		}
}

// Stop stops the timer manager
func (tm *TimerManager) Stop() {
	tm.mu.Lock()
	defer tm.mu.Unlock()
	if !tm.running {
		return
	}
	tm.running = false
	close(tm.stopCh)
}

// loadPreferences loads module preferences from storage and updates timers
func (tm *TimerManager) loadPreferences() {
	storage := GetStorage()
	item, exists := storage.Get("modulePrefs")
	if !exists {
		// No preferences stored, use defaults from module metadata
		tm.loadDefaultTimers()
		return
	}

	// Parse module preferences
	prefs, ok := item.Value.(map[string]interface{})
	if !ok {
		tm.loadDefaultTimers()
		return
	}

	tm.mu.Lock()
	defer tm.mu.Unlock()

	// Get module metadata to map module keys to timer keys
	metadata := GetModuleMetadata()

	// Update timers based on preferences
	for moduleKey, prefData := range prefs {
		prefMap, ok := prefData.(map[string]interface{})
		if !ok {
			continue
		}

		// Find the timer key for this module
		modMeta, exists := metadata[moduleKey]
		if !exists || !modMeta.HasTimer || modMeta.TimerKey == "" {
			continue
		}

		timerKey := modMeta.TimerKey
		enabled := true
		if enabledVal, ok := prefMap["enabled"].(bool); ok {
			enabled = enabledVal
		}

		interval := int64(modMeta.DefaultInterval)
		if intervalVal, ok := prefMap["interval"].(float64); ok {
			interval = int64(intervalVal)
		}

		// Update or create timer
		existing, exists := tm.timers[timerKey]
		if exists {
			// Update existing timer
			existing.Interval = interval
			existing.Enabled = enabled
			// Only update LastRefresh if interval changed significantly (to avoid resetting on minor changes)
			if interval != existing.Interval && existing.LastRefresh.IsZero() {
				existing.LastRefresh = time.Now()
			}
		} else {
			// Create new timer
			tm.timers[timerKey] = &TimerInfo{
				Interval:    interval,
				LastRefresh: time.Now(),
				Enabled:     enabled,
			}
		}
	}

	// Also add any timers from metadata that don't have preferences yet
	for moduleKey, modMeta := range metadata {
		if !modMeta.HasTimer || modMeta.TimerKey == "" {
			continue
		}

		timerKey := modMeta.TimerKey
		if _, exists := tm.timers[timerKey]; !exists {
			// Check if this module has preferences
			prefData, hasPrefs := prefs[moduleKey]
			if !hasPrefs {
				// Use default
				tm.timers[timerKey] = &TimerInfo{
					Interval:    int64(modMeta.DefaultInterval),
					LastRefresh: time.Now(),
					Enabled:     modMeta.Enabled,
				}
			} else {
				// Module has preferences but timer wasn't created above - might be disabled
				prefMap, ok := prefData.(map[string]interface{})
				if ok {
					enabled := true
					if enabledVal, ok := prefMap["enabled"].(bool); ok {
						enabled = enabledVal
					}
					interval := int64(modMeta.DefaultInterval)
					if intervalVal, ok := prefMap["interval"].(float64); ok {
						interval = int64(intervalVal)
					}
					tm.timers[timerKey] = &TimerInfo{
						Interval:    interval,
						LastRefresh: time.Now(),
						Enabled:     enabled,
					}
				}
			}
		}
	}
}

// loadDefaultTimers loads default timers from module metadata
func (tm *TimerManager) loadDefaultTimers() {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	metadata := GetModuleMetadata()
	now := time.Now()

	for _, modMeta := range metadata {
		if !modMeta.HasTimer || modMeta.TimerKey == "" {
			continue
		}

		timerKey := modMeta.TimerKey
		if _, exists := tm.timers[timerKey]; !exists {
			tm.timers[timerKey] = &TimerInfo{
				Interval:    int64(modMeta.DefaultInterval),
				LastRefresh: now,
				Enabled:     modMeta.Enabled,
			}
		}
	}
}

// checkTimers checks all timers and sends refresh notifications when needed
func (tm *TimerManager) checkTimers() {
	tm.mu.RLock()
	defer tm.mu.RUnlock()

	now := time.Now()
	wsManager := GetWSManager()

	for timerKey, timer := range tm.timers {
		if !timer.Enabled {
			continue
		}

		// Check if it's time to refresh
		elapsed := now.Sub(timer.LastRefresh)
		intervalDuration := time.Duration(timer.Interval) * time.Second

		if elapsed >= intervalDuration {
			// Send refresh notification via WebSocket
			wsManager.Broadcast(map[string]interface{}{
				"type":      "refresh",
				"module":    timerKey,
				"timestamp": now.Unix(),
			})

			// Update last refresh time
			timer.LastRefresh = now

			// Debug logging (controlled by preferences)
			GetDebugLogger().Logf("timer", "Sending refresh notification for module: %s (interval: %ds)", timerKey, timer.Interval)
		}
	}
}

// GetTimerStatus returns the current status of all timers (for debugging/monitoring)
func (tm *TimerManager) GetTimerStatus() map[string]map[string]interface{} {
	tm.mu.RLock()
	defer tm.mu.RUnlock()

	result := make(map[string]map[string]interface{})
	now := time.Now()

	for timerKey, timer := range tm.timers {
		elapsed := now.Sub(timer.LastRefresh)
		intervalDuration := time.Duration(timer.Interval) * time.Second
		remaining := intervalDuration - elapsed
		if remaining < 0 {
			remaining = 0
		}

		result[timerKey] = map[string]interface{}{
			"interval":     timer.Interval,
			"enabled":      timer.Enabled,
			"lastRefresh":  timer.LastRefresh.Unix(),
			"remaining":    int64(remaining.Seconds()),
			"elapsed":      int64(elapsed.Seconds()),
		}
	}

	return result
}

// Global timer manager instance
var globalTimerManager = NewTimerManager()

// GetTimerManager returns the global timer manager
func GetTimerManager() *TimerManager {
	return globalTimerManager
}
