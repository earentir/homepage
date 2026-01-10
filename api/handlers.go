package api

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/shirou/gopsutil/v3/disk"
)

// Handler holds the dependencies for API handlers.
type Handler struct {
	Config Config
}

// NewHandler creates a new API handler with the given configuration.
func NewHandler(cfg Config) *Handler {
	return &Handler{Config: cfg}
}

// RegisterHandlers registers all API handlers on the given mux.
func (h *Handler) RegisterHandlers(mux *http.ServeMux) {
	mux.HandleFunc("/api/summary", h.HandleSummary)
	mux.HandleFunc("/api/system", h.HandleSystem)
	mux.HandleFunc("/api/disks", h.HandleDisks)
	mux.HandleFunc("/api/disk", h.HandleDisk)
	mux.HandleFunc("/api/cpuid", h.HandleCPUID)
	mux.HandleFunc("/api/raminfo", h.HandleRAMInfo)
	mux.HandleFunc("/api/firmware", h.HandleFirmware)
	mux.HandleFunc("/api/systeminfo", h.HandleSystemInfo)
	mux.HandleFunc("/api/baseboard", h.HandleBaseboard)
	mux.HandleFunc("/api/weather", h.HandleWeather)
	mux.HandleFunc("/api/search-engines", h.HandleSearchEngines)
	mux.HandleFunc("/api/search/history/filter", h.HandleSearchHistoryFilter)
	mux.HandleFunc("/api/search/autocomplete", h.HandleSearchAutocomplete)
	mux.HandleFunc("/api/bookmarks", h.HandleBookmarks)
	mux.HandleFunc("/api/modules", h.HandleModules)
	mux.HandleFunc("/api/calendar/process", h.HandleCalendarProcess)
	mux.HandleFunc("/api/calendar/month", h.HandleCalendarMonth)
	mux.HandleFunc("/api/calendar/week", h.HandleCalendarWeek)
	mux.HandleFunc("/api/calendar/events-for-date", h.HandleCalendarEventsForDate)
	mux.HandleFunc("/api/todos/process", h.HandleTodosProcess)
	mux.HandleFunc("/api/geocode", h.HandleGeocode)
	mux.HandleFunc("/api/github", h.HandleGitHub)
	mux.HandleFunc("/api/github/repos", h.HandleGitHubRepos)
	mux.HandleFunc("/api/github/prs", h.HandleGitHubPRs)
	mux.HandleFunc("/api/github/commits", h.HandleGitHubCommits)
	mux.HandleFunc("/api/github/issues", h.HandleGitHubIssues)
	mux.HandleFunc("/api/github/stats", h.HandleGitHubStats)
	mux.HandleFunc("/api/ip", h.HandleIP)
	mux.HandleFunc("/api/favicon", h.HandleFavicon)
	mux.HandleFunc("/api/monitor", h.HandleMonitor)
	mux.HandleFunc("/api/snmp", h.HandleSNMP)
	mux.HandleFunc("/api/rss", h.HandleRSS)
	mux.HandleFunc("/api/config/upload", h.HandleConfigUpload)
	mux.HandleFunc("/api/config/list", h.HandleConfigList)
	mux.HandleFunc("/api/config/download", h.HandleConfigDownload)
	mux.HandleFunc("/api/config/delete", h.HandleConfigDelete)
	mux.HandleFunc("/api/storage/sync", h.HandleStorageSync)
	mux.HandleFunc("/api/storage/get", h.HandleStorageGet)
	mux.HandleFunc("/api/storage/get-all", h.HandleStorageGetAll)
	mux.HandleFunc("/api/storage/status", h.HandleStorageStatus)
	mux.HandleFunc("/api/layout/validate", h.HandleLayoutValidate)
	mux.HandleFunc("/api/layout/process", h.HandleLayoutProcess)
	mux.HandleFunc("/api/modules/process-prefs", h.HandleModulePrefsProcess)
	mux.HandleFunc("/api/modules/batch", h.HandleModulesBatch)
	mux.HandleFunc("/api/modules/config", h.HandleModuleConfig)
	mux.HandleFunc("/api/graphs/aggregate", h.HandleGraphHistoryAggregate)
	mux.HandleFunc("/api/storage/process", h.HandleStorageProcess)
	mux.HandleFunc("/api/utils/validate-url", h.HandleValidateURL)
	mux.HandleFunc("/api/utils/normalize-url", h.HandleNormalizeURL)
	mux.HandleFunc("/api/utils/validate-input", h.HandleValidateInput)
	mux.HandleFunc("/healthz", h.HandleHealthz)
}

// HandleSummary returns the API summary response.
func (h *Handler) HandleSummary(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	isLocal := IsLocalRequest(r)

	clientIP := GetClientIP(r)
	clientInfo := DetectClientInfo(r)
	if !isLocal && clientIP != "" {
		clientInfo.Hostname = ReverseDNS(clientIP, "1.1.1.1")
	}

	uptimeSec := GetSystemUptime()
	resp := APIRoot{
		Server: ServerInfo{
			Hostname:        MustHostname(),
			OS:              runtime.GOOS,
			Arch:            runtime.GOARCH,
			GoVersion:       runtime.Version(),
			UptimeSec:       uptimeSec,
			UptimeFormatted: FmtUptime(uptimeSec),
			Time:            time.Now().Format(time.RFC3339),
			IsLocal:         isLocal,
		},
		Client: clientInfo,
		Network: NetworkInfo{
			HostIPs: func() []HostIPInfo {
				if isLocal {
					return HostIPs()
				}
				if clientIP != "" {
					ipInfo := HostIPInfo{IP: clientIP}
					if clientInfo.Hostname != "" {
						ipInfo.PTR = clientInfo.Hostname
					}
					return []HostIPInfo{ipInfo}
				}
				return []HostIPInfo{}
			}(),
		},
		Public: PublicIPInfo{},
		Weather: WeatherInfo{
			Enabled: h.Config.Weather.Enabled,
		},
	}

	// Public IP
	ip, err := PublicIP(ctx, h.Config.PublicIPTimeout)
	if err != nil {
		resp.Public.Error = err.Error()
	} else {
		resp.Public.IP = ip
		resp.Public.PTR = ReverseDNS(ip, "1.1.1.1")
	}

	// Weather
	if h.Config.Weather.Enabled && h.Config.Weather.Lat != "" && h.Config.Weather.Lon != "" {
		wd, err := OpenMeteoSummary(ctx, h.Config.Weather.Lat, h.Config.Weather.Lon)
		if err != nil {
			resp.Weather.Error = err.Error()
		} else {
			resp.Weather.Summary = wd.Summary
			resp.Weather.Forecast = wd.Forecast
		}
	} else if h.Config.Weather.Enabled {
		resp.Weather.Summary = "Set your location in Preferences to enable weather."
	}

	// System metrics
	resp.System = GetSystemMetrics(ctx)

	WriteJSON(w, resp)
}

// HandleSystem returns system metrics.
func (h *Handler) HandleSystem(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	resp := GetSystemMetrics(ctx)
	WriteJSON(w, resp)
}

// HandleDisks returns available disk partitions.
func (h *Handler) HandleDisks(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	partitions, err := disk.PartitionsWithContext(ctx, false)
	if err != nil {
		WriteJSON(w, map[string]any{"error": err.Error(), "partitions": []any{}})
		return
	}

	var result []DiskPartition
	for _, p := range partitions {
		if p.Mountpoint != "" && p.Mountpoint != "/proc" && p.Mountpoint != "/sys" && p.Mountpoint != "/dev" {
			result = append(result, DiskPartition{
				Device:     p.Device,
				MountPoint: p.Mountpoint,
				FSType:     p.Fstype,
			})
		}
	}
	WriteJSON(w, map[string]any{"partitions": result})
}

// HandleDisk returns disk usage for a specific mount point.
func (h *Handler) HandleDisk(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	mountPoint := r.URL.Query().Get("mount")
	if mountPoint == "" {
		mountPoint = "/"
	}

	usage, err := disk.UsageWithContext(ctx, mountPoint)
	if err != nil {
		WriteJSON(w, DiskInfo{
			MountPoint: mountPoint,
			Error:      err.Error(),
		})
		return
	}

	WriteJSON(w, DiskInfo{
		MountPoint:     mountPoint,
		Total:          usage.Total,
		Used:           usage.Used,
		Free:           usage.Free,
		Percent:        usage.UsedPercent,
		TotalFormatted: FormatBytes(usage.Total),
		UsedFormatted:  FormatBytes(usage.Used),
		FreeFormatted:  FormatBytes(usage.Free),
	})
}

// HandleCPUID returns CPU details.
func (h *Handler) HandleCPUID(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	resp := GetCPUDetails(ctx)
	WriteJSON(w, resp)
}

// HandleRAMInfo returns RAM module information.
func (h *Handler) HandleRAMInfo(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	resp := GetSMBIOSRAMInfo(ctx)
	WriteJSON(w, resp)
}

// HandleFirmware returns BIOS/firmware information.
func (h *Handler) HandleFirmware(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	resp := GetSMBIOSFirmwareInfo(ctx)
	WriteJSON(w, resp)
}

// HandleSystemInfo returns system information.
func (h *Handler) HandleSystemInfo(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	resp := GetSMBIOSSystemInfo(ctx)
	WriteJSON(w, resp)
}

// HandleBaseboard returns baseboard information.
func (h *Handler) HandleBaseboard(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	resp := GetSMBIOSBaseboardInfo(ctx)
	WriteJSON(w, resp)
}

// HandleWeather returns weather data.
func (h *Handler) HandleWeather(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	resp := WeatherInfo{
		Enabled: true,
	}

	lat := r.URL.Query().Get("lat")
	lon := r.URL.Query().Get("lon")

	if lat == "" || lon == "" {
		lat = h.Config.Weather.Lat
		lon = h.Config.Weather.Lon
	}

	if lat != "" && lon != "" {
		var wd WeatherData
		var err error

		provider := h.Config.Weather.Provider
		if provider == "" {
			provider = "openmeteo"
		}

		switch provider {
		case "openweathermap":
			wd, err = OpenWeatherMapSummary(ctx, lat, lon, h.Config.Weather.APIKey)
		case "weatherapi":
			wd, err = WeatherAPISummary(ctx, lat, lon, h.Config.Weather.APIKey)
		default:
			wd, err = OpenMeteoSummary(ctx, lat, lon)
		}

		if err != nil {
			resp.Error = err.Error()
		} else {
			resp.Summary = wd.Summary
			resp.Forecast = wd.Forecast
			resp.Current = wd.Current
			resp.Today = wd.Today
			resp.Tomorrow = wd.Tomorrow
		}
	} else {
		resp.Summary = "Set your location in Preferences to enable weather."
	}
	WriteJSON(w, resp)
}

// HandleGeocode handles geocoding requests.
func (h *Handler) HandleGeocode(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	query := r.URL.Query().Get("q")
	if query == "" {
		WriteJSON(w, map[string]string{"error": "Missing query parameter 'q'"})
		return
	}

	results, err := GeocodeCity(ctx, query)
	if err != nil {
		WriteJSON(w, map[string]string{"error": err.Error()})
		return
	}
	WriteJSON(w, results)
}

// HandleGitHub returns GitHub repository information.
func (h *Handler) HandleGitHub(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var resp GitHubInfo
	userRepos, orgRepos, err := FetchGitHubRepos(ctx)
	resp.UserRepos = userRepos
	resp.OrgRepos = orgRepos
	if err != nil {
		GetDebugLogger().Logf("github", "fetch error: %v", err)
		if userRepos.Error == "" {
			resp.UserRepos.Error = err.Error()
		}
		if orgRepos.Error == "" {
			resp.OrgRepos.Error = err.Error()
		}
	}
	WriteJSON(w, resp)
}

// HandleGitHubRepos returns repos for a specific user/org.
func (h *Handler) HandleGitHubRepos(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	name := r.URL.Query().Get("name")
	repoType := r.URL.Query().Get("type")
	token := r.URL.Query().Get("token")

	if name == "" {
		WriteJSON(w, map[string]string{"error": "Missing 'name' parameter"})
		return
	}
	if repoType == "" {
		repoType = "user"
	}

	repos, err := FetchGitHubReposForName(ctx, name, repoType, token)
	if err != nil {
		WriteJSON(w, map[string]any{"error": err.Error(), "repos": []any{}, "total": 0})
		return
	}
	WriteJSON(w, repos)
}

// HandleGitHubPRs returns pull requests for a user/org.
func (h *Handler) HandleGitHubPRs(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	name := r.URL.Query().Get("name")
	accountType := r.URL.Query().Get("type")
	token := r.URL.Query().Get("token")

	if name == "" {
		WriteJSON(w, map[string]string{"error": "Missing 'name' parameter"})
		return
	}

	prs, err := FetchGitHubPRs(ctx, name, accountType, token)
	if err != nil {
		WriteJSON(w, map[string]any{"error": err.Error(), "items": []any{}, "total": 0})
		return
	}
	WriteJSON(w, prs)
}

// HandleGitHubCommits returns commits for a user/org.
func (h *Handler) HandleGitHubCommits(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	name := r.URL.Query().Get("name")
	accountType := r.URL.Query().Get("type")
	token := r.URL.Query().Get("token")

	if name == "" {
		WriteJSON(w, map[string]string{"error": "Missing 'name' parameter"})
		return
	}

	commits, err := FetchGitHubCommits(ctx, name, accountType, token)
	if err != nil {
		WriteJSON(w, map[string]any{"error": err.Error(), "items": []any{}, "total": 0})
		return
	}
	WriteJSON(w, commits)
}

// HandleGitHubIssues returns issues for a user/org.
func (h *Handler) HandleGitHubIssues(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	name := r.URL.Query().Get("name")
	accountType := r.URL.Query().Get("type")
	token := r.URL.Query().Get("token")

	if name == "" {
		WriteJSON(w, map[string]string{"error": "Missing 'name' parameter"})
		return
	}

	issues, err := FetchGitHubIssues(ctx, name, accountType, token)
	if err != nil {
		WriteJSON(w, map[string]any{"error": err.Error(), "items": []any{}, "total": 0})
		return
	}
	WriteJSON(w, issues)
}

// HandleGitHubStats returns stats for a repo.
func (h *Handler) HandleGitHubStats(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	name := r.URL.Query().Get("name")
	token := r.URL.Query().Get("token")

	if name == "" {
		WriteJSON(w, map[string]string{"error": "Missing 'name' parameter"})
		return
	}

	stats, err := FetchGitHubStats(ctx, name, token)
	if err != nil {
		WriteJSON(w, map[string]any{"error": err.Error()})
		return
	}
	WriteJSON(w, stats)
}

// HandleIP returns IP information.
func (h *Handler) HandleIP(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	isLocal := IsLocalRequest(r)
	clientIP := GetClientIP(r)

	var networkIPs []HostIPInfo
	if isLocal {
		networkIPs = HostIPs()
	} else if clientIP != "" {
		hostname := ReverseDNS(clientIP, "1.1.1.1")
		ipInfo := HostIPInfo{IP: clientIP}
		if hostname != "" {
			ipInfo.PTR = hostname
		}
		networkIPs = []HostIPInfo{ipInfo}
	}

	resp := struct {
		Network NetworkInfo  `json:"network"`
		Public  PublicIPInfo `json:"public"`
	}{
		Network: NetworkInfo{
			HostIPs: networkIPs,
		},
		Public: PublicIPInfo{},
	}

	ip, err := PublicIP(ctx, h.Config.PublicIPTimeout)
	if err != nil {
		resp.Public.Error = err.Error()
	} else {
		resp.Public.IP = ip
		resp.Public.PTR = ReverseDNS(ip, "1.1.1.1")
	}
	WriteJSON(w, resp)
}

// HandleFavicon fetches a favicon for a URL.
func (h *Handler) HandleFavicon(w http.ResponseWriter, r *http.Request) {
	targetURL := r.URL.Query().Get("url")
	log.Printf("[favicon] Request for URL: %s", targetURL)

	if targetURL == "" {
		log.Printf("[favicon] Error: Missing 'url' parameter")
		WriteJSON(w, map[string]string{"error": "Missing 'url' parameter"})
		return
	}

	parsed, err := url.Parse(targetURL)
	if err != nil {
		log.Printf("[favicon] Error parsing URL: %v", err)
		WriteJSON(w, map[string]string{"error": "Invalid URL"})
		return
	}
	origin := parsed.Scheme + "://" + parsed.Host
	log.Printf("[favicon] Origin: %s", origin)

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	faviconData, contentType, err := FetchFavicon(ctx, origin)
	if err != nil {
		log.Printf("[favicon] Error fetching favicon: %v", err)
		WriteJSON(w, map[string]string{"error": err.Error()})
		return
	}

	log.Printf("[favicon] Success! Got %d bytes, type: %s", len(faviconData), contentType)

	base64Data := base64.StdEncoding.EncodeToString(faviconData)
	dataURL := "data:" + contentType + ";base64," + base64Data

	WriteJSON(w, map[string]string{"favicon": dataURL})
}

// HandleMonitor handles service monitoring requests.
func (h *Handler) HandleMonitor(w http.ResponseWriter, r *http.Request) {
	monType := r.URL.Query().Get("type")

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	var result MonitorResult

	switch monType {
	case "http":
		targetURL := r.URL.Query().Get("url")
		if targetURL == "" {
			result.Error = "Missing 'url' parameter"
			WriteJSON(w, result)
			return
		}
		httpResult, err := CheckHTTP(ctx, targetURL)
		if err != nil {
			result.Error = err.Error()
			if httpResult != nil {
				result.Latency = httpResult.Latency
			}
		} else {
			result.Success = true
			result.Latency = httpResult.Latency
			if httpResult.SSLExpiry != nil {
				result.SSLExpiry = httpResult.SSLExpiry.Format(time.RFC3339)
			}
			if httpResult.SSLError != "" {
				result.SSLError = httpResult.SSLError
			}
		}

	case "port":
		host := r.URL.Query().Get("host")
		port := r.URL.Query().Get("port")
		if host == "" || port == "" {
			result.Error = "Missing 'host' or 'port' parameter"
			WriteJSON(w, result)
			return
		}
		latency, err := CheckPort(ctx, host, port)
		if err != nil {
			result.Error = err.Error()
		} else {
			result.Success = true
			result.Latency = latency
		}

	case "ping":
		host := r.URL.Query().Get("host")
		if host == "" {
			result.Error = "Missing 'host' parameter"
			WriteJSON(w, result)
			return
		}
		latency, err := CheckPing(ctx, host)
		if err != nil {
			result.Error = err.Error()
		} else {
			result.Success = true
			result.Latency = latency
		}

	default:
		result.Error = "Invalid monitor type"
	}

	WriteJSON(w, result)
}

// HandleSNMP handles SNMP query requests.
func (h *Handler) HandleSNMP(w http.ResponseWriter, r *http.Request) {
	host := r.URL.Query().Get("host")
	port := r.URL.Query().Get("port")
	community := r.URL.Query().Get("community")
	oid := r.URL.Query().Get("oid")

	if host == "" || port == "" || community == "" || oid == "" {
		WriteJSON(w, map[string]any{
			"success": false,
			"error":   "Missing required parameters: host, port, community, oid",
		})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	result, err := QuerySNMP(ctx, host, port, community, oid)
	if err != nil {
		WriteJSON(w, map[string]any{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	WriteJSON(w, map[string]any{
		"success": true,
		"value":   result,
	})
}

// HandleRSS handles RSS feed requests.
func (h *Handler) HandleRSS(w http.ResponseWriter, r *http.Request) {
	feedURL := r.URL.Query().Get("url")
	if feedURL == "" {
		WriteJSON(w, map[string]any{
			"error": "Missing required parameter: url",
		})
		return
	}

	count := 5
	if countStr := r.URL.Query().Get("count"); countStr != "" {
		if c, err := strconv.Atoi(countStr); err == nil && c > 0 && c <= 20 {
			count = c
		}
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	items, err := FetchRSSFeed(ctx, feedURL, count)
	if err != nil {
		WriteJSON(w, map[string]any{
			"error": err.Error(),
		})
		return
	}

	WriteJSON(w, map[string]any{
		"items": items,
	})
}

// HandleConfigUpload handles config upload.
func (h *Handler) HandleConfigUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	name := r.URL.Query().Get("name")
	if name == "" {
		WriteJSON(w, map[string]string{"error": "Missing 'name' parameter"})
		return
	}

	if !regexp.MustCompile(`^[a-zA-Z0-9_-]+$`).MatchString(name) {
		WriteJSON(w, map[string]string{"error": "Invalid config name (only alphanumeric, dash, underscore allowed)"})
		return
	}

	var configData map[string]any
	if err := json.NewDecoder(r.Body).Decode(&configData); err != nil {
		WriteJSON(w, map[string]string{"error": "Invalid JSON: " + err.Error()})
		return
	}

	configsDir := "configs"
	if err := os.MkdirAll(configsDir, 0755); err != nil {
		log.Printf("Failed to create configs directory: %v", err)
		WriteJSON(w, map[string]string{"error": "Failed to save config"})
		return
	}

	configPath := configsDir + "/" + name + ".json"
	configJSON, err := json.MarshalIndent(configData, "", "  ")
	if err != nil {
		WriteJSON(w, map[string]string{"error": "Failed to encode config: " + err.Error()})
		return
	}

	if err := os.WriteFile(configPath, configJSON, 0644); err != nil {
		log.Printf("Failed to write config file: %v", err)
		WriteJSON(w, map[string]string{"error": "Failed to save config"})
		return
	}

	WriteJSON(w, map[string]string{"success": "Config uploaded successfully"})
}

// HandleConfigList lists available configs.
func (h *Handler) HandleConfigList(w http.ResponseWriter, r *http.Request) {
	configsDir := "configs"
	files, err := os.ReadDir(configsDir)
	if err != nil {
		WriteJSON(w, map[string]any{"configs": []string{}})
		return
	}

	var configs []string
	for _, file := range files {
		if !file.IsDir() && strings.HasSuffix(file.Name(), ".json") {
			name := strings.TrimSuffix(file.Name(), ".json")
			configs = append(configs, name)
		}
	}

	WriteJSON(w, map[string]any{"configs": configs})
}

// HandleConfigDownload downloads a config.
func (h *Handler) HandleConfigDownload(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("name")
	if name == "" {
		WriteJSON(w, map[string]string{"error": "Missing 'name' parameter"})
		return
	}

	if !regexp.MustCompile(`^[a-zA-Z0-9_-]+$`).MatchString(name) {
		WriteJSON(w, map[string]string{"error": "Invalid config name"})
		return
	}

	configPath := "configs/" + name + ".json"
	data, err := os.ReadFile(configPath)
	if err != nil {
		if os.IsNotExist(err) {
			WriteJSON(w, map[string]string{"error": "Config not found"})
		} else {
			WriteJSON(w, map[string]string{"error": "Failed to read config"})
		}
		return
	}

	var configData map[string]any
	if err := json.Unmarshal(data, &configData); err != nil {
		WriteJSON(w, map[string]string{"error": "Invalid config file: " + err.Error()})
		return
	}

	WriteJSON(w, configData)
}

// HandleConfigDelete deletes a config.
func (h *Handler) HandleConfigDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	name := r.URL.Query().Get("name")
	if name == "" {
		WriteJSON(w, map[string]string{"error": "Missing 'name' parameter"})
		return
	}

	if !regexp.MustCompile(`^[a-zA-Z0-9_-]+$`).MatchString(name) {
		WriteJSON(w, map[string]string{"error": "Invalid config name"})
		return
	}

	configPath := "configs/" + name + ".json"
	if err := os.Remove(configPath); err != nil {
		if os.IsNotExist(err) {
			WriteJSON(w, map[string]string{"error": "Config not found"})
		} else {
			WriteJSON(w, map[string]string{"error": "Failed to delete config"})
		}
		return
	}

	WriteJSON(w, map[string]string{"success": "Config deleted successfully"})
}

// HandleStorageSync handles storage sync requests from frontend.
func (h *Handler) HandleStorageSync(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var syncData struct {
		Key       string      `json:"key"`
		Value     interface{} `json:"value"`
		Version   int64       `json:"version"`
		Timestamp int64       `json:"timestamp"`
	}

	if err := json.NewDecoder(r.Body).Decode(&syncData); err != nil {
		WriteJSON(w, map[string]string{"error": "Invalid JSON: " + err.Error()})
		return
	}

	if syncData.Key == "" {
		WriteJSON(w, map[string]string{"error": "Missing 'key' field"})
		return
	}

	// Process and validate data based on key type
	var processedValue interface{} = syncData.Value
	var processingErrors []string

	switch syncData.Key {
	case "layoutConfig":
		var layoutConfig LayoutConfig
		configJSON, err := json.Marshal(syncData.Value)
		if err == nil {
			if err := json.Unmarshal(configJSON, &layoutConfig); err == nil {
				// Validate
				valid, errorMsg := ValidateLayoutConfig(layoutConfig)
				if !valid {
					WriteJSON(w, map[string]any{
						"error": "Invalid layout configuration: " + errorMsg,
						"valid": false,
					})
					return
				}
				// Process (remove disabled modules)
				storage := GetStorage()
				var modulePrefs map[string]interface{}
				if item, exists := storage.Get("modulePrefs"); exists {
					if prefs, ok := item.Value.(map[string]interface{}); ok {
						modulePrefs = prefs
					}
				}
				processedConfig := ProcessLayoutConfig(layoutConfig, modulePrefs)
				processedValue = processedConfig
			}
		}
	case "modulePrefs":
		if prefs, ok := syncData.Value.(map[string]interface{}); ok {
			processed, errors := ProcessModulePrefs(prefs)
			processedValue = processed
			processingErrors = errors
			// Reload timer manager preferences
			GetTimerManager().loadPreferences()
		}
	case "cpuHistory", "ramHistory", "diskHistory":
		// Graph history - aggregate if needed
		var graphData GraphHistoryData
		if syncData.Key == "cpuHistory" {
			if history, ok := syncData.Value.([]interface{}); ok {
				cpuHistory := make([]float64, 0, len(history))
				for _, v := range history {
					if f, ok := v.(float64); ok {
						cpuHistory = append(cpuHistory, f)
					}
				}
				graphData.CPUHistory = cpuHistory
			}
		} else if syncData.Key == "ramHistory" {
			if history, ok := syncData.Value.([]interface{}); ok {
				ramHistory := make([]float64, 0, len(history))
				for _, v := range history {
					if f, ok := v.(float64); ok {
						ramHistory = append(ramHistory, f)
					}
				}
				graphData.RAMHistory = ramHistory
			}
		} else if syncData.Key == "diskHistory" {
			if history, ok := syncData.Value.(map[string]interface{}); ok {
				diskHistory := make(map[string][]float64)
				for key, val := range history {
					if arr, ok := val.([]interface{}); ok {
						diskArr := make([]float64, 0, len(arr))
						for _, v := range arr {
							if f, ok := v.(float64); ok {
								diskArr = append(diskArr, f)
							}
						}
						diskHistory[key] = diskArr
					}
				}
				graphData.DiskHistory = diskHistory
			}
		}
		aggregated := AggregateGraphHistory(graphData)
		if syncData.Key == "cpuHistory" {
			processedValue = aggregated.CPUHistory
		} else if syncData.Key == "ramHistory" {
			processedValue = aggregated.RAMHistory
		} else {
			processedValue = aggregated.DiskHistory
		}
	}

	// Store processed value in backend storage
	globalStorage.Set(syncData.Key, processedValue, syncData.Version)

	// Get the stored item to return the actual version (in case of conflict resolution)
	item, exists := globalStorage.Get(syncData.Key)
	if !exists {
		WriteJSON(w, map[string]string{"error": "Failed to store data"})
		return
	}

	response := map[string]interface{}{
		"success": true,
		"version": item.Version,
		"key":     syncData.Key,
	}
	if len(processingErrors) > 0 {
		response["processingErrors"] = processingErrors
	}
	WriteJSON(w, response)
}

// HandleStorageGet handles storage get requests from frontend.
func (h *Handler) HandleStorageGet(w http.ResponseWriter, r *http.Request) {
	key := r.URL.Query().Get("key")
	if key == "" {
		WriteJSON(w, map[string]string{"error": "Missing 'key' parameter"})
		return
	}

	item, exists := globalStorage.Get(key)
	if !exists {
		WriteJSON(w, map[string]string{"error": "Key not found"})
		return
	}

	WriteJSON(w, map[string]interface{}{
		"key":       key,
		"value":     item.Value,
		"version":   item.Version,
		"timestamp": item.LastModified.Unix(),
	})
}

// HandleStorageGetAll handles requests to get all stored items.
func (h *Handler) HandleStorageGetAll(w http.ResponseWriter, _ *http.Request) {
	allItems := globalStorage.GetAll()

	items := make([]map[string]interface{}, 0, len(allItems))
	for key, item := range allItems {
		items = append(items, map[string]interface{}{
			"key":       key,
			"value":     item.Value,
			"version":   item.Version,
			"timestamp": item.LastModified.Unix(),
		})
	}

	WriteJSON(w, map[string]interface{}{
		"items": items,
	})
}

// HandleStorageStatus returns the status of the storage system.
func (h *Handler) HandleStorageStatus(w http.ResponseWriter, _ *http.Request) {
	allItems := globalStorage.GetAll()
	
	WriteJSON(w, map[string]interface{}{
		"enabled":    true,
		"itemCount":  len(allItems),
		"hasData":    len(allItems) > 0,
		"wsConnected": true, // This could be enhanced to check actual WS connections
	})
}

// HandleSearchEngines returns the list of available search engines.
func (h *Handler) HandleSearchEngines(w http.ResponseWriter, _ *http.Request) {
	engines := GetSearchEngines()
	WriteJSON(w, map[string]any{"engines": engines})
}

// SearchHistoryItem represents a search history item.
type SearchHistoryItem struct {
	Term      string `json:"term"`
	Engine    string `json:"engine"`
	Timestamp string `json:"timestamp"`
}

// HandleSearchHistoryFilter filters search history based on a filter term.
func (h *Handler) HandleSearchHistoryFilter(w http.ResponseWriter, r *http.Request) {
	var history []SearchHistoryItem
	if err := json.NewDecoder(r.Body).Decode(&history); err != nil {
		WriteJSON(w, map[string]any{"error": "Invalid request body: " + err.Error()})
		return
	}

	filter := strings.ToLower(r.URL.Query().Get("filter"))
	if filter == "" {
		// Return all history if no filter
		WriteJSON(w, map[string]any{"history": history})
		return
	}

	// Filter history items where term contains the filter (case-insensitive)
	filtered := make([]SearchHistoryItem, 0)
	for _, item := range history {
		if strings.Contains(strings.ToLower(item.Term), filter) {
			filtered = append(filtered, item)
		}
	}

	WriteJSON(w, map[string]any{"history": filtered})
}

// HandleSearchAutocomplete returns autocomplete suggestions from search history and bookmarks.
func (h *Handler) HandleSearchAutocomplete(w http.ResponseWriter, r *http.Request) {
	var history []SearchHistoryItem
	if err := json.NewDecoder(r.Body).Decode(&history); err != nil {
		WriteJSON(w, map[string]any{"error": "Invalid request body: " + err.Error()})
		return
	}

	term := strings.ToLower(r.URL.Query().Get("term"))
	if term == "" {
		WriteJSON(w, map[string]any{"suggestions": []SearchHistoryItem{}})
		return
	}

	// Filter history items where term contains the search term (case-insensitive)
	matched := make([]SearchHistoryItem, 0)
	for _, item := range history {
		if item.Term != "" && strings.Contains(strings.ToLower(item.Term), term) {
			matched = append(matched, item)
		}
	}

	// Remove duplicates (by term, case-insensitive) and reverse to show newest first
	historyItems := make([]SearchHistoryItem, 0)
	seen := make(map[string]bool)
	for i := len(matched) - 1; i >= 0; i-- {
		item := matched[i]
		key := strings.ToLower(item.Term)
		if !seen[key] {
			seen[key] = true
			historyItems = append(historyItems, item)
		}
	}

	// Get and filter bookmarks
	bookmarkItems := make([]SearchHistoryItem, 0)
	// Detect browser from User-Agent to prioritize that browser's bookmarks
	userAgent := r.Header.Get("User-Agent")
	preferredBrowser := DetectBrowserFromUserAgent(userAgent)
	log.Printf("[BOOKMARKS] User-Agent: %s", userAgent)
	log.Printf("[BOOKMARKS] Detected browser: %s", preferredBrowser)
	
	bookmarks, err := GetBookmarks(preferredBrowser)
	log.Printf("[BOOKMARKS] GetBookmarks result: count=%d, error=%v", len(bookmarks), err)
	
	if err == nil && len(bookmarks) > 0 {
		filteredBookmarks := FilterBookmarks(bookmarks, term)
		log.Printf("[BOOKMARKS] After filtering with term '%s': %d bookmarks match", term, len(filteredBookmarks))
		
		// Convert bookmarks to SearchHistoryItem format
		for _, bookmark := range filteredBookmarks {
			// Use bookmark title as the term, and mark it as a bookmark
			bookmarkItem := SearchHistoryItem{
				Term:      bookmark.Title,
				Engine:    "Bookmark",
				Timestamp: bookmark.URL, // Store URL in timestamp field
			}
			// Check if we already have this exact bookmark URL in history to avoid duplicates
			// Use URL as key since titles might be duplicated across different URLs
			key := strings.ToLower(bookmark.URL)
			if !seen[key] {
				seen[key] = true
				bookmarkItems = append(bookmarkItems, bookmarkItem)
			}
		}
		log.Printf("[BOOKMARKS] Added %d bookmark items to autocomplete results", len(bookmarkItems))
	} else {
		if err != nil {
			log.Printf("[BOOKMARKS] Error loading bookmarks: %v", err)
		} else {
			log.Printf("[BOOKMARKS] No bookmarks found (count: %d)", len(bookmarks))
		}
	}

	// Combine results: prioritize bookmarks, then history
	// Limit history to 7 items to ensure bookmarks can appear
	maxHistory := 7
	if len(historyItems) > maxHistory {
		historyItems = historyItems[:maxHistory]
	}

	// Combine: bookmarks first (up to 5), then history (up to 7), total max 10
	uniqueItems := make([]SearchHistoryItem, 0)
	maxBookmarks := 5
	if len(bookmarkItems) > maxBookmarks {
		bookmarkItems = bookmarkItems[:maxBookmarks]
	}
	uniqueItems = append(uniqueItems, bookmarkItems...)
	uniqueItems = append(uniqueItems, historyItems...)

	// Final limit to 10 items
	if len(uniqueItems) > 10 {
		uniqueItems = uniqueItems[:10]
	}

	WriteJSON(w, map[string]any{"suggestions": uniqueItems})
}

// HandleBookmarks returns all bookmarks for debugging purposes.
func (h *Handler) HandleBookmarks(w http.ResponseWriter, r *http.Request) {
	// Optionally filter by browser from query parameter or User-Agent
	preferredBrowser := r.URL.Query().Get("browser")
	if preferredBrowser == "" {
		userAgent := r.Header.Get("User-Agent")
		preferredBrowser = DetectBrowserFromUserAgent(userAgent)
	}

	bookmarks, err := GetBookmarks(preferredBrowser)
	if err != nil {
		WriteJSON(w, map[string]any{
			"error":            err.Error(),
			"bookmarks":        []Bookmark{},
			"count":            0,
			"preferredBrowser": preferredBrowser,
		})
		return
	}

	WriteJSON(w, map[string]any{
		"bookmarks":        bookmarks,
		"count":            len(bookmarks),
		"error":            nil,
		"preferredBrowser": preferredBrowser,
	})
}

// HandleModules returns metadata for all available modules.
func (h *Handler) HandleModules(w http.ResponseWriter, _ *http.Request) {
	modules := GetModuleMetadata()
	WriteJSON(w, map[string]any{"modules": modules})
}

// HandleCalendarProcess processes calendar events and returns calculated data.
func (h *Handler) HandleCalendarProcess(w http.ResponseWriter, r *http.Request) {
	var events []CalendarEvent
	if err := json.NewDecoder(r.Body).Decode(&events); err != nil {
		WriteJSON(w, map[string]any{"error": "Invalid request body: " + err.Error()})
		return
	}

	count := 5
	if countStr := r.URL.Query().Get("count"); countStr != "" {
		if parsed, err := strconv.Atoi(countStr); err == nil && parsed > 0 {
			count = parsed
		}
	}

	processed := ProcessCalendarEvents(events, count)
	WriteJSON(w, processed)
}

// HandleCalendarMonth returns month calendar data.
func (h *Handler) HandleCalendarMonth(w http.ResponseWriter, r *http.Request) {
	yearStr := r.URL.Query().Get("year")
	monthStr := r.URL.Query().Get("month")
	var events []CalendarEvent

	if err := json.NewDecoder(r.Body).Decode(&events); err != nil {
		WriteJSON(w, map[string]any{"error": "Invalid request body: " + err.Error()})
		return
	}

	now := time.Now()
	year := now.Year()
	month := int(now.Month()) - 1

	if yearStr != "" {
		if parsed, err := strconv.Atoi(yearStr); err == nil {
			year = parsed
		}
	}
	if monthStr != "" {
		if parsed, err := strconv.Atoi(monthStr); err == nil && parsed >= 0 && parsed < 12 {
			month = parsed
		}
	}

	data := GetMonthCalendarData(year, month, events)
	WriteJSON(w, data)
}

// HandleCalendarWeek returns week calendar data.
func (h *Handler) HandleCalendarWeek(w http.ResponseWriter, r *http.Request) {
	var events []CalendarEvent
	if err := json.NewDecoder(r.Body).Decode(&events); err != nil {
		WriteJSON(w, map[string]any{"error": "Invalid request body: " + err.Error()})
		return
	}

	weekStartStr := r.URL.Query().Get("weekStart")
	workWeekOnly := r.URL.Query().Get("workWeekOnly") == "true"
	startDay := 1 // Default Monday
	if startDayStr := r.URL.Query().Get("startDay"); startDayStr != "" {
		if parsed, err := strconv.Atoi(startDayStr); err == nil && parsed >= 0 && parsed <= 6 {
			startDay = parsed
		}
	}

	var weekStart time.Time
	if weekStartStr != "" {
		parsed, err := time.Parse("2006-01-02", weekStartStr)
		if err == nil {
			weekStart = parsed
		} else {
			weekStart = time.Now()
		}
	} else {
		weekStart = time.Now()
	}

	data := GetWeekCalendarData(weekStart, workWeekOnly, startDay, events)
	WriteJSON(w, data)
}

// HandleCalendarEventsForDate returns events for a specific date.
func (h *Handler) HandleCalendarEventsForDate(w http.ResponseWriter, r *http.Request) {
	dateStr := r.URL.Query().Get("date")
	if dateStr == "" {
		WriteJSON(w, map[string]any{"error": "Missing 'date' parameter"})
		return
	}

	var events []CalendarEvent
	if err := json.NewDecoder(r.Body).Decode(&events); err != nil {
		WriteJSON(w, map[string]any{"error": "Invalid request body: " + err.Error()})
		return
	}

	dayEvents := GetEventsForDate(events, dateStr)
	WriteJSON(w, map[string]any{"events": dayEvents})
}

// HandleTodosProcess processes todos and returns sorted/prioritized todos.
func (h *Handler) HandleTodosProcess(w http.ResponseWriter, r *http.Request) {
	var todos []Todo
	if err := json.NewDecoder(r.Body).Decode(&todos); err != nil {
		WriteJSON(w, map[string]any{"error": "Invalid request body: " + err.Error()})
		return
	}

	count := 5
	if countStr := r.URL.Query().Get("count"); countStr != "" {
		if parsed, err := strconv.Atoi(countStr); err == nil && parsed > 0 {
			count = parsed
		}
	}

	includeCompleted := r.URL.Query().Get("includeCompleted") == "true"

	processed := ProcessTodos(todos, count, includeCompleted)
	WriteJSON(w, map[string]any{"todos": processed})
}

// HandleValidateURL validates if a string is a valid URL or IP address.
func (h *Handler) HandleValidateURL(w http.ResponseWriter, r *http.Request) {
	input := r.URL.Query().Get("input")
	if input == "" {
		WriteJSON(w, map[string]any{"valid": false, "error": "Missing 'input' parameter"})
		return
	}

	valid := IsValidURLOrIP(input)
	WriteJSON(w, map[string]any{"valid": valid, "input": input})
}

// HandleNormalizeURL normalizes a URL by adding http:// if no protocol is present.
func (h *Handler) HandleNormalizeURL(w http.ResponseWriter, r *http.Request) {
	input := r.URL.Query().Get("input")
	if input == "" {
		WriteJSON(w, map[string]any{"normalized": "", "error": "Missing 'input' parameter"})
		return
	}

	normalized := NormalizeURL(input)
	WriteJSON(w, map[string]any{"normalized": normalized, "input": input})
}

// LayoutConfig represents the layout configuration structure.
type LayoutConfig struct {
	MaxWidth int          `json:"maxWidth"`
	Rows     []LayoutRow  `json:"rows"`
}

// LayoutRow represents a row in the layout.
type LayoutRow struct {
	Cols    int           `json:"cols"`
	Modules []interface{} `json:"modules"` // Can be string (module ID), []string (split modules), or null
}

// ValidateLayoutConfig validates a layout configuration.
func ValidateLayoutConfig(config LayoutConfig) (bool, string) {
	// Validate maxWidth
	if config.MaxWidth < 0 || config.MaxWidth > 100 {
		return false, "maxWidth must be between 0 and 100"
	}

	// Validate rows
	if len(config.Rows) == 0 {
		return false, "layout must have at least one row"
	}

	for i, row := range config.Rows {
		// Validate cols
		if row.Cols < 1 || row.Cols > 12 {
			return false, fmt.Sprintf("row %d: cols must be between 1 and 12", i+1)
		}

		// Validate modules array
		if row.Modules == nil {
			return false, fmt.Sprintf("row %d: modules array cannot be null", i+1)
		}

		// Validate module slots
		for j, moduleSlot := range row.Modules {
			if moduleSlot == nil {
				continue // null is allowed (empty slot)
			}

			switch v := moduleSlot.(type) {
			case string:
				// Single module ID - validate it's not empty
				if v == "" {
					return false, fmt.Sprintf("row %d, column %d: module ID cannot be empty string", i+1, j+1)
				}
			case []interface{}:
				// Split modules - validate array
				if len(v) == 0 {
					return false, fmt.Sprintf("row %d, column %d: split modules array cannot be empty", i+1, j+1)
				}
				// Validate each module ID in split
				for k, modID := range v {
					if modIDStr, ok := modID.(string); ok {
						if modIDStr == "" {
							return false, fmt.Sprintf("row %d, column %d, split %d: module ID cannot be empty string", i+1, j+1, k+1)
						}
					} else {
						return false, fmt.Sprintf("row %d, column %d, split %d: module ID must be a string", i+1, j+1, k+1)
					}
				}
			default:
				return false, fmt.Sprintf("row %d, column %d: module slot must be a string, array, or null", i+1, j+1)
			}
		}
	}

	return true, ""
}

// HandleLayoutValidate validates a layout configuration.
func (h *Handler) HandleLayoutValidate(w http.ResponseWriter, r *http.Request) {
	var config LayoutConfig
	if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
		WriteJSON(w, map[string]any{
			"valid": false,
			"error": "Invalid JSON: " + err.Error(),
		})
		return
	}

	valid, errorMsg := ValidateLayoutConfig(config)
	if valid {
		WriteJSON(w, map[string]any{
			"valid": true,
		})
	} else {
		WriteJSON(w, map[string]any{
			"valid": false,
			"error": errorMsg,
		})
	}
}

// InputValidationRequest represents a request to validate user input.
type InputValidationRequest struct {
	Type  string                 `json:"type"`  // "calendar-event", "todo", "monitoring", etc.
	Data  map[string]interface{} `json:"data"`
}

// ValidateInput validates user input based on type.
func ValidateInput(req InputValidationRequest) (bool, string) {
	switch req.Type {
	case "calendar-event":
		return validateCalendarEvent(req.Data)
	case "todo":
		return validateTodo(req.Data)
	case "monitoring":
		return validateMonitoring(req.Data)
	default:
		return false, "Unknown validation type: " + req.Type
	}
}

// validateCalendarEvent validates a calendar event.
func validateCalendarEvent(data map[string]interface{}) (bool, string) {
	title, ok := data["title"].(string)
	if !ok || strings.TrimSpace(title) == "" {
		return false, "Title is required"
	}

	date, ok := data["date"].(string)
	if !ok || strings.TrimSpace(date) == "" {
		return false, "Date is required"
	}

	// Validate date format (YYYY-MM-DD)
	if !regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`).MatchString(date) {
		return false, "Date must be in YYYY-MM-DD format"
	}

	// Validate time format if provided (HH:MM)
	if timeStr, ok := data["time"].(string); ok && timeStr != "" {
		if !regexp.MustCompile(`^\d{2}:\d{2}$`).MatchString(timeStr) {
			return false, "Time must be in HH:MM format (24-hour)"
		}
		// Validate hour and minute ranges
		parts := strings.Split(timeStr, ":")
		if len(parts) == 2 {
			hour, err1 := strconv.Atoi(parts[0])
			minute, err2 := strconv.Atoi(parts[1])
			if err1 != nil || err2 != nil || hour < 0 || hour > 23 || minute < 0 || minute > 59 {
				return false, "Time must be valid (hour: 0-23, minute: 0-59)"
			}
		}
	}

	return true, ""
}

// validateTodo validates a todo item.
func validateTodo(data map[string]interface{}) (bool, string) {
	title, ok := data["title"].(string)
	if !ok || strings.TrimSpace(title) == "" {
		return false, "Title is required"
	}

	// Validate priority if provided
	if priority, ok := data["priority"].(string); ok && priority != "" {
		validPriorities := map[string]bool{"low": true, "medium": true, "high": true}
		if !validPriorities[priority] {
			return false, "Priority must be 'low', 'medium', or 'high'"
		}
	}

	// Validate due date format if provided (YYYY-MM-DD)
	if dueDate, ok := data["dueDate"].(string); ok && dueDate != "" {
		if !regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`).MatchString(dueDate) {
			return false, "Due date must be in YYYY-MM-DD format"
		}
	}

	return true, ""
}

// validateMonitoring validates a monitoring item.
func validateMonitoring(data map[string]interface{}) (bool, string) {
	name, ok := data["name"].(string)
	if !ok || strings.TrimSpace(name) == "" {
		return false, "Name is required"
	}

	monType, ok := data["type"].(string)
	if !ok {
		return false, "Type is required"
	}

	validTypes := map[string]bool{"http": true, "port": true, "ping": true}
	if !validTypes[monType] {
		return false, "Type must be 'http', 'port', or 'ping'"
	}

	switch monType {
	case "http":
		url, ok := data["url"].(string)
		if !ok || strings.TrimSpace(url) == "" {
			return false, "URL is required for HTTP monitoring"
		}
		// Basic URL validation
		if !strings.HasPrefix(url, "http://") && !strings.HasPrefix(url, "https://") {
			return false, "URL must start with http:// or https://"
		}
	case "port", "ping":
		host, ok := data["host"].(string)
		if !ok || strings.TrimSpace(host) == "" {
			return false, "Host is required for " + monType + " monitoring"
		}
		if monType == "port" {
			port, ok := data["port"]
			if !ok {
				return false, "Port is required for port monitoring"
			}
			portNum, ok := port.(float64) // JSON numbers come as float64
			if !ok {
				// Try as int
				if portInt, ok := port.(int); ok {
					portNum = float64(portInt)
				} else {
					return false, "Port must be a number"
				}
			}
			if portNum < 1 || portNum > 65535 {
				return false, "Port must be between 1 and 65535"
			}
		}
	}

	return true, ""
}

// HandleValidateInput validates user input.
func (h *Handler) HandleValidateInput(w http.ResponseWriter, r *http.Request) {
	var req InputValidationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteJSON(w, map[string]any{
			"valid": false,
			"error": "Invalid JSON: " + err.Error(),
		})
		return
	}

	if req.Type == "" {
		WriteJSON(w, map[string]any{
			"valid": false,
			"error": "Type is required",
		})
		return
	}

	valid, errorMsg := ValidateInput(req)
	if valid {
		WriteJSON(w, map[string]any{
			"valid": true,
		})
	} else {
		WriteJSON(w, map[string]any{
			"valid": false,
			"error": errorMsg,
		})
	}
}

// ProcessLayoutConfig processes layout configuration (removes disabled modules, cleans up structure).
func ProcessLayoutConfig(config LayoutConfig, modulePrefs map[string]interface{}) LayoutConfig {
	// Get enabled modules from preferences
	enabledModules := make(map[string]bool)
	if modulePrefs != nil {
		for moduleKey, prefData := range modulePrefs {
			if prefMap, ok := prefData.(map[string]interface{}); ok {
				if enabledVal, ok := prefMap["enabled"].(bool); ok {
					enabledModules[moduleKey] = enabledVal
				} else {
					enabledModules[moduleKey] = true // Default to enabled
				}
			}
		}
	}

	// Get module metadata to check defaults
	metadata := GetModuleMetadata()
	for moduleKey, modMeta := range metadata {
		if _, exists := enabledModules[moduleKey]; !exists {
			enabledModules[moduleKey] = modMeta.Enabled // Use default from metadata
		}
	}

	// Helper function to check if module is enabled
	isModuleEnabled := func(moduleID string) bool {
		if moduleID == "" {
			return false
		}
		if enabled, exists := enabledModules[moduleID]; exists {
			return enabled
		}
		// Default to enabled if not in preferences
		return true
	}

	// Process rows
	processedRows := make([]LayoutRow, 0, len(config.Rows))
	for _, row := range config.Rows {
		processedModules := make([]interface{}, 0, len(row.Modules))
		for _, moduleSlot := range row.Modules {
			if moduleSlot == nil {
				processedModules = append(processedModules, nil)
				continue
			}

			switch v := moduleSlot.(type) {
			case string:
				// Single module - keep if enabled
				if isModuleEnabled(v) {
					processedModules = append(processedModules, v)
				} else {
					processedModules = append(processedModules, nil)
				}
			case []interface{}:
				// Split modules - filter enabled ones
				enabledList := make([]interface{}, 0)
				for _, modID := range v {
					if modIDStr, ok := modID.(string); ok && isModuleEnabled(modIDStr) {
						enabledList = append(enabledList, modIDStr)
					}
				}
				if len(enabledList) == 0 {
					processedModules = append(processedModules, nil)
				} else if len(enabledList) == 1 {
					processedModules = append(processedModules, enabledList[0])
				} else {
					processedModules = append(processedModules, enabledList)
				}
			default:
				processedModules = append(processedModules, nil)
			}
		}
		processedRows = append(processedRows, LayoutRow{
			Cols:    row.Cols,
			Modules: processedModules,
		})
	}

	return LayoutConfig{
		MaxWidth: config.MaxWidth,
		Rows:     processedRows,
	}
}

// HandleLayoutProcess processes layout configuration (removes disabled modules).
func (h *Handler) HandleLayoutProcess(w http.ResponseWriter, r *http.Request) {
	var config LayoutConfig
	if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
		WriteJSON(w, map[string]any{
			"error": "Invalid JSON: " + err.Error(),
		})
		return
	}

	// Get module preferences from query or body
	var modulePrefs map[string]interface{}
	if prefsStr := r.URL.Query().Get("modulePrefs"); prefsStr != "" {
		if err := json.Unmarshal([]byte(prefsStr), &modulePrefs); err != nil {
			// Try to get from storage
			storage := GetStorage()
			if item, exists := storage.Get("modulePrefs"); exists {
				if prefs, ok := item.Value.(map[string]interface{}); ok {
					modulePrefs = prefs
				}
			}
		}
	} else {
		// Try to get from storage
		storage := GetStorage()
		if item, exists := storage.Get("modulePrefs"); exists {
			if prefs, ok := item.Value.(map[string]interface{}); ok {
				modulePrefs = prefs
			}
		}
	}

	processed := ProcessLayoutConfig(config, modulePrefs)
	WriteJSON(w, map[string]any{"layout": processed})
}

// ProcessModulePrefs processes and validates module preferences.
func ProcessModulePrefs(prefs map[string]interface{}) (map[string]interface{}, []string) {
	metadata := GetModuleMetadata()
	processed := make(map[string]interface{})
	errors := []string{}

	for moduleKey, prefData := range prefs {
		prefMap, ok := prefData.(map[string]interface{})
		if !ok {
			errors = append(errors, fmt.Sprintf("Invalid preference format for module '%s'", moduleKey))
			continue
		}

		// Check if module exists in metadata
		modMeta, exists := metadata[moduleKey]
		if !exists {
			errors = append(errors, fmt.Sprintf("Unknown module '%s'", moduleKey))
			continue
		}

		processedPref := make(map[string]interface{})

		// Validate enabled flag
		if enabledVal, ok := prefMap["enabled"].(bool); ok {
			processedPref["enabled"] = enabledVal
		} else {
			processedPref["enabled"] = modMeta.Enabled // Use default
		}

		// Validate interval if module has timer
		if modMeta.HasTimer {
			if intervalVal, ok := prefMap["interval"].(float64); ok {
				interval := int64(intervalVal)
				// Validate interval range (1 second to 24 hours)
				if interval < 1 {
					interval = int64(modMeta.DefaultInterval)
					errors = append(errors, fmt.Sprintf("Module '%s': interval too small, using default", moduleKey))
				} else if interval > 86400 {
					interval = 86400
					errors = append(errors, fmt.Sprintf("Module '%s': interval too large, capped at 86400", moduleKey))
				}
				processedPref["interval"] = interval
			} else {
				processedPref["interval"] = int64(modMeta.DefaultInterval)
			}
		}

		processed[moduleKey] = processedPref
	}

	return processed, errors
}

// HandleModulePrefsProcess processes and validates module preferences.
func (h *Handler) HandleModulePrefsProcess(w http.ResponseWriter, r *http.Request) {
	var prefs map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&prefs); err != nil {
		WriteJSON(w, map[string]any{
			"error": "Invalid JSON: " + err.Error(),
		})
		return
	}

	processed, errors := ProcessModulePrefs(prefs)
	response := map[string]any{
		"preferences": processed,
	}
	if len(errors) > 0 {
		response["errors"] = errors
	}
	WriteJSON(w, response)
}

// GraphHistoryData represents graph history data.
type GraphHistoryData struct {
	CPUHistory  []float64            `json:"cpuHistory"`
	RAMHistory  []float64            `json:"ramHistory"`
	DiskHistory map[string][]float64 `json:"diskHistory"`
	MaxBars     int                  `json:"maxBars,omitempty"` // Optional: max bars to return
}

// AggregateGraphHistory aggregates and trims graph history data.
func AggregateGraphHistory(data GraphHistoryData) GraphHistoryData {
	result := GraphHistoryData{
		CPUHistory:  make([]float64, len(data.CPUHistory)),
		RAMHistory:  make([]float64, len(data.RAMHistory)),
		DiskHistory: make(map[string][]float64),
	}

	// Copy CPU history
	copy(result.CPUHistory, data.CPUHistory)

	// Copy RAM history
	copy(result.RAMHistory, data.RAMHistory)

	// Copy disk histories
	for key, history := range data.DiskHistory {
		result.DiskHistory[key] = make([]float64, len(history))
		copy(result.DiskHistory[key], history)
	}

	// Trim to maxBars if specified
	if data.MaxBars > 0 {
		if len(result.CPUHistory) > data.MaxBars {
			result.CPUHistory = result.CPUHistory[len(result.CPUHistory)-data.MaxBars:]
		}
		if len(result.RAMHistory) > data.MaxBars {
			result.RAMHistory = result.RAMHistory[len(result.RAMHistory)-data.MaxBars:]
		}
		for key, history := range result.DiskHistory {
			if len(history) > data.MaxBars {
				result.DiskHistory[key] = history[len(history)-data.MaxBars:]
			}
		}
	}

	return result
}

// HandleGraphHistoryAggregate aggregates graph history data.
func (h *Handler) HandleGraphHistoryAggregate(w http.ResponseWriter, r *http.Request) {
	var data GraphHistoryData
	if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
		WriteJSON(w, map[string]any{
			"error": "Invalid JSON: " + err.Error(),
		})
		return
	}

	maxBars := 0
	if maxBarsStr := r.URL.Query().Get("maxBars"); maxBarsStr != "" {
		if parsed, err := strconv.Atoi(maxBarsStr); err == nil && parsed > 0 {
			maxBars = parsed
		}
	}
	data.MaxBars = maxBars

	aggregated := AggregateGraphHistory(data)
	WriteJSON(w, map[string]any{"history": aggregated})
}

// StorageProcessRequest represents a request to process localStorage data.
type StorageProcessRequest struct {
	Key   string      `json:"key"`
	Value interface{} `json:"value"`
}

// HandleStorageProcess processes raw localStorage data and returns processed results.
func (h *Handler) HandleStorageProcess(w http.ResponseWriter, r *http.Request) {
	var req StorageProcessRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteJSON(w, map[string]any{
			"error": "Invalid JSON: " + err.Error(),
		})
		return
	}

	if req.Key == "" {
		WriteJSON(w, map[string]any{
			"error": "Missing 'key' field",
		})
		return
	}

	switch req.Key {
	case "modulePrefs":
		if prefs, ok := req.Value.(map[string]interface{}); ok {
			processed, errors := ProcessModulePrefs(prefs)
			response := map[string]any{
				"key":         req.Key,
				"processed":   processed,
			}
			if len(errors) > 0 {
				response["errors"] = errors
			}
			WriteJSON(w, response)
		} else {
			WriteJSON(w, map[string]any{
				"error": "Invalid module preferences format",
			})
		}
	case "layoutConfig":
		var config LayoutConfig
		configJSON, err := json.Marshal(req.Value)
		if err != nil {
			WriteJSON(w, map[string]any{
				"error": "Invalid layout config format: " + err.Error(),
			})
			return
		}
		if err := json.Unmarshal(configJSON, &config); err != nil {
			WriteJSON(w, map[string]any{
				"error": "Invalid layout config format: " + err.Error(),
			})
			return
		}

		// Get module preferences from storage
		storage := GetStorage()
		var modulePrefs map[string]interface{}
		if item, exists := storage.Get("modulePrefs"); exists {
			if prefs, ok := item.Value.(map[string]interface{}); ok {
				modulePrefs = prefs
			}
		}

		processed := ProcessLayoutConfig(config, modulePrefs)
		WriteJSON(w, map[string]any{
			"key":       req.Key,
			"processed": processed,
		})
	case "cpuHistory", "ramHistory", "diskHistory":
		// Graph history aggregation
		var graphData GraphHistoryData
		if req.Key == "cpuHistory" {
			if history, ok := req.Value.([]interface{}); ok {
				cpuHistory := make([]float64, 0, len(history))
				for _, v := range history {
					if f, ok := v.(float64); ok {
						cpuHistory = append(cpuHistory, f)
					}
				}
				graphData.CPUHistory = cpuHistory
			}
		} else if req.Key == "ramHistory" {
			if history, ok := req.Value.([]interface{}); ok {
				ramHistory := make([]float64, 0, len(history))
				for _, v := range history {
					if f, ok := v.(float64); ok {
						ramHistory = append(ramHistory, f)
					}
				}
				graphData.RAMHistory = ramHistory
			}
		} else if req.Key == "diskHistory" {
			if history, ok := req.Value.(map[string]interface{}); ok {
				diskHistory := make(map[string][]float64)
				for key, val := range history {
					if arr, ok := val.([]interface{}); ok {
						diskArr := make([]float64, 0, len(arr))
						for _, v := range arr {
							if f, ok := v.(float64); ok {
								diskArr = append(diskArr, f)
							}
						}
						diskHistory[key] = diskArr
					}
				}
				graphData.DiskHistory = diskHistory
			}
		}

		aggregated := AggregateGraphHistory(graphData)
		WriteJSON(w, map[string]any{
			"key":       req.Key,
			"processed": aggregated,
		})
	default:
		WriteJSON(w, map[string]any{
			"key":       req.Key,
			"processed": req.Value, // Return as-is if no processing needed
		})
	}
}

// ModuleConfigRequest represents a request for module configuration operations.
type ModuleConfigRequest struct {
	Type   string      `json:"type"`   // "github", "rss", "disk", "monitoring", "snmp", "quicklinks"
	Action string      `json:"action"`  // "create", "update", "delete", "validate", "list"
	Data   interface{} `json:"data"`    // Module configuration data
	ID     string      `json:"id,omitempty"` // Module ID for update/delete
}

// HandleModuleConfig handles CRUD operations for module configurations.
func (h *Handler) HandleModuleConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		// List all module configs
		configType := r.URL.Query().Get("type")
		if configType == "" {
			WriteJSON(w, map[string]any{"error": "Missing 'type' parameter"})
			return
		}

		// Get from storage
		storage := GetStorage()
		var configs interface{}
		switch configType {
		case "github":
			if item, exists := storage.Get("githubModules"); exists {
				configs = item.Value
			}
		case "rss":
			if item, exists := storage.Get("rssModules"); exists {
				configs = item.Value
			}
		case "disk":
			if item, exists := storage.Get("diskModules"); exists {
				configs = item.Value
			}
		case "monitoring":
			if item, exists := storage.Get("monitors"); exists {
				configs = item.Value
			}
		case "snmp":
			if item, exists := storage.Get("snmpQueries"); exists {
				configs = item.Value
			}
		case "quicklinks":
			if item, exists := storage.Get("quickLinks"); exists {
				configs = item.Value
			}
		default:
			WriteJSON(w, map[string]any{"error": "Invalid module type"})
			return
		}

		WriteJSON(w, map[string]any{"configs": configs})
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req ModuleConfigRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteJSON(w, map[string]any{"error": "Invalid JSON: " + err.Error()})
		return
	}

	// Validate module type
	validTypes := map[string]bool{
		"github": true, "rss": true, "disk": true,
		"monitoring": true, "snmp": true, "quicklinks": true,
	}
	if !validTypes[req.Type] {
		WriteJSON(w, map[string]any{"error": "Invalid module type"})
		return
	}

	// Get storage key for this module type
	var storageKey string
	switch req.Type {
	case "github":
		storageKey = "githubModules"
	case "rss":
		storageKey = "rssModules"
	case "disk":
		storageKey = "diskModules"
	case "monitoring":
		storageKey = "monitors"
	case "snmp":
		storageKey = "snmpQueries"
	case "quicklinks":
		storageKey = "quickLinks"
	}

	storage := GetStorage()

	switch req.Action {
	case "validate":
		// Validate module configuration
		valid, errorMsg := ValidateModuleConfig(req.Type, req.Data)
		WriteJSON(w, map[string]any{
			"valid": valid,
			"error": errorMsg,
		})
		return

	case "list":
		// List all configs for this type
		if item, exists := storage.Get(storageKey); exists {
			WriteJSON(w, map[string]any{"configs": item.Value})
		} else {
			WriteJSON(w, map[string]any{"configs": []interface{}{}})
		}
		return

	case "create", "update", "delete":
		// These operations are handled by localStorage sync
		// The backend validates and processes the data
		WriteJSON(w, map[string]any{
			"message": "Module config operations are handled via localStorage sync. Use /api/storage/sync endpoint.",
		})
		return

	default:
		WriteJSON(w, map[string]any{"error": "Invalid action"})
		return
	}
}

// ValidateModuleConfig validates a module configuration based on type.
func ValidateModuleConfig(moduleType string, data interface{}) (bool, string) {
	dataMap, ok := data.(map[string]interface{})
	if !ok {
		return false, "Invalid data format"
	}

	switch moduleType {
	case "github":
		repo, _ := dataMap["repo"].(string)
		if repo == "" {
			return false, "Repository is required"
		}
	case "rss":
		url, _ := dataMap["url"].(string)
		if url == "" {
			return false, "URL is required"
		}
		if valid := IsValidURLOrIP(url); !valid {
			return false, "Invalid URL"
		}
	case "disk":
		mountPoint, _ := dataMap["mountPoint"].(string)
		if mountPoint == "" {
			return false, "Mount point is required"
		}
	case "monitoring":
		return validateMonitoring(dataMap)
	case "snmp":
		host, _ := dataMap["host"].(string)
		oid, _ := dataMap["oid"].(string)
		if host == "" {
			return false, "Host is required"
		}
		if oid == "" {
			return false, "OID is required"
		}
	case "quicklinks":
		url, _ := dataMap["url"].(string)
		title, _ := dataMap["title"].(string)
		if url == "" {
			return false, "URL is required"
		}
		if title == "" {
			return false, "Title is required"
		}
		if valid := IsValidURLOrIP(url); !valid {
			return false, "Invalid URL"
		}
	default:
		return false, "Unknown module type"
	}

	return true, ""
}

// ModulesBatchRequest represents a request for batch module data.
type ModulesBatchRequest struct {
	Types []string `json:"types,omitempty"` // Optional: specific module types to fetch
}

// HandleModulesBatch returns aggregated module data in a single request.
func (h *Handler) HandleModulesBatch(w http.ResponseWriter, r *http.Request) {
	var req ModulesBatchRequest
	if r.Method == http.MethodPost {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			// Ignore decode errors, use empty request
			req = ModulesBatchRequest{}
		}
	}

	storage := GetStorage()
	result := make(map[string]interface{})

	// If specific types requested, only return those
	if len(req.Types) > 0 {
		for _, moduleType := range req.Types {
			var storageKey string
			switch moduleType {
			case "github":
				storageKey = "githubModules"
			case "rss":
				storageKey = "rssModules"
			case "disk":
				storageKey = "diskModules"
			case "monitoring":
				storageKey = "monitors"
			case "snmp":
				storageKey = "snmpQueries"
			case "quicklinks":
				storageKey = "quickLinks"
			default:
				continue
			}

			if item, exists := storage.Get(storageKey); exists {
				result[moduleType] = item.Value
			} else {
				result[moduleType] = []interface{}{}
			}
		}
	} else {
		// Return all module configs
		moduleTypes := map[string]string{
			"github":     "githubModules",
			"rss":        "rssModules",
			"disk":       "diskModules",
			"monitoring": "monitors",
			"snmp":       "snmpQueries",
			"quicklinks": "quickLinks",
		}

		for moduleType, storageKey := range moduleTypes {
			if item, exists := storage.Get(storageKey); exists {
				result[moduleType] = item.Value
			} else {
				result[moduleType] = []interface{}{}
			}
		}
	}

	WriteJSON(w, map[string]any{"modules": result})
}

// HandleHealthz is the health check endpoint.
func (h *Handler) HandleHealthz(w http.ResponseWriter, _ *http.Request) {
	w.WriteHeader(http.StatusOK)
	if _, err := w.Write([]byte("ok")); err != nil {
		log.Printf("Error writing healthz response: %v", err)
	}
}
