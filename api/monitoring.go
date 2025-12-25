package api

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gosnmp/gosnmp"
)

// CheckHTTP performs an HTTP check and returns latency in ms and SSL info.
func CheckHTTP(ctx context.Context, targetURL string) (*HTTPCheckResult, error) {
	result := &HTTPCheckResult{}

	parsedURL, err := url.Parse(targetURL)
	if err != nil {
		return nil, err
	}

	tlsConfig := &tls.Config{InsecureSkipVerify: true}
	transport := &http.Transport{TLSClientConfig: tlsConfig}
	client := &http.Client{
		Timeout:   10 * time.Second,
		Transport: transport,
		CheckRedirect: func(_ *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return errors.New("too many redirects")
			}
			return nil
		},
	}

	start := time.Now()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; lan-index-monitor/1.0)")

	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() {
		if closeErr := res.Body.Close(); closeErr != nil {
			log.Printf("Error closing HTTP response body: %v", closeErr)
		}
	}()

	result.Latency = time.Since(start).Milliseconds()

	if res.StatusCode >= 400 {
		return result, errors.New("HTTP " + res.Status)
	}

	if parsedURL.Scheme == "https" {
		sslExpiry, sslErr := CheckSSLCert(ctx, parsedURL.Host)
		if sslErr != nil {
			result.SSLError = sslErr.Error()
		} else {
			result.SSLExpiry = sslExpiry
		}
	}

	return result, nil
}

// CheckSSLCert checks the SSL certificate expiration for a host.
func CheckSSLCert(ctx context.Context, host string) (*time.Time, error) {
	if !strings.Contains(host, ":") {
		host = host + ":443"
	}

	dialer := &tls.Dialer{
		NetDialer: &net.Dialer{Timeout: 5 * time.Second},
		Config:    &tls.Config{InsecureSkipVerify: true},
	}
	conn, err := dialer.DialContext(ctx, "tcp", host)
	if err != nil {
		return nil, err
	}
	defer func() {
		if closeErr := conn.Close(); closeErr != nil {
			log.Printf("Error closing TLS connection: %v", closeErr)
		}
	}()

	tlsConn := conn.(*tls.Conn)
	certs := tlsConn.ConnectionState().PeerCertificates
	if len(certs) == 0 {
		return nil, errors.New("no certificates found")
	}

	expiry := certs[0].NotAfter
	return &expiry, nil
}

// CheckPort performs a TCP port check and returns latency in ms.
func CheckPort(ctx context.Context, host, port string) (int64, error) {
	address := net.JoinHostPort(host, port)

	start := time.Now()

	dialer := &net.Dialer{
		Timeout: 10 * time.Second,
	}

	conn, err := dialer.DialContext(ctx, "tcp", address)
	if err != nil {
		return 0, err
	}
	defer func() {
		if closeErr := conn.Close(); closeErr != nil {
			log.Printf("Error closing TCP connection: %v", closeErr)
		}
	}()

	latency := time.Since(start).Milliseconds()
	return latency, nil
}

// CheckPing performs an ICMP ping (or TCP fallback) and returns latency in ms.
func CheckPing(ctx context.Context, host string) (int64, error) {
	ports := []string{"80", "443", "22", "21"}

	for _, port := range ports {
		latency, err := CheckPort(ctx, host, port)
		if err == nil {
			return latency, nil
		}
	}

	start := time.Now()
	_, err := net.LookupHost(host)
	if err != nil {
		return 0, errors.New("host unreachable")
	}
	latency := time.Since(start).Milliseconds()

	return latency, nil
}

// QuerySNMP performs an SNMP query.
func QuerySNMP(ctx context.Context, host, port, community, oid string) (string, error) {
	snmp := &gosnmp.GoSNMP{
		Target:    host,
		Port:      parsePort(port),
		Community: community,
		Version:   gosnmp.Version2c,
		Timeout:   time.Duration(5) * time.Second,
		Retries:   1,
		Context:   ctx,
	}

	err := snmp.Connect()
	if err != nil {
		return "", errors.New("SNMP connect failed: " + err.Error())
	}
	defer func() {
		if closeErr := snmp.Conn.Close(); closeErr != nil {
			log.Printf("Error closing SNMP connection: %v", closeErr)
		}
	}()

	result, err := snmp.Get([]string{oid})
	if err != nil {
		return "", errors.New("SNMP GET failed: " + err.Error())
	}

	if len(result.Variables) == 0 {
		return "", errors.New("no SNMP variables returned")
	}

	variable := result.Variables[0]
	if variable.Type == gosnmp.NoSuchObject || variable.Type == gosnmp.NoSuchInstance {
		return "", errors.New("OID not found")
	}

	switch variable.Type {
	case gosnmp.OctetString:
		return string(variable.Value.([]byte)), nil
	case gosnmp.Integer, gosnmp.Counter32, gosnmp.Counter64, gosnmp.Gauge32, gosnmp.TimeTicks, gosnmp.Uinteger32:
		return fmt.Sprintf("%v", variable.Value), nil
	case gosnmp.IPAddress:
		return variable.Value.(string), nil
	default:
		return fmt.Sprintf("%v", variable.Value), nil
	}
}

func parsePort(portStr string) uint16 {
	port := 161
	if p, err := strconv.Atoi(portStr); err == nil && p > 0 && p < 65536 {
		port = p
	}
	return uint16(port)
}

// FetchFavicon tries to fetch a favicon from a site.
func FetchFavicon(ctx context.Context, origin string) ([]byte, string, error) {
	log.Printf("[favicon] fetchFavicon called for origin: %s", origin)

	tlsConfig := &tls.Config{InsecureSkipVerify: true}
	transport := &http.Transport{TLSClientConfig: tlsConfig}

	client := &http.Client{
		Timeout:   5 * time.Second,
		Transport: transport,
		CheckRedirect: func(_ *http.Request, via []*http.Request) error {
			if len(via) >= 3 {
				return errors.New("too many redirects")
			}
			return nil
		},
	}

	faviconPaths := []string{
		"/favicon.ico",
		"/favicon.png",
		"/apple-touch-icon.png",
		"/apple-touch-icon-precomposed.png",
	}

	log.Printf("[favicon] Fetching HTML from %s", origin)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, origin, nil)
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; lan-index/1.0)")
	res, err := client.Do(req)
	if err != nil {
		log.Printf("[favicon] Error fetching HTML: %v", err)
	} else if res.StatusCode >= 200 && res.StatusCode < 300 {
		defer func() {
			if closeErr := res.Body.Close(); closeErr != nil {
				log.Printf("Error closing favicon response body: %v", closeErr)
			}
		}()
		log.Printf("[favicon] Got HTML response, status: %d", res.StatusCode)
		body, err := io.ReadAll(io.LimitReader(res.Body, 100*1024))
		if err == nil {
			log.Printf("[favicon] Read %d bytes of HTML", len(body))
			faviconURL := extractFaviconFromHTML(string(body), origin)
			if faviconURL != "" {
				log.Printf("[favicon] Found favicon URL in HTML: %s", faviconURL)
				data, contentType, err := downloadFavicon(ctx, client, faviconURL)
				if err == nil {
					log.Printf("[favicon] Successfully downloaded favicon from HTML link")
					return data, contentType, nil
				}
				log.Printf("[favicon] Failed to download from HTML link: %v", err)
			} else {
				log.Printf("[favicon] No favicon URL found in HTML")
			}
		} else {
			log.Printf("[favicon] Error reading HTML body: %v", err)
		}
	} else if res != nil {
		log.Printf("[favicon] HTML response status: %d", res.StatusCode)
		if closeErr := res.Body.Close(); closeErr != nil {
			log.Printf("Error closing favicon HTML response body: %v", closeErr)
		}
	}

	log.Printf("[favicon] Trying common favicon paths...")
	for _, path := range faviconPaths {
		faviconURL := origin + path
		log.Printf("[favicon] Trying: %s", faviconURL)
		data, contentType, err := downloadFavicon(ctx, client, faviconURL)
		if err == nil {
			log.Printf("[favicon] Success with %s", path)
			return data, contentType, nil
		}
		log.Printf("[favicon] Failed %s: %v", path, err)
	}

	log.Printf("[favicon] All attempts failed for %s", origin)
	return nil, "", errors.New("favicon not found")
}

func extractFaviconFromHTML(html, origin string) string {
	patterns := []*regexp.Regexp{
		regexp.MustCompile(`<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']`),
		regexp.MustCompile(`<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut )?icon["']`),
		regexp.MustCompile(`<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']([^"']+)["']`),
	}

	for _, re := range patterns {
		matches := re.FindStringSubmatch(html)
		if len(matches) > 1 {
			href := matches[1]
			if strings.HasPrefix(href, "//") {
				return "https:" + href
			}
			if strings.HasPrefix(href, "/") {
				return origin + href
			}
			if strings.HasPrefix(href, "http") {
				return href
			}
			return origin + "/" + href
		}
	}
	return ""
}

func downloadFavicon(ctx context.Context, client *http.Client, faviconURL string) ([]byte, string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, faviconURL, nil)
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; lan-index/1.0)")

	res, err := client.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer func() {
		if closeErr := res.Body.Close(); closeErr != nil {
			log.Printf("Error closing response body: %v", closeErr)
		}
	}()

	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, "", errors.New("favicon not found: " + res.Status)
	}

	contentType := res.Header.Get("Content-Type")
	if contentType == "" {
		if strings.HasSuffix(faviconURL, ".ico") {
			contentType = "image/x-icon"
		} else if strings.HasSuffix(faviconURL, ".png") {
			contentType = "image/png"
		} else if strings.HasSuffix(faviconURL, ".svg") {
			contentType = "image/svg+xml"
		} else {
			contentType = "image/x-icon"
		}
	}

	if !strings.HasPrefix(contentType, "image/") {
		return nil, "", errors.New("not an image: " + contentType)
	}

	data, err := io.ReadAll(io.LimitReader(res.Body, 100*1024))
	if err != nil {
		return nil, "", err
	}

	if len(data) == 0 {
		return nil, "", errors.New("empty favicon")
	}

	return data, contentType, nil
}
