package api

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

// ICSCalendar represents an ICS calendar source.
type ICSCalendar struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	URL         string `json:"url"`
	Color       string `json:"color"` // Hex color code
	Enabled     bool   `json:"enabled"`
	LastFetched string `json:"lastFetched,omitempty"` // ISO timestamp
}

// ICSEvent represents an event parsed from an ICS calendar.
type ICSEvent struct {
	UID         string    `json:"uid"`
	Summary     string    `json:"summary"`
	Description string    `json:"description,omitempty"`
	Location    string    `json:"location,omitempty"`
	Start       time.Time `json:"start"`
	End         time.Time `json:"end"`
	AllDay      bool      `json:"allDay"`
	CalendarID  string    `json:"calendarId"`
	Color       string    `json:"color"`
}

// ParseICS parses ICS content and returns events.
func ParseICS(content string, calendarID, color string) ([]ICSEvent, error) {
	var events []ICSEvent
	lines := strings.Split(content, "\n")
	
	var currentEvent *ICSEvent
	var currentLine strings.Builder
	
	for i, line := range lines {
		// Handle line continuation (lines starting with space or tab)
		if strings.HasPrefix(line, " ") || strings.HasPrefix(line, "\t") {
			if currentLine.Len() > 0 {
				currentLine.WriteString(line[1:])
			}
			continue
		}
		
		// Process accumulated line
		if currentLine.Len() > 0 {
			processICSLine(currentLine.String(), currentEvent)
			currentLine.Reset()
		}
		
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		
		// Parse key:value pairs
		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			// Line might be continued on next line
			if i+1 < len(lines) && (strings.HasPrefix(lines[i+1], " ") || strings.HasPrefix(lines[i+1], "\t")) {
				currentLine.WriteString(line)
				continue
			}
			continue
		}
		
		key := strings.ToUpper(parts[0])
		value := parts[1]
		
		// Remove parameters from key (e.g., "DTSTART;VALUE=DATE" -> "DTSTART")
		if semicolonIdx := strings.Index(key, ";"); semicolonIdx > 0 {
			key = key[:semicolonIdx]
		}
		
		switch key {
		case "BEGIN":
			if value == "VEVENT" {
				currentEvent = &ICSEvent{
					CalendarID: calendarID,
					Color:      color,
				}
			}
		case "END":
			if value == "VEVENT" && currentEvent != nil {
				// Convert ICSEvent to CalendarEvent format
				if currentEvent.Summary != "" {
					events = append(events, *currentEvent)
				}
				currentEvent = nil
			}
		case "UID":
			if currentEvent != nil {
				currentEvent.UID = value
			}
		case "SUMMARY":
			if currentEvent != nil {
				currentEvent.Summary = unescapeICS(value)
			}
		case "DESCRIPTION":
			if currentEvent != nil {
				currentEvent.Description = unescapeICS(value)
			}
		case "LOCATION":
			if currentEvent != nil {
				currentEvent.Location = unescapeICS(value)
			}
		case "DTSTART":
			if currentEvent != nil {
				start, err := parseICSTime(value)
				if err == nil {
					currentEvent.Start = start
					// Check if it's an all-day event (date only, no time)
					if len(value) == 8 {
						currentEvent.AllDay = true
					}
				}
			}
		case "DTEND", "DUE":
			if currentEvent != nil {
				end, err := parseICSTime(value)
				if err == nil {
					currentEvent.End = end
				} else {
					GetDebugLogger().Logf("calendar", "Failed to parse DTEND/DUE: %s, error: %v", value, err)
				}
			}
		}
	}
	
	// Process any remaining accumulated line
	if currentLine.Len() > 0 && currentEvent != nil {
		processICSLine(currentLine.String(), currentEvent)
	}
	
	return events, nil
}

// processICSLine processes a single ICS line for the current event.
func processICSLine(line string, event *ICSEvent) {
	if event == nil {
		return
	}
	
	parts := strings.SplitN(line, ":", 2)
	if len(parts) != 2 {
		return
	}
	
	key := strings.ToUpper(parts[0])
	value := parts[1]
	
	if semicolonIdx := strings.Index(key, ";"); semicolonIdx > 0 {
		key = key[:semicolonIdx]
	}
	
	switch key {
	case "SUMMARY":
		event.Summary = unescapeICS(value)
	case "DESCRIPTION":
		event.Description = unescapeICS(value)
	case "LOCATION":
		event.Location = unescapeICS(value)
	case "DTSTART":
		start, err := parseICSTime(value)
		if err == nil {
			event.Start = start
			if len(value) == 8 {
				event.AllDay = true
			}
		}
	case "DTEND", "DUE":
		end, err := parseICSTime(value)
		if err == nil {
			event.End = end
		}
	}
}

// parseICSTime parses ICS time format (YYYYMMDDTHHMMSS or YYYYMMDD).
func parseICSTime(value string) (time.Time, error) {
	// Remove timezone suffix if present (Z, +HHMM, -HHMM)
	if idx := strings.IndexAny(value, "Z+-"); idx > 0 {
		value = value[:idx]
	}
	
	// Try different formats in order of specificity
	formats := []string{
		"20060102T150405", // Full datetime with seconds
		"20060102T1504",   // Datetime without seconds
		"20060102",        // Date only (all-day events)
	}
	
	for _, format := range formats {
		if t, err := time.Parse(format, value); err == nil {
			// For date-only formats, set time to midnight UTC
			if format == "20060102" {
				return t.UTC(), nil
			}
			return t, nil
		}
	}
	
	return time.Time{}, fmt.Errorf("unable to parse ICS time: %s", value)
}

// unescapeICS unescapes ICS text values.
func unescapeICS(text string) string {
	text = strings.ReplaceAll(text, "\\n", "\n")
	text = strings.ReplaceAll(text, "\\,", ",")
	text = strings.ReplaceAll(text, "\\;", ";")
	text = strings.ReplaceAll(text, "\\\\", "\\")
	return text
}

// FetchICSCalendar fetches and parses an ICS calendar from a URL.
func FetchICSCalendar(url string) (string, error) {
	client := &http.Client{
		Timeout: 30 * time.Second,
	}
	
	resp, err := client.Get(url)
	if err != nil {
		return "", fmt.Errorf("failed to fetch ICS: %w", err)
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("ICS fetch returned status %d", resp.StatusCode)
	}
	
	content, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read ICS content: %w", err)
	}
	
	return string(content), nil
}

// ConvertICSEventsToCalendarEvents converts ICS events to CalendarEvent format.
func ConvertICSEventsToCalendarEvents(icsEvents []ICSEvent) []CalendarEvent {
	var calendarEvents []CalendarEvent
	
	for _, icsEvent := range icsEvents {
		dateStr := icsEvent.Start.Format("2006-01-02")
		timeStr := ""
		
		if !icsEvent.AllDay {
			timeStr = icsEvent.Start.Format("15:04")
		}
		
		// Create title with calendar color indicator
		title := icsEvent.Summary
		if icsEvent.Location != "" {
			title += " @ " + icsEvent.Location
		}
		
		calendarEvents = append(calendarEvents, CalendarEvent{
			ID:    fmt.Sprintf("ics_%s_%s", icsEvent.CalendarID, icsEvent.UID),
			Title: title,
			Date:  dateStr,
			Time:  timeStr,
		})
	}
	
	return calendarEvents
}

// MergeCalendarEvents merges local events with ICS events.
func MergeCalendarEvents(localEvents []CalendarEvent, icsEvents []CalendarEvent) []CalendarEvent {
	// Use a map to track events by ID to avoid duplicates
	eventMap := make(map[string]CalendarEvent)
	
	// Add local events first
	for _, event := range localEvents {
		eventMap[event.ID] = event
	}
	
	// Add ICS events (they will overwrite if same ID, but ICS IDs are different)
	for _, event := range icsEvents {
		eventMap[event.ID] = event
	}
	
	// Convert map back to slice
	var merged []CalendarEvent
	for _, event := range eventMap {
		merged = append(merged, event)
	}
	
	return merged
}


// GetICSCalendars returns all ICS calendars from storage.
func GetICSCalendars() ([]ICSCalendar, error) {
	storage := GetStorage()
	item, exists := storage.Get("icsCalendars")
	if !exists {
		GetDebugLogger().Logf("calendar", "GetICSCalendars: No calendars found in storage")
		return []ICSCalendar{}, nil
	}
	
	GetDebugLogger().Logf("calendar", "GetICSCalendars: Found calendars in storage, type: %T", item.Value)
	
	// Convert interface{} to []ICSCalendar
	data, err := json.Marshal(item.Value)
	if err != nil {
		GetDebugLogger().Logf("calendar", "GetICSCalendars: Failed to marshal storage value: %v", err)
		return nil, err
	}
	
	var calendars []ICSCalendar
	if err := json.Unmarshal(data, &calendars); err != nil {
		GetDebugLogger().Logf("calendar", "GetICSCalendars: Failed to unmarshal calendars: %v, data: %s", err, string(data))
		return nil, err
	}
	
	GetDebugLogger().Logf("calendar", "GetICSCalendars: Successfully loaded %d calendar(s) from storage", len(calendars))
	return calendars, nil
}

// SaveICSCalendars saves ICS calendars to storage.
func SaveICSCalendars(calendars []ICSCalendar) error {
	storage := GetStorage()
	// Get current version or use timestamp as version
	item, exists := storage.Get("icsCalendars")
	version := time.Now().Unix()
	if exists {
		version = item.Version + 1
	}
	storage.Set("icsCalendars", calendars, version)
	return nil
}

// ICSCache provides thread-safe caching for ICS calendar events.
type ICSCache struct {
	mu        sync.RWMutex
	events    []CalendarEvent
	lastFetch time.Time
	hasData   bool
}

// Global ICS cache instance
var icsCache = &ICSCache{}

// GetICSCacheTTL returns the cache TTL in minutes from settings, default 15 minutes.
func GetICSCacheTTL() time.Duration {
	storage := GetStorage()
	item, exists := storage.Get("icsCacheTTL")
	if !exists {
		return 15 * time.Minute // Default 15 minutes
	}
	
	// Try to get TTL as number (minutes)
	if ttlMinutes, ok := item.Value.(float64); ok {
		return time.Duration(ttlMinutes) * time.Minute
	}
	if ttlMinutes, ok := item.Value.(int64); ok {
		return time.Duration(ttlMinutes) * time.Minute
	}
	if ttlMinutes, ok := item.Value.(int); ok {
		return time.Duration(ttlMinutes) * time.Minute
	}
	
	return 15 * time.Minute // Default fallback
}

// GetICSEvents fetches and parses events from all enabled ICS calendars.
// Uses caching with configurable TTL. If forceRefresh is true, bypasses cache.
func GetICSEvents(calendars []ICSCalendar, forceRefresh bool) ([]CalendarEvent, error) {
	icsCache.mu.RLock()
	timeSinceLastFetch := time.Since(icsCache.lastFetch)
	hasCachedData := icsCache.hasData
	cachedEvents := icsCache.events
	icsCache.mu.RUnlock()

	cacheTTL := GetICSCacheTTL()

	// Return cached data if available and not expired (unless forced refresh)
	if !forceRefresh && hasCachedData && timeSinceLastFetch < cacheTTL {
		GetDebugLogger().Logf("calendar", "Returning cached ICS events (last fetch: %v ago, cache TTL: %v, events: %d)", timeSinceLastFetch, cacheTTL, len(cachedEvents))
		return cachedEvents, nil
	}

	// Fetch fresh data
	GetDebugLogger().Logf("calendar", "Fetching ICS events from %d enabled calendar(s)...", len(calendars))
	var allICSEvents []ICSEvent
	var fetchedCalendars []string
	
	for _, cal := range calendars {
		if !cal.Enabled {
			continue
		}
		
		GetDebugLogger().Logf("calendar", "Fetching ICS calendar: %s (%s)", cal.Name, cal.URL)
		
		// Fetch ICS content
		content, err := FetchICSCalendar(cal.URL)
		if err != nil {
			GetDebugLogger().Logf("calendar", "Failed to fetch ICS calendar %s (%s): %v", cal.Name, cal.URL, err)
			continue
		}
		
		// Parse ICS content
		events, err := ParseICS(content, cal.ID, cal.Color)
		if err != nil {
			GetDebugLogger().Logf("calendar", "Failed to parse ICS calendar %s: %v", cal.Name, err)
			continue
		}
		
		GetDebugLogger().Logf("calendar", "Fetched %d events from ICS calendar: %s", len(events), cal.Name)
		for i, evt := range events {
			if i < 5 { // Log first 5 events as examples
				GetDebugLogger().Logf("calendar", "  Event %d: %s (%s) - %s", i+1, evt.Summary, evt.Start.Format("2006-01-02 15:04"), cal.Name)
			}
		}
		if len(events) > 5 {
			GetDebugLogger().Logf("calendar", "  ... and %d more events", len(events)-5)
		}
		
		allICSEvents = append(allICSEvents, events...)
		fetchedCalendars = append(fetchedCalendars, cal.Name)
	}
	
	// Convert to CalendarEvent format
	calendarEvents := ConvertICSEventsToCalendarEvents(allICSEvents)
	
	GetDebugLogger().Logf("calendar", "Total ICS events fetched: %d from %d calendar(s): %v", len(calendarEvents), len(fetchedCalendars), fetchedCalendars)
	
	// Update cache
	icsCache.mu.Lock()
	icsCache.events = calendarEvents
	icsCache.lastFetch = time.Now()
	icsCache.hasData = true
	icsCache.mu.Unlock()
	
	return calendarEvents, nil
}
