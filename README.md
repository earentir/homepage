# Homepage Dashboard

A comprehensive, customizable dashboard application built with Go and vanilla JavaScript. This dashboard provides system monitoring, weather information, GitHub integration, RSS feeds, calendar management, and much more.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Configuration](#configuration)
- [Modules](#modules)
- [API Endpoints](#api-endpoints)
- [Themes](#themes)
- [Usage](#usage)
- [Development](#development)

## Features

### Core Features

- **System Monitoring**: Real-time CPU, RAM, and disk usage with historical graphs
- **SMBIOS Integration**: Detailed hardware information (BIOS, System, Baseboard, RAM modules)
- **Weather Integration**: Current conditions and forecasts with support for multiple providers
- **GitHub Integration**: Repository monitoring, pull requests, commits, and issues
- **RSS Feed Reader**: Subscribe to and read RSS feeds
- **Calendar & Events**: Month and week calendar views with event management
- **Todo List**: Task management with priorities
- **Service Monitoring**: Health checks for HTTP/HTTPS services with SSL certificate monitoring
- **SNMP Support**: Query SNMP devices on your network
- **Quick Links**: Customizable bookmark collection with favicon support
- **Search**: Global search with history
- **Drag-and-Drop Layout**: Fully customizable module arrangement with split columns
- **Quick Module Actions**: Drag to left edge to disable, drag to right edge to temporarily pin
- **Theme System**: Multiple themes with color scheme variations

## Installation

### Prerequisites

- Go 1.25.5 or later
- Linux/macOS/Windows

### Build

```bash
go build -o homepage
```

### Run

```bash
# Basic usage (creates default config file)
./homepage

# Custom port
./homepage --port 3000

# Custom IP and port
./homepage --listen 192.168.1.100 --port 8080

# Use custom config file
./homepage --config /etc/homepage/config.json
```

### SMBIOS Access (Linux)

To access SMBIOS data (BIOS, System, Baseboard, RAM modules) without running as root, set the required capabilities on the binary:

```bash
sudo setcap cap_sys_rawio,cap_dac_read_search=ep homepage
```

This grants the binary the necessary permissions to read SMBIOS data from `/dev/mem` and `/sys/firmware/dmi/tables/DMI` without requiring root privileges.

**Note**: You need to run this command after each build, as the capabilities are lost when the binary is rebuilt.

On startup, the dashboard displays all accessible addresses:

```
Dashboard starting...
  Listening on: 0.0.0.0:8080
  http://192.168.1.100:8080
  http://10.0.0.5:8080
  http://localhost:8080
```

When using `--listen` to specify a specific IP:

```
Dashboard starting...
  Listening on: 192.168.1.100:8080
  http://192.168.1.100:8080
```

This includes all IPv4 addresses from active network interfaces, making it easy to access the dashboard from other devices on your network.

## Configuration

### Command Line Flags

The application uses Cobra for command-line argument parsing with the following options:

- `--port`: Port to listen on (overrides config file, default: `8080`)
- `--listen`: IP address to listen on (overrides config file, default: `0.0.0.0`)
- `--config`: Path to config file or directory (default: creates `homepage.config`)
- `--debug`: Enable verbose debug output during startup
- `--log`: Path to log file or directory for storing application logs

### Configuration File

The application supports JSON-based configuration files for persistent settings:

**File Format**: JSON with the following fields:
```json
{
  "port": "8080",
  "ip": "0.0.0.0",
  "id": "homepage",
  "debug": false,
  "log": ""
}
```

**File Location**:
- Specify a config file: `--config /path/to/my-config.json`
- Specify a directory: `--config /etc/homepage/` (creates `/etc/homepage/homepage.config`)
- Default: Creates `homepage.config` in current directory

**Configuration Priority**:
1. Load values from config file (if exists)
2. Override with command-line flags (if provided)
3. Use validation and defaults for missing values

**Configurable Options**:
- `port`: Server port (default: "8080")
- `ip`: Server IP address (default: "0.0.0.0")
- `id`: Application identifier (default: "homepage")
- `debug`: Enable verbose debug output (default: false)
- `log`: Path to log file or directory (default: "")

**Auto-Creation**: If the specified config file doesn't exist, it's automatically created with default values.

### Examples

```bash
# Use defaults (creates homepage.config if needed)
./homepage

# Specify custom port
./homepage --port 3000

# Specify custom IP and port
./homepage --listen 192.168.1.100 --port 8080

# Enable debug output
./homepage --debug

# Log to file
./homepage --log /var/log/homepage.log

# Log to directory (creates homepage.log)
./homepage --log /var/log/

# Use custom config file
./homepage --config /etc/homepage/config.json

# Use custom config directory (creates /etc/homepage/homepage.config)
./homepage --config /etc/homepage/

# Override config file with flags
./homepage --config /etc/homepage/ --port 9090 --listen 127.0.0.1
```

### Preferences

All configuration is managed through the dashboard's Preferences system (accessible via the gear icon in the footer):

#### General Tab
- **Appearance**:
  - Theme selection (Nordic, Modern, Minimal, Forest, Ocean, Matrix, Blade Runner, Alien)
  - Color scheme selection (varies by theme)
- **Timers**:
  - Disk Refresh interval (5-3600 seconds, default: 15)
  - RSS Refresh interval (60-86400 seconds, default: 300)
- **Graphs**:
  - Show full bar height toggle (displays unused portion in dimmed color)
  - Minimum bar width (2-50 pixels, default: 10)
- **Data**:
  - Clear cached data (resets history graphs and module preferences)
  - Reset module order (restores default layout)
- **GitHub API Key**: Optional token for higher rate limits (stored securely)

#### Modules Tab
- Enable/disable individual modules
- Configure refresh intervals for modules with timers
- Manage multiple GitHub modules (repos, PRs, commits, issues)
- Manage multiple RSS feed modules
- Manage multiple disk modules (add/remove disks to monitor)

#### Layout Tab
- Grid configuration (columns per row)
- Maximum dashboard width percentage
- Visual layout editor showing current module arrangement
- Drag-and-drop module reordering

#### Weather Tab
- Location search and selection
- Weather provider selection (Open-Meteo, OpenWeatherMap, WeatherAPI.com)
- API key configuration for providers that require it

#### GitHub Tab
- Add/remove GitHub usernames or organizations
- Configure GitHub modules (repos, PRs, commits, issues, stats)
- Set item count per module (1-20, default: 5)

#### RSS Tab
- Add/remove RSS feed URLs
- Configure feed display options (show/hide title, text, date)
- Set item count per feed (1-20, default: 5)

#### Monitoring Tab
- Add/remove service endpoints to monitor
- Configure check intervals
- View service status and SSL certificate information

#### SNMP Tab
- Add/remove SNMP devices
- Configure OID queries and community strings
- Set refresh intervals

#### Calendar Tab
- Month view settings:
  - Dim weekends toggle
- Week view settings:
  - Work week only toggle (Monday-Friday)
  - Week start day selection (Sunday, Monday, Saturday)
- Event management (add, edit, delete events)

#### Todo Tab
- Manage todo items
- Set priorities (low, medium, high)
- Mark items as complete

#### Quicklinks Tab
- Add, edit, or delete quick links
- Automatic favicon fetching and caching

#### Search Tab
- View and filter search history
- Clear search history

#### Config Tab
- Export configuration (downloads all preferences as JSON)
- Import configuration (upload JSON to restore settings)
- List and manage saved configurations
- Delete saved configurations

#### About Tab
- Application version information
- Links to source code

Preferences are stored in browser localStorage and can be exported/imported via the Config tab for backup and migration.

## Modules

### System Modules

#### Status
- System uptime
- Server time (local and UTC)
- Online status indicator (pulsing dot)
- Hostname display
- Client IP and hostname (if available)

#### CPU
- Real-time CPU usage percentage
- Historical usage graph
- Multi-core support
- Configurable refresh interval (default: 5 seconds)

#### CPU Info
- CPU model and manufacturer
- Architecture and features
- Cache information
- Clock speed

#### RAM
- Memory usage (used, total, available)
- Usage percentage
- Historical usage graph
- Configurable refresh interval (default: 5 seconds)

#### RAM Info
- SMBIOS memory module information
- Module size, speed, type
- Manufacturer and part number
- Serial numbers

#### Disk
- **Multiple disk support**: Monitor multiple disks simultaneously
- Disk usage by mount point
- Free and used space
- Historical usage graph (persisted across page loads)
- Configurable refresh interval via General preferences (default: 15 seconds)
- Add/remove disks via Preferences > Modules > Disk Modules

#### Firmware
- BIOS/Firmware vendor
- Version
- Release date

#### System Info
- SMBIOS System Information
- Manufacturer, product name, version
- Serial number and UUID
- Wake-up type, SKU number, family

#### Baseboard
- SMBIOS Baseboard Information
- Manufacturer, product, version
- Serial number and asset tag
- Location in chassis, board type
- Feature flags

### Network Modules

#### Network
- Local IP addresses with PTR records (reverse DNS)
- Public IP address with PTR record
- Network interface information
- **PTR caching**: DNS PTR lookups are cached for 1 hour to reduce queries
- Automatic PTR lookups run once per hour after app starts
- Configurable refresh interval (default: 7200 seconds)

### Weather Module

#### Current Weather
- Temperature, humidity, wind speed
- Feels like temperature
- Pressure, wind direction
- UV index, cloud cover
- Visibility, dew point
- Precipitation probability
- Weather condition icon

#### Forecast
- Today's forecast (high/low, precipitation, sunrise/sunset)
- Tomorrow's forecast
- Extended forecast (next 3 days)

#### Weather Providers
- **Open-Meteo** (default, no API key required)
- **OpenWeatherMap** (requires API key)
- **WeatherAPI.com** (requires API key)

### GitHub Modules

#### Repository Monitoring
- User repositories
- Organization repositories
- Repository statistics
- Commit activity
- Pull request status
- Issue tracking
- Configurable number of items per module (1-20, default: 5)
- Rate limit monitoring with caching to prevent excessive API calls
- Optional GitHub token support for higher rate limits

### RSS Module

- Subscribe to multiple RSS feeds
- Feed item display with title, description, and date
- **Image preview**: Hover over titles to see feed images (from enclosure/media:content)
- Configurable number of articles per feed (1-20, default: 5)
- Show/hide title, text, date per feed
- Configurable refresh interval (default: 300 seconds)
- Multiple feed support with individual settings

### Calendar Modules

#### Calendar
- Month view with event display
- Navigation controls (previous/next month)
- **Dim weekends option**: Show Saturday and Sunday in dimmed color
- Event management via Preferences > Calendar tab

#### Week Calendar
- Week view with events
- Event details and day-by-day breakdown
- **Work week only option**: Show only Monday-Friday
- **Week start day**: Configure week to start on Sunday, Monday, or Saturday

#### Upcoming Events
- Next 5 upcoming events
- Event details and dates
- Click events to view/edit in calendar

### Todo Module

- Task list management
- Priority levels
- Next 5 todos display
- Task completion tracking

### Monitoring Module

- Service health checks for HTTP/HTTPS endpoints
- Add/remove services via Preferences > Monitoring tab
- Per-service configuration:
  - Service URL
  - Check interval (default: 60 seconds)
- Monitoring features:
  - Health status (online/offline)
  - Response time tracking
  - SSL certificate expiration monitoring (for HTTPS)
  - Uptime tracking
- Visual status indicators in the module

### SNMP Module

- SNMP device queries
- OID-based queries
- Community string support (default: "public")
- Add/remove SNMP devices via Preferences > SNMP tab
- Configure per-device settings:
  - Host address
  - Port (default: 161)
  - Community string
  - OID to query
- Configurable refresh interval per device (default: 60 seconds)

### Quick Links Module

- Customizable bookmark collection
- Add, edit, delete links via Preferences > Quicklinks tab
- Automatic favicon fetching and caching
- Links displayed with icons in module
- Quick access to frequently used sites
- Links saved in browser localStorage

### Search Module

- Global search functionality in header
- Multiple search engine support (Google, DuckDuckGo, etc.)
- Search history automatically saved
- Filter and search within search history
- Clear search history from Preferences > Search tab
- Quick access via header search box

## API Endpoints

### System Endpoints

- `GET /api/summary` - Get summary of all modules
- `GET /api/system` - Get system metrics (CPU, RAM, disk)
- `GET /api/cpuid` - Get CPU details
- `GET /api/raminfo` - Get SMBIOS RAM information
- `GET /api/firmware` - Get BIOS/Firmware information
- `GET /api/systeminfo` - Get SMBIOS System information
- `GET /api/baseboard` - Get SMBIOS Baseboard information
- `GET /api/disks` - List all available disk partitions
- `GET /api/disk?mount={mountPoint}` - Get disk usage for a specific mount point

### Network Endpoints

- `GET /api/ip` - Get local and public IP addresses
- `GET /api/favicon` - Get favicon for a URL

### Weather Endpoints

- `GET /api/weather?lat={lat}&lon={lon}` - Get weather data
- `GET /api/geocode?q={query}` - Geocode city name to coordinates

### GitHub Endpoints

- `GET /api/github` - Get GitHub repositories
- `GET /api/github/repos?name={name}&type={user|org}&token={token}` - Get repos for user/org
- `GET /api/github/prs?name={name}&type={user|org|repo}&token={token}` - Get pull requests
- `GET /api/github/commits?name={name}&type={user|org|repo}&token={token}` - Get commits
- `GET /api/github/issues?name={name}&type={user|org|repo}&token={token}` - Get issues
- `GET /api/github/stats?name={repo}&token={token}` - Get repository statistics

### Monitoring Endpoints

- `GET /api/monitor` - Get service monitoring status
- `POST /api/monitor` - Add/update monitored service

### SNMP Endpoints

- `GET /api/snmp?host={host}&port={port}&community={community}&oid={oid}` - Query SNMP device

### RSS Endpoints

- `GET /api/rss?url={feedUrl}&count={count}` - Fetch RSS feed (count: 1-20, default 5)

### Configuration Endpoints

- `GET /api/config/list` - List saved configurations
- `GET /api/config/download?name={name}` - Download configuration
- `POST /api/config/upload` - Upload configuration
- `DELETE /api/config/delete?name={name}` - Delete configuration

### Theme Endpoints

- `GET /api/theme?template={template}&scheme={scheme}` - Get theme CSS

### Health Endpoints

- `GET /healthz` - Health check endpoint

## Themes

The dashboard includes multiple themes with various color schemes:

### Available Themes

1. **Nordic** - Clean, modern design with Nordic color palette
2. **Modern** - Contemporary design with smooth gradients
3. **Minimal** - Minimalist design with clean lines
4. **Forest** - Nature-inspired green theme
5. **Ocean** - Blue ocean-inspired theme
6. **Matrix** - Cyberpunk matrix-style theme
7. **Blade Runner** - Neon cyberpunk theme
8. **Alien** - Sci-fi inspired theme

### Color Schemes

Each theme includes multiple color schemes:
- Default
- Dark
- Light (where applicable)
- Various accent color variations

### Theme Customization

- Themes are stored in `templates/*.css`
- Each theme can have multiple color schemes
- Themes use CSS variables for easy customization
- Theme selection is saved in browser localStorage

## Usage

### Module Management

#### Enabling/Disabling Modules

1. Click the gear icon in the footer to open Preferences
2. Navigate to the "Modules" tab
3. Toggle modules on/off
4. Configure refresh intervals for each module

#### Module Layout

- **Drag and Drop**: Click and drag modules by the grip handle (⋮⋮ icon) to reorder
- **Layout Editor**: Access via Preferences > Layout tab
  - Visual representation of current layout
  - Shows split modules as "ModuleA/ModuleB"
  - Remove modules from layout
- **Grid Configuration**: Set number of columns per row (1-6)
- **Max Width**: Adjust dashboard maximum width percentage (50-100%)

#### Advanced Drag Features

- **Quick Disable**:
  - Drag a module to the left edge of the screen
  - Background turns muted red with disable icon
  - Module is disabled and removed from layout and preferences
  - Can be re-enabled from Preferences > Modules tab

- **Temporary Pin**:
  - Drag a module to the right edge of the screen
  - Background turns soft green with pin icon
  - Module is pinned temporarily and:
    - Stays fixed on screen while you scroll
    - Can be dragged from the pin to a new location
    - Has a close button (×) to unpin without moving
    - If dropped in invalid area, stays pinned instead of disappearing
  - Useful for repositioning modules while viewing other parts of the dashboard

- **Column Splitting**: Create vertically-stacked modules in a single column:
  1. Drag a module over an existing module's column
  2. Hold for 5 seconds until the split overlay appears (shows top/bottom zones)
  3. Drop on the top or bottom zone
  4. Both modules now share the column height equally
  5. Split modules show as "ModuleA/ModuleB" in the layout editor
  6. Drag additional modules to empty split slots to fill them
  7. Empty split slots can receive drops directly
  8. Remove split modules individually from layout editor

### Weather Configuration

1. Open Preferences > Weather tab
2. Search for your location using the search box
3. Select from search results to set location
4. Choose weather provider:
   - **Open-Meteo** (default, no API key required)
   - **OpenWeatherMap** (requires API key)
   - **WeatherAPI.com** (requires API key)
5. Enter API key if using a provider that requires it
6. Location and provider settings are saved in browser localStorage
7. Weather updates automatically based on module refresh interval (default: 1800 seconds)

### GitHub Integration

1. Open Preferences > GitHub tab
2. Add GitHub usernames or organizations
3. Optionally add GitHub token in General tab for higher rate limits
4. Click "Add" to create GitHub modules (repos, PRs, commits, issues, stats)
5. Configure each module:
   - Select type (repos, PRs, commits, issues, stats)
   - Set item count (1-20, default: 5)
6. Modules are displayed on the dashboard with automatic refresh

### RSS Feeds

1. Open Preferences > RSS tab
2. Click "Add" to add RSS feed URLs
3. Configure each feed:
   - Feed URL
   - Number of articles to show (1-20, default: 5)
   - Display options: Show/hide title, text, date (all checked by default)
4. Feeds are displayed as modules on the dashboard
5. Configure global RSS refresh interval in General > Timers (default: 300 seconds)
6. Hover over article titles to preview images (if available in feed)

### Service Monitoring

1. Open Preferences > Monitoring tab
2. Add service URLs (HTTP/HTTPS endpoints)
3. Configure check intervals per service
4. View service status in Monitoring module:
   - Health status (online/offline)
   - Response time
   - SSL certificate expiration (for HTTPS)
   - Uptime tracking

### Quick Links

1. Open Preferences > Quicklinks tab
2. Add, edit, or delete links
3. Links are saved in browser localStorage
4. Favicons are automatically fetched and cached
5. Quick access to frequently used sites from the dashboard

### Calendar & Events

1. Calendar displays current month with navigation controls
2. Configure calendar settings in Preferences > Calendar tab:
   - Dim weekends (month view)
   - Work week only (week view)
   - Week start day (Sunday, Monday, or Saturday)
3. Add events via Preferences > Calendar tab or click on calendar dates
4. Events are saved in browser localStorage
5. View upcoming events in dedicated "Upcoming Events" module

### Todo List

1. Add todos via Preferences > Todo tab or Todo module
2. Set priorities (low, medium, high)
3. Mark todos as complete
4. Edit or delete todos from Preferences > Todo tab
5. View next 5 todos in dedicated Todo module
6. Todos are saved in browser localStorage

### Search

1. Use the search box in the header
2. Select search engine from dropdown (Google, DuckDuckGo, etc.)
3. Search history is automatically saved
4. Access search history by clicking search box
5. Filter search history in Preferences > Search tab
6. Clear search history from Preferences > Search tab

### Configuration Management

1. **Export configuration**: Preferences > Config tab > Download
   - Downloads all preferences as JSON file
   - Includes: themes, module settings, layout, weather, GitHub, RSS, monitoring, calendar, todos, quicklinks
2. **Import configuration**: Preferences > Config tab > Upload
   - Upload previously exported JSON file
   - Restores all settings and preferences
3. **Saved configurations**: List and manage saved configuration files
4. **Delete configurations**: Remove saved configuration files
5. Configurations include all user preferences and module settings for easy backup and migration

## Development

### Project Structure

```
homepage/
├── main.go                 # Main application code and API endpoints
├── config.go               # Configuration file handling and validation
├── go.mod                  # Go module dependencies
├── go.sum                  # Go module checksums
├── README.md               # This file - project documentation
├── TODO.md                 # Development todo list
├── configs/                # Saved configuration files
│   └── Default.json       # Default configuration template
├── static/                 # Static assets
│   └── js/                 # JavaScript modules
│       ├── app.js          # Application initialization and intervals
│       ├── core.js         # Core utilities and helpers
│       ├── graphs.js       # History graph rendering (CPU, RAM, Disk)
│       ├── layout.js       # Layout system and drag-and-drop
│       ├── preferences.js # Preferences modal management
│       └── modules/         # Module-specific code
│           ├── calendar.js  # Calendar and events management
│           ├── config.js   # Configuration import/export
│           ├── github.js   # GitHub integration (repos, PRs, commits, issues)
│           ├── monitoring.js # Service monitoring
│           ├── network.js  # Network IP and PTR lookups
│           ├── quicklinks.js # Quick links management
│           ├── rss.js      # RSS feed parsing and display
│           ├── search.js   # Search functionality
│           ├── snmp.js    # SNMP device queries
│           ├── system.js   # System metrics (CPU, RAM, Disk, SMBIOS)
│           ├── todo.js    # Todo list management
│           └── weather.js # Weather data fetching and display
└── templates/              # HTML and CSS templates
    ├── index.html         # Main HTML template
    ├── index.html.old     # Backup of previous template version
    └── *.css              # Theme CSS files
        ├── alien.css      # Alien theme
        ├── bladerunner.css # Blade Runner theme
        ├── forest.css     # Forest theme
        ├── matrix.css     # Matrix theme
        ├── minimal.css    # Minimal theme
        ├── modern.css     # Modern theme
        ├── nordic.css     # Nordic theme (default)
        └── ocean.css      # Ocean theme
```

### Adding a New Module

1. Add module configuration to `static/js/layout.js`:
```javascript
const moduleConfig = {
  mymodule: {
    name: 'My Module',
    icon: 'fa-icon',
    desc: 'Description',
    hasTimer: true,
    timerKey: 'mymodule',
    defaultInterval: 60,
    enabled: true
  }
};
```

2. Create module JavaScript file in `static/js/modules/mymodule.js`
3. Add API endpoint in `main.go` if needed
4. Add module card HTML in `templates/index.html`
5. Register module refresh function in `static/js/app.js`

### Adding a New Theme

1. Create CSS file in `templates/` directory
2. Follow theme structure with CSS variables
3. Add theme metadata comments:
```css
/*
Template: mytheme
Scheme: default
Accent: #FF0000
Display: Default
*/
```

4. Theme will be automatically detected and available in preferences

### Dependencies

Key Go dependencies:
- `github.com/spf13/cobra` - Command-line argument parsing and CLI framework
- `github.com/shirou/gopsutil/v3` - System metrics (CPU, RAM, disk, network)
- `github.com/earentir/gosmbios` - SMBIOS data (hardware information)
- `github.com/earentir/cpuid` - CPU information and features
- `github.com/gosnmp/gosnmp` - SNMP device queries
- `github.com/miekg/dns` - DNS lookups and PTR record queries

## Contributing

Contributions are always welcome!
All contributions are required to follow the [![License](https://google.github.io/styleguide/go/)](https://google.github.io/styleguide/go/)


## License

I will always follow the Linux Kernel License as primary, if you require any other OPEN license please let me know and I will try to accomodate it.

[![License](https://img.shields.io/github/license/earentir/gitearelease)](https://opensource.org/license/gpl-2-0)
