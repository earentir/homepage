# Homepage TODO

## UI/UX Improvements
- [x] Add customizable module ordering via drag-and-drop
- [x] Add theme switcher to footer
- [x] module editing via UI
- [ ] Improve mobile responsiveness
- [x] split schemes with template selectors and combine the schemes into the theme

## Additional Modules
- [x] Add system metrics (CPU, RAM, disk usage)
- [x] Add bar graph for cpu usage
- [x] Change RAM to be a single line with the usage, total, available, keep the usage percentage in its own line
- [x] Add bar graph for ram usage
- [x] Add popup menu to edit the refresh times for each enabled module, we can disable or enable the module, and change the refresh time
- [ ] Add Docker containers status
- [ ] Add service health checks
- [ ] Add recent logs viewer
- [x] Add uptime monitoring
- [ ] Add docker/podman status
- [ ] Add docker image/update status
- [ ] Add inoreader support
- [ ] Add TTRSS
- [ ] Add module that gets a json and builds a ui
- [ ] Add paypal payment notification
- [ ] Add gumroad payment notification
- [ ] Add stripe payment notification
- [ ] Add World Clock

## IP Address Module
- [x] Add PTR of public IP addresses
- [x] Add PTR of local IP addresses
- [ ] Add network interface selection
- [x] Add PTR on the second line of the public and local IP addresses
- [ ] add status indicator for the public and local IP addresses
- [ ] add indicator for next hop in both local and public IP addresses
- [x] add copy of the ip/ptr on click


## GitHub Enhancements
- [x] Add disk caching for GitHub data
- [x] Show rate limit availability time in UI
- [x] Add GitHub token support for higher rate limits
- [x] Show commit activity
- [x] Show PR status
- [x] Add repository statistics

## Weather Enhancements
- [x] Add location picker UI
- [x] Add weather API key support
- [x] add icons for weather conditions
- [ ] Add multiple location support

## Search Improvements
- [x] Add search history
- [x] Add searching of search history
- [x] Add auto complete for history
- [x] Add preference to use the last search engine used for the search history item
- [x] Add preference to visit links directly from search history (shift always does that)
- [x] Add search in search history
- [x] Add bookmark support (read from filesystem?)
- [x] Add skroutz support
- [x] Add amazon support
- [x] preferences for selecting search engines
- [ ] Add custom engine
- [x] Add search shortcuts
- [x] Add @ engine selection shortcut
- [x] Add tab autocomplete for search engine (ie youtube tab, switch the engine)

## Calendar & Todo
- [ ] Sync with ics calendar (read only for now)
- [ ] Sync with a todo system localy

## WiKi
- [ ] Add custom simple markdown wiki
- [ ] Integrate wiki with search

## Quicklinks
- [x] Add a favicon or icon only mode

## Quick Links Enhancements
- [x] Make links editable via UI
- [x] Add icons for links
- [x] Add favicon caching

## Monitoring & Alerts
- [x] Add service status monitoring
- [ ] Add email/webhook notifications for downtime
- [x] Add health check endpoints
- [ ] Add historical data using status bars with tooltip on each service
- [x] Add SSL certificate expiration monitoring
- [x] Add snmp support
- [ ] Add notifications for monitoring in browser/windows

## Data Persistence
- [x] Add settings storage (localStorage or database)
- [x] Add user preferences saving
- [x] Add configuration export/import

## Additional API Endpoints
- [x] Add api to monitor services

## Customization
- [x] Add grid layout configuration
- [ ] Add color scheme customization
- [ ] Add background image

## Performance
- [ ] Add request batching
- [ ] Add WebSocket for real-time updates
- [x] Add service worker for offline support
- [ ] Add asset caching

## Integrations
- [x] Add RSS feed reader
- [x] Add calendar integration
- [x] Add todo list widget
- [ ] Add bookmark manager
- [ ] Add Google Analytics metrics for users sites
- [ ] Add Proxmox metrics for proxmox clusters
- [ ] Add pihole start/stop/status and metrics

## SMBIOS
- [x] Add RAM information
- [ ] Add CPU information
- [x] Add BIOS information
- [x] Add Baseboard information
- [x] Add System information

## plane modules
- [ ] Add a module to show dhcp status and last 5 leases
- [ ] Add a module to show dns status and last 5 dns requests
- [ ] Add a module to show ntp status and last 5 ntp requests
- [ ] Add a module to show proxy status and last 5 proxy requests

## Backend Migration - Move Frontend Logic to Backend

### Easy Pickings (Simple to implement)

#### Data Formatting & Utilities
- [x] Move `formatBytes()` to backend - format byte values server-side before sending to frontend
- [x] Move `fmtUptime()` to backend - format uptime strings server-side
- [x] Move `escapeHtml()` to backend - HTML escaping should happen server-side (or use template escaping)
- [x] Move `detectClientInfo()` to backend - detect OS/browser/timezone from User-Agent header server-side
- [x] Move `isValidUrlOrIp()` and `normalizeUrl()` to backend - URL validation/normalization should be server-side

#### Data Processing
**IMPORTANT: All user data (preferences, configs, history) is stored in localStorage as the primary source of truth. Backend processes/syncs this data but does NOT replace localStorage storage.**

- [x] Move weather icon mapping (`getWeatherIcon()`) to backend - return icon class in API response
- [x] Move search engine list to backend API endpoint - return list of engines from server
- [x] Move module configuration metadata to backend - return module list with metadata from API (NOTE: module configs stored in localStorage, backend provides metadata only)
- [x] Move calendar date calculations to backend - return formatted calendar data from API (NOTE: calendar events stored in localStorage, backend processes/calculates dates)
- [x] Move todo sorting/prioritization logic to backend - return sorted todos from API (NOTE: todos stored in localStorage, backend processes/sorts them)

#### Timer Management
- [x] Move timer interval management to backend - server tracks refresh intervals and pushes updates via WebSocket
- [x] Remove client-side timer logic, rely on WebSocket push notifications for updates

### More Complex (Requires architectural changes)

#### State Management
- [x] Create unified preferences API endpoint - single endpoint for all user preferences (via `/api/storage/get-all`)
- [x] Implement preference sync mechanism - ensure frontend and backend stay in sync (via localStorage sync system)
- [x] Add preference versioning/migration system - handle preference schema changes (version tracking implemented)

#### Data Aggregation
- [x] Move module data aggregation to backend - backend combines data from multiple sources before sending (NOTE: preferences/configs stay in localStorage, backend processes aggregated data)
- [x] Create batch API endpoint - single request returns all module data at once
- [x] Move graph history aggregation to backend - server processes history and sends only needed data (NOTE: graph history stored in localStorage, backend processes/aggregates it)

#### Real-time Updates (tested, its stupid)
- [x] Expand WebSocket to push all module updates (not just system metrics) - System metrics pushed every 5s, other modules can push data via timer manager
- [x] Move refresh scheduling to backend - server determines when to refresh and pushes updates (via timer manager)
- [x] Remove client-side polling intervals - rely entirely on WebSocket push (all polling removed, WebSocket-only)

#### Module Configuration
- [x] Move module enable/disable logic to backend - server processes module state (via localStorage sync - module prefs stored in localStorage, synced to backend for processing)
- [x] Move module ordering to backend - server processes and returns module order (via localStorage sync - order stored in localStorage, synced to backend)
- [x] Create module configuration API - CRUD operations for all module types (NOTE: CRUD operations work on localStorage, backend syncs for processing/validation)

#### Search Functionality
- [x] Move search history filtering to backend - server handles search within history (NOTE: search history stored in localStorage, backend processes/filters)
- [x] Move autocomplete logic to backend - server returns filtered suggestions (NOTE: search history in localStorage, backend processes autocomplete)
- [x] Move search engine switching logic to backend - server provides engine list via API (NOTE: current engine stored in localStorage, backend provides engine list)

#### Calendar/Todo Logic
- [x] Move calendar event calculations (upcoming events, date filtering) to backend (NOTE: events stored in localStorage, backend calculates)
- [x] Move todo prioritization and sorting to backend (NOTE: todos stored in localStorage, backend sorts/prioritizes)
- [x] Move calendar date navigation logic to backend - server calculates month/week views (NOTE: events stored in localStorage, backend calculates views)

#### Layout System
- [x] Move layout configuration storage to backend (via localStorage sync - layout stored in localStorage, synced to backend for processing)
- [x] Move layout validation to backend - ensure layout config is valid before saving (NOTE: layout stored in localStorage, backend validates on sync)

#### Error Handling & Validation
- [x] Move input validation to backend - validate all user inputs server-side
- [x] Move error message generation to backend - return user-friendly errors from API

### Keep in Frontend (UI-specific, should stay)
- Drag-and-drop UI interactions (result stored in localStorage, synced to backend)
- Graph rendering (Canvas/SVG manipulation)
- Modal/dialog UI management
- Theme/scheme UI selection (preference stored in localStorage, synced to backend)
- Real-time UI updates and animations
- Keyboard shortcuts handling
- Click handlers and event listeners
- DOM manipulation for rendering
- Visual feedback (loading states, hover effects, etc.)

## localStorage Sync with Backend Processing

### Frontend: Generic localStorage Wrapper
- [x] Create generic `saveToStorage(key, value)` wrapper that:
  - Writes to localStorage (immediate, local-first)
  - Sends data to backend API endpoint (async, non-blocking)
  - Handles errors gracefully (localStorage always succeeds, backend sync can fail)
- [x] Create generic `loadFromStorage(key, defaultValue)` wrapper that:
  - Reads from localStorage (fast, local-first)
  - Optionally checks backend for newer version on initialization
- [x] Replace all direct `localStorage.setItem()` calls with wrapper
- [x] Replace all direct `localStorage.getItem()` calls with wrapper
- [x] Add version/timestamp tracking for each localStorage key to detect stale data
- [x] Add retry mechanism for failed backend syncs (queue failed syncs, retry later)

### Backend: Storage & Sync API
- [x] Create `/api/storage/sync` endpoint (POST) - receives localStorage data from frontend
- [x] Create `/api/storage/get?key={key}` endpoint (GET) - returns backend copy of data
- [x] Create `/api/storage/get-all` endpoint (GET) - returns all stored preferences
- [x] Create backend storage system (in-memory map for syncing localStorage data, not replacing it)
- [x] Add version/timestamp tracking for each stored key
- [x] Store data with metadata (lastModified, version, source)

### Backend: Data Processing Logic
- [x] Move all data processing logic from frontend to backend:
  - [x] Module preference processing (enabled/disabled, intervals) - NOTE: preferences stored in localStorage, backend processes/validates
  - [x] Layout configuration processing - NOTE: layout stored in localStorage, backend processes
  - [x] Search history processing/filtering - NOTE: search history stored in localStorage, backend processes/filters
  - [x] Calendar event calculations (upcoming events, date filtering) - NOTE: events stored in localStorage, backend calculates
  - [x] Todo prioritization and sorting - NOTE: todos stored in localStorage, backend sorts/prioritizes
  - [x] Graph history aggregation - NOTE: history stored in localStorage, backend aggregates
  - [x] Module configuration validation - NOTE: configs stored in localStorage, backend validates
- [x] Create processing functions that take raw localStorage data and return processed results
- [x] Add processing triggers (when data changes, process and notify via WebSocket)

### WebSocket: Update Notifications
- [x] Extend WebSocket to send data change notifications:
  - `{type: "storage-update", key: "modulePrefs", version: 123, timestamp: "..."}`
- [x] Backend sends notification when:
  - Data is processed/aggregated
  - External events update data (scheduled tasks, etc.)
  - Multiple clients might have conflicts
- [x] Frontend receives notification and fetches updated data
- [x] Add WebSocket message type for storage sync requests

### Frontend: Sync Mechanism
- [x] On page load: Check backend for latest versions of all localStorage keys
- [x] Compare versions/timestamps between localStorage and backend
- [x] If backend has newer data: Fetch and update localStorage
- [x] If localStorage has newer data: Send to backend (already handled by wrapper)
- [x] On WebSocket notification: Fetch specific key from backend and update localStorage
- [x] Add conflict resolution (last-write-wins or user choice)
- [x] Add sync status indicator in UI (show when syncing, show errors)

### Migration & Compatibility
- [x] Create migration script to send existing localStorage data to backend on first load (handled by syncAllFromBackend on init)
- [x] Ensure backward compatibility (if backend unavailable, localStorage still works)
- [x] Add feature flag to enable/disable backend sync (backendSyncDisabled in localStorage)
- [x] Add sync status API endpoint to check if backend has data

### Testing & Error Handling
- [x] Handle offline scenarios (localStorage works, queue syncs for when online)
- [x] Handle backend errors gracefully (don't break UI if sync fails)
- [x] Add logging for sync operations (debug sync issues)
- [ ] Test with multiple browser tabs (ensure sync works across tabs)
- [ ] Test WebSocket reconnection scenarios (ensure sync resumes after reconnect)
