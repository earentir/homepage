package api

import (
	"fmt"
	"sort"
	"time"
)

// CalendarEvent represents a calendar event.
type CalendarEvent struct {
	ID            string `json:"id"`
	Title         string `json:"title"`
	Date          string `json:"date"`  // YYYY-MM-DD
	Time          string `json:"time"`  // HH:MM (24h format)
	FormattedDate string `json:"formattedDate,omitempty"` // Formatted for display
}

// CalendarProcessedData contains processed calendar data.
type CalendarProcessedData struct {
	UpcomingEvents []CalendarEvent          `json:"upcomingEvents"`
	EventsByDate   map[string][]CalendarEvent `json:"eventsByDate"`
	DatesWithEvents []string                `json:"datesWithEvents"`
}

// ProcessCalendarEvents processes calendar events and returns calculated data.
func ProcessCalendarEvents(events []CalendarEvent, count int) CalendarProcessedData {
	result := CalendarProcessedData{
		EventsByDate:   make(map[string][]CalendarEvent),
		DatesWithEvents: []string{},
	}

	now := time.Now()
	todayStr := now.Format("2006-01-02")
	nowTime := now.Format("15:04")

	// Filter and sort upcoming events
	var upcoming []CalendarEvent
	for _, evt := range events {
		// Check if event is upcoming
		if evt.Date > todayStr {
			upcoming = append(upcoming, evt)
		} else if evt.Date == todayStr && evt.Time >= nowTime {
			upcoming = append(upcoming, evt)
		}

		// Group by date
		if _, exists := result.EventsByDate[evt.Date]; !exists {
			result.EventsByDate[evt.Date] = []CalendarEvent{}
			result.DatesWithEvents = append(result.DatesWithEvents, evt.Date)
		}
		result.EventsByDate[evt.Date] = append(result.EventsByDate[evt.Date], evt)
	}

	// Sort upcoming events
	sort.Slice(upcoming, func(i, j int) bool {
		if upcoming[i].Date != upcoming[j].Date {
			return upcoming[i].Date < upcoming[j].Date
		}
		return upcoming[i].Time < upcoming[j].Time
	})

	// Limit to count and add formatted dates
	limited := upcoming
	if count > 0 && len(upcoming) > count {
		limited = upcoming[:count]
	}
	
	// Add formatted dates to events
	for i := range limited {
		limited[i].FormattedDate = FormatEventDate(limited[i].Date, limited[i].Time)
	}
	
	result.UpcomingEvents = limited

	// Sort events within each date by time
	for date := range result.EventsByDate {
		sort.Slice(result.EventsByDate[date], func(i, j int) bool {
			return result.EventsByDate[date][i].Time < result.EventsByDate[date][j].Time
		})
	}

	// Sort dates with events
	sort.Strings(result.DatesWithEvents)

	return result
}

// GetEventsForDate returns events for a specific date.
func GetEventsForDate(events []CalendarEvent, dateStr string) []CalendarEvent {
	var result []CalendarEvent
	for _, evt := range events {
		if evt.Date == dateStr {
			result = append(result, evt)
		}
	}
	// Sort by time
	sort.Slice(result, func(i, j int) bool {
		return result[i].Time < result[j].Time
	})
	return result
}

// DateHasEvents checks if a date has any events.
func DateHasEvents(events []CalendarEvent, dateStr string) bool {
	for _, evt := range events {
		if evt.Date == dateStr {
			return true
		}
	}
	return false
}

// FormatEventDate formats a date and time for display.
func FormatEventDate(dateStr, timeStr string) string {
	date, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		return dateStr
	}

	formatted := date.Format("Mon, Jan 2")
	if timeStr != "" {
		formatted += " " + timeStr
	}
	return formatted
}

// GetMonthCalendarData returns calendar data for a specific month.
type MonthCalendarData struct {
	Year         int      `json:"year"`
	Month        int      `json:"month"`
	MonthName    string   `json:"monthName"`
	DaysInMonth  int      `json:"daysInMonth"`
	FirstDay     int      `json:"firstDay"`     // 0 = Sunday, 1 = Monday, etc.
	Today        string   `json:"today"`       // YYYY-MM-DD
	DatesWithEvents []string `json:"datesWithEvents"`
}

// GetMonthCalendarData calculates month calendar data.
func GetMonthCalendarData(year, month int, events []CalendarEvent) MonthCalendarData {
	firstDay := time.Date(year, time.Month(month+1), 1, 0, 0, 0, 0, time.UTC).Weekday()
	daysInMonth := time.Date(year, time.Month(month+2), 0, 0, 0, 0, 0, time.UTC).Day()
	today := time.Now().Format("2006-01-02")

	// Get dates with events for this month
	datesWithEvents := []string{}
	monthStart := fmt.Sprintf("%04d-%02d-01", year, month+1)
	monthEnd := fmt.Sprintf("%04d-%02d-%02d", year, month+1, daysInMonth)

	for _, evt := range events {
		if evt.Date >= monthStart && evt.Date <= monthEnd {
			// Check if already in list
			found := false
			for _, d := range datesWithEvents {
				if d == evt.Date {
					found = true
					break
				}
			}
			if !found {
				datesWithEvents = append(datesWithEvents, evt.Date)
			}
		}
	}

	monthNames := []string{"January", "February", "March", "April", "May", "June",
		"July", "August", "September", "October", "November", "December"}

	return MonthCalendarData{
		Year:          year,
		Month:         month,
		MonthName:     monthNames[month],
		DaysInMonth:   daysInMonth,
		FirstDay:      int(firstDay),
		Today:         today,
		DatesWithEvents: datesWithEvents,
	}
}

// GetWeekCalendarData returns calendar data for a specific week.
type WeekCalendarData struct {
	WeekStart    string   `json:"weekStart"`    // YYYY-MM-DD
	WeekEnd      string   `json:"weekEnd"`      // YYYY-MM-DD
	Days         []WeekDay `json:"days"`
	Today        string   `json:"today"`       // YYYY-MM-DD
}

// WeekDay represents a day in the week view.
type WeekDay struct {
	Date        string          `json:"date"`        // YYYY-MM-DD
	DayNumber   int             `json:"dayNumber"`
	DayName     string          `json:"dayName"`
	Events      []CalendarEvent `json:"events"`
	HasEvents   bool            `json:"hasEvents"`
	IsToday     bool            `json:"isToday"`
}

// GetWeekCalendarData calculates week calendar data.
func GetWeekCalendarData(weekStart time.Time, workWeekOnly bool, startDay int, events []CalendarEvent) WeekCalendarData {
	// Adjust week start based on startDay setting
	day := int(weekStart.Weekday())
	diff := (day - startDay + 7) % 7
	actualStart := weekStart.AddDate(0, 0, -diff)

	if workWeekOnly {
		// For work week, always start from Monday
		day = int(actualStart.Weekday())
		if day == 0 {
			diff = 1
		} else {
			diff = (1 - day + 7) % 7
		}
		actualStart = actualStart.AddDate(0, 0, diff)
	}

	daysToShow := 7
	if workWeekOnly {
		daysToShow = 5
	}

	weekEnd := actualStart.AddDate(0, 0, daysToShow-1)
	today := time.Now().Format("2006-01-02")

	dayNames := []string{"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"}
	days := []WeekDay{}

	currentDay := actualStart
	for i := 0; i < daysToShow; i++ {
		dateStr := currentDay.Format("2006-01-02")
		dayEvents := GetEventsForDate(events, dateStr)
		
		days = append(days, WeekDay{
			Date:      dateStr,
			DayNumber: currentDay.Day(),
			DayName:   dayNames[int(currentDay.Weekday())],
			Events:    dayEvents,
			HasEvents: len(dayEvents) > 0,
			IsToday:   dateStr == today,
		})

		currentDay = currentDay.AddDate(0, 0, 1)
	}

	return WeekCalendarData{
		WeekStart: actualStart.Format("2006-01-02"),
		WeekEnd:   weekEnd.Format("2006-01-02"),
		Days:      days,
		Today:     today,
	}
}
