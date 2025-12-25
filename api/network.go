package api

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"strings"
	"time"
)

// PublicIP fetches the public IP address using multiple services.
func PublicIP(ctx context.Context, timeout time.Duration) (string, error) {
	cctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

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
