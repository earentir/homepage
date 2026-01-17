package main

import (
	"encoding/json"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// Config represents the application configuration
type Config struct {
	Port  string `json:"port"`
	IP    string `json:"ip"`
	ID    string `json:"id"`
	Debug bool   `json:"debug"`
	Log   string `json:"log"`
}

// DefaultConfig returns the default configuration
func DefaultConfig() Config {
	return Config{
		Port:  "8080",
		IP:    "0.0.0.0",
		ID:    "homepage",
		Debug: false,
		Log:   "",
	}
}

// LoadConfig loads configuration from a file or directory path
func LoadConfig(configPath string) (Config, error) {
	config := DefaultConfig()
	configFile := "homepage.config" // Default config file name

	if configPath != "" {
		// Determine the config file path from provided path
		var err error
		configFile, err = resolveConfigPath(configPath)
		if err != nil {
			return config, fmt.Errorf("failed to resolve config path: %w", err)
		}
	}

	// Check if config file exists
	if _, err := os.Stat(configFile); os.IsNotExist(err) {
		// Config file doesn't exist, create it with defaults
		if err := saveConfigToFile(configFile, config); err != nil {
			return config, fmt.Errorf("failed to create config file: %w", err)
		}
		fmt.Printf("Created config file: %s\n", configFile)
		return config, nil
	}

	// Load existing config file
	file, err := os.Open(configFile)
	if err != nil {
		return config, fmt.Errorf("failed to open config file: %w", err)
	}
	defer file.Close()

	var fileConfig Config
	decoder := json.NewDecoder(file)
	if err := decoder.Decode(&fileConfig); err != nil {
		return config, fmt.Errorf("failed to parse config file: %w", err)
	}

	// Validate loaded config
	if err := validateConfig(fileConfig); err != nil {
		return config, fmt.Errorf("invalid config: %w", err)
	}

	return fileConfig, nil
}

// resolveConfigPath determines the full path to the config file
func resolveConfigPath(configPath string) (string, error) {
	// Check if it's already a file
	if info, err := os.Stat(configPath); err == nil {
		if info.IsDir() {
			// It's a directory, append default filename
			return filepath.Join(configPath, "homepage.config"), nil
		}
		// It's a file, use as-is
		return configPath, nil
	}

	// Path doesn't exist, check if it ends with a separator (indicating directory)
	if strings.HasSuffix(configPath, string(filepath.Separator)) ||
		strings.HasSuffix(configPath, "/") {
		return filepath.Join(configPath, "homepage.config"), nil
	}

	// Assume it's a file path that doesn't exist yet
	return configPath, nil
}

// saveConfigToFile saves the configuration to a JSON file
func saveConfigToFile(filename string, config Config) error {
	// Create directory if it doesn't exist
	dir := filepath.Dir(filename)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create config directory: %w", err)
	}

	file, err := os.Create(filename)
	if err != nil {
		return fmt.Errorf("failed to create config file: %w", err)
	}
	defer file.Close()

	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(config); err != nil {
		return fmt.Errorf("failed to write config: %w", err)
	}

	return nil
}

// validateConfig validates the configuration values
func validateConfig(config Config) error {
	// Validate port
	if config.Port == "" {
		return fmt.Errorf("port cannot be empty")
	}
	if port, err := strconv.Atoi(config.Port); err != nil || port < 1 || port > 65535 {
		return fmt.Errorf("port must be a valid port number (1-65535)")
	}

	// Validate IP (allow empty for 0.0.0.0 default)
	if config.IP != "" {
		if net.ParseIP(config.IP) == nil {
			return fmt.Errorf("ip must be a valid IP address")
		}
	}

	// Validate ID
	if config.ID == "" {
		return fmt.Errorf("id cannot be empty")
	}
	if len(config.ID) > 64 {
		return fmt.Errorf("id must be 64 characters or less")
	}

	// Debug is a boolean, no validation needed
	// Log is a string path, no validation needed

	return nil
}

// GetListenAddr returns the listen address string (ip:port)
func (c Config) GetListenAddr() string {
	ip := c.IP
	if ip == "" {
		ip = "0.0.0.0"
	}
	return fmt.Sprintf("%s:%s", ip, c.Port)
}