package api

// SearchEngine represents a search engine configuration.
type SearchEngine struct {
	Name     string `json:"name"`
	URL      string `json:"url"`
	Icon     string `json:"icon"`
	Category string `json:"category"`
}

// GetSearchEngines returns the list of available search engines.
func GetSearchEngines() []SearchEngine {
	return []SearchEngine{
		// General Search Engines
		{Name: "Google", URL: "https://www.google.com/search?q=%s", Icon: "fab fa-google", Category: "general"},
		{Name: "DuckDuckGo", URL: "https://duckduckgo.com/?q=%s", Icon: "fas fa-duck", Category: "general"},
		{Name: "Bing", URL: "https://www.bing.com/search?q=%s", Icon: "fab fa-microsoft", Category: "general"},
		{Name: "Brave", URL: "https://search.brave.com/search?q=%s", Icon: "fas fa-shield-alt", Category: "general"},
		{Name: "Startpage", URL: "https://www.startpage.com/sp/search?query=%s", Icon: "fas fa-search", Category: "general"},
		{Name: "Ecosia", URL: "https://www.ecosia.org/search?q=%s", Icon: "fas fa-leaf", Category: "general"},
		{Name: "Qwant", URL: "https://www.qwant.com/?q=%s", Icon: "fas fa-search", Category: "general"},
		{Name: "SearXNG", URL: "https://searx.org/search?q=%s", Icon: "fas fa-search", Category: "general"},
		{Name: "Wikipedia", URL: "https://en.wikipedia.org/w/index.php?search=%s", Icon: "fab fa-wikipedia-w", Category: "general"},

		// LLM / AI Search
		{Name: "Perplexity", URL: "https://www.perplexity.ai/search?q=%s", Icon: "fas fa-brain", Category: "llm"},
		{Name: "ChatGPT", URL: "https://chat.openai.com/?q=%s", Icon: "fas fa-robot", Category: "llm"},
		{Name: "DeepSeek", URL: "https://www.deepseek.com/chat?q=%s", Icon: "fas fa-brain", Category: "llm"},
		{Name: "Kimi", URL: "https://kimi.moonshot.cn/search?q=%s", Icon: "fas fa-sparkles", Category: "llm"},
		{Name: "Claude", URL: "https://claude.ai/chat?q=%s", Icon: "fas fa-comments", Category: "llm"},

		// Social
		{Name: "Reddit", URL: "https://www.reddit.com/search/?q=%s", Icon: "fab fa-reddit", Category: "social"},

		// Media
		{Name: "YouTube", URL: "https://www.youtube.com/results?search_query=%s", Icon: "fab fa-youtube", Category: "media"},
		{Name: "Genius", URL: "https://genius.com/search?q=%s", Icon: "fas fa-music", Category: "media"},
		{Name: "AZLyrics", URL: "https://search.azlyrics.com/search.php?q=%s", Icon: "fas fa-music", Category: "media"},
		{Name: "Lyrics.com", URL: "https://www.lyrics.com/lyrics/%s", Icon: "fas fa-music", Category: "media"},

		// Shopping
		{Name: "Skroutz", URL: "https://www.skroutz.gr/search?keyphrase=%s", Icon: "fas fa-shopping-bag", Category: "shopping"},
		{Name: "Amazon", URL: "https://www.amazon.com/s?k=%s", Icon: "fab fa-amazon", Category: "shopping"},
		{Name: "eBay", URL: "https://www.ebay.com/sch/i.html?_nkw=%s", Icon: "fab fa-ebay", Category: "shopping"},

		// Maps
		{Name: "Google Maps", URL: "https://www.google.com/maps/search/%s", Icon: "fas fa-map-marker-alt", Category: "maps"},
		{Name: "OpenStreetMap", URL: "https://www.openstreetmap.org/search?query=%s", Icon: "fas fa-map", Category: "maps"},

		// Development
		{Name: "GitHub", URL: "https://github.com/search?q=%s", Icon: "fab fa-github", Category: "development"},
		{Name: "Stack Overflow", URL: "https://stackoverflow.com/search?q=%s", Icon: "fab fa-stack-overflow", Category: "development"},
	}
}
