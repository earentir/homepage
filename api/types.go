// Package api provides HTTP API handlers for the homepage dashboard.
package api

import (
	"sync"
	"time"
)

// APIRoot represents the root API response structure.
type APIRoot struct {
	Server  ServerInfo    `json:"server"`
	Client  ClientInfo    `json:"client"`
	Network NetworkInfo   `json:"network"`
	Public  PublicIPInfo  `json:"public"`
	Weather WeatherInfo   `json:"weather"`
	GitHub  GitHubInfo    `json:"github"`
	System  SystemMetrics `json:"system"`
}

// ServerInfo contains server system information.
type ServerInfo struct {
	Hostname        string `json:"hostname"`
	OS              string `json:"os"`
	Arch            string `json:"arch"`
	GoVersion       string `json:"goVersion"`
	UptimeSec       int64  `json:"uptimeSec"`
	UptimeFormatted string `json:"uptimeFormatted,omitempty"`
	Time            string `json:"time"`
	IsLocal         bool   `json:"isLocal"`
}

// ClientInfo contains client information extracted from the request.
type ClientInfo struct {
	IP       string `json:"ip"`
	Hostname string `json:"hostname"`
	IsLocal  bool   `json:"isLocal"`
	OS       string `json:"os,omitempty"`
	Browser  string `json:"browser,omitempty"`
	Timezone string `json:"timezone,omitempty"`
}

// NetworkInfo contains network interface information.
type NetworkInfo struct {
	HostIPs []HostIPInfo `json:"hostIps"`
}

// HostIPInfo contains information about a host IP address.
type HostIPInfo struct {
	IP  string `json:"ip"`
	PTR string `json:"ptr,omitempty"`
}

// PublicIPInfo contains information about the public IP address.
type PublicIPInfo struct {
	IP    string `json:"ip"`
	PTR   string `json:"ptr,omitempty"`
	Error string `json:"error,omitempty"`
}

// WeatherInfo contains weather data and forecast information.
type WeatherInfo struct {
	Enabled  bool            `json:"enabled"`
	Summary  string          `json:"summary,omitempty"`
	Forecast []string        `json:"forecast,omitempty"`
	Current  *WeatherCurrent `json:"current,omitempty"`
	Today    *WeatherDay     `json:"today,omitempty"`
	Tomorrow *WeatherDay     `json:"tomorrow,omitempty"`
	Error    string          `json:"error,omitempty"`
}

// WeatherCurrent contains current weather conditions.
type WeatherCurrent struct {
	Temperature       float64 `json:"temperature"`
	TempUnit          string  `json:"tempUnit"`
	FeelsLike         float64 `json:"feelsLike,omitempty"`
	Humidity          float64 `json:"humidity"`
	WindSpeed         float64 `json:"windSpeed"`
	WindUnit          string  `json:"windUnit"`
	WindDirection     int     `json:"windDirection,omitempty"`
	Pressure          float64 `json:"pressure,omitempty"`
	UVIndex           float64 `json:"uvIndex,omitempty"`
	CloudCover        float64 `json:"cloudCover,omitempty"`
	Visibility        float64 `json:"visibility,omitempty"`
	DewPoint          float64 `json:"dewPoint,omitempty"`
	PrecipitationProb float64 `json:"precipitationProb,omitempty"`
	WeatherCode       int     `json:"weatherCode"`
	Icon              string  `json:"icon,omitempty"`
	IconDescription   string  `json:"iconDescription,omitempty"`
}

// WeatherDay contains weather forecast for a single day.
type WeatherDay struct {
	TempMax           float64 `json:"tempMax"`
	TempMin           float64 `json:"tempMin"`
	TempUnit          string  `json:"tempUnit"`
	PrecipitationProb float64 `json:"precipitationProb,omitempty"`
	UVIndexMax        float64 `json:"uvIndexMax,omitempty"`
	WeatherCode       int     `json:"weatherCode"`
	Icon              string  `json:"icon,omitempty"`
	IconDescription   string  `json:"iconDescription,omitempty"`
	Sunrise           string  `json:"sunrise,omitempty"`
	Sunset            string  `json:"sunset,omitempty"`
}

// WeatherData contains parsed weather data from API responses.
type WeatherData struct {
	Summary  string
	Forecast []string
	Current  *WeatherCurrent
	Today    *WeatherDay
	Tomorrow *WeatherDay
}

// GitHubInfo contains GitHub repository information.
type GitHubInfo struct {
	UserRepos GitHubUserRepos `json:"userRepos,omitempty"`
	OrgRepos  GitHubOrgRepos  `json:"orgRepos,omitempty"`
}

// SystemMetrics contains system resource usage metrics.
type SystemMetrics struct {
	CPU  CPUInfo  `json:"cpu"`
	RAM  RAMInfo  `json:"ram"`
	Disk DiskInfo `json:"disk"`
}

// CPUInfo contains CPU usage information.
type CPUInfo struct {
	Usage float64 `json:"usage"`
	Error string  `json:"error,omitempty"`
}

// RAMInfo contains RAM/memory usage information.
type RAMInfo struct {
	Total          uint64  `json:"total"`
	Used           uint64  `json:"used"`
	Available      uint64  `json:"available"`
	Percent        float64 `json:"percent"`
	TotalFormatted string  `json:"totalFormatted,omitempty"`
	UsedFormatted  string  `json:"usedFormatted,omitempty"`
	FreeFormatted  string  `json:"freeFormatted,omitempty"`
	Error          string  `json:"error,omitempty"`
}

// DiskInfo contains disk storage usage information.
type DiskInfo struct {
	MountPoint     string  `json:"mountPoint,omitempty"`
	Total          uint64  `json:"total"`
	Used           uint64  `json:"used"`
	Free           uint64  `json:"free"`
	Percent        float64 `json:"percent"`
	TotalFormatted string  `json:"totalFormatted,omitempty"`
	UsedFormatted  string  `json:"usedFormatted,omitempty"`
	FreeFormatted  string  `json:"freeFormatted,omitempty"`
	Error          string  `json:"error,omitempty"`
}

// DiskPartition represents a disk partition/mount point.
type DiskPartition struct {
	Device     string `json:"device"`
	MountPoint string `json:"mountPoint"`
	FSType     string `json:"fsType"`
}

// CPUDetailsInfo contains detailed CPU information from CPUID.
type CPUDetailsInfo struct {
	Name          string         `json:"name"`
	Vendor        string         `json:"vendor,omitempty"`
	PhysicalCores int            `json:"physicalCores"`
	VirtualCores  int            `json:"virtualCores"`
	Family        int            `json:"family,omitempty"`
	Model         int            `json:"model,omitempty"`
	Stepping      int            `json:"stepping,omitempty"`
	Cache         []CPUCacheInfo `json:"cache,omitempty"`
	Features      []string       `json:"features,omitempty"`
	HybridCPU     bool           `json:"hybridCPU,omitempty"`
	CoreType      string         `json:"coreType,omitempty"`
	Error         string         `json:"error,omitempty"`
}

// CPUCacheInfo contains CPU cache information.
type CPUCacheInfo struct {
	Level    int     `json:"level"`
	Type     string  `json:"type"`
	SizeKB   int     `json:"sizeKB"`
	SpeedMHz float64 `json:"speedMHz,omitempty"`
}

// RAMModuleInfo contains information about a single RAM module.
type RAMModuleInfo struct {
	Size             uint64 `json:"size"`
	DeviceLocator   string `json:"deviceLocator,omitempty"`
	BankLocator     string `json:"bankLocator,omitempty"`
	Manufacturer    string `json:"manufacturer,omitempty"`
	PartNumber      string `json:"partNumber,omitempty"`
	SerialNumber    string `json:"serialNumber,omitempty"`
	SizeString      string `json:"sizeString"`
	SpeedString     string `json:"speedString,omitempty"`
	Type            string `json:"type,omitempty"`
	FormFactor      string `json:"formFactor,omitempty"`
	VoltageString   string `json:"voltageString,omitempty"`
	Speed           uint16 `json:"speed,omitempty"`           // Max speed
	ConfiguredSpeed uint16 `json:"configuredSpeed,omitempty"`  // Current/configured speed
	Voltage         uint16 `json:"voltage,omitempty"`
}

// SMBIOSRAMInfo contains SMBIOS RAM information.
type SMBIOSRAMInfo struct {
	TotalSize       uint64          `json:"totalSize"`
	TotalSizeString string          `json:"totalSizeString"`
	Manufacturer    string          `json:"manufacturer,omitempty"`
	Modules         []RAMModuleInfo `json:"modules,omitempty"`
	Error           string          `json:"error,omitempty"`
}

// SMBIOSFirmwareInfo contains SMBIOS BIOS/Firmware information.
type SMBIOSFirmwareInfo struct {
	Vendor      string `json:"vendor,omitempty"`
	Version     string `json:"version,omitempty"`
	ReleaseDate string `json:"releaseDate,omitempty"`
	Error       string `json:"error,omitempty"`
}

// SMBIOSSystemInfo contains SMBIOS System information.
type SMBIOSSystemInfo struct {
	Manufacturer string `json:"manufacturer,omitempty"`
	ProductName  string `json:"productName,omitempty"`
	Version      string `json:"version,omitempty"`
	SerialNumber string `json:"serialNumber,omitempty"`
	UUID         string `json:"uuid,omitempty"`
	WakeUpType   string `json:"wakeUpType,omitempty"`
	SKUNumber    string `json:"skuNumber,omitempty"`
	Family       string `json:"family,omitempty"`
	Error        string `json:"error,omitempty"`
}

// SMBIOSBaseboardInfo contains SMBIOS Baseboard information.
type SMBIOSBaseboardInfo struct {
	Manufacturer      string   `json:"manufacturer,omitempty"`
	Product           string   `json:"product,omitempty"`
	Version           string   `json:"version,omitempty"`
	SerialNumber      string   `json:"serialNumber,omitempty"`
	AssetTag          string   `json:"assetTag,omitempty"`
	LocationInChassis string   `json:"locationInChassis,omitempty"`
	BoardType         string   `json:"boardType,omitempty"`
	FeatureFlags      []string `json:"featureFlags,omitempty"`
	Error             string   `json:"error,omitempty"`
}

// GitHubUserRepos contains GitHub user repository information.
type GitHubUserRepos struct {
	Repos      []GitHubRepo `json:"repos,omitempty"`
	Total      int          `json:"total,omitempty"`
	AccountURL string       `json:"accountUrl,omitempty"`
	Error      string       `json:"error,omitempty"`
}

// GitHubOrgRepos contains GitHub organization repository information.
type GitHubOrgRepos struct {
	Repos      []GitHubRepo `json:"repos,omitempty"`
	Total      int          `json:"total,omitempty"`
	AccountURL string       `json:"accountUrl,omitempty"`
	Error      string       `json:"error,omitempty"`
}

// GitHubRepo contains information about a GitHub repository.
type GitHubRepo struct {
	Name        string `json:"name"`
	FullName    string `json:"fullName"`
	Description string `json:"description"`
	URL         string `json:"url"`
	Stars       int    `json:"stars"`
	Language    string `json:"language"`
	Updated     string `json:"updated"`
}

// GitHubReposResponse is the response for the repos endpoint.
type GitHubReposResponse struct {
	Repos           []GitHubRepo `json:"repos,omitempty"`
	Total           int          `json:"total"`
	AccountURL      string       `json:"accountUrl,omitempty"`
	Error           string       `json:"error,omitempty"`
	RateLimitError  string       `json:"rateLimitError,omitempty"`
	RateLimitReset  string       `json:"rateLimitReset,omitempty"`
	RetryAfter      int          `json:"retryAfter,omitempty"`
	RemainingCalls  int          `json:"remainingCalls,omitempty"`
	RateLimitUsed   int          `json:"rateLimitUsed,omitempty"`
	CoreRateLimit   int          `json:"coreRateLimit,omitempty"`
	SearchRateLimit int          `json:"searchRateLimit,omitempty"`
}

// GitHubPRsResponse is the response for the PRs endpoint.
type GitHubPRsResponse struct {
	Items          []GitHubPRItem `json:"items,omitempty"`
	Total          int            `json:"total"`
	Error          string         `json:"error,omitempty"`
	RateLimitError string         `json:"rateLimitError,omitempty"`
	RateLimitReset string         `json:"rateLimitReset,omitempty"`
	RetryAfter     int            `json:"retryAfter,omitempty"`
	RemainingCalls int            `json:"remainingCalls,omitempty"`
}

// GitHubPRItem represents a pull request item.
type GitHubPRItem struct {
	Title     string `json:"title"`
	URL       string `json:"url"`
	Repo      string `json:"repo"`
	State     string `json:"state"`
	User      string `json:"user"`
	Author    string `json:"author"` // Keep for backwards compatibility
	Created   string `json:"created"`
	CreatedAt string `json:"createdAt"` // Keep for backwards compatibility
	UpdatedAt string `json:"updatedAt"`
}

// GitHubCommitsResponse is the response for the commits endpoint.
type GitHubCommitsResponse struct {
	Items          []GitHubCommitItem `json:"items,omitempty"`
	Total          int                `json:"total"`
	Error          string             `json:"error,omitempty"`
	RateLimitError string             `json:"rateLimitError,omitempty"`
	RateLimitReset string             `json:"rateLimitReset,omitempty"`
	RetryAfter     int                `json:"retryAfter,omitempty"`
	RemainingCalls int                `json:"remainingCalls,omitempty"`
}

// GitHubCommitItem represents a commit item.
type GitHubCommitItem struct {
	SHA     string `json:"sha"`
	Message string `json:"message"`
	URL     string `json:"url"`
	Repo    string `json:"repo"`
	Author  string `json:"author"`
	Date    string `json:"date"`
}

// GitHubIssuesResponse is the response for the issues endpoint.
type GitHubIssuesResponse struct {
	Items          []GitHubIssueItem `json:"items,omitempty"`
	Total          int               `json:"total"`
	Error          string            `json:"error,omitempty"`
	RateLimitError string            `json:"rateLimitError,omitempty"`
	RateLimitReset string            `json:"rateLimitReset,omitempty"`
	RetryAfter     int               `json:"retryAfter,omitempty"`
	RemainingCalls int               `json:"remainingCalls,omitempty"`
}

// GitHubIssueItem represents an issue item.
type GitHubIssueItem struct {
	Title     string   `json:"title"`
	URL       string   `json:"url"`
	Repo      string   `json:"repo"`
	State     string   `json:"state"`
	User      string   `json:"user"`
	Author    string   `json:"author"` // Keep for backwards compatibility
	Labels    []string `json:"labels,omitempty"`
	Created   string   `json:"created"`
	CreatedAt string   `json:"createdAt"` // Keep for backwards compatibility
	UpdatedAt string   `json:"updatedAt"`
}

// GitHubStatsResponse is the response for the stats endpoint.
type GitHubStatsResponse struct {
	Stats          *GitHubStats `json:"stats,omitempty"`
	Error          string       `json:"error,omitempty"`
	RateLimitError string       `json:"rateLimitError,omitempty"`
	RateLimitReset string       `json:"rateLimitReset,omitempty"`
	RetryAfter     int          `json:"retryAfter,omitempty"`
	RemainingCalls int          `json:"remainingCalls,omitempty"`
}

// GitHubStats represents repository or account statistics.
type GitHubStats struct {
	// Repository stats
	Stars        int      `json:"stars"`
	Forks        int      `json:"forks"`
	Watchers     int      `json:"watchers"`
	OpenIssues   int      `json:"openIssues"`
	TotalIssues  int      `json:"totalIssues"`             // Total issues (open + closed)
	OpenPRs      int      `json:"openPRs"`                // Open pull requests
	TotalPRs     int      `json:"totalPRs"`               // Total pull requests (open + closed)
	Language     string   `json:"language,omitempty"`
	Languages    []string `json:"languages,omitempty"`    // All languages used in repo
	Size         int      `json:"size,omitempty"`         // Repository size in KB
	RepoCreatedAt string  `json:"repoCreatedAt,omitempty"` // Repository creation date
	RepoUpdatedAt string  `json:"repoUpdatedAt,omitempty"` // Last push date
	License      string   `json:"license,omitempty"`      // Repository license
	IsFork       bool     `json:"isFork,omitempty"`       // Whether it's a fork
	IsArchived   bool     `json:"isArchived,omitempty"`   // Whether it's archived
	Topics       []string `json:"topics,omitempty"`       // Repository topics

	// Account stats (users/orgs)
	PublicRepos   int    `json:"publicRepos,omitempty"`
	PrivateRepos  int    `json:"privateRepos,omitempty"`
	Followers     int    `json:"followers,omitempty"`
	Following     int    `json:"following,omitempty"`
	TotalCommits  int    `json:"totalCommits,omitempty"`
	StarredRepos  int    `json:"starredRepos,omitempty"`  // Repos starred by this account
	Gists         int    `json:"gists,omitempty"`          // Gist count (users only)
	AccountType   string `json:"accountType,omitempty"`
	AccountCreatedAt string `json:"accountCreatedAt,omitempty"` // Account creation date
	AccountUpdatedAt string `json:"accountUpdatedAt,omitempty"` // Account last update date
	Location      string `json:"location,omitempty"`       // Account location
	Company       string `json:"company,omitempty"`       // Account company
	Bio           string `json:"bio,omitempty"`            // Account bio
	Blog          string `json:"blog,omitempty"`           // Account blog/website
}

// GitHubCache provides thread-safe caching for GitHub repository data.
type GitHubCache struct {
	mu        sync.RWMutex
	userRepos GitHubUserRepos
	orgRepos  GitHubOrgRepos
	lastFetch time.Time
	hasData   bool
}

// PTRCacheEntry holds a cached PTR record.
type PTRCacheEntry struct {
	PTR       string
	Timestamp time.Time
}

// PTRCache holds cached PTR records.
type PTRCache struct {
	mu      sync.RWMutex
	entries map[string]PTRCacheEntry
}

// HTTPCheckResult contains the result of an HTTP check.
type HTTPCheckResult struct {
	Latency   int64
	SSLExpiry *time.Time
	SSLError  string
}

// MonitorResult is the response for the monitor endpoint.
type MonitorResult struct {
	Success   bool   `json:"success"`
	Latency   int64  `json:"latency,omitempty"`
	Error     string `json:"error,omitempty"`
	SSLExpiry string `json:"sslExpiry,omitempty"`
	SSLError  string `json:"sslError,omitempty"`
}

// GeoLocation represents a geocoded location.
type GeoLocation struct {
	Name      string  `json:"name"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	Country   string  `json:"country"`
	Admin1    string  `json:"admin1,omitempty"`
}

// RSSFeedItem represents an RSS feed item.
type RSSFeedItem struct {
	Title       string `json:"title"`
	Link        string `json:"link"`
	Description string `json:"description,omitempty"`
	PubDate     string `json:"pubDate,omitempty"`
}

// Config holds the application configuration.
type Config struct {
	ListenAddr      string
	Title           string
	PublicIPTimeout time.Duration
	Weather         WeatherConfig
}

// WeatherConfig holds weather service configuration.
type WeatherConfig struct {
	Enabled  bool
	Lat      string
	Lon      string
	Provider string
	APIKey   string
}
