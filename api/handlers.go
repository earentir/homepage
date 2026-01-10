package api

import (
	"context"
	"encoding/base64"
	"encoding/json"
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
	mux.HandleFunc("/api/utils/validate-url", h.HandleValidateURL)
	mux.HandleFunc("/api/utils/normalize-url", h.HandleNormalizeURL)
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
		log.Printf("GitHub fetch error: %v", err)
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

	// Store in backend storage
	globalStorage.Set(syncData.Key, syncData.Value, syncData.Version)

	// Get the stored item to return the actual version (in case of conflict resolution)
	item, exists := globalStorage.Get(syncData.Key)
	if !exists {
		WriteJSON(w, map[string]string{"error": "Failed to store data"})
		return
	}

	WriteJSON(w, map[string]interface{}{
		"success": true,
		"version": item.Version,
		"key":     syncData.Key,
	})
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

// HandleHealthz is the health check endpoint.
func (h *Handler) HandleHealthz(w http.ResponseWriter, _ *http.Request) {
	w.WriteHeader(http.StatusOK)
	if _, err := w.Write([]byte("ok")); err != nil {
		log.Printf("Error writing healthz response: %v", err)
	}
}
