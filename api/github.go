package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

var githubCache = &GitHubCache{}

// githubHTTPClient is an HTTP client with proper timeouts for GitHub API requests
var githubHTTPClient = &http.Client{
	Timeout: 15 * time.Second,
}

// makeGitHubRequest creates and executes a GitHub API request with proper headers
func makeGitHubRequest(ctx context.Context, url, token string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "lan-index/1.0")
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	return githubHTTPClient.Do(req)
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

// FetchGitHubPRs fetches pull requests for a user/org/repo.
func FetchGitHubPRs(ctx context.Context, name, accountType, token string) (GitHubPRsResponse, error) {
	cctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	var resp GitHubPRsResponse

	if accountType == "repo" {
		// For a specific repo, get PRs directly from the repo endpoint
		u := "https://api.github.com/repos/" + name + "/pulls?state=open&sort=updated&per_page=20"
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
			resp.Error = "Repository not found: " + name
			return resp, nil
		}
		if res.StatusCode < 200 || res.StatusCode > 299 {
			resp.Error = "HTTP error: " + res.Status
			return resp, nil
		}

		var prs []struct {
			Title     string `json:"title"`
			HTMLURL   string `json:"html_url"`
			State     string `json:"state"`
			User      struct {
				Login string `json:"login"`
			} `json:"user"`
			CreatedAt time.Time `json:"created_at"`
			UpdatedAt time.Time `json:"updated_at"`
		}
		if err := json.NewDecoder(res.Body).Decode(&prs); err != nil {
			resp.Error = "Failed to decode PRs: " + err.Error()
			return resp, nil
		}

		for _, pr := range prs {
			resp.Items = append(resp.Items, GitHubPRItem{
				Title:     pr.Title,
				URL:       pr.HTMLURL,
				Repo:      name,
				State:     pr.State,
				User:      pr.User.Login,
				Author:    pr.User.Login,
				Created:   pr.CreatedAt.Format("2006-01-02"),
				CreatedAt: pr.CreatedAt.Format("2006-01-02"),
				UpdatedAt: pr.UpdatedAt.Format("2006-01-02"),
			})
		}
		resp.Total = len(prs)
		return resp, nil
	}

	// For users and orgs, use the search API (more comprehensive but has limitations)
	var searchQuery string
	if accountType == "org" {
		searchQuery = "org:" + name + "+is:pr+is:open"
	} else {
		// Default to user
		searchQuery = "author:" + name + "+is:pr+is:open"
	}

	u := "https://api.github.com/search/issues?q=" + searchQuery + "&sort=updated&per_page=30"
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

	u := "https://api.github.com/search/issues?q=" + searchQuery + "&sort=updated&per_page=30"
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

// FetchGitHubStats fetches stats for a repo, user, or organization.
func FetchGitHubStats(ctx context.Context, name, accountType, token string) (GitHubStatsResponse, error) {
	cctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	var resp GitHubStatsResponse


	var apiURL string
	if accountType == "repo" {
		// For repos: GET /repos/{owner}/{repo}
		apiURL = "https://api.github.com/repos/" + name
	} else if accountType == "org" {
		// For orgs: GET /orgs/{org}
		apiURL = "https://api.github.com/orgs/" + name
	} else {
		// For users (default): GET /users/{username}
		apiURL = "https://api.github.com/users/" + name
	}

	req, _ := http.NewRequestWithContext(cctx, http.MethodGet, apiURL, nil)
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
		if accountType == "repo" {
			resp.Error = "Repository not found: " + name
		} else if accountType == "org" {
			resp.Error = "Organization not found: " + name
		} else {
			resp.Error = "User not found: " + name
		}
		return resp, nil
	}
	if res.StatusCode < 200 || res.StatusCode > 299 {
		resp.Error = "HTTP error: " + res.Status
		return resp, nil
	}

	if accountType == "repo" {
		// Parse repository stats
		var repo struct {
			StargazersCount int       `json:"stargazers_count"`
			ForksCount      int       `json:"forks_count"`
			WatchersCount   int       `json:"watchers_count"`
			OpenIssuesCount int       `json:"open_issues_count"`
			Language        string    `json:"language"`
			Size            int       `json:"size"`
			CreatedAt       time.Time `json:"created_at"`
			UpdatedAt       time.Time `json:"updated_at"`
			PushedAt        time.Time `json:"pushed_at"`
			License         struct {
				Name string `json:"name"`
			} `json:"license"`
			Fork       bool     `json:"fork"`
			Archived   bool     `json:"archived"`
			Topics     []string `json:"topics"`
			FullName   string   `json:"full_name"`
		}
		if err := json.NewDecoder(res.Body).Decode(&repo); err != nil {
			resp.Error = "Failed to decode repo stats: " + err.Error()
			return resp, nil
		}

		// Get PR and issue counts for this repo
		var openPRs, totalPRs, totalIssues int

		// Get open PRs
		openPrURL := "https://api.github.com/repos/" + repo.FullName + "/pulls?state=open&per_page=100"
		openPrReq, _ := http.NewRequestWithContext(cctx, http.MethodGet, openPrURL, nil)
		openPrReq.Header.Set("User-Agent", "lan-index/1.0")
		openPrReq.Header.Set("Accept", "application/vnd.github.v3+json")
		if token != "" {
			openPrReq.Header.Set("Authorization", "Bearer "+token)
		}
		if openPrRes, openPrErr := githubHTTPClient.Do(openPrReq); openPrErr == nil {
			defer openPrRes.Body.Close()
			GetDebugLogger().Logf("github", "Open PRs API call status: %d", openPrRes.StatusCode)
			if openPrRes.StatusCode == 200 {
				// Use Link header to get total count
				if linkHeader := openPrRes.Header.Get("Link"); linkHeader != "" {
					GetDebugLogger().Logf("github", "Open PRs Link header: %s", linkHeader)
					if lastPage := parseLastPageFromLink(linkHeader); lastPage > 0 {
						openPRs = (lastPage - 1) * 100 // Approximate count
						// Also count actual items returned
						var prs []struct{}
						if json.NewDecoder(openPrRes.Body).Decode(&prs) == nil {
							openPRs += len(prs)
							GetDebugLogger().Logf("github", "Open PRs calculated: %d (page %d, items %d)", openPRs, lastPage, len(prs))
						}
					} else {
						// No pagination, count the items directly
						var prs []struct{}
						if json.NewDecoder(openPrRes.Body).Decode(&prs) == nil {
							openPRs = len(prs)
							GetDebugLogger().Logf("github", "Open PRs (no pagination): %d", openPRs)
						}
					}
				} else {
					// No Link header, count items directly (should be <= 100)
					var prs []struct{}
					if json.NewDecoder(openPrRes.Body).Decode(&prs) == nil {
						openPRs = len(prs)
						GetDebugLogger().Logf("github", "Open PRs (direct count): %d", openPRs)
					}
				}
			}
		} else {
			GetDebugLogger().Logf("github", "Open PRs request failed: %v", openPrErr)
		}

		// Get total PRs (all states)
		totalPrURL := "https://api.github.com/repos/" + repo.FullName + "/pulls?state=all&per_page=100"
		totalPrReq, _ := http.NewRequestWithContext(cctx, http.MethodGet, totalPrURL, nil)
		totalPrReq.Header.Set("User-Agent", "lan-index/1.0")
		totalPrReq.Header.Set("Accept", "application/vnd.github.v3+json")
		if token != "" {
			totalPrReq.Header.Set("Authorization", "Bearer "+token)
		}
		if totalPrRes, totalPrErr := githubHTTPClient.Do(totalPrReq); totalPrErr == nil {
			defer totalPrRes.Body.Close()
			GetDebugLogger().Logf("github", "Total PRs API call status: %d", totalPrRes.StatusCode)
			if totalPrRes.StatusCode == 200 {
				// Use Link header to get total count
				if linkHeader := totalPrRes.Header.Get("Link"); linkHeader != "" {
					GetDebugLogger().Logf("github", "Total PRs Link header: %s", linkHeader)
					if lastPage := parseLastPageFromLink(linkHeader); lastPage > 0 {
						totalPRs = (lastPage - 1) * 100 // Approximate count
						// Also count actual items returned
						var prs []struct{}
						if json.NewDecoder(totalPrRes.Body).Decode(&prs) == nil {
							totalPRs += len(prs)
							GetDebugLogger().Logf("github", "Total PRs calculated: %d (page %d, items %d)", totalPRs, lastPage, len(prs))
						}
					} else {
						// No pagination, count the items directly
						var prs []struct{}
						if json.NewDecoder(totalPrRes.Body).Decode(&prs) == nil {
							totalPRs = len(prs)
							GetDebugLogger().Logf("github", "Total PRs (no pagination): %d", totalPRs)
						}
					}
				} else {
					// No Link header, count items directly (should be <= 100)
					var prs []struct{}
					if json.NewDecoder(totalPrRes.Body).Decode(&prs) == nil {
						totalPRs = len(prs)
						GetDebugLogger().Logf("github", "Total PRs (direct count): %d", totalPRs)
					}
				}
			}
		} else {
			GetDebugLogger().Logf("github", "Total PRs request failed: %v", totalPrErr)
		}

		// Get repository languages
		var languages []string
		languagesURL := "https://api.github.com/repos/" + repo.FullName + "/languages"
		languagesReq, _ := http.NewRequestWithContext(cctx, http.MethodGet, languagesURL, nil)
		languagesReq.Header.Set("User-Agent", "lan-index/1.0")
		languagesReq.Header.Set("Accept", "application/vnd.github.v3+json")
		if token != "" {
			languagesReq.Header.Set("Authorization", "Bearer "+token)
		}
		if languagesRes, languagesErr := githubHTTPClient.Do(languagesReq); languagesErr == nil {
			defer languagesRes.Body.Close()
			if languagesRes.StatusCode == 200 {
				var langMap map[string]int
				if json.NewDecoder(languagesRes.Body).Decode(&langMap) == nil {
					// Sort languages by byte count (descending) and take top languages
					type langPair struct {
						name  string
						bytes int
					}
					var langPairs []langPair
					for name, bytes := range langMap {
						langPairs = append(langPairs, langPair{name, bytes})
					}
					// Sort by bytes descending
					for i := 0; i < len(langPairs)-1; i++ {
						for j := i + 1; j < len(langPairs); j++ {
							if langPairs[i].bytes < langPairs[j].bytes {
								langPairs[i], langPairs[j] = langPairs[j], langPairs[i]
							}
						}
					}
					// Take top 5 languages
					for i, pair := range langPairs {
						if i >= 5 {
							break
						}
						languages = append(languages, pair.name)
					}
				}
			}
		}

		// Get total issues (all states)
		totalIssuesURL := "https://api.github.com/repos/" + repo.FullName + "/issues?state=all&per_page=100"
		totalIssuesReq, _ := http.NewRequestWithContext(cctx, http.MethodGet, totalIssuesURL, nil)
		totalIssuesReq.Header.Set("User-Agent", "lan-index/1.0")
		totalIssuesReq.Header.Set("Accept", "application/vnd.github.v3+json")
		if token != "" {
			totalIssuesReq.Header.Set("Authorization", "Bearer "+token)
		}
		if totalIssuesRes, totalIssuesErr := githubHTTPClient.Do(totalIssuesReq); totalIssuesErr == nil {
			defer totalIssuesRes.Body.Close()
			GetDebugLogger().Logf("github", "Total issues API call status: %d", totalIssuesRes.StatusCode)
			if totalIssuesRes.StatusCode == 200 {
				// Use Link header to get total count
				if linkHeader := totalIssuesRes.Header.Get("Link"); linkHeader != "" {
					GetDebugLogger().Logf("github", "Total issues Link header: %s", linkHeader)
					if lastPage := parseLastPageFromLink(linkHeader); lastPage > 0 {
						totalIssues = (lastPage - 1) * 100 // Approximate count
						// Also count actual items returned
						var issues []struct{}
						if json.NewDecoder(totalIssuesRes.Body).Decode(&issues) == nil {
							totalIssues += len(issues)
							GetDebugLogger().Logf("github", "Total issues calculated: %d (page %d, items %d)", totalIssues, lastPage, len(issues))
						}
					} else {
						// No pagination, count the items directly
						var issues []struct{}
						if json.NewDecoder(totalIssuesRes.Body).Decode(&issues) == nil {
							totalIssues = len(issues)
							GetDebugLogger().Logf("github", "Total issues (no pagination): %d", totalIssues)
						}
					}
				} else {
					// No Link header, count items directly (should be <= 100)
					var issues []struct{}
					if json.NewDecoder(totalIssuesRes.Body).Decode(&issues) == nil {
						totalIssues = len(issues)
					}
				}
			}
		} else {
			GetDebugLogger().Logf("github", "Total issues request failed: %v", totalIssuesErr)
		}

		resp.Stats = &GitHubStats{
			Stars:         repo.StargazersCount,
			Forks:         repo.ForksCount,
			Watchers:      repo.WatchersCount,
			OpenIssues:    repo.OpenIssuesCount,
			TotalIssues:   totalIssues,
			OpenPRs:       openPRs,
			TotalPRs:      totalPRs,
			Language:      repo.Language,
			Languages:     languages,
			Size:          repo.Size,
			RepoCreatedAt: repo.CreatedAt.Format("2006-01-02"),
			RepoUpdatedAt: repo.PushedAt.Format("2006-01-02"),
			License:       repo.License.Name,
			IsFork:        repo.Fork,
			IsArchived:    repo.Archived,
			Topics:        repo.Topics,
		}
	} else {
		// Parse user/organization stats
		var account struct {
			PublicRepos   int       `json:"public_repos"`
			PrivateRepos  int       `json:"total_private_repos,omitempty"`
			Followers     int       `json:"followers"`
			Following     int       `json:"following"`
			Type          string    `json:"type"`
			Company       string    `json:"company,omitempty"`
			Location      string    `json:"location,omitempty"`
			Bio           string    `json:"bio,omitempty"`
			Blog          string    `json:"blog,omitempty"`
			Email         string    `json:"email,omitempty"`
			CreatedAt     time.Time `json:"created_at"`
		}
		if err := json.NewDecoder(res.Body).Decode(&account); err != nil {
			resp.Error = "Failed to decode account stats: " + err.Error()
			return resp, nil
		}


		// Get additional stats: PRs and issues counts
		var totalPRs, openPRs, totalIssues, openIssues, totalCommits, starredCount, gistsCount int

		// TODO: Implement accurate PRs/issues counting for user/org accounts
		// GitHub Search API has restrictions on author/org queries for PRs/issues
		// For now, display 0/0 to show the UI elements
		openPRs = 0
		totalPRs = 0
		openIssues = 0
		totalIssues = 0

		// Skip the failing API calls for now
		_ = openPRs // avoid unused variable warning
		// Build queries using the CORRECT GitHub Search API syntax
		// Convert name to lowercase for GitHub search (case-insensitive but let's be safe)
		lowerName := strings.ToLower(name)
		var openPrQuery, mergedPrQuery, openIssueQuery, closedIssueQuery string
		if accountType == "org" {
			openPrQuery = "type:pr+org:" + lowerName + "+state:open"
			mergedPrQuery = "type:pr+org:" + lowerName + "+is:merged"
			openIssueQuery = "type:issue+org:" + lowerName + "+state:open"
			closedIssueQuery = "type:issue+org:" + lowerName + "+state:closed"
		} else {
			openPrQuery = "type:pr+author:" + lowerName + "+state:open"
			mergedPrQuery = "type:pr+author:" + lowerName + "+is:merged"
			openIssueQuery = "type:issue+author:" + lowerName + "+state:open"
			closedIssueQuery = "type:issue+author:" + lowerName + "+state:closed"
		}


		// Only fetch PRs/issues for users (orgs don't have their own PRs/issues)
		if accountType == "user" {
			// Fetch open PRs
			if resp, err := makeGitHubRequest(ctx, "https://api.github.com/search/issues?q="+openPrQuery+"&per_page=1", token); err == nil {
				defer resp.Body.Close()
				if resp.StatusCode == 200 {
					var result struct {
						TotalCount int `json:"total_count"`
					}
					if json.NewDecoder(resp.Body).Decode(&result) == nil {
						openPRs = result.TotalCount
					}
				}
			}

			// Fetch merged PRs
			var mergedPRs int
			if resp, err := makeGitHubRequest(ctx, "https://api.github.com/search/issues?q="+mergedPrQuery+"&per_page=1", token); err == nil {
				defer resp.Body.Close()
				if resp.StatusCode == 200 {
					var result struct {
						TotalCount int `json:"total_count"`
					}
					if json.NewDecoder(resp.Body).Decode(&result) == nil {
						mergedPRs = result.TotalCount
					}
				}
			}

			// Calculate total PRs as open + merged
			totalPRs = openPRs + mergedPRs

			// Fetch open issues
			if resp, err := makeGitHubRequest(ctx, "https://api.github.com/search/issues?q="+openIssueQuery+"&per_page=1", token); err == nil {
				defer resp.Body.Close()
				if resp.StatusCode == 200 {
					var result struct {
						TotalCount int `json:"total_count"`
					}
					if json.NewDecoder(resp.Body).Decode(&result) == nil {
						openIssues = result.TotalCount
					}
				}
			}

			// Fetch closed issues and calculate total
			if resp, err := makeGitHubRequest(ctx, "https://api.github.com/search/issues?q="+closedIssueQuery+"&per_page=1", token); err == nil {
				defer resp.Body.Close()
				if resp.StatusCode == 200 {
					var result struct {
						TotalCount int `json:"total_count"`
					}
					if json.NewDecoder(resp.Body).Decode(&result) == nil {
						totalIssues = openIssues + result.TotalCount
					}
				}
			}
		}

		// Get commit count (approximate - last 30 days of activity)
		if accountType == "user" {
			// For users, get recent commit activity
			eventsURL := "https://api.github.com/users/" + name + "/events?per_page=100"
			eventsReq, _ := http.NewRequestWithContext(cctx, http.MethodGet, eventsURL, nil)
			eventsReq.Header.Set("User-Agent", "lan-index/1.0")
			eventsReq.Header.Set("Accept", "application/vnd.github.v3+json")
			if token != "" {
				eventsReq.Header.Set("Authorization", "Bearer "+token)
			}
			if eventsRes, eventsErr := githubHTTPClient.Do(eventsReq); eventsErr == nil {
				defer eventsRes.Body.Close()
				if eventsRes.StatusCode == 200 {
					var events []struct {
						Type string `json:"type"`
						Repo struct {
							Name string `json:"name"`
						} `json:"repo"`
						Payload struct {
							Commits []struct{} `json:"commits,omitempty"`
						} `json:"payload"`
					}
					if json.NewDecoder(eventsRes.Body).Decode(&events) == nil {
						// Count PushEvent commits from recent activity
						for _, event := range events {
							if event.Type == "PushEvent" {
								totalCommits += len(event.Payload.Commits)
							}
						}
					}
				}
			}
		}

		// Get additional account stats

		// Get starred repositories count
		starredURL := ""
		if accountType == "user" {
			starredURL = "https://api.github.com/users/" + name + "/starred?per_page=1"
		} else {
			// For organizations, we can't easily get starred repos count
			starredCount = 0
		}

		if starredURL != "" {
			starredReq, _ := http.NewRequestWithContext(cctx, http.MethodGet, starredURL, nil)
			starredReq.Header.Set("User-Agent", "lan-index/1.0")
			starredReq.Header.Set("Accept", "application/vnd.github.v3+json")
			if token != "" {
				starredReq.Header.Set("Authorization", "Bearer "+token)
			}
			if starredRes, starredErr := githubHTTPClient.Do(starredReq); starredErr == nil {
				defer starredRes.Body.Close()
				// Use Link header to get total count
				if linkHeader := starredRes.Header.Get("Link"); linkHeader != "" {
					// Parse Link header to extract last page number
					if lastPage := parseLastPageFromLink(linkHeader); lastPage > 0 {
						starredCount = (lastPage - 1) * 30 // Approximate, assuming 30 per page
						if starredCount < 0 {
							starredCount = 0
						}
					}
				}
			}
		}

		// Get gists count for users
		if accountType == "user" {
			gistsURL := "https://api.github.com/users/" + name + "/gists?per_page=1"
			gistsReq, _ := http.NewRequestWithContext(cctx, http.MethodGet, gistsURL, nil)
			gistsReq.Header.Set("User-Agent", "lan-index/1.0")
			gistsReq.Header.Set("Accept", "application/vnd.github.v3+json")
			if token != "" {
				gistsReq.Header.Set("Authorization", "Bearer "+token)
			}
			if gistsRes, gistsErr := githubHTTPClient.Do(gistsReq); gistsErr == nil {
				defer gistsRes.Body.Close()
				// Use Link header to get total count
				if linkHeader := gistsRes.Header.Get("Link"); linkHeader != "" {
					if lastPage := parseLastPageFromLink(linkHeader); lastPage > 0 {
						gistsCount = (lastPage - 1) * 30 // Approximate, assuming 30 per page
						if gistsCount < 0 {
							gistsCount = 0
						}
					}
				}
			}
		}

		// For users/orgs, we show comprehensive stats
		resp.Stats = &GitHubStats{
			PublicRepos:     account.PublicRepos,
			PrivateRepos:    account.PrivateRepos,
			Followers:       account.Followers,
			Following:       account.Following,
			TotalPRs:        totalPRs,
			OpenPRs:         openPRs,
			TotalIssues:     totalIssues,
			OpenIssues:      openIssues,
			TotalCommits:    totalCommits,
			StarredRepos:    starredCount,
			Gists:           gistsCount,
			AccountType:     account.Type,
			AccountCreatedAt: account.CreatedAt.Format("2006-01-02"),
			Location:        account.Location,
			Company:         account.Company,
			Bio:             account.Bio,
			Blog:            account.Blog,
		}

	}

	return resp, nil
}

// parseLastPageFromLink extracts the last page number from GitHub's Link header
func parseLastPageFromLink(linkHeader string) int {
	// Link header format: <https://api.github.com/resource?page=2>; rel="next", <https://api.github.com/resource?page=5>; rel="last"
	// We want to extract the page number from the "last" link
	GetDebugLogger().Logf("github", "Parsing Link header: %s", linkHeader)
	links := strings.Split(linkHeader, ",")
	for _, link := range links {
		link = strings.TrimSpace(link)
		GetDebugLogger().Logf("github", "Processing link: %s", link)
		if strings.Contains(link, `rel="last"`) {
			GetDebugLogger().Logf("github", "Found last link: %s", link)
			// Extract URL from <...>
			if start := strings.Index(link, "<"); start != -1 {
				if end := strings.Index(link[start:], ">"); end != -1 {
					urlStr := link[start+1 : start+end]
					GetDebugLogger().Logf("github", "Extracted URL: %s", urlStr)
					// Parse page parameter
					if u, err := url.Parse(urlStr); err == nil {
						if page := u.Query().Get("page"); page != "" {
							GetDebugLogger().Logf("github", "Found page: %s", page)
							if p, err := strconv.Atoi(page); err == nil {
								GetDebugLogger().Logf("github", "Returning page number: %d", p)
								return p
							}
						}
					}
				}
			}
		}
	}
	GetDebugLogger().Logf("github", "No last page found, returning 0")
	return 0
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
