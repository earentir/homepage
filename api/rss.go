package api

import (
	"context"
	"crypto/tls"
	"encoding/xml"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

// RSSFeed represents an RSS feed structure.
type RSSFeed struct {
	XMLName xml.Name   `xml:"rss"`
	Channel RSSChannel `xml:"channel"`
}

// RSSChannel represents an RSS channel.
type RSSChannel struct {
	Title       string        `xml:"title"`
	Description string        `xml:"description"`
	Link        string        `xml:"link"`
	Items       []RSSItem     `xml:"item"`
}

// RSSItem represents an RSS item.
type RSSItem struct {
	Title        string       `xml:"title"`
	Description  string       `xml:"description"`
	Link         string       `xml:"link"`
	PubDate      string       `xml:"pubDate"`
	Enclosure    RSSEnclosure `xml:"enclosure"`
	MediaContent MediaContent `xml:"content"`
	MediaThumb   string       `xml:"thumbnail"`
}

// RSSEnclosure represents an RSS enclosure (for media).
type RSSEnclosure struct {
	URL  string `xml:"url,attr"`
	Type string `xml:"type,attr"`
}

// MediaContent represents media:content element.
type MediaContent struct {
	URL string `xml:"url,attr"`
}

// FetchRSSFeed fetches and parses an RSS feed.
func FetchRSSFeed(ctx context.Context, feedURL string, count int) ([]RSSFeedItem, error) {
	parsedURL, err := url.Parse(feedURL)
	if err != nil {
		return nil, fmt.Errorf("invalid URL: %v", err)
	}
	if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
		return nil, fmt.Errorf("URL must be http or https")
	}

	client := &http.Client{
		Timeout: 15 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, feedURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %v", err)
	}
	req.Header.Set("User-Agent", "lan-index/1.0")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch feed: %v", err)
	}
	defer func() {
		if closeErr := resp.Body.Close(); closeErr != nil {
			log.Printf("Error closing RSS response body: %v", closeErr)
		}
	}()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("HTTP error: %s", resp.Status)
	}

	var feed RSSFeed
	decoder := xml.NewDecoder(resp.Body)
	if err := decoder.Decode(&feed); err != nil {
		return nil, fmt.Errorf("failed to parse RSS: %v", err)
	}

	items := make([]RSSFeedItem, 0, count)
	for i, item := range feed.Channel.Items {
		if i >= count {
			break
		}

		pubDate := ""
		if item.PubDate != "" {
			formats := []string{
				time.RFC1123Z,
				time.RFC1123,
				time.RFC822Z,
				time.RFC822,
				time.RFC3339,
			}
			for _, format := range formats {
				if t, err := time.Parse(format, item.PubDate); err == nil {
					pubDate = t.Format(time.RFC3339)
					break
				}
			}
			if pubDate == "" {
				if t, err := time.Parse(time.RFC3339, item.PubDate); err == nil {
					pubDate = t.Format(time.RFC3339)
				}
			}
		}

		description := cleanHTML(item.Description)
		lines := strings.Split(description, "\n")
		if len(lines) > 2 {
			description = strings.Join(lines[:2], "\n")
		}

		items = append(items, RSSFeedItem{
			Title:       strings.TrimSpace(item.Title),
			Description: strings.TrimSpace(description),
			Link:        strings.TrimSpace(item.Link),
			PubDate:     pubDate,
		})
	}

	return items, nil
}

func cleanHTML(html string) string {
	re := regexp.MustCompile(`<[^>]*>`)
	cleaned := re.ReplaceAllString(html, "")
	cleaned = strings.ReplaceAll(cleaned, "&lt;", "<")
	cleaned = strings.ReplaceAll(cleaned, "&gt;", ">")
	cleaned = strings.ReplaceAll(cleaned, "&amp;", "&")
	cleaned = strings.ReplaceAll(cleaned, "&quot;", "\"")
	cleaned = strings.ReplaceAll(cleaned, "&apos;", "'")
	cleaned = strings.ReplaceAll(cleaned, "&#39;", "'")
	cleaned = strings.ReplaceAll(cleaned, "&nbsp;", " ")
	return cleaned
}
