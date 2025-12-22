package main

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"html/template"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/miekg/dns"
	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/mem"
)

//go:embed templates
var templatesFS embed.FS

type ThemeMetadata struct {
	Template string // "nordic", "modern", "minimal"
	Scheme   string // "default", "blue-dark", "light", etc.
	Accent   string
	Display  string
	Border   bool
}

type TemplateInfo struct {
	Name    string
	BaseCSS string                // Base template CSS (without :root)
	Schemes map[string]SchemeInfo // scheme name -> scheme info
}

type SchemeInfo struct {
	Name    string
	Accent  string
	Display string
	Border  bool
	CSS     string // CSS content (variables and overrides)
}

var (
	templatesMap  map[string]*TemplateInfo // template name -> template info
	templatesList []string                 // ordered list of template names
	indexTemplate *template.Template
)

type Config struct {
	ListenAddr      string
	Title           string
	PublicIPTimeout time.Duration
	Weather         WeatherConfig
}

type WeatherConfig struct {
	Enabled bool
	// Optional fixed coordinates. If empty, UI can show "set coords" hint.
	Lat string
	Lon string
}

type APIRoot struct {
	Server  ServerInfo    `json:"server"`
	Network NetworkInfo   `json:"network"`
	Public  PublicIPInfo  `json:"public"`
	Weather WeatherInfo   `json:"weather"`
	GitHub  GitHubInfo    `json:"github"`
	System  SystemMetrics `json:"system"`
}

type ServerInfo struct {
	Hostname  string `json:"hostname"`
	OS        string `json:"os"`
	Arch      string `json:"arch"`
	GoVersion string `json:"goVersion"`
	UptimeSec int64  `json:"uptimeSec"`
	Time      string `json:"time"`
}

type NetworkInfo struct {
	HostIPs []HostIPInfo `json:"hostIps"`
}

type HostIPInfo struct {
	IP  string `json:"ip"`
	PTR string `json:"ptr,omitempty"`
}

type PublicIPInfo struct {
	IP    string `json:"ip"`
	PTR   string `json:"ptr,omitempty"`
	Error string `json:"error,omitempty"`
}

type WeatherInfo struct {
	Enabled  bool     `json:"enabled"`
	Summary  string   `json:"summary,omitempty"`
	Forecast []string `json:"forecast,omitempty"`
	Error    string   `json:"error,omitempty"`
}

type GitHubInfo struct {
	UserRepos GitHubUserRepos `json:"userRepos,omitempty"`
	OrgRepos  GitHubOrgRepos  `json:"orgRepos,omitempty"`
}

type SystemMetrics struct {
	CPU  CPUInfo  `json:"cpu"`
	RAM  RAMInfo  `json:"ram"`
	Disk DiskInfo `json:"disk"`
}

type CPUInfo struct {
	Usage float64 `json:"usage"`
	Error string  `json:"error,omitempty"`
}

type RAMInfo struct {
	Total     uint64  `json:"total"`
	Used      uint64  `json:"used"`
	Available uint64  `json:"available"`
	Percent   float64 `json:"percent"`
	Error     string  `json:"error,omitempty"`
}

type DiskInfo struct {
	Total   uint64  `json:"total"`
	Used    uint64  `json:"used"`
	Free    uint64  `json:"free"`
	Percent float64 `json:"percent"`
	Error   string  `json:"error,omitempty"`
}

type GitHubUserRepos struct {
	Repos      []GitHubRepo `json:"repos,omitempty"`
	Total      int          `json:"total,omitempty"`
	AccountURL string       `json:"accountUrl,omitempty"`
	Error      string       `json:"error,omitempty"`
}

type GitHubOrgRepos struct {
	Repos      []GitHubRepo `json:"repos,omitempty"`
	Total      int          `json:"total,omitempty"`
	AccountURL string       `json:"accountUrl,omitempty"`
	Error      string       `json:"error,omitempty"`
}

type GitHubRepo struct {
	Name        string `json:"name"`
	FullName    string `json:"fullName"`
	Description string `json:"description"`
	URL         string `json:"url"`
	Stars       int    `json:"stars"`
	Language    string `json:"language"`
	Updated     string `json:"updated"`
}

var startedAt = time.Now()

type GitHubCache struct {
	mu        sync.RWMutex
	userRepos GitHubUserRepos
	orgRepos  GitHubOrgRepos
	lastFetch time.Time
	hasData   bool
}

var githubCache = &GitHubCache{}

const githubCacheMaxAge = 15 * time.Minute // In-memory cache valid for 15 minutes

// findBlockEnd finds the end of a CSS block (the matching closing brace)
func findBlockEnd(content string, startPos int) int {
	if startPos >= len(content) {
		return len(content)
	}

	// Find the opening brace
	openBrace := strings.Index(content[startPos:], "{")
	if openBrace == -1 {
		return len(content)
	}
	openBrace += startPos

	// Find the matching closing brace
	depth := 1
	pos := openBrace + 1
	for pos < len(content) && depth > 0 {
		if content[pos] == '{' {
			depth++
		} else if content[pos] == '}' {
			depth--
		}
		pos++
	}

	return pos
}

func parseThemeMetadata(cssContent string) ThemeMetadata {
	meta := ThemeMetadata{
		Template: "",
		Scheme:   "",
		Accent:   "rgba(136,192,208,.85)", // default
		Display:  "",
		Border:   false,
	}

	// Look for metadata block in CSS comments
	// Format: /*\nTheme: ...\nTemplate: ...\nScheme: ...\nAccent: ...\nDisplay: ...\nBorder: ...\n*/
	startIdx := strings.Index(cssContent, "/*")
	if startIdx == -1 {
		return meta
	}

	endIdx := strings.Index(cssContent[startIdx:], "*/")
	if endIdx == -1 {
		return meta
	}

	metadataBlock := cssContent[startIdx+2 : startIdx+endIdx]
	lines := strings.Split(metadataBlock, "\n")

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "Template:") {
			meta.Template = strings.TrimSpace(strings.TrimPrefix(line, "Template:"))
		} else if strings.HasPrefix(line, "Scheme:") {
			meta.Scheme = strings.TrimSpace(strings.TrimPrefix(line, "Scheme:"))
		} else if strings.HasPrefix(line, "Accent:") {
			meta.Accent = strings.TrimSpace(strings.TrimPrefix(line, "Accent:"))
		} else if strings.HasPrefix(line, "Display:") {
			meta.Display = strings.TrimSpace(strings.TrimPrefix(line, "Display:"))
		} else if strings.HasPrefix(line, "Border:") {
			borderVal := strings.TrimSpace(strings.TrimPrefix(line, "Border:"))
			meta.Border = borderVal == "true" || borderVal == "1" || borderVal == "yes"
		}
	}

	return meta
}

// parseSchemesFromTemplate parses all schemes from a single template file
// Format: Each scheme has a metadata block followed by [data-scheme="name"] :root { ... } and optionally body { ... }
func parseSchemesFromTemplate(cssContent string) ([]SchemeInfo, string) {
	var schemes []SchemeInfo
	content := cssContent

	// Find all scheme blocks (metadata + CSS)
	// Look for pattern: /* ... Template: ... Scheme: ... */ followed by [data-scheme="..."]
	pos := 0
	lastSchemeEnd := 0

	for pos < len(content) {
		// Find next metadata block
		metaStart := strings.Index(content[pos:], "/*")
		if metaStart == -1 {
			break
		}
		metaStart += pos

		metaEnd := strings.Index(content[metaStart:], "*/")
		if metaEnd == -1 {
			break
		}
		metaEnd += metaStart

		// Parse metadata
		metadataBlock := content[metaStart : metaEnd+2]
		meta := parseThemeMetadata(metadataBlock)

		// Check if this is a scheme metadata (has Template and Scheme)
		if meta.Template == "" || meta.Scheme == "" {
			// Not a scheme block, continue
			pos = metaEnd + 2
			continue
		}

		// Find the scheme CSS block after metadata
		// Look for [data-scheme="schemeName"] first, then fall back to :root
		schemeSelector := `[data-scheme="` + meta.Scheme + `"]`
		schemeStart := strings.Index(content[metaEnd:], schemeSelector)
		isWrappedFormat := true
		if schemeStart == -1 {
			// Fallback: look for :root directly (for files like nordic.css that don't use data-scheme)
			rootStart := strings.Index(content[metaEnd:], ":root")
			if rootStart == -1 {
				pos = metaEnd + 2
				continue
			}
			schemeStart = rootStart + metaEnd
			isWrappedFormat = false
		} else {
			schemeStart += metaEnd
		}

		// Find where this scheme block ends
		var schemeEnd int
		if isWrappedFormat {
			// For wrapped format ([data-scheme="..."]), find the end of the scheme block
			// Look for next "/*" that starts a new scheme metadata, or "/* Base CSS" comment
			nextMetaStart := strings.Index(content[schemeStart:], "/*")
			if nextMetaStart == -1 {
				// Last scheme, find where base CSS starts
				baseCSSMarker := strings.Index(content[schemeStart:], "/* Base CSS")
				if baseCSSMarker != -1 {
					schemeEnd = schemeStart + baseCSSMarker
				} else {
					schemeEnd = len(content)
				}
			} else {
				// Check if next /* is a scheme metadata or base CSS marker
				nextMetaPos := schemeStart + nextMetaStart
				nextMetaEnd := strings.Index(content[nextMetaPos:], "*/")
				if nextMetaEnd != -1 {
					nextMetaBlock := content[nextMetaPos : nextMetaPos+nextMetaEnd+2]
					nextMeta := parseThemeMetadata(nextMetaBlock)
					// If next metadata has Template and Scheme, it's another scheme
					if nextMeta.Template != "" && nextMeta.Scheme != "" {
						schemeEnd = nextMetaPos
					} else {
						// It's base CSS marker
						schemeEnd = nextMetaPos
					}
				} else {
					schemeEnd = schemeStart + nextMetaStart
				}
			}
		} else {
			// For unwrapped format (:root), only extract :root{...} and optionally body{...}
			// Find the end of :root block
			rootBlockEnd := findBlockEnd(content, schemeStart)
			schemeEnd = rootBlockEnd

			// Check if there's a body block immediately after :root
			bodyStart := strings.Index(content[schemeEnd:], "body{")
			if bodyStart != -1 && bodyStart < 50 { // body should be close to :root
				bodyBlockEnd := findBlockEnd(content, schemeEnd+bodyStart)
				schemeEnd = bodyBlockEnd
			}
		}

		schemeCSS := strings.TrimSpace(content[schemeStart:schemeEnd])
		lastSchemeEnd = schemeEnd

		// If the CSS doesn't start with [data-scheme="..."], wrap it
		// This handles files like nordic.css that use :root directly
		if !strings.HasPrefix(schemeCSS, `[data-scheme="`) {
			// Wrap :root and body selectors with [data-scheme="..."]
			wrappedCSS := `[data-scheme="` + meta.Scheme + `"] ` + schemeCSS
			schemeCSS = wrappedCSS
		}

		// Check if we've already added this scheme (avoid duplicates)
		alreadyExists := false
		for _, existingScheme := range schemes {
			if existingScheme.Name == meta.Scheme {
				alreadyExists = true
				break
			}
		}

		if !alreadyExists {
			// Store scheme
			schemes = append(schemes, SchemeInfo{
				Name:    meta.Scheme,
				Accent:  meta.Accent,
				Display: meta.Display,
				Border:  meta.Border,
				CSS:     schemeCSS,
			})
		}

		pos = schemeEnd
	}

	// Base CSS is everything after the last scheme block
	// Find "/* Base CSS" comment or use everything after last scheme
	baseCSSStart := strings.Index(content, "/* Base CSS")
	if baseCSSStart != -1 {
		baseCSSEnd := strings.Index(content[baseCSSStart:], "*/")
		if baseCSSEnd != -1 {
			baseCSSStart = baseCSSStart + baseCSSEnd + 2
			// Skip whitespace
			for baseCSSStart < len(content) && (content[baseCSSStart] == ' ' || content[baseCSSStart] == '\n' || content[baseCSSStart] == '\r' || content[baseCSSStart] == '\t') {
				baseCSSStart++
			}
		}
	} else {
		// No base CSS marker, use everything after last scheme
		baseCSSStart = lastSchemeEnd
		// Skip whitespace
		for baseCSSStart < len(content) && (content[baseCSSStart] == ' ' || content[baseCSSStart] == '\n' || content[baseCSSStart] == '\r' || content[baseCSSStart] == '\t') {
			baseCSSStart++
		}
	}

	baseCSS := strings.TrimSpace(content[baseCSSStart:])

	return schemes, baseCSS
}

func init() {
	// Initialize templates map
	templatesMap = make(map[string]*TemplateInfo)
	templatesList = []string{}

	// Read index.html template
	indexHTML, err := templatesFS.ReadFile("templates/index.html")
	if err != nil {
		log.Fatalf("Failed to read index.html: %v", err)
	}
	indexTemplate = template.Must(template.New("index").Parse(string(indexHTML)))

	// First pass: Load base templates (nordic.css, modern.css, minimal.css)
	baseTemplates := []string{"nordic", "modern", "minimal"}

	for _, templateName := range baseTemplates {
		path := "templates/" + templateName + ".css"
		cssContent, err := templatesFS.ReadFile(path)
		if err != nil {
			log.Printf("Warning: Failed to read base template %s: %v", path, err)
			continue
		}

		cssStr := string(cssContent)

		// Parse all schemes from the template file
		schemes, baseCSS := parseSchemesFromTemplate(cssStr)

		// Initialize template info
		templatesMap[templateName] = &TemplateInfo{
			Name:    templateName,
			BaseCSS: baseCSS,
			Schemes: make(map[string]SchemeInfo),
		}

		// Add all schemes
		for _, scheme := range schemes {
			templatesMap[templateName].Schemes[scheme.Name] = scheme
			log.Printf("Loaded scheme: %s/%s (Accent: %s)", templateName, scheme.Name, scheme.Accent)
		}

		templatesList = append(templatesList, templateName)
		log.Printf("Loaded template: %s with %d schemes", templateName, len(schemes))
	}
	if err != nil {
		log.Fatalf("Failed to load themes: %v", err)
	}

	// Sort templates (nordic first, then alphabetical)
	templatesList = sortTemplates(templatesList)
}

func sortTemplates(templates []string) []string {
	// Put nordic first, then sort the rest alphabetically
	var sorted []string
	var others []string

	for _, template := range templates {
		if template == "nordic" {
			sorted = append(sorted, template)
		} else {
			others = append(others, template)
		}
	}

	// Simple alphabetical sort for others
	for i := 0; i < len(others); i++ {
		for j := i + 1; j < len(others); j++ {
			if others[i] > others[j] {
				others[i], others[j] = others[j], others[i]
			}
		}
	}

	return append(sorted, others...)
}

func sortThemes(themes []string) []string {
	// Put nordic-blue-dark first if it exists, then sort the rest alphabetically
	var sorted []string
	var others []string

	for _, theme := range themes {
		if theme == "nordic-blue-dark" {
			sorted = append(sorted, theme)
		} else {
			others = append(others, theme)
		}
	}

	// Simple alphabetical sort for others
	for i := 0; i < len(others); i++ {
		for j := i + 1; j < len(others); j++ {
			if others[i] > others[j] {
				others[i], others[j] = others[j], others[i]
			}
		}
	}

	return append(sorted, others...)
}

func main() {
	cfg := Config{
		ListenAddr:      env("DASH_ADDR", ":8080"),
		Title:           env("DASH_TITLE", "LAN Index"),
		PublicIPTimeout: 1500 * time.Millisecond,
		Weather: WeatherConfig{
			Enabled: envBool("DASH_WEATHER", true),
			Lat:     env("DASH_LAT", "37.9838"), // Athens, Greece default
			Lon:     env("DASH_LON", "23.7275"), // Athens, Greece default
		},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}

		// Get template and scheme from cookies or defaults
		defaultTemplate := "nordic"
		defaultScheme := "default"
		if len(templatesList) > 0 {
			defaultTemplate = templatesList[0]
			if templateInfo, exists := templatesMap[defaultTemplate]; exists {
				// Get first available scheme
				for schemeName := range templateInfo.Schemes {
					defaultScheme = schemeName
					break
				}
			}
		}

		templateName := defaultTemplate
		schemeName := defaultScheme

		if cookie, err := r.Cookie("template"); err == nil {
			if _, exists := templatesMap[cookie.Value]; exists {
				templateName = cookie.Value
			}
		}
		if cookie, err := r.Cookie("scheme"); err == nil {
			if templateInfo, exists := templatesMap[templateName]; exists {
				if _, schemeExists := templateInfo.Schemes[cookie.Value]; schemeExists {
					schemeName = cookie.Value
				}
			}
		}

		// Get CSS for selected template + scheme
		var themeCSS string
		if templateInfo, exists := templatesMap[templateName]; exists {
			if scheme, schemeExists := templateInfo.Schemes[schemeName]; schemeExists {
				// Combine base template CSS + scheme CSS
				themeCSS = scheme.CSS + "\n" + templateInfo.BaseCSS
			} else {
				// Fallback to default scheme
				if defaultScheme, hasDefault := templateInfo.Schemes["default"]; hasDefault {
					themeCSS = defaultScheme.CSS + "\n" + templateInfo.BaseCSS
					schemeName = "default"
				} else {
					themeCSS = "/* No schemes available */"
				}
			}
		} else {
			themeCSS = "/* No templates available */"
		}

		// Build template and scheme menu HTML
		var templateMenuHTML strings.Builder
		var schemeMenuHTML strings.Builder

		// Template menu
		for _, tmplName := range templatesList {
			if _, exists := templatesMap[tmplName]; exists {
				displayName := strings.ToUpper(tmplName[:1]) + tmplName[1:]
				templateMenuHTML.WriteString(`<button data-template="`)
				templateMenuHTML.WriteString(tmplName)
				templateMenuHTML.WriteString(`"`)
				if tmplName == templateName {
					templateMenuHTML.WriteString(` class="active"`)
				}
				templateMenuHTML.WriteString(`>`)
				templateMenuHTML.WriteString(displayName)
				templateMenuHTML.WriteString(`</button>`)
			}
		}

		// Scheme menu (for current template)
		if templateInfo, exists := templatesMap[templateName]; exists {
			// Sort schemes (default first, then alphabetical)
			schemeNames := make([]string, 0, len(templateInfo.Schemes))
			for name := range templateInfo.Schemes {
				schemeNames = append(schemeNames, name)
			}
			// Sort: default first, then alphabetical
			for i := 0; i < len(schemeNames); i++ {
				for j := i + 1; j < len(schemeNames); j++ {
					if schemeNames[i] == "default" {
						continue
					}
					if schemeNames[j] == "default" || (schemeNames[i] > schemeNames[j] && schemeNames[j] != "default") {
						schemeNames[i], schemeNames[j] = schemeNames[j], schemeNames[i]
					}
				}
			}

			for _, schName := range schemeNames {
				scheme := templateInfo.Schemes[schName]
				displayName := scheme.Display
				if displayName == "" {
					// Format scheme name
					parts := strings.Split(schName, "-")
					for i, part := range parts {
						if len(part) > 0 {
							parts[i] = strings.ToUpper(part[:1]) + part[1:]
						}
					}
					displayName = strings.Join(parts, " ")
				}

				schemeMenuHTML.WriteString(`<button data-scheme="`)
				schemeMenuHTML.WriteString(schName)
				schemeMenuHTML.WriteString(`"><i class="fas fa-circle" style="color:`)
				schemeMenuHTML.WriteString(scheme.Accent)
				if scheme.Border {
					schemeMenuHTML.WriteString(`; border:1px solid rgba(136,192,208,.5);`)
				}
				schemeMenuHTML.WriteString(`;"></i> `)
				schemeMenuHTML.WriteString(displayName)
				schemeMenuHTML.WriteString(`</button>`)
			}
		}

		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_ = indexTemplate.Execute(w, map[string]any{
			"Title":            cfg.Title,
			"ThemeCSS":         template.CSS(themeCSS),
			"TemplatesList":    templatesList,
			"TemplateMenuHTML": template.HTML(templateMenuHTML.String()),
			"SchemeMenuHTML":   template.HTML(schemeMenuHTML.String()),
			"CurrentTemplate":  templateName,
			"CurrentScheme":    schemeName,
			"Year":             time.Now().Year(),
		})
	})

	mux.HandleFunc("/api/summary", func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		resp := APIRoot{
			Server: ServerInfo{
				Hostname:  mustHostname(),
				OS:        runtime.GOOS,
				Arch:      runtime.GOARCH,
				GoVersion: runtime.Version(),
				UptimeSec: getSystemUptime(),
				Time:      time.Now().Format(time.RFC3339),
			},
			Network: NetworkInfo{
				HostIPs: hostIPs(),
			},
			Public: PublicIPInfo{},
			Weather: WeatherInfo{
				Enabled: cfg.Weather.Enabled,
			},
		}

		// Public IP (best effort, short timeout)
		{
			ip, err := publicIP(ctx, cfg.PublicIPTimeout)
			if err != nil {
				resp.Public.Error = err.Error()
			} else {
				resp.Public.IP = ip
				// Get PTR record for public IP using Cloudflare DNS
				resp.Public.PTR = reverseDNS(ip, "1.1.1.1")
			}
		}

		// Weather (best effort; uses Open-Meteo, no key needed)
		if cfg.Weather.Enabled && cfg.Weather.Lat != "" && cfg.Weather.Lon != "" {
			wd, err := openMeteoSummary(ctx, cfg.Weather.Lat, cfg.Weather.Lon)
			if err != nil {
				resp.Weather.Error = err.Error()
			} else {
				resp.Weather.Summary = wd.Summary
				resp.Weather.Forecast = wd.Forecast
			}
		} else if cfg.Weather.Enabled {
			resp.Weather.Summary = "Set DASH_LAT and DASH_LON to enable local weather."
		}

		// GitHub repos (best effort)
		{
			userRepos, orgRepos, err := fetchGitHubRepos(ctx)
			// Always use the repos we got, even if there's an error
			// The error field in the struct will contain the actual error message (e.g., rate limiting)
			resp.GitHub.UserRepos = userRepos
			resp.GitHub.OrgRepos = orgRepos
			if err != nil {
				log.Printf("GitHub fetch error: %v", err)
				// Only set error if it's not already set (rate limit errors are already in the struct)
				if userRepos.Error == "" {
					resp.GitHub.UserRepos.Error = err.Error()
				}
				if orgRepos.Error == "" {
					resp.GitHub.OrgRepos.Error = err.Error()
				}
			}
		}

		// System metrics
		{
			resp.System = getSystemMetrics(ctx)
		}

		writeJSON(w, resp)
	})

	mux.HandleFunc("/api/system", func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		resp := SystemMetrics{}
		resp = getSystemMetrics(ctx)
		writeJSON(w, resp)
	})

	mux.HandleFunc("/api/weather", func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		resp := WeatherInfo{
			Enabled: true, // Always enabled, user can set location
		}

		// Check for lat/lon query parameters (from user preferences)
		lat := r.URL.Query().Get("lat")
		lon := r.URL.Query().Get("lon")

		// Fall back to config if not provided
		if lat == "" || lon == "" {
			lat = cfg.Weather.Lat
			lon = cfg.Weather.Lon
		}

		if lat != "" && lon != "" {
			wd, err := openMeteoSummary(ctx, lat, lon)
			if err != nil {
				resp.Error = err.Error()
			} else {
				resp.Summary = wd.Summary
				resp.Forecast = wd.Forecast
			}
		} else {
			resp.Summary = "Set your location in Preferences to enable weather."
		}
		writeJSON(w, resp)
	})

	// Geocoding endpoint to convert city name to coordinates
	mux.HandleFunc("/api/geocode", func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		query := r.URL.Query().Get("q")
		if query == "" {
			writeJSON(w, map[string]string{"error": "Missing query parameter 'q'"})
			return
		}

		results, err := geocodeCity(ctx, query)
		if err != nil {
			writeJSON(w, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, results)
	})

	mux.HandleFunc("/api/github", func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		var resp GitHubInfo
		userRepos, orgRepos, err := fetchGitHubRepos(ctx)
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
		writeJSON(w, resp)
	})

	// Fetch repos for a specific user or org
	mux.HandleFunc("/api/github/repos", func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		name := r.URL.Query().Get("name")
		repoType := r.URL.Query().Get("type") // "user" or "org"

		if name == "" {
			writeJSON(w, map[string]string{"error": "Missing 'name' parameter"})
			return
		}
		if repoType == "" {
			repoType = "user" // default to user
		}

		repos, err := fetchGitHubReposForName(ctx, name, repoType)
		if err != nil {
			writeJSON(w, map[string]any{"error": err.Error(), "repos": []any{}, "total": 0})
			return
		}
		writeJSON(w, repos)
	})

	// Fetch pull requests for a user/org/repo
	mux.HandleFunc("/api/github/prs", func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		name := r.URL.Query().Get("name")
		accountType := r.URL.Query().Get("type") // "user", "org", or "repo"

		if name == "" {
			writeJSON(w, map[string]string{"error": "Missing 'name' parameter"})
			return
		}

		prs, err := fetchGitHubPRs(ctx, name, accountType)
		if err != nil {
			writeJSON(w, map[string]any{"error": err.Error(), "items": []any{}, "total": 0})
			return
		}
		writeJSON(w, prs)
	})

	// Fetch commits for a user/org/repo
	mux.HandleFunc("/api/github/commits", func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		name := r.URL.Query().Get("name")
		accountType := r.URL.Query().Get("type") // "user", "org", or "repo"

		if name == "" {
			writeJSON(w, map[string]string{"error": "Missing 'name' parameter"})
			return
		}

		commits, err := fetchGitHubCommits(ctx, name, accountType)
		if err != nil {
			writeJSON(w, map[string]any{"error": err.Error(), "items": []any{}, "total": 0})
			return
		}
		writeJSON(w, commits)
	})

	// Fetch issues for a user/org/repo
	mux.HandleFunc("/api/github/issues", func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		name := r.URL.Query().Get("name")
		accountType := r.URL.Query().Get("type") // "user", "org", or "repo"

		if name == "" {
			writeJSON(w, map[string]string{"error": "Missing 'name' parameter"})
			return
		}

		issues, err := fetchGitHubIssues(ctx, name, accountType)
		if err != nil {
			writeJSON(w, map[string]any{"error": err.Error(), "items": []any{}, "total": 0})
			return
		}
		writeJSON(w, issues)
	})

	// Fetch stats for a repo
	mux.HandleFunc("/api/github/stats", func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		name := r.URL.Query().Get("name")

		if name == "" {
			writeJSON(w, map[string]string{"error": "Missing 'name' parameter"})
			return
		}

		stats, err := fetchGitHubStats(ctx, name)
		if err != nil {
			writeJSON(w, map[string]any{"error": err.Error()})
			return
		}
		writeJSON(w, stats)
	})

	mux.HandleFunc("/api/ip", func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		resp := struct {
			Network NetworkInfo  `json:"network"`
			Public  PublicIPInfo `json:"public"`
		}{
			Network: NetworkInfo{
				HostIPs: hostIPs(),
			},
			Public: PublicIPInfo{},
		}
		ip, err := publicIP(ctx, cfg.PublicIPTimeout)
		if err != nil {
			resp.Public.Error = err.Error()
		} else {
			resp.Public.IP = ip
			resp.Public.PTR = reverseDNS(ip, "1.1.1.1")
		}
		writeJSON(w, resp)
	})

	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	srv := &http.Server{
		Addr:              cfg.ListenAddr,
		Handler:           withSecurityHeaders(mux),
		ReadHeaderTimeout: 5 * time.Second,
	}

	log.Printf("listening on %s", cfg.ListenAddr)
	log.Fatal(srv.ListenAndServe())
}

func withSecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Same-origin dashboard; keep it tight.
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; script-src 'self' 'unsafe-inline'; connect-src 'self' https:; img-src 'self' data:; font-src 'self' https://cdnjs.cloudflare.com data:;")
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(v)
}

func mustHostname() string {
	h, err := os.Hostname()
	if err != nil || h == "" {
		return "unknown"
	}
	return h
}

func getSystemUptime() int64 {
	uptime, err := host.Uptime()
	if err != nil {
		return 0
	}
	return int64(uptime)
}

func reverseDNS(ip string, dnsServer string) string {
	// Parse IP address
	ipAddr := net.ParseIP(ip)
	if ipAddr == nil {
		return ""
	}

	// Create reverse DNS query
	var arpa string
	if ipAddr.To4() != nil {
		// IPv4: reverse the octets and append .in-addr.arpa.
		parts := strings.Split(ip, ".")
		if len(parts) != 4 {
			return ""
		}
		arpa = parts[3] + "." + parts[2] + "." + parts[1] + "." + parts[0] + ".in-addr.arpa."
	} else {
		// IPv6: reverse the hex digits and append .ip6.arpa.
		ip6 := ipAddr.To16()
		if ip6 == nil {
			return ""
		}
		// Convert each byte to two hex digits, then reverse the entire string
		var hexDigits []string
		for i := len(ip6) - 1; i >= 0; i-- {
			b := ip6[i]
			// Each byte becomes two hex digits (low nibble first, then high)
			low := b & 0x0f
			high := (b >> 4) & 0x0f
			// Convert to hex character
			toHex := func(n byte) string {
				if n < 10 {
					return string('0' + n)
				}
				return string('a' + (n - 10))
			}
			// Add low nibble first, then high (reversed byte order)
			hexDigits = append(hexDigits, toHex(low))
			hexDigits = append(hexDigits, toHex(high))
		}
		// Join with dots
		arpa = strings.Join(hexDigits, ".") + ".ip6.arpa."
	}

	// Create DNS client
	client := &dns.Client{
		Timeout: 2 * time.Second,
	}

	// Create PTR query
	m := new(dns.Msg)
	m.SetQuestion(arpa, dns.TypePTR)
	m.RecursionDesired = true

	// Query DNS server
	r, _, err := client.Exchange(m, dnsServer+":53")
	if err != nil {
		log.Printf("DNS query error for %s (server %s): %v", ip, dnsServer, err)
		return ""
	}
	if r == nil || len(r.Answer) == 0 {
		log.Printf("DNS query returned no answer for %s (server %s, query: %s)", ip, dnsServer, arpa)
		return ""
	}

	// Extract PTR record
	for _, ans := range r.Answer {
		if ptr, ok := ans.(*dns.PTR); ok {
			name := ptr.Ptr
			// Remove trailing dot if present
			if strings.HasSuffix(name, ".") {
				name = name[:len(name)-1]
			}
			return name
		}
	}

	return ""
}

func hostIPs() []HostIPInfo {
	var ipInfos []HostIPInfo
	ifaces, err := net.Interfaces()
	if err != nil {
		return ipInfos
	}
	var ips []string
	for _, ifc := range ifaces {
		if (ifc.Flags&net.FlagUp) == 0 || (ifc.Flags&net.FlagLoopback) != 0 {
			continue
		}
		addrs, _ := ifc.Addrs()
		for _, a := range addrs {
			ip := ipFromAddr(a)
			if ip == "" {
				continue
			}
			// Prefer IPv4, but allow IPv6.
			if strings.Contains(ip, ":") {
				continue
			}
			ips = append(ips, ip)
		}
	}
	// If no IPv4 found, include non-loopback IPv6 as fallback.
	if len(ips) == 0 {
		for _, ifc := range ifaces {
			if (ifc.Flags&net.FlagUp) == 0 || (ifc.Flags&net.FlagLoopback) != 0 {
				continue
			}
			addrs, _ := ifc.Addrs()
			for _, a := range addrs {
				ip := ipFromAddr(a)
				if ip != "" && strings.Contains(ip, ":") {
					ips = append(ips, ip)
				}
			}
		}
	}
	ips = dedup(ips)

	// Get PTR records for each IP using local DNS server
	for _, ip := range ips {
		ptr := reverseDNS(ip, "192.168.178.21")
		ipInfos = append(ipInfos, HostIPInfo{
			IP:  ip,
			PTR: ptr,
		})
	}
	return ipInfos
}

func ipFromAddr(a net.Addr) string {
	switch v := a.(type) {
	case *net.IPNet:
		ip := v.IP
		if ip == nil || ip.IsLoopback() || ip.IsLinkLocalUnicast() {
			return ""
		}
		return ip.String()
	case *net.IPAddr:
		ip := v.IP
		if ip == nil || ip.IsLoopback() || ip.IsLinkLocalUnicast() {
			return ""
		}
		return ip.String()
	default:
		return ""
	}
}

func dedup(in []string) []string {
	seen := make(map[string]struct{}, len(in))
	var out []string
	for _, s := range in {
		if _, ok := seen[s]; ok {
			continue
		}
		seen[s] = struct{}{}
		out = append(out, s)
	}
	return out
}

func publicIP(ctx context.Context, timeout time.Duration) (string, error) {
	cctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	// Try multiple (fast) endpoints.
	endpoints := []string{
		"https://api.ipify.org",
		"https://ifconfig.me/ip",
		"https://icanhazip.com",
	}

	var lastErr error
	for _, u := range endpoints {
		req, _ := http.NewRequestWithContext(cctx, http.MethodGet, u, nil)
		req.Header.Set("User-Agent", "lan-index/1.0")
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			lastErr = err
			continue
		}
		b, _ := io.ReadAll(io.LimitReader(res.Body, 128))
		_ = res.Body.Close()
		if res.StatusCode < 200 || res.StatusCode > 299 {
			lastErr = errors.New("public ip http status " + res.Status)
			continue
		}
		ip := strings.TrimSpace(string(b))
		if net.ParseIP(ip) == nil {
			lastErr = errors.New("invalid public ip response")
			continue
		}
		return ip, nil
	}
	if lastErr == nil {
		lastErr = errors.New("public ip unavailable")
	}
	return "", lastErr
}

type WeatherData struct {
	Summary  string
	Forecast []string
}

func openMeteoSummary(ctx context.Context, lat, lon string) (WeatherData, error) {
	// Current weather via Open-Meteo. No key required.
	// Docs: https://open-meteo.com/
	u := "https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lon + "&current=temperature_2m,relative_humidity_2m,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=3"
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	req.Header.Set("User-Agent", "lan-index/1.0")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return WeatherData{}, err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode > 299 {
		return WeatherData{}, errors.New("weather http status " + res.Status)
	}
	var raw struct {
		Current struct {
			Temperature float64 `json:"temperature_2m"`
			Humidity    float64 `json:"relative_humidity_2m"`
			WindSpeed   float64 `json:"wind_speed_10m"`
		} `json:"current"`
		CurrentUnits struct {
			Temperature string `json:"temperature_2m"`
			Humidity    string `json:"relative_humidity_2m"`
			WindSpeed   string `json:"wind_speed_10m"`
		} `json:"current_units"`
		Daily struct {
			Time           []string  `json:"time"`
			TemperatureMax []float64 `json:"temperature_2m_max"`
			TemperatureMin []float64 `json:"temperature_2m_min"`
			WeatherCode    []int     `json:"weather_code"`
		} `json:"daily"`
	}
	if err := json.NewDecoder(res.Body).Decode(&raw); err != nil {
		return WeatherData{}, err
	}

	summary := "Now: " +
		format1(raw.Current.Temperature) + raw.CurrentUnits.Temperature +
		", " + format0(raw.Current.Humidity) + raw.CurrentUnits.Humidity +
		", wind " + format1(raw.Current.WindSpeed) + raw.CurrentUnits.WindSpeed

	var forecast []string
	if len(raw.Daily.Time) > 0 && len(raw.Daily.TemperatureMax) > 0 {
		// Skip today (index 0), show next 3 days
		for i := 1; i < len(raw.Daily.Time) && i <= 3; i++ {
			if i < len(raw.Daily.TemperatureMax) && i < len(raw.Daily.TemperatureMin) {
				date := raw.Daily.Time[i]
				if len(date) >= 10 {
					date = date[5:10] // MM-DD format
				}
				forecast = append(forecast, date+": "+
					format1(raw.Daily.TemperatureMax[i])+"°/"+
					format1(raw.Daily.TemperatureMin[i])+"°")
			}
		}
	}

	return WeatherData{Summary: summary, Forecast: forecast}, nil
}

// GeoLocation represents a geocoded location result
type GeoLocation struct {
	Name      string  `json:"name"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	Country   string  `json:"country"`
	Admin1    string  `json:"admin1,omitempty"` // State/region
}

func geocodeCity(ctx context.Context, query string) ([]GeoLocation, error) {
	// Use Open-Meteo's geocoding API (free, no key required)
	u := "https://geocoding-api.open-meteo.com/v1/search?name=" + url.QueryEscape(query) + "&count=5&language=en&format=json"
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	req.Header.Set("User-Agent", "lan-index/1.0")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode > 299 {
		return nil, errors.New("geocode http status " + res.Status)
	}

	var raw struct {
		Results []struct {
			Name      string  `json:"name"`
			Latitude  float64 `json:"latitude"`
			Longitude float64 `json:"longitude"`
			Country   string  `json:"country"`
			Admin1    string  `json:"admin1"`
		} `json:"results"`
	}
	if err := json.NewDecoder(res.Body).Decode(&raw); err != nil {
		return nil, err
	}

	if len(raw.Results) == 0 {
		return nil, errors.New("no locations found")
	}

	var results []GeoLocation
	for _, r := range raw.Results {
		results = append(results, GeoLocation{
			Name:      r.Name,
			Latitude:  r.Latitude,
			Longitude: r.Longitude,
			Country:   r.Country,
			Admin1:    r.Admin1,
		})
	}
	return results, nil
}

func formatRateLimitReset(resetHeader string) string {
	if resetHeader == "" {
		return "unknown"
	}
	// Parse epoch timestamp
	var resetTime int64
	if err := itoaParse(resetHeader, &resetTime); err != nil {
		return resetHeader + " (parse error)"
	}
	reset := time.Unix(resetTime, 0)
	now := time.Now()
	untilReset := reset.Sub(now)

	if untilReset <= 0 {
		return "expired"
	}

	// Format as "in X minutes" or "at HH:MM:SS"
	if untilReset < time.Hour {
		minutes := int(untilReset.Minutes())
		if minutes == 0 {
			seconds := int(untilReset.Seconds())
			return reset.Format("15:04:05") + " (in " + itoa(int64(seconds)) + "s)"
		}
		return reset.Format("15:04:05") + " (in " + itoa(int64(minutes)) + "m)"
	}
	return reset.Format("15:04:05") + " (in " + formatDuration(untilReset) + ")"
}

func formatDuration(d time.Duration) string {
	hours := int(d.Hours())
	minutes := int(d.Minutes()) % 60
	if hours > 0 {
		return itoa(int64(hours)) + "h" + itoa(int64(minutes)) + "m"
	}
	return itoa(int64(minutes)) + "m"
}

func itoaParse(s string, out *int64) error {
	s = strings.TrimSpace(s)
	if s == "" {
		return errors.New("empty string")
	}
	var result int64
	for _, c := range s {
		if c < '0' || c > '9' {
			return errors.New("invalid character")
		}
		result = result*10 + int64(c-'0')
	}
	*out = result
	return nil
}

func fetchGitHubRepos(ctx context.Context) (GitHubUserRepos, GitHubOrgRepos, error) {
	// Check in-memory cache first
	githubCache.mu.RLock()
	timeSinceLastFetch := time.Since(githubCache.lastFetch)
	hasCachedData := githubCache.hasData
	cachedUserRepos := githubCache.userRepos
	cachedOrgRepos := githubCache.orgRepos
	githubCache.mu.RUnlock()

	// If we have cached data, only refresh every 15 minutes
	// If we don't have cached data, allow refresh every 5 minutes
	minWaitTime := 5 * time.Minute
	if hasCachedData {
		minWaitTime = 15 * time.Minute
	}

	// Return cached data if available and within time limits
	if hasCachedData && timeSinceLastFetch < minWaitTime {
		log.Printf("GitHub: returning cached data (last fetch: %v ago)", timeSinceLastFetch)
		return cachedUserRepos, cachedOrgRepos, nil
	}

	// Don't make API call if less than 5 minutes since last call
	if timeSinceLastFetch < 5*time.Minute {
		log.Printf("GitHub: too soon since last call (%v), returning cached data", timeSinceLastFetch)
		if hasCachedData {
			return cachedUserRepos, cachedOrgRepos, nil
		}
		// If no cached data and too soon, return empty with error
		return GitHubUserRepos{Error: "Rate limited. Please wait a few minutes."},
			GitHubOrgRepos{Error: "Rate limited. Please wait a few minutes."},
			nil
	}

	// Make API calls
	cctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var userRepos GitHubUserRepos
	var orgRepos GitHubOrgRepos

	// Fetch from Earentir user
	{
		u := "https://api.github.com/users/Earentir/repos?sort=updated&per_page=5"
		req, _ := http.NewRequestWithContext(cctx, http.MethodGet, u, nil)
		req.Header.Set("User-Agent", "lan-index/1.0")
		req.Header.Set("Accept", "application/vnd.github.v3+json")
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			log.Printf("GitHub API error (user repos): %v", err)
			userRepos.Error = "Failed to fetch user repos: " + err.Error()
		} else if res.StatusCode == 403 {
			rateLimitRemaining := res.Header.Get("X-RateLimit-Remaining")
			rateLimitReset := res.Header.Get("X-RateLimit-Reset")
			resetTime := formatRateLimitReset(rateLimitReset)
			log.Printf("GitHub API rate limit (user repos): Remaining=%s, Resets at %s", rateLimitRemaining, resetTime)
			userRepos.Error = "Rate Limited (403) will be available again in " + formatRateLimitResetForUI(rateLimitReset)
			res.Body.Close()
		} else if res.StatusCode < 200 || res.StatusCode > 299 {
			log.Printf("GitHub API error (user repos): HTTP %d - %s", res.StatusCode, res.Status)
			userRepos.Error = "Failed to fetch user repos: HTTP " + res.Status
			res.Body.Close()
		} else {
			var repos []struct {
				Name        string    `json:"name"`
				FullName    string    `json:"full_name"`
				Description string    `json:"description"`
				HTMLURL     string    `json:"html_url"`
				Stargazers  int       `json:"stargazers_count"`
				Language    string    `json:"language"`
				UpdatedAt   time.Time `json:"updated_at"`
			}
			if err := json.NewDecoder(res.Body).Decode(&repos); err != nil {
				log.Printf("GitHub API error (user repos decode): %v", err)
				userRepos.Error = "Failed to decode user repos: " + err.Error()
			} else {
				for _, r := range repos {
					userRepos.Repos = append(userRepos.Repos, GitHubRepo{
						Name:        r.Name,
						FullName:    r.FullName,
						Description: r.Description,
						URL:         r.HTMLURL,
						Stars:       r.Stargazers,
						Language:    r.Language,
						Updated:     r.UpdatedAt.Format("2006-01-02"),
					})
				}
				userRepos.Total = len(repos)
				userRepos.AccountURL = "https://github.com/Earentir"
				log.Printf("GitHub: fetched %d user repos", len(repos))

				// Fetch total count for user (only if repos fetch succeeded to avoid extra API calls on errors)
				{
					u := "https://api.github.com/users/Earentir"
					req, _ := http.NewRequestWithContext(cctx, http.MethodGet, u, nil)
					req.Header.Set("User-Agent", "lan-index/1.0")
					req.Header.Set("Accept", "application/vnd.github.v3+json")
					res, err := http.DefaultClient.Do(req)
					if err != nil {
						log.Printf("GitHub API error (user total count): %v", err)
					} else if res.StatusCode == 403 {
						rateLimitRemaining := res.Header.Get("X-RateLimit-Remaining")
						rateLimitReset := res.Header.Get("X-RateLimit-Reset")
						resetTime := formatRateLimitReset(rateLimitReset)
						log.Printf("GitHub API rate limit (user total count): Remaining=%s, Resets at %s", rateLimitRemaining, resetTime)
						// Don't set error here, we already have repos, just use count as fallback
						// Use repos count as fallback
						userRepos.Total = len(userRepos.Repos)
						res.Body.Close()
					} else if res.StatusCode < 200 || res.StatusCode > 299 {
						log.Printf("GitHub API error (user total count): HTTP %d - %s", res.StatusCode, res.Status)
						// Use repos count as fallback
						userRepos.Total = len(userRepos.Repos)
						res.Body.Close()
					} else {
						var user struct {
							PublicRepos int `json:"public_repos"`
						}
						if err := json.NewDecoder(res.Body).Decode(&user); err != nil {
							log.Printf("GitHub API error (user total count decode): %v", err)
							userRepos.Total = len(userRepos.Repos)
						} else {
							userRepos.Total = user.PublicRepos
							log.Printf("GitHub: user total repos = %d", user.PublicRepos)
						}
						res.Body.Close()
					}
				}
			}
			res.Body.Close()
		}
	}

	// Fetch from network-plane org
	{
		u := "https://api.github.com/orgs/network-plane/repos?sort=updated&per_page=5"
		req, _ := http.NewRequestWithContext(cctx, http.MethodGet, u, nil)
		req.Header.Set("User-Agent", "lan-index/1.0")
		req.Header.Set("Accept", "application/vnd.github.v3+json")
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			log.Printf("GitHub API error (org repos): %v", err)
			orgRepos.Error = "Failed to fetch org repos: " + err.Error()
		} else if res.StatusCode == 403 {
			rateLimitRemaining := res.Header.Get("X-RateLimit-Remaining")
			rateLimitReset := res.Header.Get("X-RateLimit-Reset")
			resetTime := formatRateLimitReset(rateLimitReset)
			log.Printf("GitHub API rate limit (org repos): Remaining=%s, Resets at %s", rateLimitRemaining, resetTime)
			orgRepos.Error = "Rate Limited (403) will be available again in " + formatRateLimitResetForUI(rateLimitReset)
			res.Body.Close()
		} else if res.StatusCode < 200 || res.StatusCode > 299 {
			log.Printf("GitHub API error (org repos): HTTP %d - %s", res.StatusCode, res.Status)
			orgRepos.Error = "Failed to fetch org repos: HTTP " + res.Status
			res.Body.Close()
		} else {
			var repos []struct {
				Name        string    `json:"name"`
				FullName    string    `json:"full_name"`
				Description string    `json:"description"`
				HTMLURL     string    `json:"html_url"`
				Stargazers  int       `json:"stargazers_count"`
				Language    string    `json:"language"`
				UpdatedAt   time.Time `json:"updated_at"`
			}
			if err := json.NewDecoder(res.Body).Decode(&repos); err != nil {
				log.Printf("GitHub API error (org repos decode): %v", err)
				orgRepos.Error = "Failed to decode org repos: " + err.Error()
			} else {
				for _, r := range repos {
					orgRepos.Repos = append(orgRepos.Repos, GitHubRepo{
						Name:        r.Name,
						FullName:    r.FullName,
						Description: r.Description,
						URL:         r.HTMLURL,
						Stars:       r.Stargazers,
						Language:    r.Language,
						Updated:     r.UpdatedAt.Format("2006-01-02"),
					})
				}
				orgRepos.Total = len(repos)
				orgRepos.AccountURL = "https://github.com/network-plane"
				log.Printf("GitHub: fetched %d org repos", len(repos))

				// Fetch total count for org (only if repos fetch succeeded to avoid extra API calls on errors)
				{
					u := "https://api.github.com/orgs/network-plane"
					req, _ := http.NewRequestWithContext(cctx, http.MethodGet, u, nil)
					req.Header.Set("User-Agent", "lan-index/1.0")
					req.Header.Set("Accept", "application/vnd.github.v3+json")
					res, err := http.DefaultClient.Do(req)
					if err != nil {
						log.Printf("GitHub API error (org total count): %v", err)
						// Use repos count as fallback
						orgRepos.Total = len(orgRepos.Repos)
					} else if res.StatusCode == 403 {
						rateLimitRemaining := res.Header.Get("X-RateLimit-Remaining")
						rateLimitReset := res.Header.Get("X-RateLimit-Reset")
						resetTime := formatRateLimitReset(rateLimitReset)
						log.Printf("GitHub API rate limit (org total count): Remaining=%s, Resets at %s", rateLimitRemaining, resetTime)
						// Don't set error here, we already have repos, just use count as fallback
						orgRepos.Total = len(orgRepos.Repos)
						res.Body.Close()
					} else if res.StatusCode < 200 || res.StatusCode > 299 {
						log.Printf("GitHub API error (org total count): HTTP %d - %s", res.StatusCode, res.Status)
						// Use repos count as fallback
						orgRepos.Total = len(orgRepos.Repos)
						res.Body.Close()
					} else {
						var org struct {
							PublicRepos int `json:"public_repos"`
						}
						if err := json.NewDecoder(res.Body).Decode(&org); err != nil {
							log.Printf("GitHub API error (org total count decode): %v", err)
							orgRepos.Total = len(orgRepos.Repos)
						} else {
							orgRepos.Total = org.PublicRepos
							log.Printf("GitHub: org total repos = %d", org.PublicRepos)
						}
						res.Body.Close()
					}
				}
			}
			res.Body.Close()
		}
	}

	// If we got errors but have cached data, return cached data instead
	if (userRepos.Error != "" || orgRepos.Error != "") && hasCachedData {
		log.Printf("GitHub: API call failed but returning cached data")
		return cachedUserRepos, cachedOrgRepos, nil
	}

	// Only return error if we have no repos AND no error messages (meaning we actually tried but found nothing)
	// If we have error messages (like rate limiting), return nil error so the error messages are shown in the UI
	if len(userRepos.Repos) == 0 && len(orgRepos.Repos) == 0 {
		if userRepos.Error == "" && orgRepos.Error == "" {
			return userRepos, orgRepos, errors.New("no repos found")
		}
		// If we have error messages, return nil error so the UI can display them
		// Don't cache errors
		return userRepos, orgRepos, nil
	}

	// Cache successful results in memory (only if we have data and no errors)
	if len(userRepos.Repos) > 0 || len(orgRepos.Repos) > 0 {
		githubCache.mu.Lock()
		githubCache.userRepos = userRepos
		githubCache.orgRepos = orgRepos
		githubCache.lastFetch = time.Now()
		githubCache.hasData = true
		githubCache.mu.Unlock()

		log.Printf("GitHub: cached %d user repos and %d org repos", len(userRepos.Repos), len(orgRepos.Repos))
	}

	return userRepos, orgRepos, nil
}

// GitHubReposResponse is the response for the /api/github/repos endpoint
type GitHubReposResponse struct {
	Repos      []GitHubRepo `json:"repos"`
	Total      int          `json:"total"`
	AccountURL string       `json:"accountUrl"`
	Error      string       `json:"error,omitempty"`
}

func fetchGitHubReposForName(ctx context.Context, name, repoType string) (GitHubReposResponse, error) {
	cctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var resp GitHubReposResponse
	resp.AccountURL = "https://github.com/" + name

	// Determine API URL based on type
	var reposURL, profileURL string
	if repoType == "org" {
		reposURL = "https://api.github.com/orgs/" + name + "/repos?sort=updated&per_page=5"
		profileURL = "https://api.github.com/orgs/" + name
	} else {
		reposURL = "https://api.github.com/users/" + name + "/repos?sort=updated&per_page=5"
		profileURL = "https://api.github.com/users/" + name
	}

	// Fetch repos
	req, _ := http.NewRequestWithContext(cctx, http.MethodGet, reposURL, nil)
	req.Header.Set("User-Agent", "lan-index/1.0")
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		resp.Error = "Failed to fetch repos: " + err.Error()
		return resp, nil
	}
	defer res.Body.Close()

	if res.StatusCode == 403 {
		rateLimitReset := res.Header.Get("X-RateLimit-Reset")
		resp.Error = "Rate Limited - available again in " + formatRateLimitResetForUI(rateLimitReset)
		return resp, nil
	}
	if res.StatusCode == 404 {
		resp.Error = "Not found: " + name
		return resp, nil
	}
	if res.StatusCode < 200 || res.StatusCode > 299 {
		resp.Error = "HTTP error: " + res.Status
		return resp, nil
	}

	var repos []struct {
		Name        string    `json:"name"`
		FullName    string    `json:"full_name"`
		Description string    `json:"description"`
		HTMLURL     string    `json:"html_url"`
		Stargazers  int       `json:"stargazers_count"`
		Language    string    `json:"language"`
		UpdatedAt   time.Time `json:"updated_at"`
	}
	if err := json.NewDecoder(res.Body).Decode(&repos); err != nil {
		resp.Error = "Failed to decode repos: " + err.Error()
		return resp, nil
	}

	for _, r := range repos {
		resp.Repos = append(resp.Repos, GitHubRepo{
			Name:        r.Name,
			FullName:    r.FullName,
			Description: r.Description,
			URL:         r.HTMLURL,
			Stars:       r.Stargazers,
			Language:    r.Language,
			Updated:     r.UpdatedAt.Format("2006-01-02"),
		})
	}
	resp.Total = len(repos)

	// Fetch total count
	req2, _ := http.NewRequestWithContext(cctx, http.MethodGet, profileURL, nil)
	req2.Header.Set("User-Agent", "lan-index/1.0")
	req2.Header.Set("Accept", "application/vnd.github.v3+json")
	res2, err := http.DefaultClient.Do(req2)
	if err == nil && res2.StatusCode >= 200 && res2.StatusCode <= 299 {
		var profile struct {
			PublicRepos int `json:"public_repos"`
		}
		if err := json.NewDecoder(res2.Body).Decode(&profile); err == nil {
			resp.Total = profile.PublicRepos
		}
		res2.Body.Close()
	}

	return resp, nil
}

// GitHubPRItem represents a pull request
type GitHubPRItem struct {
	Title   string `json:"title"`
	URL     string `json:"url"`
	User    string `json:"user"`
	State   string `json:"state"`
	Created string `json:"created"`
	Repo    string `json:"repo"`
}

// GitHubPRsResponse is the response for the /api/github/prs endpoint
type GitHubPRsResponse struct {
	Items []GitHubPRItem `json:"items"`
	Total int            `json:"total"`
	Error string         `json:"error,omitempty"`
}

func fetchGitHubPRs(ctx context.Context, name, accountType string) (GitHubPRsResponse, error) {
	cctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	var resp GitHubPRsResponse

	var searchQuery string
	if accountType == "repo" {
		// For a specific repo: name is "user/repo"
		searchQuery = "repo:" + name + " is:pr is:open"
	} else if accountType == "org" {
		searchQuery = "org:" + name + " is:pr is:open"
	} else {
		searchQuery = "author:" + name + " is:pr is:open"
	}

	apiURL := "https://api.github.com/search/issues?q=" + url.QueryEscape(searchQuery) + "&sort=updated&per_page=10"

	req, _ := http.NewRequestWithContext(cctx, http.MethodGet, apiURL, nil)
	req.Header.Set("User-Agent", "lan-index/1.0")
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		resp.Error = "Failed to fetch PRs: " + err.Error()
		return resp, nil
	}
	defer res.Body.Close()

	if res.StatusCode == 403 {
		rateLimitReset := res.Header.Get("X-RateLimit-Reset")
		resp.Error = "Rate Limited - available again in " + formatRateLimitResetForUI(rateLimitReset)
		return resp, nil
	}
	if res.StatusCode < 200 || res.StatusCode > 299 {
		resp.Error = "HTTP error: " + res.Status
		return resp, nil
	}

	var searchResult struct {
		TotalCount int `json:"total_count"`
		Items      []struct {
			Title     string `json:"title"`
			HTMLURL   string `json:"html_url"`
			State     string `json:"state"`
			CreatedAt string `json:"created_at"`
			User      struct {
				Login string `json:"login"`
			} `json:"user"`
			Repository struct {
				FullName string `json:"full_name"`
			} `json:"repository"`
			RepositoryURL string `json:"repository_url"`
		} `json:"items"`
	}

	if err := json.NewDecoder(res.Body).Decode(&searchResult); err != nil {
		resp.Error = "Failed to decode PRs: " + err.Error()
		return resp, nil
	}

	for _, item := range searchResult.Items {
		created := ""
		if t, err := time.Parse(time.RFC3339, item.CreatedAt); err == nil {
			created = t.Format("2006-01-02")
		}
		repoName := item.Repository.FullName
		if repoName == "" && item.RepositoryURL != "" {
			// Extract from URL like https://api.github.com/repos/user/repo
			parts := strings.Split(item.RepositoryURL, "/")
			if len(parts) >= 2 {
				repoName = parts[len(parts)-2] + "/" + parts[len(parts)-1]
			}
		}
		resp.Items = append(resp.Items, GitHubPRItem{
			Title:   item.Title,
			URL:     item.HTMLURL,
			User:    item.User.Login,
			State:   item.State,
			Created: created,
			Repo:    repoName,
		})
	}
	resp.Total = searchResult.TotalCount

	return resp, nil
}

// GitHubCommitItem represents a commit
type GitHubCommitItem struct {
	Message string `json:"message"`
	URL     string `json:"url"`
	Author  string `json:"author"`
	Date    string `json:"date"`
	Sha     string `json:"sha"`
	Repo    string `json:"repo"`
}

// GitHubCommitsResponse is the response for the /api/github/commits endpoint
type GitHubCommitsResponse struct {
	Items []GitHubCommitItem `json:"items"`
	Total int                `json:"total"`
	Error string             `json:"error,omitempty"`
}

func fetchGitHubCommits(ctx context.Context, name, accountType string) (GitHubCommitsResponse, error) {
	cctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	var resp GitHubCommitsResponse

	var apiURL string
	if accountType == "repo" {
		// For a specific repo: name is "user/repo"
		apiURL = "https://api.github.com/repos/" + name + "/commits?per_page=10"
	} else {
		// For user/org, we need to search commits
		var searchQuery string
		if accountType == "org" {
			searchQuery = "org:" + name
		} else {
			searchQuery = "author:" + name
		}
		apiURL = "https://api.github.com/search/commits?q=" + url.QueryEscape(searchQuery) + "&sort=author-date&order=desc&per_page=10"
	}

	req, _ := http.NewRequestWithContext(cctx, http.MethodGet, apiURL, nil)
	req.Header.Set("User-Agent", "lan-index/1.0")
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	if accountType != "repo" {
		// Search commits requires special accept header
		req.Header.Set("Accept", "application/vnd.github.cloak-preview+json")
	}

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		resp.Error = "Failed to fetch commits: " + err.Error()
		return resp, nil
	}
	defer res.Body.Close()

	if res.StatusCode == 403 {
		rateLimitReset := res.Header.Get("X-RateLimit-Reset")
		resp.Error = "Rate Limited - available again in " + formatRateLimitResetForUI(rateLimitReset)
		return resp, nil
	}
	if res.StatusCode < 200 || res.StatusCode > 299 {
		resp.Error = "HTTP error: " + res.Status
		return resp, nil
	}

	if accountType == "repo" {
		// Direct commits endpoint
		var commits []struct {
			Sha     string `json:"sha"`
			HTMLURL string `json:"html_url"`
			Commit  struct {
				Message string `json:"message"`
				Author  struct {
					Name string `json:"name"`
					Date string `json:"date"`
				} `json:"author"`
			} `json:"commit"`
		}
		if err := json.NewDecoder(res.Body).Decode(&commits); err != nil {
			resp.Error = "Failed to decode commits: " + err.Error()
			return resp, nil
		}

		for _, c := range commits {
			date := ""
			if t, err := time.Parse(time.RFC3339, c.Commit.Author.Date); err == nil {
				date = t.Format("2006-01-02")
			}
			// Truncate message to first line
			msg := c.Commit.Message
			if idx := strings.Index(msg, "\n"); idx > 0 {
				msg = msg[:idx]
			}
			if len(msg) > 60 {
				msg = msg[:57] + "..."
			}
			resp.Items = append(resp.Items, GitHubCommitItem{
				Message: msg,
				URL:     c.HTMLURL,
				Author:  c.Commit.Author.Name,
				Date:    date,
				Sha:     c.Sha[:7],
				Repo:    name,
			})
		}
		resp.Total = len(commits)
	} else {
		// Search commits endpoint
		var searchResult struct {
			TotalCount int `json:"total_count"`
			Items      []struct {
				Sha        string `json:"sha"`
				HTMLURL    string `json:"html_url"`
				Repository struct {
					FullName string `json:"full_name"`
				} `json:"repository"`
				Commit struct {
					Message string `json:"message"`
					Author  struct {
						Name string `json:"name"`
						Date string `json:"date"`
					} `json:"author"`
				} `json:"commit"`
			} `json:"items"`
		}
		if err := json.NewDecoder(res.Body).Decode(&searchResult); err != nil {
			resp.Error = "Failed to decode commits: " + err.Error()
			return resp, nil
		}

		for _, c := range searchResult.Items {
			date := ""
			if t, err := time.Parse(time.RFC3339, c.Commit.Author.Date); err == nil {
				date = t.Format("2006-01-02")
			}
			msg := c.Commit.Message
			if idx := strings.Index(msg, "\n"); idx > 0 {
				msg = msg[:idx]
			}
			if len(msg) > 60 {
				msg = msg[:57] + "..."
			}
			resp.Items = append(resp.Items, GitHubCommitItem{
				Message: msg,
				URL:     c.HTMLURL,
				Author:  c.Commit.Author.Name,
				Date:    date,
				Sha:     c.Sha[:7],
				Repo:    c.Repository.FullName,
			})
		}
		resp.Total = searchResult.TotalCount
	}

	return resp, nil
}

// GitHubIssueItem represents an issue
type GitHubIssueItem struct {
	Title   string `json:"title"`
	URL     string `json:"url"`
	User    string `json:"user"`
	State   string `json:"state"`
	Created string `json:"created"`
	Repo    string `json:"repo"`
}

// GitHubIssuesResponse is the response for the /api/github/issues endpoint
type GitHubIssuesResponse struct {
	Items []GitHubIssueItem `json:"items"`
	Total int               `json:"total"`
	Error string            `json:"error,omitempty"`
}

func fetchGitHubIssues(ctx context.Context, name, accountType string) (GitHubIssuesResponse, error) {
	cctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	var resp GitHubIssuesResponse

	var searchQuery string
	if accountType == "repo" {
		// For a specific repo: name is "user/repo"
		searchQuery = "repo:" + name + " is:issue is:open"
	} else if accountType == "org" {
		searchQuery = "org:" + name + " is:issue is:open"
	} else {
		searchQuery = "author:" + name + " is:issue is:open"
	}

	apiURL := "https://api.github.com/search/issues?q=" + url.QueryEscape(searchQuery) + "&sort=updated&per_page=10"

	req, _ := http.NewRequestWithContext(cctx, http.MethodGet, apiURL, nil)
	req.Header.Set("User-Agent", "lan-index/1.0")
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		resp.Error = "Failed to fetch issues: " + err.Error()
		return resp, nil
	}
	defer res.Body.Close()

	if res.StatusCode == 403 {
		rateLimitReset := res.Header.Get("X-RateLimit-Reset")
		resp.Error = "Rate Limited - available again in " + formatRateLimitResetForUI(rateLimitReset)
		return resp, nil
	}
	if res.StatusCode < 200 || res.StatusCode > 299 {
		resp.Error = "HTTP error: " + res.Status
		return resp, nil
	}

	var searchResult struct {
		TotalCount int `json:"total_count"`
		Items      []struct {
			Title     string `json:"title"`
			HTMLURL   string `json:"html_url"`
			State     string `json:"state"`
			CreatedAt string `json:"created_at"`
			User      struct {
				Login string `json:"login"`
			} `json:"user"`
			Repository struct {
				FullName string `json:"full_name"`
			} `json:"repository"`
			RepositoryURL string `json:"repository_url"`
		} `json:"items"`
	}

	if err := json.NewDecoder(res.Body).Decode(&searchResult); err != nil {
		resp.Error = "Failed to decode issues: " + err.Error()
		return resp, nil
	}

	for _, item := range searchResult.Items {
		created := ""
		if t, err := time.Parse(time.RFC3339, item.CreatedAt); err == nil {
			created = t.Format("2006-01-02")
		}
		repoName := item.Repository.FullName
		if repoName == "" && item.RepositoryURL != "" {
			parts := strings.Split(item.RepositoryURL, "/")
			if len(parts) >= 2 {
				repoName = parts[len(parts)-2] + "/" + parts[len(parts)-1]
			}
		}
		resp.Items = append(resp.Items, GitHubIssueItem{
			Title:   item.Title,
			URL:     item.HTMLURL,
			User:    item.User.Login,
			State:   item.State,
			Created: created,
			Repo:    repoName,
		})
	}
	resp.Total = searchResult.TotalCount

	return resp, nil
}

// GitHubStatsResponse is the response for the /api/github/stats endpoint
type GitHubStatsResponse struct {
	Stats struct {
		Stars      int    `json:"stars"`
		Forks      int    `json:"forks"`
		Watchers   int    `json:"watchers"`
		OpenIssues int    `json:"openIssues"`
		Language   string `json:"language"`
		Size       int    `json:"size"`
		Created    string `json:"created"`
		Updated    string `json:"updated"`
	} `json:"stats"`
	Error string `json:"error,omitempty"`
}

func fetchGitHubStats(ctx context.Context, name string) (GitHubStatsResponse, error) {
	cctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var resp GitHubStatsResponse

	// name should be "user/repo"
	apiURL := "https://api.github.com/repos/" + name

	req, _ := http.NewRequestWithContext(cctx, http.MethodGet, apiURL, nil)
	req.Header.Set("User-Agent", "lan-index/1.0")
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		resp.Error = "Failed to fetch stats: " + err.Error()
		return resp, nil
	}
	defer res.Body.Close()

	if res.StatusCode == 403 {
		rateLimitReset := res.Header.Get("X-RateLimit-Reset")
		resp.Error = "Rate Limited - available again in " + formatRateLimitResetForUI(rateLimitReset)
		return resp, nil
	}
	if res.StatusCode == 404 {
		resp.Error = "Repository not found: " + name
		return resp, nil
	}
	if res.StatusCode < 200 || res.StatusCode > 299 {
		resp.Error = "HTTP error: " + res.Status
		return resp, nil
	}

	var repo struct {
		StargazersCount int       `json:"stargazers_count"`
		ForksCount      int       `json:"forks_count"`
		WatchersCount   int       `json:"watchers_count"`
		OpenIssuesCount int       `json:"open_issues_count"`
		Language        string    `json:"language"`
		Size            int       `json:"size"`
		CreatedAt       time.Time `json:"created_at"`
		UpdatedAt       time.Time `json:"updated_at"`
	}

	if err := json.NewDecoder(res.Body).Decode(&repo); err != nil {
		resp.Error = "Failed to decode stats: " + err.Error()
		return resp, nil
	}

	resp.Stats.Stars = repo.StargazersCount
	resp.Stats.Forks = repo.ForksCount
	resp.Stats.Watchers = repo.WatchersCount
	resp.Stats.OpenIssues = repo.OpenIssuesCount
	resp.Stats.Language = repo.Language
	resp.Stats.Size = repo.Size
	resp.Stats.Created = repo.CreatedAt.Format("2006-01-02")
	resp.Stats.Updated = repo.UpdatedAt.Format("2006-01-02")

	return resp, nil
}

func formatRateLimitResetForUI(resetHeader string) string {
	if resetHeader == "" {
		return "unknown time"
	}
	// Parse epoch timestamp
	var resetTime int64
	if err := itoaParse(resetHeader, &resetTime); err != nil {
		return "unknown time"
	}
	reset := time.Unix(resetTime, 0)
	now := time.Now()
	untilReset := reset.Sub(now)

	if untilReset <= 0 {
		return "now"
	}

	// Format as "Xm" or "XhYm" for UI
	if untilReset < time.Hour {
		minutes := int(untilReset.Minutes())
		if minutes == 0 {
			seconds := int(untilReset.Seconds())
			return itoa(int64(seconds)) + "s"
		}
		return itoa(int64(minutes)) + "m"
	}
	hours := int(untilReset.Hours())
	minutes := int(untilReset.Minutes()) % 60
	if minutes > 0 {
		return itoa(int64(hours)) + "h" + itoa(int64(minutes)) + "m"
	}
	return itoa(int64(hours)) + "h"
}

func getSystemMetrics(ctx context.Context) SystemMetrics {
	var metrics SystemMetrics

	// CPU metrics
	{
		// Get CPU usage percentage
		percentages, err := cpu.PercentWithContext(ctx, time.Second, false)
		if err != nil {
			metrics.CPU.Error = err.Error()
		} else if len(percentages) > 0 {
			metrics.CPU.Usage = percentages[0]
		}
		// Load average not available in gopsutil v3, would need platform-specific code
	}

	// RAM metrics
	{
		vm, err := mem.VirtualMemoryWithContext(ctx)
		if err != nil {
			metrics.RAM.Error = err.Error()
		} else {
			metrics.RAM.Total = vm.Total
			metrics.RAM.Used = vm.Used
			metrics.RAM.Available = vm.Available
			metrics.RAM.Percent = vm.UsedPercent
		}
	}

	// Disk metrics (root filesystem)
	{
		usage, err := disk.UsageWithContext(ctx, "/")
		if err != nil {
			metrics.Disk.Error = err.Error()
		} else {
			metrics.Disk.Total = usage.Total
			metrics.Disk.Used = usage.Used
			metrics.Disk.Free = usage.Free
			metrics.Disk.Percent = usage.UsedPercent
		}
	}

	return metrics
}

func format1(v float64) string {
	return strings.TrimRight(strings.TrimRight(fmtFloat(v, 1), "0"), ".")
}
func format0(v float64) string {
	return strings.TrimRight(strings.TrimRight(fmtFloat(v, 0), "0"), ".")
}
func fmtFloat(v float64, decimals int) string {
	// small local formatter to avoid importing fmt for a couple numbers
	pow := 1.0
	for i := 0; i < decimals; i++ {
		pow *= 10
	}
	iv := int64(v*pow + 0.5)
	neg := iv < 0
	if neg {
		iv = -iv
	}
	s := itoa(iv)
	if decimals == 0 {
		if neg {
			return "-" + s
		}
		return s
	}
	for len(s) <= decimals {
		s = "0" + s
	}
	pos := len(s) - decimals
	out := s[:pos] + "." + s[pos:]
	if neg {
		return "-" + out
	}
	return out
}
func itoa(v int64) string {
	if v == 0 {
		return "0"
	}
	var b [32]byte
	i := len(b)
	for v > 0 {
		i--
		b[i] = byte('0' + (v % 10))
		v /= 10
	}
	return string(b[i:])
}

func env(k, def string) string {
	if v := strings.TrimSpace(os.Getenv(k)); v != "" {
		return v
	}
	return def
}

func envBool(k string, def bool) bool {
	v := strings.TrimSpace(strings.ToLower(os.Getenv(k)))
	if v == "" {
		return def
	}
	switch v {
	case "1", "true", "yes", "y", "on":
		return true
	case "0", "false", "no", "n", "off":
		return false
	default:
		return def
	}
}

const indexHTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{{.Title}}</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" integrity="sha512-DTOQO9RWCH3ppGqcWaEA1BIZOC6xxalwEsw9c2QQeAIftl+Vegovlnee1c9QX4TctnWMn13TZye+giMm8e2LwA==" crossorigin="anonymous" referrerpolicy="no-referrer" />
<style>
:root{
  --bg:#0b0f17;
  --panel:#0f1626;
  --panel2:#0c1322;
  --border:rgba(255,255,255,.08);
  --txt:rgba(255,255,255,.88);
  --muted:rgba(255,255,255,.60);
  --glow:rgba(120,140,255,.25);
  --accent:rgba(140,180,255,.95);
  --good:rgba(90,220,160,.95);
  --warn:rgba(255,200,90,.95);
}
*{box-sizing:border-box}
html,body{height:100%}
body{
  margin:0;
  font:14px/1.35 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;
  background:radial-gradient(1200px 700px at 20% 10%, rgba(120,140,255,.12), transparent 60%),
             radial-gradient(900px 600px at 80% 30%, rgba(90,220,160,.08), transparent 55%),
             var(--bg);
  color:var(--txt);
  transition:background 0.3s ease, color 0.3s ease;
}
[data-theme="nordic"] body{
  background:var(--bg);
}
a{color:inherit}
.header, .footer{
  position:fixed; left:0; right:0;
  display:flex; align-items:center; gap:12px;
  padding:8px 16px;
  background:linear-gradient(180deg, rgba(15,22,38,.92), rgba(15,22,38,.72));
  backdrop-filter: blur(10px);
  border-bottom:1px solid var(--border);
  z-index:10;
  transition:background 0.3s ease, border-color 0.3s ease;
}
[data-theme="nordic"] .header, [data-theme="nordic"] .footer{
  background:linear-gradient(180deg, rgba(59,66,82,.95), rgba(59,66,82,.85));
  border-bottom:1px solid var(--border);
}
.footer{
  bottom:0; top:auto;
  border-bottom:none;
  border-top:1px solid var(--border);
  background:linear-gradient(0deg, rgba(15,22,38,.92), rgba(15,22,38,.72));
}
[data-theme="nordic"] .footer{
  background:linear-gradient(0deg, rgba(59,66,82,.95), rgba(59,66,82,.85));
}
.header{top:0}
.brand{
  display:flex; align-items:center; gap:10px; min-width:210px;
}
.dot{
  width:10px; height:10px; border-radius:50%;
  background:var(--accent);
  box-shadow:0 0 0 6px rgba(140,180,255,.12), 0 0 24px var(--glow);
  transition:background 0.3s ease, box-shadow 0.3s ease;
}
[data-theme="nordic"] .dot{
  box-shadow:0 0 0 4px rgba(136,192,208,.08), 0 0 16px var(--glow);
}
.h-title{font-weight:650; letter-spacing:.2px}
.h-sub{color:var(--muted); font-size:12px}
.search{
  flex:1;
  display:flex; gap:8px; align-items:center;
  max-width:900px;
}
.searchbox{
  flex:1;
  display:flex; align-items:center; flex-wrap:nowrap; gap:8px;
  background:rgba(12,19,34,.7);
  border:1px solid var(--border);
  border-radius:14px;
  padding:8px 8px 8px 12px;
  box-shadow:0 10px 30px rgba(0,0,0,.25);
  transition:background 0.3s ease, border-color 0.3s ease;
}
[data-theme="nordic"] .searchbox{
  background:rgba(67,76,94,.5);
  border:1px solid var(--border);
  box-shadow:0 4px 12px rgba(0,0,0,.2);
}
.searchbox input{
  flex:1;
  min-width:0;
  border:none; outline:none;
  background:transparent;
  color:var(--txt);
  font-size:14px;
}
.pill{
  border:1px solid var(--border);
  background:rgba(255,255,255,.03);
  color:var(--txt);
  padding:6px 10px;
  border-radius:12px;
  cursor:pointer;
  user-select:none;
  white-space:nowrap;
  display:inline-flex;
  align-items:center;
  flex-shrink:0;
}
.pill:hover{border-color:rgba(255,255,255,.16)}
.drop{
  position:relative;
}
.menu{
  position:absolute;
  right:0; top:36px;
  width:220px;
  background:rgba(15,22,38,.96);
  border:1px solid var(--border);
  border-radius:14px;
  padding:8px;
  display:none;
  box-shadow:0 20px 60px rgba(0,0,0,.35);
}
.menu button{
  width:100%;
  text-align:left;
  padding:10px 10px;
  border:none;
  background:transparent;
  color:var(--txt);
  border-radius:10px;
  cursor:pointer;
}
.menu button:hover{background:rgba(255,255,255,.06)}
.main{
  padding:80px 16px 64px 16px;
  max-width:1200px;
  margin:0 auto;
}
.grid{
  display:grid;
  grid-template-columns: repeat(12, 1fr);
  gap:12px;
}
.card{
  background:linear-gradient(180deg, rgba(15,22,38,.78), rgba(12,19,34,.62));
  border:1px solid var(--border);
  border-radius:18px;
  padding:14px;
  box-shadow:0 18px 55px rgba(0,0,0,.30);
  overflow:hidden;
  position:relative;
  transition:background 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
}
[data-theme="nordic"] .card{
  background:linear-gradient(180deg, rgba(59,66,82,.6), rgba(67,76,94,.4));
  border:1px solid var(--border);
  border-radius:12px;
  box-shadow:0 2px 8px rgba(0,0,0,.15);
}
.card::before{
  content:"";
  position:absolute; inset:-2px;
  background:radial-gradient(600px 140px at 30% 0%, rgba(140,180,255,.18), transparent 60%);
  pointer-events:none;
  transition:background 0.3s ease;
}
[data-theme="nordic"] .card::before{
  background:none;
}
.card h3{
  margin:0 0 10px 0;
  font-size:13px;
  letter-spacing:.25px;
  color:rgba(255,255,255,.78);
  font-weight:650;
  text-transform:uppercase;
  display:flex;
  align-items:center;
  gap:8px;
}
.card h3 a{
  margin-left:auto;
  opacity:0.7;
  transition:opacity 0.2s;
}
.card h3 a:hover{
  opacity:1;
}
.card h3 i{
  font-size:14px;
  opacity:0.85;
}
.timer-circle{
  width:14px;
  height:14px;
  border-radius:50%;
  border:2px solid rgba(255,255,255,0.2);
  background:rgba(255,255,255,0.05);
  margin-left:auto;
  cursor:pointer;
  position:relative;
  transition:opacity 0.2s;
  flex-shrink:0;
  overflow:hidden;
}
.timer-circle:hover{
  opacity:0.8;
  border-color:rgba(255,255,255,0.4);
}
.timer-circle::before{
  content:"";
  position:absolute;
  inset:0;
  border-radius:50%;
  background:conic-gradient(from 0deg, var(--accent) 0%, var(--accent) var(--progress-percent, 0%), transparent var(--progress-percent, 0%));
  opacity:0.6;
  transition:background 0.5s linear;
}
.timer-circle.paused::before{
  background:conic-gradient(from 0deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.5) 100%);
}
.kv{
  display:flex;
  justify-content:space-between;
  gap:10px;
  padding:8px 0;
  border-top:1px dashed rgba(255,255,255,.10);
  transition:border-color 0.3s ease;
}
[data-theme="nordic"] .kv{
  border-top:1px solid rgba(216,222,233,.08);
}
.kv:first-of-type{border-top:none; padding-top:0}
.k{color:var(--muted)}
.v{font-weight:600}
.badge{
  display:inline-flex; align-items:center; gap:8px;
  padding:6px 10px;
  border-radius:999px;
  border:1px solid var(--border);
  background:rgba(255,255,255,.03);
}
.pulse{
  width:8px; height:8px; border-radius:50%;
  background:var(--good);
  box-shadow:0 0 0 0 rgba(90,220,160,.55);
  animation:pulse 1.6s infinite;
}
@keyframes pulse{
  0%{box-shadow:0 0 0 0 rgba(90,220,160,.55)}
  70%{box-shadow:0 0 0 10px rgba(90,220,160,0)}
  100%{box-shadow:0 0 0 0 rgba(90,220,160,0)}
}
.small{font-size:12px; color:var(--muted)}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace}
.span-4{grid-column: span 4}
.span-6{grid-column: span 6}
.span-8{grid-column: span 8}
.span-12{grid-column: span 12}
@media (max-width: 980px){
  .brand{min-width:160px}
  .span-4,.span-6,.span-8{grid-column: span 12}
}
.footer .left{display:flex; align-items:center; gap:10px}
.footer .right{margin-left:auto; display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end}
.btn{
  border:1px solid var(--border);
  background:rgba(255,255,255,.03);
  color:var(--txt);
  padding:8px 10px;
  border-radius:12px;
  cursor:pointer;
  text-decoration:none;
}
.btn:hover{border-color:rgba(255,255,255,.16)}
.repo-item{
  padding:10px 0;
  border-top:1px dashed rgba(255,255,255,.10);
  transition:border-color 0.3s ease;
}
[data-theme="nordic"] .repo-item{
  border-top:1px solid rgba(216,222,233,.08);
}
.repo-item:first-child{border-top:none; padding-top:0}
.repo-item:last-child{padding-bottom:0}
.repo-name{
  font-weight:600;
  margin-bottom:4px;
  display:flex;
  align-items:center;
  gap:8px;
}
.repo-name a{
  color:var(--accent);
  text-decoration:none;
}
.repo-name a:hover{text-decoration:underline}
.repo-desc{
  font-size:12px;
  color:var(--muted);
  margin-bottom:6px;
  line-height:1.4;
}
.repo-meta{
  display:flex;
  gap:12px;
  font-size:11px;
  color:var(--muted);
  flex-wrap:wrap;
}
.repo-meta span{
  display:flex;
  align-items:center;
  gap:4px;
}
</style>
</head>
<body>
<script>
// Theme management
(function() {
  const savedTheme = localStorage.getItem('theme') || 'blue-dark';
  document.documentElement.setAttribute('data-theme', savedTheme);

  // Add theme switcher to footer
  window.addEventListener('DOMContentLoaded', function() {
    const footer = document.querySelector('.footer .right');
    if (footer) {
      const themeSwitcher = document.createElement('div');
      themeSwitcher.className = 'drop';
      themeSwitcher.innerHTML = '<button class="pill" id="themeBtn"><i class="fas fa-palette"></i> Theme</button><div class="menu" id="themeMenu" style="display:none;"><button data-theme="blue-dark"><i class="fas fa-circle" style="color:#8CB4FF;"></i> Blue Dark</button><button data-theme="nordic"><i class="fas fa-circle" style="color:#88C0D0;"></i> Nordic</button></div>';
      footer.insertBefore(themeSwitcher, footer.firstChild);

      const themeBtn = document.getElementById('themeBtn');
      const themeMenu = document.getElementById('themeMenu');

      themeBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        themeMenu.style.display = themeMenu.style.display === 'none' ? 'block' : 'none';
      });

      document.addEventListener('click', function(e) {
        if (!themeSwitcher.contains(e.target)) {
          themeMenu.style.display = 'none';
        }
      });

      themeMenu.querySelectorAll('button[data-theme]').forEach(btn => {
        btn.addEventListener('click', function() {
          const theme = this.getAttribute('data-theme');
          document.documentElement.setAttribute('data-theme', theme);
          localStorage.setItem('theme', theme);
          themeMenu.style.display = 'none';
          // Update active state
          themeMenu.querySelectorAll('button[data-theme]').forEach(b => b.style.background = '');
          this.style.background = 'rgba(255,255,255,.08)';
        });
      });

      // Mark current theme
      const currentThemeBtn = themeMenu.querySelector('button[data-theme="' + savedTheme + '"]');
      if (currentThemeBtn) {
        currentThemeBtn.style.background = 'rgba(255,255,255,.08)';
      }
    }
  });
})();
</script>
  <div class="header">
    <div class="brand">
      <div class="dot"></div>
      <div>
        <div class="h-title">{{.Title}}</div>
        <div class="h-sub" id="subtitle">Loading…</div>
      </div>
    </div>

    <div class="search">
      <div class="searchbox">
        <input id="q" placeholder="Search…" autocomplete="off" />
        <div class="drop">
          <div class="pill" id="engineBtn">Google ▾</div>
          <div class="menu" id="engineMenu"></div>
        </div>
      </div>
      <div class="pill" id="goBtn">Go</div>
    </div>
  </div>

  <div class="main">
    <div class="grid">
      <div class="card span-4">
        <h3><i class="fas fa-server"></i> Status</h3>
        <div class="badge"><span class="pulse"></span><span id="statusText">Online</span></div>
        <div class="kv"><div class="k">Host</div><div class="v mono" id="host">—</div></div>
        <div class="kv"><div class="k">Uptime</div><div class="v mono" id="uptime">—</div></div>
        <div class="kv"><div class="k">Server time</div><div class="v mono" id="time">—</div></div>
      </div>

      <div class="card span-4">
        <h3><i class="fas fa-network-wired"></i> Network<div class="timer-circle" id="ipTimer" title="Double-click to refresh"></div></h3>
        <div class="kv"><div class="k">LAN IPs</div><div class="v mono" id="lanIps">—</div></div>
        <div class="kv"><div class="k">Public IP</div><div class="v mono" id="pubIp">—</div></div>
        <div class="small" id="pubIpErr"></div>
      </div>

      <div class="card span-4">
        <h3><i class="fas fa-cloud-sun"></i> Weather<div class="timer-circle" id="weatherTimer" title="Double-click to refresh"></div></h3>
        <div class="kv"><div class="k">Athens, Greece</div><div class="v" id="weather">—</div></div>
        <div id="weatherForecast"></div>
        <div class="small" id="weatherErr"></div>
      </div>

      <div class="card span-4">
        <h3><i class="fas fa-microchip"></i> CPU<div class="timer-circle" id="cpuTimer" title="Double-click to refresh"></div></h3>
        <div class="kv"><div class="k">Usage</div><div class="v" id="cpuUsage">—</div></div>
        <div class="small" id="cpuErr"></div>
      </div>

      <div class="card span-4">
        <h3><i class="fas fa-memory"></i> RAM<div class="timer-circle" id="ramTimer" title="Double-click to refresh"></div></h3>
        <div class="kv"><div class="k">Used</div><div class="v mono" id="ramUsed">—</div></div>
        <div class="kv"><div class="k">Total</div><div class="v mono" id="ramTotal">—</div></div>
        <div class="kv"><div class="k">Available</div><div class="v mono" id="ramAvailable">—</div></div>
        <div class="kv"><div class="k">Usage</div><div class="v" id="ramPercent">—</div></div>
        <div class="small" id="ramErr"></div>
      </div>

      <div class="card span-4">
        <h3><i class="fas fa-hdd"></i> Disk<div class="timer-circle" id="diskTimer" title="Double-click to refresh"></div></h3>
        <div class="kv"><div class="k">Used</div><div class="v mono" id="diskUsed">—</div></div>
        <div class="kv"><div class="k">Total</div><div class="v mono" id="diskTotal">—</div></div>
        <div class="kv"><div class="k">Free</div><div class="v mono" id="diskFree">—</div></div>
        <div class="kv"><div class="k">Usage</div><div class="v" id="diskPercent">—</div></div>
        <div class="small" id="diskErr"></div>
      </div>

      <div class="card span-6">
        <h3><i class="fas fa-link"></i> Quick Links</h3>
        <div class="kv"><div class="k">Router</div><div class="v"><a class="btn" href="http://192.168.1.1" target="_blank" rel="noreferrer">Open</a></div></div>
        <div class="kv"><div class="k">Proxmox / NAS</div><div class="v"><span class="small">Edit these in HTML</span></div></div>
        <div class="kv"><div class="k">Docs</div><div class="v"><span class="small">Add internal wiki links</span></div></div>
      </div>

      <div class="card span-6">
        <h3><i class="fas fa-tools"></i> Utilities</h3>
        <div class="kv"><div class="k">Ping</div><div class="v"><span class="small">Add /api/ping later</span></div></div>
        <div class="kv"><div class="k">Wake-on-LAN</div><div class="v"><span class="small">Add /api/wol later</span></div></div>
        <div class="kv"><div class="k">Service checks</div><div class="v"><span class="small">Add /api/checks later</span></div></div>
      </div>

      <div class="card span-6">
        <h3><i class="fab fa-github"></i> GitHub - Earentir<a href="https://github.com/Earentir" target="_blank" rel="noreferrer"><i class="fas fa-external-link-alt"></i></a><div class="timer-circle" id="githubTimer" title="Double-click to refresh"></div></h3>
        <div class="small" style="margin-bottom:8px; color:var(--muted);">Total: <span id="userRepoCount">—</span> repositories</div>
        <div id="githubUserRepos">
          <div class="small">Loading repositories...</div>
        </div>
        <div class="small" id="githubUserErr"></div>
      </div>

      <div class="card span-6">
        <h3><i class="fab fa-github"></i> GitHub - network-plane<a href="https://github.com/network-plane" target="_blank" rel="noreferrer"><i class="fas fa-external-link-alt"></i></a></h3>
        <div class="small" style="margin-bottom:8px; color:var(--muted);">Total: <span id="orgRepoCount">—</span> repositories</div>
        <div id="githubOrgRepos">
          <div class="small">Loading repositories...</div>
        </div>
        <div class="small" id="githubOrgErr"></div>
      </div>
    </div>
  </div>

  <div class="footer">
    <div class="left">
      <div class="small">Shortcuts:</div>
      <div class="badge"><span class="mono">/</span><span class="small">focus search</span></div>
      <div class="badge"><span class="mono">Enter</span><span class="small">search</span></div>
      <div class="badge"><span class="mono">E</span><span class="small">engine</span></div>
    </div>
    <div class="right">
      <a class="btn" href="/api/summary" target="_blank" rel="noreferrer">API</a>
      <a class="btn" href="/healthz" target="_blank" rel="noreferrer">Health</a>
      <div class="btn" id="refreshBtn">Refresh</div>
    </div>
  </div>

<script>
const engines = [
  {name:"Google", url:"https://www.google.com/search?q=%s"},
  {name:"Perplexity", url:"https://www.perplexity.ai/search?q=%s"},
  {name:"DuckDuckGo", url:"https://duckduckgo.com/?q=%s"},
  {name:"Brave", url:"https://search.brave.com/search?q=%s"},
  {name:"Bing", url:"https://www.bing.com/search?q=%s"},
  {name:"Wikipedia", url:"https://en.wikipedia.org/wiki/Special:Search?search=%s"},
  {name:"GitHub", url:"https://github.com/search?q=%s"},
  {name:"Stack Overflow", url:"https://stackoverflow.com/search?q=%s"},
  {name:"YouTube", url:"https://www.youtube.com/results?search_query=%s"},
  {name:"Reddit", url:"https://www.reddit.com/search/?q=%s"},
];

let engine = engines[0];

const q = document.getElementById('q');
const engineBtn = document.getElementById('engineBtn');
const engineMenu = document.getElementById('engineMenu');

function renderEngines(){
  engineMenu.innerHTML = "";
  engines.forEach((e) => {
    const b = document.createElement('button');
    b.textContent = e.name;
    b.onclick = () => {
      engine = e;
      engineBtn.textContent = e.name + " ▾";
      engineMenu.style.display = "none";
      q.focus();
    };
    engineMenu.appendChild(b);
  });
}
renderEngines();

engineBtn.onclick = () => {
  engineMenu.style.display = (engineMenu.style.display === "block") ? "none" : "block";
};

document.addEventListener('click', (ev) => {
  if (!engineBtn.contains(ev.target) && !engineMenu.contains(ev.target)) {
    engineMenu.style.display = "none";
  }
});

function goSearch(){
  const term = (q.value || "").trim();
  if(!term) return;
  const u = engine.url.replace("%s", encodeURIComponent(term));
  window.open(u, "_blank", "noreferrer");
}

document.getElementById('goBtn').onclick = goSearch;
q.addEventListener('keydown', (e) => { if(e.key === "Enter") goSearch(); });

document.addEventListener('keydown', (e) => {
  if (e.key === "/") { e.preventDefault(); q.focus(); }
  if (e.key.toLowerCase() === "e" && document.activeElement !== q) {
    engineMenu.style.display = "block";
  }
});

function fmtUptime(sec){
  sec = Math.max(0, sec|0);
  const d = Math.floor(sec/86400); sec%=86400;
  const h = Math.floor(sec/3600); sec%=3600;
  const m = Math.floor(sec/60); sec%=60;
  const parts = [];
  if(d) parts.push(d+"d");
  if(h) parts.push(h+"h");
  if(m) parts.push(m+"m");
  parts.push(sec+"s");
  return parts.join(" ");
}

// Timer management
const timers = {
  cpu: {interval: 5000, lastUpdate: 0, timer: null}, // 5 seconds
  ram: {interval: 5000, lastUpdate: 0, timer: null}, // 5 seconds
  disk: {interval: 15000, lastUpdate: 0, timer: null}, // 15 seconds
  github: {interval: 900000, lastUpdate: 0, timer: null}, // 15 minutes
  weather: {interval: 1800000, lastUpdate: 0, timer: null}, // 30 minutes
  ip: {interval: 7200000, lastUpdate: 0, timer: null}, // 2 hours
  general: {interval: 30000, lastUpdate: 0, timer: null} // 30 seconds for other data
};

function updateTimer(moduleName) {
  const timer = timers[moduleName];
  if (!timer) return;
  const elapsed = Date.now() - timer.lastUpdate;
  const remaining = Math.max(0, timer.interval - elapsed);
  const timerEl = document.getElementById(moduleName + "Timer");
  if (timerEl) {
    const seconds = Math.ceil(remaining / 1000);
    const percent = (elapsed / timer.interval) * 100;
    const percentClamped = Math.min(100, Math.max(0, percent));

    if (remaining > 0) {
      timerEl.title = "Next refresh in " + seconds + "s (double-click to refresh now)";
      timerEl.classList.remove("paused");
      // Update CSS variable for progress percentage
      timerEl.style.setProperty("--progress-percent", percentClamped + "%");
    } else {
      timerEl.title = "Ready to refresh (double-click to refresh now)";
      timerEl.classList.add("paused");
      timerEl.style.setProperty("--progress-percent", "100%");
    }
  }
}

function startTimer(moduleName) {
  const timer = timers[moduleName];
  if (!timer) return;
  timer.lastUpdate = Date.now();
  updateTimer(moduleName);
  if (timer.timer) clearInterval(timer.timer);
  timer.timer = setInterval(() => updateTimer(moduleName), 1000);
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(2) + " " + sizes[i];
}

async function refreshCPU(){
  try{
    const res = await fetch("/api/system", {cache:"no-store"});
    const j = await res.json();
    if (j.cpu) {
      if (j.cpu.error) {
        document.getElementById("cpuUsage").textContent = "—";
        document.getElementById("cpuErr").textContent = j.cpu.error;
      } else {
        document.getElementById("cpuUsage").textContent = (j.cpu.usage || 0).toFixed(1) + "%";
        document.getElementById("cpuErr").textContent = "";
      }
    }
    startTimer("cpu");
  } catch(err){
    console.error("Error refreshing CPU:", err);
  }
}

async function refreshRAM(){
  try{
    const res = await fetch("/api/system", {cache:"no-store"});
    const j = await res.json();
    if (j.ram) {
      if (j.ram.error) {
        document.getElementById("ramUsed").textContent = "—";
        document.getElementById("ramTotal").textContent = "—";
        document.getElementById("ramAvailable").textContent = "—";
        document.getElementById("ramPercent").textContent = "—";
        document.getElementById("ramErr").textContent = j.ram.error;
      } else {
        document.getElementById("ramUsed").textContent = formatBytes(j.ram.used || 0);
        document.getElementById("ramTotal").textContent = formatBytes(j.ram.total || 0);
        document.getElementById("ramAvailable").textContent = formatBytes(j.ram.available || 0);
        document.getElementById("ramPercent").textContent = (j.ram.percent || 0).toFixed(1) + "%";
        document.getElementById("ramErr").textContent = "";
      }
    }
    startTimer("ram");
  } catch(err){
    console.error("Error refreshing RAM:", err);
  }
}

async function refreshDisk(){
  try{
    const res = await fetch("/api/system", {cache:"no-store"});
    const j = await res.json();
    if (j.disk) {
      if (j.disk.error) {
        document.getElementById("diskUsed").textContent = "—";
        document.getElementById("diskTotal").textContent = "—";
        document.getElementById("diskFree").textContent = "—";
        document.getElementById("diskPercent").textContent = "—";
        document.getElementById("diskErr").textContent = j.disk.error;
      } else {
        document.getElementById("diskUsed").textContent = formatBytes(j.disk.used || 0);
        document.getElementById("diskTotal").textContent = formatBytes(j.disk.total || 0);
        document.getElementById("diskFree").textContent = formatBytes(j.disk.free || 0);
        document.getElementById("diskPercent").textContent = (j.disk.percent || 0).toFixed(1) + "%";
        document.getElementById("diskErr").textContent = "";
      }
    }
    startTimer("disk");
  } catch(err){
    console.error("Error refreshing Disk:", err);
  }
}

async function refreshWeather(){
  try{
    const res = await fetch("/api/weather", {cache:"no-store"});
    const j = await res.json();

    document.getElementById("weather").textContent = j.summary || "—";
    const forecastContainer = document.getElementById("weatherForecast");
    if (j.forecast && j.forecast.length > 0) {
      forecastContainer.innerHTML = "";
      j.forecast.forEach((day) => {
        const kv = document.createElement("div");
        kv.className = "kv";
        const k = document.createElement("div");
        k.className = "k";
        k.textContent = day.split(":")[0];
        const v = document.createElement("div");
        v.className = "v";
        v.textContent = day.split(":")[1] || day;
        kv.appendChild(k);
        kv.appendChild(v);
        forecastContainer.appendChild(kv);
      });
    } else {
      forecastContainer.innerHTML = "";
    }
    document.getElementById("weatherErr").textContent = j.error || "";

    startTimer("weather");
  } catch(err){
    console.error("Error refreshing weather:", err);
  }
}

async function refreshGitHub(){
  try{
    const res = await fetch("/api/github", {cache:"no-store"});
    const j = await res.json();

    // GitHub user repos
    const userContainer = document.getElementById("githubUserRepos");
    const userErr = document.getElementById("githubUserErr");
    if (j.userRepos) {
      if (j.userRepos.repos && j.userRepos.repos.length > 0) {
        document.getElementById("userRepoCount").textContent = j.userRepos.total || j.userRepos.repos.length;
        userContainer.innerHTML = "";
        j.userRepos.repos.forEach((repo) => {
          const item = document.createElement("div");
          item.className = "repo-item";
          const name = document.createElement("div");
          name.className = "repo-name";
          const link = document.createElement("a");
          link.href = repo.url;
          link.target = "_blank";
          link.rel = "noreferrer";
          link.innerHTML = '<i class="fab fa-github"></i> ' + repo.fullName;
          name.appendChild(link);
          item.appendChild(name);
          if (repo.description) {
            const desc = document.createElement("div");
            desc.className = "repo-desc";
            desc.textContent = repo.description;
            item.appendChild(desc);
          }
          const meta = document.createElement("div");
          meta.className = "repo-meta";
          if (repo.stars > 0) {
            const stars = document.createElement("span");
            stars.innerHTML = '<i class="fas fa-star"></i> ' + repo.stars;
            meta.appendChild(stars);
          }
          if (repo.language) {
            const lang = document.createElement("span");
            lang.innerHTML = '<i class="fas fa-code"></i> ' + repo.language;
            meta.appendChild(lang);
          }
          if (repo.updated) {
            const updated = document.createElement("span");
            updated.innerHTML = '<i class="fas fa-clock"></i> ' + repo.updated;
            meta.appendChild(updated);
          }
          item.appendChild(meta);
          userContainer.appendChild(item);
        });
        userErr.textContent = "";
      } else if (j.userRepos && j.userRepos.error) {
        userContainer.innerHTML = "";
        userErr.textContent = j.userRepos.error;
      } else {
        userContainer.innerHTML = '<div class="small">No repositories found.</div>';
        userErr.textContent = "";
      }
    }

    // GitHub org repos
    const orgContainer = document.getElementById("githubOrgRepos");
    const orgErr = document.getElementById("githubOrgErr");
    if (j.orgRepos) {
      if (j.orgRepos.repos && j.orgRepos.repos.length > 0) {
        document.getElementById("orgRepoCount").textContent = j.orgRepos.total || j.orgRepos.repos.length;
        orgContainer.innerHTML = "";
        j.orgRepos.repos.forEach((repo) => {
          const item = document.createElement("div");
          item.className = "repo-item";
          const name = document.createElement("div");
          name.className = "repo-name";
          const link = document.createElement("a");
          link.href = repo.url;
          link.target = "_blank";
          link.rel = "noreferrer";
          link.innerHTML = '<i class="fab fa-github"></i> ' + repo.fullName;
          name.appendChild(link);
          item.appendChild(name);
          if (repo.description) {
            const desc = document.createElement("div");
            desc.className = "repo-desc";
            desc.textContent = repo.description;
            item.appendChild(desc);
          }
          const meta = document.createElement("div");
          meta.className = "repo-meta";
          if (repo.stars > 0) {
            const stars = document.createElement("span");
            stars.innerHTML = '<i class="fas fa-star"></i> ' + repo.stars;
            meta.appendChild(stars);
          }
          if (repo.language) {
            const lang = document.createElement("span");
            lang.innerHTML = '<i class="fas fa-code"></i> ' + repo.language;
            meta.appendChild(lang);
          }
          if (repo.updated) {
            const updated = document.createElement("span");
            updated.innerHTML = '<i class="fas fa-clock"></i> ' + repo.updated;
            meta.appendChild(updated);
          }
          item.appendChild(meta);
          orgContainer.appendChild(item);
        });
        orgErr.textContent = "";
      } else if (j.orgRepos && j.orgRepos.error) {
        orgContainer.innerHTML = "";
        orgErr.textContent = j.orgRepos.error;
      } else {
        orgContainer.innerHTML = '<div class="small">No repositories found.</div>';
        orgErr.textContent = "";
      }
    }

    startTimer("github");
  } catch(err){
    console.error("Error refreshing GitHub:", err);
  }
}

async function refreshIP(){
  try{
    const res = await fetch("/api/ip", {cache:"no-store"});
    const j = await res.json();

    // Display LAN IPs with PTR records
    const lanIpsEl = document.getElementById("lanIps");
    if (j.network && j.network.hostIps && j.network.hostIps.length > 0) {
      const ipStrings = j.network.hostIps.map(ipInfo => {
        if (ipInfo.ptr) {
          return ipInfo.ip + " (" + ipInfo.ptr + ")";
        }
        return ipInfo.ip;
      });
      lanIpsEl.textContent = ipStrings.join(", ");
    } else {
      lanIpsEl.textContent = "—";
    }

    if (j.public && j.public.ip) {
      let pubIpText = j.public.ip;
      if (j.public.ptr) {
        pubIpText += " (" + j.public.ptr + ")";
      }
      document.getElementById("pubIp").textContent = pubIpText;
      document.getElementById("pubIpErr").textContent = "";
    } else {
      document.getElementById("pubIp").textContent = "—";
      document.getElementById("pubIpErr").textContent = (j.public && j.public.error) || "";
    }

    startTimer("ip");
  } catch(err){
    console.error("Error refreshing IP:", err);
  }
}

async function refresh(){
  try{
    const res = await fetch("/api/summary", {cache:"no-store"});
    const j = await res.json();

    document.getElementById("subtitle").textContent =
      j.server.os + "/" + j.server.arch + " • " + j.server.goVersion;

    document.getElementById("host").textContent = j.server.hostname;
    document.getElementById("uptime").textContent = fmtUptime(j.server.uptimeSec);
    document.getElementById("time").textContent = j.server.time;

  } catch(err){
    document.getElementById("statusText").textContent = "Degraded";
  }
}

document.getElementById("refreshBtn").onclick = refresh;

// Setup double-click handlers for timers
const refreshHandlers = {
  cpu: refreshCPU,
  ram: refreshRAM,
  disk: refreshDisk,
  github: refreshGitHub,
  weather: refreshWeather,
  ip: refreshIP
};

["cpu", "ram", "disk", "github", "weather", "ip"].forEach(module => {
  const timerEl = document.getElementById(module + "Timer");
  if (timerEl) {
    let lastClick = 0;
    timerEl.addEventListener("dblclick", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const handler = refreshHandlers[module];
      if (handler) handler();
    });
    // Also handle click for better compatibility
    timerEl.addEventListener("click", (e) => {
      const now = Date.now();
      if (now - lastClick < 300) {
        e.preventDefault();
        e.stopPropagation();
        const handler = refreshHandlers[module];
        if (handler) handler();
      }
      lastClick = now;
    });
  }
});

// Initial refresh
refresh();
refreshCPU();
refreshRAM();
refreshDisk();
refreshGitHub();
refreshWeather();
refreshIP();

// Set up intervals - each module refreshes independently
setInterval(refresh, 30000); // General refresh every 30s (server info only)
setInterval(refreshCPU, 5000); // CPU every 5s
setInterval(refreshRAM, 5000); // RAM every 5s
setInterval(refreshDisk, 15000); // Disk every 15s
setInterval(refreshGitHub, 900000); // GitHub every 15 minutes (cache handles this)
setInterval(refreshWeather, 1800000); // Weather every 30 minutes
setInterval(refreshIP, 7200000); // IP every 2 hours
</script>
</body>
</html>`
