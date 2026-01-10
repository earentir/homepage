package api

import (
	"fmt"
	"sort"
	"time"
)

// Todo represents a todo item.
type Todo struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Completed bool   `json:"completed"`
	Priority  string `json:"priority,omitempty"` // 'low', 'medium', 'high'
	DueDate   string `json:"dueDate,omitempty"` // YYYY-MM-DD
}

// TodoProcessed represents a processed todo with formatted date.
type TodoProcessed struct {
	Todo
	FormattedDueDate string `json:"formattedDueDate,omitempty"`
}

// ProcessTodos processes and sorts todos by priority and due date.
func ProcessTodos(todos []Todo, count int, includeCompleted bool) []TodoProcessed {
	// Filter todos
	var filtered []Todo
	for _, todo := range todos {
		if includeCompleted || !todo.Completed {
			filtered = append(filtered, todo)
		}
	}

	// Sort by: priority (high > medium > low), then due date (earliest first)
	priorityOrder := map[string]int{
		"high":   3,
		"medium": 2,
		"low":    1,
	}

	sort.Slice(filtered, func(i, j int) bool {
		a := filtered[i]
		b := filtered[j]

		// Priority first
		aPriority := priorityOrder[a.Priority]
		bPriority := priorityOrder[b.Priority]
		if aPriority != bPriority {
			return aPriority > bPriority
		}

		// Then due date (earliest first)
		if a.DueDate != "" && b.DueDate != "" {
			return a.DueDate < b.DueDate
		}
		if a.DueDate != "" {
			return true
		}
		if b.DueDate != "" {
			return false
		}

		// Finally by creation order (ID contains timestamp)
		return a.ID < b.ID
	})

	// Limit to count
	if count > 0 && len(filtered) > count {
		filtered = filtered[:count]
	}

	// Convert to processed todos with formatted dates
	result := make([]TodoProcessed, len(filtered))
	for i, todo := range filtered {
		result[i] = TodoProcessed{
			Todo:            todo,
			FormattedDueDate: FormatTodoDate(todo.DueDate),
		}
	}

	return result
}

// FormatTodoDate formats a date string for display.
func FormatTodoDate(dateStr string) string {
	if dateStr == "" {
		return ""
	}

	date, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		return dateStr
	}

	today := time.Now()
	today = time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, today.Location())
	date = time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, date.Location())

	diff := date.Sub(today)
	diffDays := int(diff.Hours() / 24)

	if diffDays == 0 {
		return "Today"
	}
	if diffDays == 1 {
		return "Tomorrow"
	}
	if diffDays == -1 {
		return "Yesterday"
	}
	if diffDays < 0 {
		return fmt.Sprintf("%d days ago", -diffDays)
	}
	if diffDays <= 7 {
		return fmt.Sprintf("In %d days", diffDays)
	}

	return date.Format("Jan 2")
}
