package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

var githubCache = &GitHubCache{}

// githubHTTPClient is an HTTP client with proper timeouts for GitHub API requests
var githubHTTPClient = &http.Client{
	Timeout: 15 * time.Second,
}

// FetchGitHubRepos fetches repos from hardcoded user and org.
func FetchGitHubRepos(ctx context.Context) (GitHubUserRepos, GitHubOrgRepos, error) {
	githubCache.mu.RLock()
	timeSinceLastFetch := time.Since(githubCache.lastFetch)
	hasCachedData := githubCache.hasData
	cachedUserRepos := githubCache.userRepos
	cachedOrgRepos := githubCache.orgRepos
	githubCache.mu.RUnlock()

	minWaitTime := 5 * time.Minute
	if hasCachedData {
		minWaitTime = 15 * time.Minute
	}

	if hasCachedData && timeSinceLastFetch < minWaitTime {
		GetDebugLogger().Logf("github", "returning cached data (last fetch: %v ago)", timeSinceLastFetch)
		return cachedUserRepos, cachedOrgRepos, nil
	}

	if timeSinceLastFetch < 5*time.Minute {
		GetDebugLogger().Logf("github", "too soon since last call (%v), returning cached data", timeSinceLastFetch)
		if hasCachedData {
			return cachedUserRepos, cachedOrgRepos, nil
		}
		return GitHubUserRepos{Error: "Rate limited. Please wait a few minutes."},
			GitHubOrgRepos{Error: "Rate limited. Please wait a few minutes."},
			nil
	}

	cctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	var userRepos GitHubUserRepos
	var orgRepos GitHubOrgRepos

	// Fetch from Earentir user
	userRepos = fetchUserRepos(cctx, "Earentir")

	// Fetch from network-plane org
	orgRepos = fetchOrgRepos(cctx, "network-plane")

	if (userRepos.Error != "" || orgRepos.Error != "") && hasCachedData {
		GetDebugLogger().Logf("github", "API call failed but returning cached data")
		return cachedUserRepos, cachedOrgRepos, nil
	}

	if len(userRepos.Repos) == 0 && len(orgRepos.Repos) == 0 {
		if userRepos.Error == "" && orgRepos.Error == "" {
			return userRepos, orgRepos, errors.New("no repos found")
		}
		return userRepos, orgRepos, nil
	}

	if len(userRepos.Repos) > 0 || len(orgRepos.Repos) > 0 {
		githubCache.mu.Lock()
		githubCache.userRepos = userRepos
		githubCache.orgRepos = orgRepos
		githubCache.lastFetch = time.Now()
		githubCache.hasData = true
		githubCache.mu.Unlock()

		GetDebugLogger().Logf("github", "cached %d user repos and %d org repos", len(userRepos.Repos), len(orgRepos.Repos))
	}

	return userRepos, orgRepos, nil
}

func fetchUserRepos(ctx context.Context, username string) GitHubUserRepos {
	var userRepos GitHubUserRepos

	u := "https://api.github.com/users/" + username + "/repos?sort=updated&per_page=5"
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	req.Header.Set("User-Agent", "lan-index/1.0")
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	res, err := githubHTTPClient.Do(req)
	if err != nil {
		GetDebugLogger().Logf("github", "API error (user repos): %v", err)
		userRepos.Error = "Failed to fetch user repos: " + err.Error()
		return userRepos
	}
	defer res.Body.Close()

	if res.StatusCode == 403 {
		rateLimitReset := res.Header.Get("X-RateLimit-Reset")
		userRepos.Error = "Rate Limited (403) will be available again in " + formatRateLimitResetForUI(rateLimitReset)
		return userRepos
	}

	if res.StatusCode < 200 || res.StatusCode > 299 {
		userRepos.Error = "Failed to fetch user repos: HTTP " + res.Status
		return userRepos
	}

	var repos []struct {
		Name        string    `json:"name"`
		FullName    string    `json:"full_name"`
		Description string    `json:"description"`
		HTMLURL     string    `json:"html_url"`
		Stargazers  int       `json:"stargazers_count"`
		Language    string    `json:"language"`
		UpdatedAt   time.Time `json:"updated_at"`
	}
	if err := json.NewDecoder(res.Body).Decode(&repos); err != nil {
		userRepos.Error = "Failed to decode user repos: " + err.Error()
		return userRepos
	}

	for _, r := range repos {
		userRepos.Repos = append(userRepos.Repos, GitHubRepo{
			Name:        r.Name,
			FullName:    r.FullName,
			Description: r.Description,
			URL:         r.HTMLURL,
			Stars:       r.Stargazers,
			Language:    r.Language,
			Updated:     r.UpdatedAt.Format("2006-01-02"),
		})
	}
	userRepos.Total = len(repos)
	userRepos.AccountURL = "https://github.com/" + username

	return userRepos
}

func fetchOrgRepos(ctx context.Context, orgName string) GitHubOrgRepos {
	var orgRepos GitHubOrgRepos

	u := "https://api.github.com/orgs/" + orgName + "/repos?sort=updated&per_page=5"
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	req.Header.Set("User-Agent", "lan-index/1.0")
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	res, err := githubHTTPClient.Do(req)
	if err != nil {
		orgRepos.Error = "Failed to fetch org repos: " + err.Error()
		return orgRepos
	}
	defer res.Body.Close()

	if res.StatusCode == 403 {
		rateLimitReset := res.Header.Get("X-RateLimit-Reset")
		orgRepos.Error = "Rate Limited (403) will be available again in " + formatRateLimitResetForUI(rateLimitReset)
		return orgRepos
	}

	if res.StatusCode < 200 || res.StatusCode > 299 {
		orgRepos.Error = "Failed to fetch org repos: HTTP " + res.Status
		return orgRepos
	}

	var repos []struct {
		Name        string    `json:"name"`
		FullName    string    `json:"full_name"`
		Description string    `json:"description"`
		HTMLURL     string    `json:"html_url"`
		Stargazers  int       `json:"stargazers_count"`
		Language    string    `json:"language"`
		UpdatedAt   time.Time `json:"updated_at"`
	}
	if err := json.NewDecoder(res.Body).Decode(&repos); err != nil {
		orgRepos.Error = "Failed to decode org repos: " + err.Error()
		return orgRepos
	}

	for _, r := range repos {
		orgRepos.Repos = append(orgRepos.Repos, GitHubRepo{
			Name:        r.Name,
			FullName:    r.FullName,
			Description: r.Description,
			URL:         r.HTMLURL,
			Stars:       r.Stargazers,
			Language:    r.Language,
			Updated:     r.UpdatedAt.Format("2006-01-02"),
		})
	}
	orgRepos.Total = len(repos)
	orgRepos.AccountURL = "https://github.com/" + orgName

	return orgRepos
}

// FetchGitHubReposForName fetches repos for a specific user or org.
func FetchGitHubReposForName(ctx context.Context, name, repoType, token string) (GitHubReposResponse, error) {
	cctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	var resp GitHubReposResponse
	resp.AccountURL = "https://github.com/" + name

	var reposURL, profileURL string
	if repoType == "org" {
		reposURL = "https://api.github.com/orgs/" + name + "/repos?sort=updated&per_page=5"
		profileURL = "https://api.github.com/orgs/" + name
	} else {
		reposURL = "https://api.github.com/users/" + name + "/repos?sort=updated&per_page=5"
		profileURL = "https://api.github.com/users/" + name
	}

	req, _ := http.NewRequestWithContext(cctx, http.MethodGet, reposURL, nil)
	req.Header.Set("User-Agent", "lan-index/1.0")
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := githubHTTPClient.Do(req)
	if err != nil {
		resp.Error = "Failed to fetch repos: " + err.Error()
		return resp, nil
	}
	defer res.Body.Close()

	if res.StatusCode == 403 {
		rateLimitReset := res.Header.Get("X-RateLimit-Reset")
		resp.Error = "Rate Limited - available again in " + formatRateLimitResetForUI(rateLimitReset)
		return resp, nil
	}
	if res.StatusCode == 404 {
		resp.Error = "Not found: " + name
		return resp, nil
	}
	if res.StatusCode < 200 || res.StatusCode > 299 {
		resp.Error = "HTTP error: " + res.Status
		return resp, nil
	}

	var repos []struct {
		Name        string    `json:"name"`
		FullName    string    `json:"full_name"`
		Description string    `json:"description"`
		HTMLURL     string    `json:"html_url"`
		Stargazers  int       `json:"stargazers_count"`
		Language    string    `json:"language"`
		UpdatedAt   time.Time `json:"updated_at"`
	}
	if err := json.NewDecoder(res.Body).Decode(&repos); err != nil {
		resp.Error = "Failed to decode repos: " + err.Error()
		return resp, nil
	}

	for _, r := range repos {
		resp.Repos = append(resp.Repos, GitHubRepo{
			Name:        r.Name,
			FullName:    r.FullName,
			Description: r.Description,
			URL:         r.HTMLURL,
			Stars:       r.Stargazers,
			Language:    r.Language,
			Updated:     r.UpdatedAt.Format("2006-01-02"),
		})
	}
	resp.Total = len(repos)

	req2, _ := http.NewRequestWithContext(cctx, http.MethodGet, profileURL, nil)
	req2.Header.Set("User-Agent", "lan-index/1.0")
	req2.Header.Set("Accept", "application/vnd.github.v3+json")
	if token != "" {
		req2.Header.Set("Authorization", "Bearer "+token)
	}
	res2, err := githubHTTPClient.Do(req2)
	if err == nil && res2.StatusCode >= 200 && res2.StatusCode <= 299 {
		var profile struct {
			PublicRepos int `json:"public_repos"`
		}
		if err := json.NewDecoder(res2.Body).Decode(&profile); err == nil {
			resp.Total = profile.PublicRepos
		}
		res2.Body.Close()
	}

	return resp, nil
}

// FetchGitHubPRs fetches pull requests for a user/org.
func FetchGitHubPRs(ctx context.Context, name, accountType, token string) (GitHubPRsResponse, error) {
	cctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	var resp GitHubPRsResponse

	// Build search query based on account type
	var searchQuery string
	if accountType == "org" {
		searchQuery = "org:" + name + "+is:pr+is:open"
	} else if accountType == "repo" {
		searchQuery = "repo:" + name + "+is:pr+is:open"
	} else {
		searchQuery = "author:" + name + "+is:pr+is:open"
	}

	u := "https://api.github.com/search/issues?q=" + url.QueryEscape(searchQuery) + "&sort=updated&per_page=30"
	req, _ := http.NewRequestWithContext(cctx, http.MethodGet, u, nil)
	req.Header.Set("User-Agent", "lan-index/1.0")
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := githubHTTPClient.Do(req)
	if err != nil {
		resp.Error = "Failed to fetch PRs: " + err.Error()
		return resp, nil
	}
	defer res.Body.Close()

	if res.StatusCode == 403 {
		rateLimitReset := res.Header.Get("X-RateLimit-Reset")
		resp.RateLimitError = "Rate Limited"
		resp.RateLimitReset = formatRateLimitResetForUI(rateLimitReset)
		return resp, nil
	}
	if res.StatusCode == 404 {
		resp.Error = "Not found: " + name
		return resp, nil
	}
	if res.StatusCode < 200 || res.StatusCode > 299 {
		resp.Error = "HTTP error: " + res.Status
		return resp, nil
	}

	var searchResult struct {
		TotalCount int `json:"total_count"`
		Items      []struct {
			Title     string `json:"title"`
			HTMLURL   string `json:"html_url"`
			State     string `json:"state"`
			User      struct {
				Login string `json:"login"`
			} `json:"user"`
			CreatedAt time.Time `json:"created_at"`
			UpdatedAt time.Time `json:"updated_at"`
			Repository struct {
				FullName string `json:"full_name"`
			} `json:"repository"`
		} `json:"items"`
	}
	if err := json.NewDecoder(res.Body).Decode(&searchResult); err != nil {
		resp.Error = "Failed to decode PRs: " + err.Error()
		return resp, nil
	}

	for _, item := range searchResult.Items {
		resp.Items = append(resp.Items, GitHubPRItem{
			Title:     item.Title,
			URL:       item.HTMLURL,
			Repo:      item.Repository.FullName,
			State:     item.State,
			User:      item.User.Login,
			Author:    item.User.Login,
			Created:   item.CreatedAt.Format("2006-01-02"),
			CreatedAt: item.CreatedAt.Format("2006-01-02"),
			UpdatedAt: item.UpdatedAt.Format("2006-01-02"),
		})
	}
	resp.Total = searchResult.TotalCount

	return resp, nil
}

// FetchGitHubCommits fetches commits for a user/org.
func FetchGitHubCommits(ctx context.Context, name, accountType, token string) (GitHubCommitsResponse, error) {
	cctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	var resp GitHubCommitsResponse

	// For commits, we need to get repos first, then get commits from each repo
	var reposURL string
	if accountType == "org" {
		reposURL = "https://api.github.com/orgs/" + name + "/repos?sort=updated&per_page=10"
	} else if accountType == "repo" {
		// For a specific repo, get commits directly
		u := "https://api.github.com/repos/" + name + "/commits?per_page=30"
		req, _ := http.NewRequestWithContext(cctx, http.MethodGet, u, nil)
		req.Header.Set("User-Agent", "lan-index/1.0")
		req.Header.Set("Accept", "application/vnd.github.v3+json")
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		res, err := githubHTTPClient.Do(req)
		if err != nil {
			resp.Error = "Failed to fetch commits: " + err.Error()
			return resp, nil
		}
		defer res.Body.Close()

		if res.StatusCode == 403 {
			rateLimitReset := res.Header.Get("X-RateLimit-Reset")
			resp.RateLimitError = "Rate Limited"
			resp.RateLimitReset = formatRateLimitResetForUI(rateLimitReset)
			return resp, nil
		}
		if res.StatusCode == 404 {
			resp.Error = "Repository not found: " + name
			return resp, nil
		}
		if res.StatusCode < 200 || res.StatusCode > 299 {
			resp.Error = "HTTP error: " + res.Status
			return resp, nil
		}

		var commits []struct {
			SHA    string `json:"sha"`
			Commit struct {
				Message string `json:"message"`
				Author  struct {
					Name  string    `json:"name"`
					Date  time.Time `json:"date"`
				} `json:"author"`
			} `json:"commit"`
			HTMLURL string `json:"html_url"`
		}
		if err := json.NewDecoder(res.Body).Decode(&commits); err != nil {
			resp.Error = "Failed to decode commits: " + err.Error()
			return resp, nil
		}

		for _, c := range commits {
			message := c.Commit.Message
			if len(message) > 80 {
				message = message[:77] + "..."
			}
			resp.Items = append(resp.Items, GitHubCommitItem{
				SHA:     c.SHA[:7],
				Message: message,
				URL:     c.HTMLURL,
				Repo:    name,
				Author:  c.Commit.Author.Name,
				Date:    c.Commit.Author.Date.Format("2006-01-02 15:04"),
			})
		}
		resp.Total = len(resp.Items)
		return resp, nil
	} else {
		reposURL = "https://api.github.com/users/" + name + "/repos?sort=updated&per_page=10"
	}

	// Get repos first
	req, _ := http.NewRequestWithContext(cctx, http.MethodGet, reposURL, nil)
	req.Header.Set("User-Agent", "lan-index/1.0")
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := githubHTTPClient.Do(req)
	if err != nil {
		resp.Error = "Failed to fetch repos: " + err.Error()
		return resp, nil
	}
	defer res.Body.Close()

	if res.StatusCode == 403 {
		rateLimitReset := res.Header.Get("X-RateLimit-Reset")
		resp.RateLimitError = "Rate Limited"
		resp.RateLimitReset = formatRateLimitResetForUI(rateLimitReset)
		return resp, nil
	}
	if res.StatusCode < 200 || res.StatusCode > 299 {
		resp.Error = "HTTP error: " + res.Status
		return resp, nil
	}

	var repos []struct {
		FullName string `json:"full_name"`
	}
	if err := json.NewDecoder(res.Body).Decode(&repos); err != nil {
		resp.Error = "Failed to decode repos: " + err.Error()
		return resp, nil
	}

	// Get commits from each repo (limit to first 3 repos to avoid rate limits)
	maxRepos := 3
	if len(repos) < maxRepos {
		maxRepos = len(repos)
	}
	for i := 0; i < maxRepos && len(resp.Items) < 30; i++ {
		repoName := repos[i].FullName
		u := "https://api.github.com/repos/" + repoName + "/commits?per_page=10&author=" + name
		req2, _ := http.NewRequestWithContext(cctx, http.MethodGet, u, nil)
		req2.Header.Set("User-Agent", "lan-index/1.0")
		req2.Header.Set("Accept", "application/vnd.github.v3+json")
		if token != "" {
			req2.Header.Set("Authorization", "Bearer "+token)
		}
		res2, err := githubHTTPClient.Do(req2)
		if err != nil {
			continue
		}
		if res2.StatusCode < 200 || res2.StatusCode > 299 {
			res2.Body.Close()
			continue
		}

		var commits []struct {
			SHA    string `json:"sha"`
			Commit struct {
				Message string `json:"message"`
				Author  struct {
					Name  string    `json:"name"`
					Date  time.Time `json:"date"`
				} `json:"author"`
			} `json:"commit"`
			HTMLURL string `json:"html_url"`
		}
		if err := json.NewDecoder(res2.Body).Decode(&commits); err == nil {
			for _, c := range commits {
				if len(resp.Items) >= 30 {
					break
				}
				message := c.Commit.Message
				if len(message) > 80 {
					message = message[:77] + "..."
				}
				resp.Items = append(resp.Items, GitHubCommitItem{
					SHA:     c.SHA[:7],
					Message: message,
					URL:     c.HTMLURL,
					Repo:    repoName,
					Author:  c.Commit.Author.Name,
					Date:    c.Commit.Author.Date.Format("2006-01-02 15:04"),
				})
			}
		}
		res2.Body.Close()
	}
	resp.Total = len(resp.Items)

	return resp, nil
}

// FetchGitHubIssues fetches issues for a user/org.
func FetchGitHubIssues(ctx context.Context, name, accountType, token string) (GitHubIssuesResponse, error) {
	cctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	var resp GitHubIssuesResponse

	// Build search query based on account type
	var searchQuery string
	if accountType == "org" {
		searchQuery = "org:" + name + "+is:issue+is:open"
	} else if accountType == "repo" {
		searchQuery = "repo:" + name + "+is:issue+is:open"
	} else {
		searchQuery = "author:" + name + "+is:issue+is:open"
	}

	u := "https://api.github.com/search/issues?q=" + url.QueryEscape(searchQuery) + "&sort=updated&per_page=30"
	req, _ := http.NewRequestWithContext(cctx, http.MethodGet, u, nil)
	req.Header.Set("User-Agent", "lan-index/1.0")
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := githubHTTPClient.Do(req)
	if err != nil {
		resp.Error = "Failed to fetch issues: " + err.Error()
		return resp, nil
	}
	defer res.Body.Close()

	if res.StatusCode == 403 {
		rateLimitReset := res.Header.Get("X-RateLimit-Reset")
		resp.RateLimitError = "Rate Limited"
		resp.RateLimitReset = formatRateLimitResetForUI(rateLimitReset)
		return resp, nil
	}
	if res.StatusCode == 404 {
		resp.Error = "Not found: " + name
		return resp, nil
	}
	if res.StatusCode < 200 || res.StatusCode > 299 {
		resp.Error = "HTTP error: " + res.Status
		return resp, nil
	}

	var searchResult struct {
		TotalCount int `json:"total_count"`
		Items      []struct {
			Title     string `json:"title"`
			HTMLURL   string `json:"html_url"`
			State     string `json:"state"`
			User      struct {
				Login string `json:"login"`
			} `json:"user"`
			Labels    []struct {
				Name string `json:"name"`
			} `json:"labels"`
			CreatedAt time.Time `json:"created_at"`
			UpdatedAt time.Time `json:"updated_at"`
			Repository struct {
				FullName string `json:"full_name"`
			} `json:"repository"`
		} `json:"items"`
	}
	if err := json.NewDecoder(res.Body).Decode(&searchResult); err != nil {
		resp.Error = "Failed to decode issues: " + err.Error()
		return resp, nil
	}

	for _, item := range searchResult.Items {
		labels := make([]string, len(item.Labels))
		for i, label := range item.Labels {
			labels[i] = label.Name
		}
		resp.Items = append(resp.Items, GitHubIssueItem{
			Title:     item.Title,
			URL:       item.HTMLURL,
			Repo:      item.Repository.FullName,
			State:     item.State,
			User:      item.User.Login,
			Author:    item.User.Login,
			Labels:    labels,
			Created:   item.CreatedAt.Format("2006-01-02"),
			CreatedAt: item.CreatedAt.Format("2006-01-02"),
			UpdatedAt: item.UpdatedAt.Format("2006-01-02"),
		})
	}
	resp.Total = searchResult.TotalCount

	return resp, nil
}

// FetchGitHubStats fetches stats for a repo.
func FetchGitHubStats(ctx context.Context, name, token string) (GitHubStatsResponse, error) {
	cctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	var resp GitHubStatsResponse

	u := "https://api.github.com/repos/" + name
	req, _ := http.NewRequestWithContext(cctx, http.MethodGet, u, nil)
	req.Header.Set("User-Agent", "lan-index/1.0")
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := githubHTTPClient.Do(req)
	if err != nil {
		resp.Error = "Failed to fetch stats: " + err.Error()
		return resp, nil
	}
	defer res.Body.Close()

	if res.StatusCode == 403 {
		rateLimitReset := res.Header.Get("X-RateLimit-Reset")
		resp.RateLimitError = "Rate Limited"
		resp.RateLimitReset = formatRateLimitResetForUI(rateLimitReset)
		return resp, nil
	}
	if res.StatusCode == 404 {
		resp.Error = "Repository not found: " + name
		return resp, nil
	}
	if res.StatusCode < 200 || res.StatusCode > 299 {
		resp.Error = "HTTP error: " + res.Status
		return resp, nil
	}

	var repo struct {
		StargazersCount int    `json:"stargazers_count"`
		ForksCount      int    `json:"forks_count"`
		WatchersCount   int    `json:"watchers_count"`
		OpenIssuesCount int    `json:"open_issues_count"`
		Language        string `json:"language"`
	}
	if err := json.NewDecoder(res.Body).Decode(&repo); err != nil {
		resp.Error = "Failed to decode stats: " + err.Error()
		return resp, nil
	}

	resp.Stats = &GitHubStats{
		Stars:      repo.StargazersCount,
		Forks:      repo.ForksCount,
		Watchers:   repo.WatchersCount,
		OpenIssues: repo.OpenIssuesCount,
		Language:   repo.Language,
	}

	return resp, nil
}

func formatRateLimitResetForUI(resetHeader string) string {
	if resetHeader == "" {
		return "soon"
	}
	resetUnix, err := strconv.ParseInt(resetHeader, 10, 64)
	if err != nil {
		return "soon"
	}
	resetTime := time.Unix(resetUnix, 0)
	untilReset := time.Until(resetTime)
	if untilReset <= 0 {
		return "now"
	}
	if untilReset < time.Minute {
		return "less than a minute"
	}
	if untilReset < time.Hour {
		return Itoa(int64(untilReset.Minutes())) + " minutes"
	}
	hours := int(untilReset.Hours())
	minutes := int(untilReset.Minutes()) % 60
	if minutes > 0 {
		return Itoa(int64(hours)) + "h" + Itoa(int64(minutes)) + "m"
	}
	return Itoa(int64(hours)) + "h"
}
