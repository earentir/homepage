package api

// ModuleMetadata contains metadata about a module.
type ModuleMetadata struct {
	Name          string `json:"name"`
	Icon          string `json:"icon"`
	Desc          string `json:"desc"`
	HasTimer      bool   `json:"hasTimer"`
	TimerKey      string `json:"timerKey,omitempty"`
	DefaultInterval int  `json:"defaultInterval,omitempty"`
	Enabled       bool   `json:"enabled"` // Default enabled state (user can override in localStorage)
}

// GetModuleMetadata returns metadata for all available modules.
func GetModuleMetadata() map[string]ModuleMetadata {
	return map[string]ModuleMetadata{
		"status": {
			Name:     "Status",
			Icon:     "fa-server",
			Desc:     "System status and uptime",
			HasTimer: false,
			Enabled:  true,
		},
		"network": {
			Name:           "Network",
			Icon:           "fa-network-wired",
			Desc:           "LAN and public IP addresses",
			HasTimer:       true,
			TimerKey:       "ip",
			DefaultInterval: 7200,
			Enabled:        true,
		},
		"weather": {
			Name:           "Weather",
			Icon:           "fa-cloud-sun",
			Desc:           "Current weather and forecast",
			HasTimer:       true,
			TimerKey:       "weather",
			DefaultInterval: 1800,
			Enabled:        true,
		},
		"cpu": {
			Name:           "CPU",
			Icon:           "fa-microchip",
			Desc:           "CPU usage with history graph",
			HasTimer:       true,
			TimerKey:       "cpu",
			DefaultInterval: 5,
			Enabled:        true,
		},
		"cpuid": {
			Name:     "CPU Info",
			Icon:     "fa-info-circle",
			Desc:     "CPU model and specifications",
			HasTimer: false,
			Enabled:  true,
		},
		"ram": {
			Name:           "RAM",
			Icon:           "fa-memory",
			Desc:           "Memory usage with history graph",
			HasTimer:       true,
			TimerKey:       "ram",
			DefaultInterval: 5,
			Enabled:        true,
		},
		"raminfo": {
			Name:     "RAM Info",
			Icon:     "fa-memory",
			Desc:     "SMBIOS RAM module information",
			HasTimer: false,
			Enabled:  true,
		},
		"firmware": {
			Name:     "Firmware",
			Icon:     "fa-microchip",
			Desc:     "BIOS/Firmware information",
			HasTimer: false,
			Enabled:  true,
		},
		"systeminfo": {
			Name:     "System",
			Icon:     "fa-desktop",
			Desc:     "SMBIOS System information",
			HasTimer: false,
			Enabled:  true,
		},
		"baseboard": {
			Name:     "Baseboard",
			Icon:     "fa-server",
			Desc:     "SMBIOS Baseboard information",
			HasTimer: false,
			Enabled:  true,
		},
		"disk": {
			Name:           "Disk",
			Icon:           "fa-hdd",
			Desc:           "Disk usage with history graph",
			HasTimer:       true,
			TimerKey:       "disk",
			DefaultInterval: 15,
			Enabled:        true,
		},
		"links": {
			Name:     "Quick Links",
			Icon:     "fa-link",
			Desc:     "Quick access links",
			HasTimer: false,
			Enabled:  true,
		},
		"monitoring": {
			Name:           "Monitoring",
			Icon:           "fa-heartbeat",
			Desc:           "Service health monitoring",
			HasTimer:       true,
			TimerKey:       "monitoring",
			DefaultInterval: 60,
			Enabled:        true,
		},
		"snmp": {
			Name:           "SNMP",
			Icon:           "fa-network-wired",
			Desc:           "SNMP device queries",
			HasTimer:       true,
			TimerKey:       "snmp",
			DefaultInterval: 60,
			Enabled:        true,
		},
		"github": {
			Name:            "GitHub",
			Icon:            "fa-github",
			Desc:            "GitHub repository information",
			HasTimer:        true,
			TimerKey:        "github",
			DefaultInterval: 300,
			Enabled:         true,
		},
		"rss": {
			Name:            "RSS",
			Icon:            "fa-rss",
			Desc:            "RSS feed reader",
			HasTimer:        true,
			TimerKey:        "rss",
			DefaultInterval: 300,
			Enabled:         true,
		},
		"calendar": {
			Name:     "Calendar",
			Icon:     "fa-calendar-alt",
			Desc:     "Month calendar view",
			HasTimer: false,
			Enabled:  true,
		},
		"events": {
			Name:     "Upcoming Events",
			Icon:     "fa-calendar-check",
			Desc:     "Next 5 upcoming events",
			HasTimer: false,
			Enabled:  true,
		},
		"weekcalendar": {
			Name:     "Week Calendar",
			Icon:     "fa-calendar-week",
			Desc:     "Week view with events",
			HasTimer: false,
			Enabled:  true,
		},
		"todo": {
			Name:     "Todo",
			Icon:     "fa-tasks",
			Desc:     "Todo list",
			HasTimer: false,
			Enabled:  true,
		},
	}
}
