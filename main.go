// Package main provides a homepage dashboard server with system metrics, weather, GitHub integration, and customizable themes.
package main

import (
	"embed"
	"flag"
	"html/template"
	"io/fs"
	"log"
	"net"
	"net/http"
	"runtime"
	"strings"
	"time"

	"github.com/gorilla/websocket"

	"homepage/api"
)

//go:embed templates
var templatesFS embed.FS

//go:embed static
var staticFS embed.FS

// ThemeMetadata represents metadata parsed from CSS template files.
type ThemeMetadata struct {
	Template string
	Scheme   string
	Accent   string
	Display  string
	Border   bool
}

// TemplateInfo contains information about a CSS template and its color schemes.
type TemplateInfo struct {
	Name    string
	BaseCSS string
	Schemes map[string]SchemeInfo
}

// SchemeInfo contains information about a color scheme within a template.
type SchemeInfo struct {
	Name    string
	Accent  string
	Display string
	Border  bool
	CSS     string
}

var (
	templatesMap  map[string]*TemplateInfo
	templatesList []string
	indexTemplate *template.Template
	appversion    = "0.2.86"
)

// findBlockEnd finds the end of a CSS block (the matching closing brace)
func findBlockEnd(content string, startPos int) int {
	if startPos >= len(content) {
		return len(content)
	}

	openBrace := strings.Index(content[startPos:], "{")
	if openBrace == -1 {
		return len(content)
	}
	openBrace += startPos

	depth := 1
	pos := openBrace + 1
	for pos < len(content) && depth > 0 {
		switch content[pos] {
		case '{':
			depth++
		case '}':
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
		Accent:   "rgba(136,192,208,.85)",
		Display:  "",
		Border:   false,
	}

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

func parseSchemesFromTemplate(cssContent string) ([]SchemeInfo, string) {
	var schemes []SchemeInfo
	content := cssContent
	pos := 0
	lastSchemeEnd := 0

	for pos < len(content) {
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

		metadataBlock := content[metaStart : metaEnd+2]
		meta := parseThemeMetadata(metadataBlock)

		if meta.Template == "" || meta.Scheme == "" {
			pos = metaEnd + 2
			continue
		}

		schemeSelector := `[data-scheme="` + meta.Scheme + `"]`
		schemeStart := strings.Index(content[metaEnd:], schemeSelector)
		isWrappedFormat := true
		if schemeStart == -1 {
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

		var schemeEnd int
		if isWrappedFormat {
			nextMetaStart := strings.Index(content[schemeStart:], "/*")
			if nextMetaStart == -1 {
				baseCSSMarker := strings.Index(content[schemeStart:], "/* Base CSS")
				if baseCSSMarker != -1 {
					schemeEnd = schemeStart + baseCSSMarker
				} else {
					schemeEnd = len(content)
				}
			} else {
				nextMetaPos := schemeStart + nextMetaStart
				nextMetaEnd := strings.Index(content[nextMetaPos:], "*/")
				if nextMetaEnd != -1 {
					nextMetaBlock := content[nextMetaPos : nextMetaPos+nextMetaEnd+2]
					nextMeta := parseThemeMetadata(nextMetaBlock)
					if nextMeta.Template != "" && nextMeta.Scheme != "" {
						schemeEnd = nextMetaPos
					} else {
						schemeEnd = nextMetaPos
					}
				} else {
					schemeEnd = schemeStart + nextMetaStart
				}
			}
		} else {
			rootBlockEnd := findBlockEnd(content, schemeStart)
			schemeEnd = rootBlockEnd

			bodyStart := strings.Index(content[schemeEnd:], "body{")
			if bodyStart != -1 && bodyStart < 50 {
				bodyBlockEnd := findBlockEnd(content, schemeEnd+bodyStart)
				schemeEnd = bodyBlockEnd
			}
		}

		schemeCSS := strings.TrimSpace(content[schemeStart:schemeEnd])
		lastSchemeEnd = schemeEnd

		if !strings.HasPrefix(schemeCSS, `[data-scheme="`) {
			wrappedCSS := `[data-scheme="` + meta.Scheme + `"] ` + schemeCSS
			schemeCSS = wrappedCSS
		}

		alreadyExists := false
		for _, existingScheme := range schemes {
			if existingScheme.Name == meta.Scheme {
				alreadyExists = true
				break
			}
		}

		if !alreadyExists {
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

	baseCSSStart := strings.Index(content, "/* Base CSS")
	if baseCSSStart != -1 {
		baseCSSEnd := strings.Index(content[baseCSSStart:], "*/")
		if baseCSSEnd != -1 {
			baseCSSStart = baseCSSStart + baseCSSEnd + 2
			for baseCSSStart < len(content) && (content[baseCSSStart] == ' ' || content[baseCSSStart] == '\n' || content[baseCSSStart] == '\r' || content[baseCSSStart] == '\t') {
				baseCSSStart++
			}
		}
	} else {
		baseCSSStart = lastSchemeEnd
		for baseCSSStart < len(content) && (content[baseCSSStart] == ' ' || content[baseCSSStart] == '\n' || content[baseCSSStart] == '\r' || content[baseCSSStart] == '\t') {
			baseCSSStart++
		}
	}

	baseCSS := strings.TrimSpace(content[baseCSSStart:])

	return schemes, baseCSS
}

func init() {
	templatesMap = make(map[string]*TemplateInfo)
	templatesList = []string{}

	indexHTML, err := templatesFS.ReadFile("templates/index.html")
	if err != nil {
		log.Fatalf("Failed to read index.html: %v", err)
	}
	indexTemplate = template.Must(template.New("index").Parse(string(indexHTML)))

	entries, err := fs.ReadDir(templatesFS, "templates")
	if err != nil {
		log.Fatalf("Failed to read templates directory: %v", err)
	}

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".css") {
			continue
		}

		cssContent, err := templatesFS.ReadFile("templates/" + entry.Name())
		if err != nil {
			log.Printf("Warning: failed to read template %s: %v", entry.Name(), err)
			continue
		}

		schemes, baseCSS := parseSchemesFromTemplate(string(cssContent))
		if len(schemes) == 0 {
			continue
		}

		// Get template name from metadata - search for a metadata block with Template:
		templateName := ""
		content := string(cssContent)
		pos := 0
		for pos < len(content) {
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
			metadataBlock := content[metaStart+2 : metaEnd]
			if strings.Contains(metadataBlock, "Template:") {
				meta := parseThemeMetadata(content[metaStart : metaEnd+2])
				if meta.Template != "" {
					templateName = meta.Template
					break
				}
			}
			pos = metaEnd + 2
		}
		if templateName == "" {
			templateName = strings.TrimSuffix(entry.Name(), ".css")
		}

		templateInfo := &TemplateInfo{
			Name:    templateName,
			BaseCSS: baseCSS,
			Schemes: make(map[string]SchemeInfo),
		}

		for _, scheme := range schemes {
			templateInfo.Schemes[scheme.Name] = scheme
		}

		templatesMap[templateName] = templateInfo
		templatesList = append(templatesList, templateName)
	}

	templatesList = sortTemplates(templatesList)

	log.Printf("Loaded %d theme templates:", len(templatesMap))
	for name, info := range templatesMap {
		schemeNames := make([]string, 0, len(info.Schemes))
		for schemeName := range info.Schemes {
			schemeNames = append(schemeNames, schemeName)
		}
		log.Printf("  - %s: %d schemes (%s)", name, len(info.Schemes), strings.Join(schemeNames, ", "))
	}
}

func sortTemplates(templates []string) []string {
	preferredOrder := []string{"nordic", "modern", "minimal", "matrix", "ocean", "forest", "bladerunner", "alien", "youtube"}
	var sorted []string
	var others []string

	for _, preferred := range preferredOrder {
		for _, t := range templates {
			if t == preferred {
				sorted = append(sorted, t)
				break
			}
		}
	}

	for _, t := range templates {
		found := false
		for _, preferred := range preferredOrder {
			if t == preferred {
				found = true
				break
			}
		}
		if !found {
			others = append(others, t)
		}
	}

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
	port := flag.String("port", "8080", "Port to listen on")
	flag.Parse()

	listenAddr := ":" + *port
	cfg := api.Config{
		ListenAddr:      listenAddr,
		Title:           "LAN Index",
		PublicIPTimeout: 1500 * time.Millisecond,
		Weather: api.WeatherConfig{
			Enabled:  true,
			Lat:      "",
			Lon:      "",
			Provider: "openmeteo",
			APIKey:   "",
		},
	}

	mux := http.NewServeMux()

	// Index page handler
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}

		defaultTemplate := "nordic"
		defaultScheme := "default"
		if len(templatesList) > 0 {
			defaultTemplate = templatesList[0]
			if templateInfo, exists := templatesMap[defaultTemplate]; exists {
				for schemeName := range templateInfo.Schemes {
					defaultScheme = schemeName
					break
				}
			}
		}

		templateName := defaultTemplate
		schemeName := defaultScheme

		themeCSS := "/* Theme CSS loaded dynamically from /api/theme */"

		var templateMenuHTML strings.Builder
		var schemeMenuHTML strings.Builder

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

		if templateInfo, exists := templatesMap[templateName]; exists {
			schemeNames := make([]string, 0, len(templateInfo.Schemes))
			for name := range templateInfo.Schemes {
				schemeNames = append(schemeNames, name)
			}
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
			"AppVersion":       appversion,
		})
	})

	// Theme CSS API
	mux.HandleFunc("/api/theme", func(w http.ResponseWriter, r *http.Request) {
		templateName := "nordic"
		schemeName := "default"

		if qTemplate := r.URL.Query().Get("template"); qTemplate != "" {
			if _, exists := templatesMap[qTemplate]; exists {
				templateName = qTemplate
			}
		}
		if qScheme := r.URL.Query().Get("scheme"); qScheme != "" {
			if templateInfo, exists := templatesMap[templateName]; exists {
				if _, schemeExists := templateInfo.Schemes[qScheme]; schemeExists {
					schemeName = qScheme
				}
			}
		}

		var themeCSS string
		if templateInfo, exists := templatesMap[templateName]; exists {
			if scheme, schemeExists := templateInfo.Schemes[schemeName]; schemeExists {
				themeCSS = scheme.CSS + "\n" + templateInfo.BaseCSS
			} else if defaultScheme, hasDefault := templateInfo.Schemes["default"]; hasDefault {
				themeCSS = defaultScheme.CSS + "\n" + templateInfo.BaseCSS
			}
		}

		w.Header().Set("Content-Type", "text/css; charset=utf-8")
		w.Header().Set("Cache-Control", "public, max-age=3600")
		_, _ = w.Write([]byte(themeCSS))
	})

	// Register API handlers
	apiHandler := api.NewHandler(cfg)
	apiHandler.RegisterHandlers(mux)

	// Service worker
	mux.HandleFunc("/sw.js", func(w http.ResponseWriter, r *http.Request) {
		swContent, err := fs.ReadFile(staticFS, "static/sw.js")
		if err != nil {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/javascript")
		w.Header().Set("Service-Worker-Allowed", "/")
		w.Write(swContent)
	})

	// Static files with explicit Content-Type for JavaScript
	staticContent, err := fs.Sub(staticFS, "static")
	if err != nil {
		log.Fatalf("Failed to create static file sub-filesystem: %v", err)
	}

	// Custom handler to ensure proper Content-Type for JS files
	mux.Handle("/static/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if strings.HasSuffix(path, ".js") {
			w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
		} else if strings.HasSuffix(path, ".css") {
			w.Header().Set("Content-Type", "text/css; charset=utf-8")
		}
		http.StripPrefix("/static/", http.FileServer(http.FS(staticContent))).ServeHTTP(w, r)
	}))

	// WebSocket handler
	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return true
		},
	}

	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("WebSocket upgrade error: %v", err)
			return
		}
		defer conn.Close()

		log.Printf("WebSocket client connected from %s", r.RemoteAddr)

		ctx := r.Context()
		isLocal := api.IsLocalRequest(r)

		serverInfo := api.ServerInfo{
			Hostname:  api.MustHostname(),
			OS:        runtime.GOOS,
			Arch:      runtime.GOARCH,
			GoVersion: runtime.Version(),
			UptimeSec: api.GetSystemUptime(),
			Time:      time.Now().Format(time.RFC3339),
			IsLocal:   isLocal,
		}
		if err := conn.WriteJSON(map[string]any{
			"type":   "status",
			"status": "online",
			"server": serverInfo,
		}); err != nil {
			log.Printf("WebSocket write error: %v", err)
			return
		}

		systemTicker := time.NewTicker(5 * time.Second)
		defer systemTicker.Stop()

		pingTicker := time.NewTicker(30 * time.Second)
		defer pingTicker.Stop()

		conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		conn.SetPongHandler(func(string) error {
			conn.SetReadDeadline(time.Now().Add(60 * time.Second))
			return nil
		})

		done := make(chan struct{})
		go func() {
			defer close(done)
			for {
				_, _, err := conn.ReadMessage()
				if err != nil {
					if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
						log.Printf("WebSocket error: %v", err)
					}
					return
				}
			}
		}()

		for {
			select {
			case <-done:
				return
			case <-systemTicker.C:
				metrics := api.GetSystemMetrics(ctx)
				if err := conn.WriteJSON(map[string]any{
					"type":   "system",
					"system": metrics,
					"server": api.ServerInfo{Time: time.Now().Format(time.RFC3339), UptimeSec: api.GetSystemUptime()},
				}); err != nil {
					log.Printf("WebSocket system update error: %v", err)
					return
				}
			case <-pingTicker.C:
				if err := conn.WriteJSON(map[string]string{"type": "ping"}); err != nil {
					log.Printf("WebSocket ping error: %v", err)
					return
				}
			}
		}
	})

	srv := &http.Server{
		Addr:              cfg.ListenAddr,
		Handler:           api.WithSecurityHeaders(mux),
		ReadHeaderTimeout: 5 * time.Second,
	}

	_, listenPort, _ := net.SplitHostPort(cfg.ListenAddr)
	if listenPort == "" {
		listenPort = "8080"
	}

	log.Printf("Dashboard starting...")
	log.Printf("  Listening on: %s", cfg.ListenAddr)

	ifaces, err := net.Interfaces()
	if err == nil {
		for _, iface := range ifaces {
			if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
				continue
			}
			addrs, err := iface.Addrs()
			if err != nil {
				continue
			}
			for _, addr := range addrs {
				var ip net.IP
				switch v := addr.(type) {
				case *net.IPNet:
					ip = v.IP
				case *net.IPAddr:
					ip = v.IP
				}
				if ip == nil || ip.IsLoopback() {
					continue
				}
				if ip.To4() != nil {
					log.Printf("  http://%s:%s", ip.String(), listenPort)
				}
			}
		}
	}
	log.Printf("  http://localhost:%s", listenPort)

	log.Fatal(srv.ListenAndServe())
}
