package api

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// Bookmark represents a browser bookmark.
type Bookmark struct {
	Title string `json:"title"`
	URL   string `json:"url"`
}

// ChromeBookmarkNode represents a node in Chrome's bookmark JSON structure.
type ChromeBookmarkNode struct {
	Name     string                `json:"name"`
	URL      string                `json:"url,omitempty"`
	Type     string                `json:"type,omitempty"`
	Children []ChromeBookmarkNode  `json:"children,omitempty"`
}

// ChromeBookmarkRoot represents the root of Chrome's bookmark JSON structure.
type ChromeBookmarkRoot struct {
	Roots struct {
		BookmarkBar ChromeBookmarkNode `json:"bookmark_bar"`
		Other       ChromeBookmarkNode `json:"other"`
		Synced      ChromeBookmarkNode `json:"synced"`
	} `json:"roots"`
}

// GetBookmarks reads bookmarks from common browser locations.
// If preferredBrowser is specified, it will try to read only from that browser first.
// If preferredBrowser is empty or the preferred browser is not found, it falls back to reading from all browsers.
func GetBookmarks(preferredBrowser string) ([]Bookmark, error) {
	log.Printf("[BOOKMARKS] GetBookmarks called with preferredBrowser: '%s'", preferredBrowser)
	var allBookmarks []Bookmark
	foundPreferred := false

	// If a preferred browser is specified, try to read from it first
	if preferredBrowser != "" {
		log.Printf("[BOOKMARKS] Attempting to read from preferred browser: %s", preferredBrowser)
		switch strings.ToLower(preferredBrowser) {
		case "chrome", "chromium":
			chromeBookmarks, err := getChromeBookmarks()
			log.Printf("[BOOKMARKS] Chrome bookmarks: count=%d, error=%v", len(chromeBookmarks), err)
			if err == nil && len(chromeBookmarks) > 0 {
				allBookmarks = append(allBookmarks, chromeBookmarks...)
				foundPreferred = true
				log.Printf("[BOOKMARKS] Successfully loaded %d Chrome bookmarks", len(chromeBookmarks))
			}
		case "firefox":
			firefoxBookmarks, err := getFirefoxBookmarks()
			log.Printf("[BOOKMARKS] Firefox bookmarks: count=%d, error=%v", len(firefoxBookmarks), err)
			if err == nil && len(firefoxBookmarks) > 0 {
				allBookmarks = append(allBookmarks, firefoxBookmarks...)
				foundPreferred = true
				log.Printf("[BOOKMARKS] Successfully loaded %d Firefox bookmarks", len(firefoxBookmarks))
			}
		case "edge":
			edgeBookmarks, err := getEdgeBookmarks()
			log.Printf("[BOOKMARKS] Edge bookmarks: count=%d, error=%v", len(edgeBookmarks), err)
			if err == nil && len(edgeBookmarks) > 0 {
				allBookmarks = append(allBookmarks, edgeBookmarks...)
				foundPreferred = true
				log.Printf("[BOOKMARKS] Successfully loaded %d Edge bookmarks", len(edgeBookmarks))
			}
		case "brave":
			braveBookmarks, err := getBraveBookmarks()
			log.Printf("[BOOKMARKS] Brave bookmarks: count=%d, error=%v", len(braveBookmarks), err)
			if err == nil && len(braveBookmarks) > 0 {
				allBookmarks = append(allBookmarks, braveBookmarks...)
				foundPreferred = true
				log.Printf("[BOOKMARKS] Successfully loaded %d Brave bookmarks", len(braveBookmarks))
			}
		}
	}

	// If preferred browser not found or not specified, try all browsers
	if !foundPreferred {
		log.Printf("[BOOKMARKS] Preferred browser not found or not specified, trying all browsers...")
		// Try Chrome/Chromium bookmarks
		chromeBookmarks, err := getChromeBookmarks()
		log.Printf("[BOOKMARKS] Chrome bookmarks: count=%d, error=%v", len(chromeBookmarks), err)
		if err == nil {
			allBookmarks = append(allBookmarks, chromeBookmarks...)
		}

		// Try Firefox bookmarks (HTML format)
		firefoxBookmarks, err := getFirefoxBookmarks()
		log.Printf("[BOOKMARKS] Firefox bookmarks: count=%d, error=%v", len(firefoxBookmarks), err)
		if err == nil {
			allBookmarks = append(allBookmarks, firefoxBookmarks...)
		}

		// Try Edge bookmarks (same format as Chrome)
		edgeBookmarks, err := getEdgeBookmarks()
		log.Printf("[BOOKMARKS] Edge bookmarks: count=%d, error=%v", len(edgeBookmarks), err)
		if err == nil {
			allBookmarks = append(allBookmarks, edgeBookmarks...)
		}

		// Try Brave bookmarks (same format as Chrome)
		braveBookmarks, err := getBraveBookmarks()
		log.Printf("[BOOKMARKS] Brave bookmarks: count=%d, error=%v", len(braveBookmarks), err)
		if err == nil {
			allBookmarks = append(allBookmarks, braveBookmarks...)
		}
	}

	log.Printf("[BOOKMARKS] Total bookmarks before deduplication: %d", len(allBookmarks))

	// Remove duplicates (by URL)
	uniqueBookmarks := make([]Bookmark, 0)
	seen := make(map[string]bool)
	for _, bookmark := range allBookmarks {
		if bookmark.URL != "" && !seen[bookmark.URL] {
			seen[bookmark.URL] = true
			uniqueBookmarks = append(uniqueBookmarks, bookmark)
		}
	}

	log.Printf("[BOOKMARKS] Total unique bookmarks after deduplication: %d", len(uniqueBookmarks))
	return uniqueBookmarks, nil
}

// DetectBrowserFromUserAgent detects the browser from User-Agent string.
func DetectBrowserFromUserAgent(userAgent string) string {
	ua := strings.ToLower(userAgent)
	if strings.Contains(ua, "edg") {
		return "edge"
	} else if strings.Contains(ua, "chrome") && !strings.Contains(ua, "edg") {
		return "chrome"
	} else if strings.Contains(ua, "firefox") {
		return "firefox"
	} else if strings.Contains(ua, "brave") {
		return "brave"
	}
	return ""
}

// getChromeBookmarks reads bookmarks from Chrome/Chromium.
func getChromeBookmarks() ([]Bookmark, error) {
	var baseDirs []string

	if runtime.GOOS == "windows" {
		// Windows paths
		localAppData := os.Getenv("LOCALAPPDATA")
		if localAppData == "" {
			log.Printf("[BOOKMARKS] LOCALAPPDATA not set on Windows")
			return nil, fmt.Errorf("LOCALAPPDATA not set")
		}
		baseDirs = []string{
			filepath.Join(localAppData, "Google", "Chrome", "User Data"),
			filepath.Join(localAppData, "Google", "Chrome Beta", "User Data"),
			filepath.Join(localAppData, "Google", "Chrome SxS", "User Data"), // Chrome Canary
			filepath.Join(localAppData, "Chromium", "User Data"),
		}
	} else {
		// Linux/macOS paths
		homeDir, err := os.UserHomeDir()
		if err != nil {
			log.Printf("[BOOKMARKS] Failed to get home directory: %v", err)
			return nil, err
		}
		baseDirs = []string{
			filepath.Join(homeDir, ".config", "google-chrome"),
			filepath.Join(homeDir, ".config", "chromium"),
			filepath.Join(homeDir, ".config", "google-chrome-beta"),
			filepath.Join(homeDir, ".config", "google-chrome-unstable"),
		}
		// macOS paths
		if runtime.GOOS == "darwin" {
			baseDirs = append(baseDirs,
				filepath.Join(homeDir, "Library", "Application Support", "Google", "Chrome"),
				filepath.Join(homeDir, "Library", "Application Support", "Chromium"),
			)
		}
	}

	log.Printf("[BOOKMARKS] Searching for Chrome bookmarks in %d directories (OS: %s)", len(baseDirs), runtime.GOOS)
	for _, baseDir := range baseDirs {
		log.Printf("[BOOKMARKS] Trying Chrome directory: %s", baseDir)
		// Try to find bookmarks in any profile directory
		bookmarks, err := findChromeBookmarksInDir(baseDir)
		if err == nil && len(bookmarks) > 0 {
			log.Printf("[BOOKMARKS] Found Chrome bookmarks in %s: %d bookmarks", baseDir, len(bookmarks))
			return bookmarks, nil
		} else if err != nil {
			log.Printf("[BOOKMARKS] Error reading from %s: %v", baseDir, err)
		}
	}

	log.Printf("[BOOKMARKS] Chrome bookmarks not found in any directory")
	return nil, fmt.Errorf("chrome bookmarks not found")
}

// findChromeBookmarksInDir searches for bookmarks in a Chrome base directory.
func findChromeBookmarksInDir(baseDir string) ([]Bookmark, error) {
	// Check if base directory exists
	if _, err := os.Stat(baseDir); os.IsNotExist(err) {
		log.Printf("[BOOKMARKS] Directory does not exist: %s", baseDir)
		return nil, fmt.Errorf("directory does not exist: %s", baseDir)
	}

	// First try the common "Default" profile
	defaultPath := filepath.Join(baseDir, "Default", "Bookmarks")
	log.Printf("[BOOKMARKS] Trying default profile: %s", defaultPath)
	if bookmarks, err := readChromeBookmarksFile(defaultPath); err == nil {
		log.Printf("[BOOKMARKS] Found bookmarks in default profile: %d bookmarks", len(bookmarks))
		return bookmarks, nil
	} else {
		log.Printf("[BOOKMARKS] Default profile not found or error: %v", err)
	}

	// If Default doesn't exist, try to find any profile directory
	entries, err := os.ReadDir(baseDir)
	if err != nil {
		log.Printf("[BOOKMARKS] Error reading directory %s: %v", baseDir, err)
		return nil, err
	}

	log.Printf("[BOOKMARKS] Found %d entries in %s, searching for profiles...", len(entries), baseDir)
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		// Skip system directories
		if entry.Name() == "System Profile" || entry.Name() == "Guest Profile" {
			log.Printf("[BOOKMARKS] Skipping system directory: %s", entry.Name())
			continue
		}
		profilePath := filepath.Join(baseDir, entry.Name(), "Bookmarks")
		log.Printf("[BOOKMARKS] Trying profile: %s", profilePath)
		if bookmarks, err := readChromeBookmarksFile(profilePath); err == nil {
			log.Printf("[BOOKMARKS] Found bookmarks in profile %s: %d bookmarks", entry.Name(), len(bookmarks))
			return bookmarks, nil
		} else {
			log.Printf("[BOOKMARKS] Profile %s error: %v", entry.Name(), err)
		}
	}

	log.Printf("[BOOKMARKS] No bookmarks found in %s", baseDir)
	return nil, fmt.Errorf("no bookmarks found in %s", baseDir)
}

// readChromeBookmarksFile reads and parses a Chrome bookmarks file.
func readChromeBookmarksFile(path string) ([]Bookmark, error) {
	log.Printf("[BOOKMARKS] Attempting to read Chrome bookmarks file: %s", path)
	
	// Check if file exists
	if _, err := os.Stat(path); os.IsNotExist(err) {
		log.Printf("[BOOKMARKS] File does not exist: %s", path)
		return nil, fmt.Errorf("file does not exist: %s", path)
	}

	file, err := os.Open(path)
	if err != nil {
		log.Printf("[BOOKMARKS] Error opening file %s: %v", path, err)
		return nil, err
	}
	defer file.Close()

	var root ChromeBookmarkRoot
	if err := json.NewDecoder(file).Decode(&root); err != nil {
		log.Printf("[BOOKMARKS] Error decoding JSON from %s: %v", path, err)
		return nil, err
	}

	var bookmarks []Bookmark
	extractBookmarks(&root.Roots.BookmarkBar, &bookmarks)
	extractBookmarks(&root.Roots.Other, &bookmarks)
	extractBookmarks(&root.Roots.Synced, &bookmarks)

	log.Printf("[BOOKMARKS] Successfully parsed %d bookmarks from %s", len(bookmarks), path)
	return bookmarks, nil
}

// extractBookmarks recursively extracts bookmarks from a Chrome bookmark node.
func extractBookmarks(node *ChromeBookmarkNode, bookmarks *[]Bookmark) {
	if node.Type == "url" && node.URL != "" {
		*bookmarks = append(*bookmarks, Bookmark{
			Title: node.Name,
			URL:   node.URL,
		})
	}

	for i := range node.Children {
		extractBookmarks(&node.Children[i], bookmarks)
	}
}

// getEdgeBookmarks reads bookmarks from Microsoft Edge.
func getEdgeBookmarks() ([]Bookmark, error) {
	log.Printf("[BOOKMARKS] Searching for Edge bookmarks...")
	var baseDirs []string

	if runtime.GOOS == "windows" {
		// Windows paths
		localAppData := os.Getenv("LOCALAPPDATA")
		if localAppData == "" {
			log.Printf("[BOOKMARKS] LOCALAPPDATA not set on Windows")
			return nil, fmt.Errorf("LOCALAPPDATA not set")
		}
		baseDirs = []string{
			filepath.Join(localAppData, "Microsoft", "Edge", "User Data"),
			filepath.Join(localAppData, "Microsoft", "Edge Beta", "User Data"),
			filepath.Join(localAppData, "Microsoft", "Edge Dev", "User Data"),
		}
	} else {
		// Linux paths
		homeDir, err := os.UserHomeDir()
		if err != nil {
			log.Printf("[BOOKMARKS] Failed to get home directory for Edge: %v", err)
			return nil, err
		}
		baseDirs = []string{
			filepath.Join(homeDir, ".config", "microsoft-edge"),
			filepath.Join(homeDir, ".config", "microsoft-edge-beta"),
			filepath.Join(homeDir, ".config", "microsoft-edge-dev"),
		}
		// macOS paths
		if runtime.GOOS == "darwin" {
			baseDirs = append(baseDirs,
				filepath.Join(homeDir, "Library", "Application Support", "Microsoft Edge"),
			)
		}
	}

	log.Printf("[BOOKMARKS] Trying %d Edge directories (OS: %s)", len(baseDirs), runtime.GOOS)
	for _, baseDir := range baseDirs {
		log.Printf("[BOOKMARKS] Trying Edge directory: %s", baseDir)
		bookmarks, err := findChromeBookmarksInDir(baseDir) // Edge uses same format as Chrome
		if err == nil && len(bookmarks) > 0 {
			log.Printf("[BOOKMARKS] Found Edge bookmarks in %s: %d bookmarks", baseDir, len(bookmarks))
			return bookmarks, nil
		} else if err != nil {
			log.Printf("[BOOKMARKS] Edge directory %s error: %v", baseDir, err)
		}
	}

	log.Printf("[BOOKMARKS] Edge bookmarks not found")
	return nil, fmt.Errorf("edge bookmarks not found")
}

// getBraveBookmarks reads bookmarks from Brave browser.
func getBraveBookmarks() ([]Bookmark, error) {
	log.Printf("[BOOKMARKS] Searching for Brave bookmarks...")
	var baseDir string

	if runtime.GOOS == "windows" {
		// Windows paths
		localAppData := os.Getenv("LOCALAPPDATA")
		if localAppData == "" {
			log.Printf("[BOOKMARKS] LOCALAPPDATA not set on Windows")
			return nil, fmt.Errorf("LOCALAPPDATA not set")
		}
		baseDir = filepath.Join(localAppData, "BraveSoftware", "Brave-Browser", "User Data")
	} else {
		// Linux paths
		homeDir, err := os.UserHomeDir()
		if err != nil {
			log.Printf("[BOOKMARKS] Failed to get home directory for Brave: %v", err)
			return nil, err
		}
		baseDir = filepath.Join(homeDir, ".config", "BraveSoftware", "Brave-Browser")
		// macOS paths
		if runtime.GOOS == "darwin" {
			baseDir = filepath.Join(homeDir, "Library", "Application Support", "BraveSoftware", "Brave-Browser")
		}
	}

	log.Printf("[BOOKMARKS] Trying Brave directory: %s (OS: %s)", baseDir, runtime.GOOS)
	bookmarks, err := findChromeBookmarksInDir(baseDir) // Brave uses same format as Chrome
	if err == nil {
		log.Printf("[BOOKMARKS] Found Brave bookmarks: %d bookmarks", len(bookmarks))
	} else {
		log.Printf("[BOOKMARKS] Brave bookmarks error: %v", err)
	}
	return bookmarks, err
}

// getFirefoxBookmarks reads bookmarks from Firefox (HTML format).
func getFirefoxBookmarks() ([]Bookmark, error) {
	log.Printf("[BOOKMARKS] Searching for Firefox bookmarks...")
	var firefoxDir string

	if runtime.GOOS == "windows" {
		// Windows paths
		appData := os.Getenv("APPDATA")
		if appData == "" {
			log.Printf("[BOOKMARKS] APPDATA not set on Windows")
			return nil, fmt.Errorf("APPDATA not set")
		}
		firefoxDir = filepath.Join(appData, "Mozilla", "Firefox")
	} else {
		// Linux/macOS paths
		homeDir, err := os.UserHomeDir()
		if err != nil {
			log.Printf("[BOOKMARKS] Failed to get home directory for Firefox: %v", err)
			return nil, err
		}
		if runtime.GOOS == "darwin" {
			firefoxDir = filepath.Join(homeDir, "Library", "Application Support", "Firefox")
		} else {
			firefoxDir = filepath.Join(homeDir, ".mozilla", "firefox")
		}
	}

	log.Printf("[BOOKMARKS] Firefox directory: %s (OS: %s)", firefoxDir, runtime.GOOS)
	
	entries, err := os.ReadDir(firefoxDir)
	if err != nil {
		log.Printf("[BOOKMARKS] Error reading Firefox directory %s: %v", firefoxDir, err)
		return nil, err
	}

	log.Printf("[BOOKMARKS] Found %d entries in Firefox directory", len(entries))
	var bookmarksFile string
	for _, entry := range entries {
		if entry.IsDir() && (strings.Contains(entry.Name(), ".default") || strings.Contains(entry.Name(), ".default-release")) {
			potentialFile := filepath.Join(firefoxDir, entry.Name(), "bookmarks.html")
			log.Printf("[BOOKMARKS] Checking Firefox profile: %s", potentialFile)
			if _, err := os.Stat(potentialFile); err == nil {
				bookmarksFile = potentialFile
				log.Printf("[BOOKMARKS] Found Firefox bookmarks file: %s", bookmarksFile)
				break
			} else {
				log.Printf("[BOOKMARKS] Firefox bookmarks file not found: %s (error: %v)", potentialFile, err)
			}
		}
	}

	if bookmarksFile == "" {
		log.Printf("[BOOKMARKS] Firefox bookmarks not found in any profile")
		return nil, fmt.Errorf("firefox bookmarks not found")
	}

	bookmarks, err := readFirefoxBookmarksFile(bookmarksFile)
	if err == nil {
		log.Printf("[BOOKMARKS] Successfully read %d Firefox bookmarks from %s", len(bookmarks), bookmarksFile)
	} else {
		log.Printf("[BOOKMARKS] Error reading Firefox bookmarks from %s: %v", bookmarksFile, err)
	}
	return bookmarks, err
}

// readFirefoxBookmarksFile reads and parses a Firefox bookmarks.html file.
func readFirefoxBookmarksFile(path string) ([]Bookmark, error) {
	log.Printf("[BOOKMARKS] Attempting to read Firefox bookmarks file: %s", path)
	
	file, err := os.Open(path)
	if err != nil {
		log.Printf("[BOOKMARKS] Error opening Firefox bookmarks file %s: %v", path, err)
		return nil, err
	}
	defer file.Close()

	content, err := io.ReadAll(file)
	if err != nil {
		log.Printf("[BOOKMARKS] Error reading Firefox bookmarks file %s: %v", path, err)
		return nil, err
	}

	log.Printf("[BOOKMARKS] Read %d bytes from Firefox bookmarks file", len(content))
	var bookmarks []Bookmark
	htmlContent := string(content)

	// Parse HTML bookmarks - Firefox uses <DT><A HREF="url">title</A></DT> format
	lines := strings.Split(htmlContent, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if !strings.Contains(line, "<DT><A") && !strings.Contains(line, "<dt><a") {
			continue
		}

		// Extract URL
		urlStart := strings.Index(line, "HREF=\"")
		if urlStart == -1 {
			urlStart = strings.Index(line, "href=\"")
		}
		if urlStart == -1 {
			continue
		}

		var urlEnd int
		if urlStart > 0 {
			if strings.Contains(line[urlStart:], "HREF=\"") {
				urlStart += len("HREF=\"")
				urlEnd = strings.Index(line[urlStart:], "\"")
			} else {
				urlStart += len("href=\"")
				urlEnd = strings.Index(line[urlStart:], "\"")
			}
		}

		if urlEnd == -1 {
			continue
		}

		url := line[urlStart : urlStart+urlEnd]

		// Extract title (between > and </A>)
		titleStart := strings.Index(line, ">")
		if titleStart == -1 {
			continue
		}
		titleStart++

		titleEnd := strings.Index(line[titleStart:], "</A>")
		if titleEnd == -1 {
			titleEnd = strings.Index(line[titleStart:], "</a>")
		}
		if titleEnd == -1 {
			continue
		}

		title := line[titleStart : titleStart+titleEnd]
		title = strings.TrimSpace(title)

		if url != "" && title != "" {
			bookmarks = append(bookmarks, Bookmark{
				Title: title,
				URL:   url,
			})
		}
	}

	log.Printf("[BOOKMARKS] Parsed %d bookmarks from Firefox HTML file", len(bookmarks))
	return bookmarks, nil
}

// FilterBookmarks filters bookmarks by search term.
func FilterBookmarks(bookmarks []Bookmark, term string) []Bookmark {
	if term == "" {
		return bookmarks
	}

	termLower := strings.ToLower(term)
	var filtered []Bookmark

	for _, bookmark := range bookmarks {
		titleLower := strings.ToLower(bookmark.Title)
		urlLower := strings.ToLower(bookmark.URL)

		if strings.Contains(titleLower, termLower) || strings.Contains(urlLower, termLower) {
			filtered = append(filtered, bookmark)
		}
	}

	return filtered
}
