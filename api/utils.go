package api

import (
	"fmt"
	"html"
	"math"
	"net"
	"net/http"
	"regexp"
	"strings"
)

// FormatBytes formats a byte count into a human-readable string (e.g., "1.5 GB").
func FormatBytes(bytes uint64) string {
	if bytes == 0 {
		return "0 B"
	}
	const k = 1024
	sizes := []string{"B", "KB", "MB", "GB", "TB"}
	i := int(math.Floor(math.Log(float64(bytes)) / math.Log(k)))
	if i >= len(sizes) {
		i = len(sizes) - 1
	}
	value := float64(bytes) / math.Pow(k, float64(i))
	return fmt.Sprintf("%.2f %s", value, sizes[i])
}

// FmtUptime formats seconds into a human-readable uptime string (e.g., "5d 3h 2m 1s").
func FmtUptime(sec int64) string {
	d := sec / 86400
	h := (sec % 86400) / 3600
	m := (sec % 3600) / 60
	s := sec % 60

	var parts []string
	if d > 0 {
		parts = append(parts, fmt.Sprintf("%dd", d))
	}
	if h > 0 {
		parts = append(parts, fmt.Sprintf("%dh", h))
	}
	if m > 0 {
		parts = append(parts, fmt.Sprintf("%dm", m))
	}
	if s > 0 || len(parts) == 0 {
		parts = append(parts, fmt.Sprintf("%ds", s))
	}
	return strings.Join(parts, " ")
}

// EscapeHTML escapes HTML special characters in a string.
func EscapeHTML(text string) string {
	return html.EscapeString(text)
}

// DetectClientInfo detects client OS, browser, and timezone from the request.
func DetectClientInfo(r *http.Request) ClientInfo {
	info := ClientInfo{
		IP:       GetClientIP(r),
		Hostname: "",
		IsLocal:  IsLocalRequest(r),
	}

	// Detect OS and browser from User-Agent
	userAgent := r.Header.Get("User-Agent")
	if userAgent != "" {
		// Simple OS detection
		ua := strings.ToLower(userAgent)
		if strings.Contains(ua, "windows") {
			info.OS = "Windows"
		} else if strings.Contains(ua, "mac") {
			info.OS = "macOS"
		} else if strings.Contains(ua, "linux") {
			info.OS = "Linux"
		} else if strings.Contains(ua, "android") {
			info.OS = "Android"
		} else if strings.Contains(ua, "ios") || strings.Contains(ua, "iphone") || strings.Contains(ua, "ipad") {
			info.OS = "iOS"
		} else {
			info.OS = "Unknown"
		}

		// Simple browser detection
		if strings.Contains(ua, "chrome") && !strings.Contains(ua, "edg") {
			info.Browser = "Chrome"
		} else if strings.Contains(ua, "firefox") {
			info.Browser = "Firefox"
		} else if strings.Contains(ua, "safari") && !strings.Contains(ua, "chrome") {
			info.Browser = "Safari"
		} else if strings.Contains(ua, "edg") {
			info.Browser = "Edge"
		} else {
			info.Browser = "Unknown"
		}
	}

	// Timezone detection from Accept-Language or we can't really detect it server-side
	// Client would need to send it via JavaScript
	info.Timezone = "Unknown"

	return info
}

// IsValidURLOrIP checks if a string is a valid URL or IP address.
func IsValidURLOrIP(s string) bool {
	if s == "" {
		return false
	}

	// Check if it's a valid IP address
	if ip := net.ParseIP(s); ip != nil {
		return true
	}

	// Check if it's a valid URL
	urlPattern := regexp.MustCompile(`^https?://[^\s/$.?#].[^\s]*$`)
	if urlPattern.MatchString(s) {
		return true
	}

	// Check if it's a domain name (without protocol)
	domainPattern := regexp.MustCompile(`^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$`)
	if domainPattern.MatchString(s) {
		return true
	}

	return false
}

// NormalizeURL normalizes a URL by adding http:// if no protocol is present.
func NormalizeURL(url string) string {
	if url == "" {
		return url
	}

	url = strings.TrimSpace(url)

	// If it already has a protocol, return as-is
	if strings.HasPrefix(url, "http://") || strings.HasPrefix(url, "https://") {
		return url
	}

	// If it looks like an IP address, add http://
	if net.ParseIP(url) != nil {
		return "http://" + url
	}

	// If it looks like a domain, add http://
	if strings.Contains(url, ".") && !strings.Contains(url, " ") {
		return "http://" + url
	}

	// Otherwise return as-is (might be a search term)
	return url
}

// WeatherIconInfo contains icon information for weather codes.
type WeatherIconInfo struct {
	Icon string `json:"icon"`
	Desc string `json:"desc"`
}

// GetWeatherIcon maps a weather code to an icon class and description.
func GetWeatherIcon(code int) WeatherIconInfo {
	icons := map[int]WeatherIconInfo{
		0:  {Icon: "fa-sun", Desc: "Clear sky"},
		1:  {Icon: "fa-sun", Desc: "Mainly clear"},
		2:  {Icon: "fa-cloud-sun", Desc: "Partly cloudy"},
		3:  {Icon: "fa-cloud", Desc: "Overcast"},
		45: {Icon: "fa-smog", Desc: "Fog"},
		48: {Icon: "fa-smog", Desc: "Depositing rime fog"},
		51: {Icon: "fa-cloud-rain", Desc: "Light drizzle"},
		53: {Icon: "fa-cloud-rain", Desc: "Moderate drizzle"},
		55: {Icon: "fa-cloud-rain", Desc: "Dense drizzle"},
		61: {Icon: "fa-cloud-showers-heavy", Desc: "Slight rain"},
		63: {Icon: "fa-cloud-showers-heavy", Desc: "Moderate rain"},
		65: {Icon: "fa-cloud-showers-heavy", Desc: "Heavy rain"},
		71: {Icon: "fa-snowflake", Desc: "Slight snow"},
		73: {Icon: "fa-snowflake", Desc: "Moderate snow"},
		75: {Icon: "fa-snowflake", Desc: "Heavy snow"},
		80: {Icon: "fa-cloud-showers-heavy", Desc: "Slight showers"},
		81: {Icon: "fa-cloud-showers-heavy", Desc: "Moderate showers"},
		82: {Icon: "fa-cloud-showers-heavy", Desc: "Violent showers"},
		95: {Icon: "fa-bolt", Desc: "Thunderstorm"},
		96: {Icon: "fa-bolt", Desc: "Thunderstorm with hail"},
		99: {Icon: "fa-bolt", Desc: "Thunderstorm with heavy hail"},
	}

	if icon, exists := icons[code]; exists {
		return icon
	}
	return WeatherIconInfo{Icon: "fa-question", Desc: "Unknown"}
}
