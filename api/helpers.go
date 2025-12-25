package api

import (
	"encoding/json"
	"net"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/miekg/dns"
	"github.com/shirou/gopsutil/v3/host"
)

const PTRCacheTTL = 1 * time.Hour

var ptrCache = &PTRCache{
	entries: make(map[string]PTRCacheEntry),
}

// WriteJSON writes a JSON response to the HTTP response writer.
func WriteJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(v)
}

// MustHostname returns the system hostname or "unknown" if it cannot be determined.
func MustHostname() string {
	h, err := os.Hostname()
	if err != nil || h == "" {
		return "unknown"
	}
	return h
}

// GetSystemUptime returns the system uptime in seconds.
func GetSystemUptime() int64 {
	uptime, err := host.Uptime()
	if err != nil {
		return 0
	}
	return int64(uptime)
}

// IsLocalRequest determines if the request is from localhost or a local network interface.
func IsLocalRequest(r *http.Request) bool {
	ip := GetClientIP(r)
	if ip == "" {
		return false
	}

	// Check if it's localhost
	if ip == "127.0.0.1" || ip == "::1" || ip == "localhost" {
		return true
	}

	// Parse the IP to check if it's a local network IP
	parsedIP := net.ParseIP(ip)
	if parsedIP == nil {
		return false
	}

	// Check if the IP matches any of the server's network interfaces
	ifaces, err := net.Interfaces()
	if err != nil {
		return false
	}

	for _, iface := range ifaces {
		if iface.Flags&net.FlagUp == 0 {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			var ifaceIP net.IP
			switch v := addr.(type) {
			case *net.IPNet:
				ifaceIP = v.IP
			case *net.IPAddr:
				ifaceIP = v.IP
			}
			if ifaceIP == nil {
				continue
			}
			if ifaceIP.Equal(parsedIP) {
				return true
			}
		}
	}

	return false
}

// GetClientIP extracts the client IP from the request.
func GetClientIP(r *http.Request) string {
	// Check for X-Forwarded-For header (proxy/load balancer)
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		// Take the first IP in the list
		ips := strings.Split(xff, ",")
		if len(ips) > 0 {
			ip := strings.TrimSpace(ips[0])
			if ip != "" {
				return ip
			}
		}
	}

	// Check for X-Real-IP header
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return strings.TrimSpace(xri)
	}

	// Fall back to RemoteAddr
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		// RemoteAddr might not have a port
		return r.RemoteAddr
	}
	return host
}

// ReverseDNS performs a reverse DNS lookup for the given IP address.
func ReverseDNS(ip string, dnsServer string) string {
	return GetCachedPTR(ip, dnsServer)
}

// GetCachedPTR returns cached PTR or performs lookup if cache is stale.
func GetCachedPTR(ip string, dnsServer string) string {
	cacheKey := ip + "@" + dnsServer

	// Check cache first
	ptrCache.mu.RLock()
	entry, exists := ptrCache.entries[cacheKey]
	ptrCache.mu.RUnlock()

	if exists && time.Since(entry.Timestamp) < PTRCacheTTL {
		return entry.PTR
	}

	// Cache miss or stale - perform lookup
	ptr := ReverseDNSUncached(ip, dnsServer)

	// Store in cache
	ptrCache.mu.Lock()
	ptrCache.entries[cacheKey] = PTRCacheEntry{
		PTR:       ptr,
		Timestamp: time.Now(),
	}
	ptrCache.mu.Unlock()

	return ptr
}

// ReverseDNSUncached performs an uncached reverse DNS lookup.
func ReverseDNSUncached(ip string, dnsServer string) string {
	if ip == "" {
		return ""
	}

	// Build the reverse DNS name
	arpa, err := dns.ReverseAddr(ip)
	if err != nil {
		return ""
	}

	// Create DNS client
	c := new(dns.Client)
	c.Timeout = 2 * time.Second

	// Build the query
	m := new(dns.Msg)
	m.SetQuestion(arpa, dns.TypePTR)
	m.RecursionDesired = true

	// Use provided DNS server or default
	if dnsServer == "" {
		dnsServer = "1.1.1.1"
	}
	if !strings.Contains(dnsServer, ":") {
		dnsServer = dnsServer + ":53"
	}

	// Perform the lookup
	r, _, err := c.Exchange(m, dnsServer)
	if err != nil {
		return ""
	}

	if r.Rcode != dns.RcodeSuccess {
		return ""
	}

	for _, ans := range r.Answer {
		if ptr, ok := ans.(*dns.PTR); ok {
			// Remove trailing dot
			name := ptr.Ptr
			if strings.HasSuffix(name, ".") {
				name = name[:len(name)-1]
			}
			return name
		}
	}

	return ""
}

// HostIPs returns all non-loopback IPv4 addresses for the host.
func HostIPs() []HostIPInfo {
	var result []HostIPInfo

	ifaces, err := net.Interfaces()
	if err != nil {
		return result
	}

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
			// Only IPv4 for now
			if ip.To4() != nil {
				ipInfo := HostIPInfo{IP: ip.String()}
				// Optionally get PTR record
				ptr := GetCachedPTR(ip.String(), "1.1.1.1")
				if ptr != "" {
					ipInfo.PTR = ptr
				}
				result = append(result, ipInfo)
			}
		}
	}

	return result
}

// Dedup removes duplicates from a string slice.
func Dedup(in []string) []string {
	seen := make(map[string]bool)
	var out []string
	for _, s := range in {
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	return out
}

// WithSecurityHeaders wraps an HTTP handler with security headers.
func WithSecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; script-src 'self' 'unsafe-inline'; connect-src 'self' https: ws: wss:; img-src 'self' data:; font-src 'self' https://cdnjs.cloudflare.com data:;")
		next.ServeHTTP(w, r)
	})
}
