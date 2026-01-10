package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
)

// OpenMeteoSummary fetches weather data from Open-Meteo API.
func OpenMeteoSummary(ctx context.Context, lat, lon string) (WeatherData, error) {
	u := "https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lon + "&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,pressure_msl,uv_index,cloud_cover,visibility,dewpoint_2m,precipitation_probability,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,sunrise,sunset,weather_code&timezone=auto&forecast_days=3"
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	req.Header.Set("User-Agent", "lan-index/1.0")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return WeatherData{}, err
	}
	defer func() {
		if closeErr := res.Body.Close(); closeErr != nil {
			log.Printf("Error closing weather response body: %v", closeErr)
		}
	}()
	if res.StatusCode < 200 || res.StatusCode > 299 {
		return WeatherData{}, errors.New("weather http status " + res.Status)
	}

	var raw struct {
		Current struct {
			Temperature         float64 `json:"temperature_2m"`
			ApparentTemperature float64 `json:"apparent_temperature"`
			Humidity            float64 `json:"relative_humidity_2m"`
			WindSpeed           float64 `json:"wind_speed_10m"`
			WindDirection       int     `json:"wind_direction_10m"`
			Pressure            float64 `json:"pressure_msl"`
			UVIndex             float64 `json:"uv_index"`
			CloudCover          float64 `json:"cloud_cover"`
			Visibility          float64 `json:"visibility"`
			DewPoint            float64 `json:"dewpoint_2m"`
			PrecipitationProb   float64 `json:"precipitation_probability"`
			WeatherCode         int     `json:"weather_code"`
		} `json:"current"`
		CurrentUnits struct {
			Temperature string `json:"temperature_2m"`
			Humidity    string `json:"relative_humidity_2m"`
			WindSpeed   string `json:"wind_speed_10m"`
			Pressure    string `json:"pressure_msl"`
			Visibility  string `json:"visibility"`
		} `json:"current_units"`
		Daily struct {
			Time                 []string  `json:"time"`
			TemperatureMax       []float64 `json:"temperature_2m_max"`
			TemperatureMin       []float64 `json:"temperature_2m_min"`
			PrecipitationProbMax []float64 `json:"precipitation_probability_max"`
			UVIndexMax           []float64 `json:"uv_index_max"`
			Sunrise              []string  `json:"sunrise"`
			Sunset               []string  `json:"sunset"`
			WeatherCode          []int     `json:"weather_code"`
		} `json:"daily"`
		DailyUnits struct {
			TemperatureMax string `json:"temperature_2m_max"`
		} `json:"daily_units"`
	}
	if err := json.NewDecoder(res.Body).Decode(&raw); err != nil {
		return WeatherData{}, err
	}

	summary := "Now: " +
		Format1(raw.Current.Temperature) + raw.CurrentUnits.Temperature +
		", " + Format0(raw.Current.Humidity) + raw.CurrentUnits.Humidity +
		", wind " + Format1(raw.Current.WindSpeed) + raw.CurrentUnits.WindSpeed

	var forecast []string
	if len(raw.Daily.Time) > 0 && len(raw.Daily.TemperatureMax) > 0 {
		for i := 1; i < len(raw.Daily.Time) && i <= 3; i++ {
			if i < len(raw.Daily.TemperatureMax) && i < len(raw.Daily.TemperatureMin) {
				date := raw.Daily.Time[i]
				if len(date) >= 10 {
					date = date[5:10]
				}
				forecast = append(forecast, date+": "+
					Format1(raw.Daily.TemperatureMax[i])+"°/"+
					Format1(raw.Daily.TemperatureMin[i])+"°")
			}
		}
	}

	iconInfo := GetWeatherIcon(raw.Current.WeatherCode)
	current := &WeatherCurrent{
		Temperature:       raw.Current.Temperature,
		TempUnit:          raw.CurrentUnits.Temperature,
		FeelsLike:         raw.Current.ApparentTemperature,
		Humidity:          raw.Current.Humidity,
		WindSpeed:         raw.Current.WindSpeed,
		WindUnit:          raw.CurrentUnits.WindSpeed,
		WindDirection:     raw.Current.WindDirection,
		Pressure:          raw.Current.Pressure,
		UVIndex:           raw.Current.UVIndex,
		CloudCover:        raw.Current.CloudCover,
		Visibility:        raw.Current.Visibility,
		DewPoint:          raw.Current.DewPoint,
		PrecipitationProb: raw.Current.PrecipitationProb,
		WeatherCode:       raw.Current.WeatherCode,
		Icon:              iconInfo.Icon,
		IconDescription:   iconInfo.Desc,
	}

	tempUnit := raw.DailyUnits.TemperatureMax
	if tempUnit == "" {
		tempUnit = "°C"
	}

	var today, tomorrow *WeatherDay
	if len(raw.Daily.TemperatureMax) > 0 && len(raw.Daily.TemperatureMin) > 0 && len(raw.Daily.WeatherCode) > 0 {
		todayIcon := GetWeatherIcon(raw.Daily.WeatherCode[0])
		today = &WeatherDay{
			TempMax:           raw.Daily.TemperatureMax[0],
			TempMin:           raw.Daily.TemperatureMin[0],
			TempUnit:          tempUnit,
			PrecipitationProb: 0,
			WeatherCode:       raw.Daily.WeatherCode[0],
			Icon:              todayIcon.Icon,
			IconDescription:   todayIcon.Desc,
		}
		if len(raw.Daily.PrecipitationProbMax) > 0 {
			today.PrecipitationProb = raw.Daily.PrecipitationProbMax[0]
		}
		if len(raw.Daily.UVIndexMax) > 0 {
			today.UVIndexMax = raw.Daily.UVIndexMax[0]
		}
		if len(raw.Daily.Sunrise) > 0 && len(raw.Daily.Sunrise[0]) >= 16 {
			today.Sunrise = raw.Daily.Sunrise[0][11:16]
		}
		if len(raw.Daily.Sunset) > 0 && len(raw.Daily.Sunset[0]) >= 16 {
			today.Sunset = raw.Daily.Sunset[0][11:16]
		}
	}
	if len(raw.Daily.TemperatureMax) > 1 && len(raw.Daily.TemperatureMin) > 1 && len(raw.Daily.WeatherCode) > 1 {
		tomorrowIcon := GetWeatherIcon(raw.Daily.WeatherCode[1])
		tomorrow = &WeatherDay{
			TempMax:           raw.Daily.TemperatureMax[1],
			TempMin:           raw.Daily.TemperatureMin[1],
			TempUnit:          tempUnit,
			PrecipitationProb: 0,
			WeatherCode:       raw.Daily.WeatherCode[1],
			Icon:              tomorrowIcon.Icon,
			IconDescription:   tomorrowIcon.Desc,
		}
		if len(raw.Daily.PrecipitationProbMax) > 1 {
			tomorrow.PrecipitationProb = raw.Daily.PrecipitationProbMax[1]
		}
		if len(raw.Daily.UVIndexMax) > 1 {
			tomorrow.UVIndexMax = raw.Daily.UVIndexMax[1]
		}
		if len(raw.Daily.Sunrise) > 1 && len(raw.Daily.Sunrise[1]) >= 16 {
			tomorrow.Sunrise = raw.Daily.Sunrise[1][11:16]
		}
		if len(raw.Daily.Sunset) > 1 && len(raw.Daily.Sunset[1]) >= 16 {
			tomorrow.Sunset = raw.Daily.Sunset[1][11:16]
		}
	}

	return WeatherData{
		Summary:  summary,
		Forecast: forecast,
		Current:  current,
		Today:    today,
		Tomorrow: tomorrow,
	}, nil
}

// OpenWeatherMapSummary fetches weather data from OpenWeatherMap API.
func OpenWeatherMapSummary(ctx context.Context, lat, lon, apiKey string) (WeatherData, error) {
	if apiKey == "" {
		return WeatherData{}, errors.New("OpenWeatherMap API key required (set in Preferences)")
	}

	var today, tomorrow *WeatherDay

	u := "https://api.openweathermap.org/data/2.5/weather?lat=" + lat + "&lon=" + lon + "&appid=" + apiKey + "&units=metric"
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	req.Header.Set("User-Agent", "lan-index/1.0")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return WeatherData{}, err
	}
	defer func() {
		if closeErr := res.Body.Close(); closeErr != nil {
			log.Printf("Error closing weather response body: %v", closeErr)
		}
	}()
	if res.StatusCode < 200 || res.StatusCode > 299 {
		return WeatherData{}, fmt.Errorf("OpenWeatherMap API error: %s", res.Status)
	}

	var currentResp struct {
		Main struct {
			Temp      float64 `json:"temp"`
			FeelsLike float64 `json:"feels_like"`
			Pressure  float64 `json:"pressure"`
			Humidity  float64 `json:"humidity"`
		} `json:"main"`
		Wind struct {
			Speed float64 `json:"speed"`
			Deg   int     `json:"deg"`
		} `json:"wind"`
		Clouds struct {
			All float64 `json:"all"`
		} `json:"clouds"`
		Visibility int `json:"visibility"`
		Weather    []struct {
			ID int `json:"id"`
		} `json:"weather"`
	}
	if err := json.NewDecoder(res.Body).Decode(&currentResp); err != nil {
		return WeatherData{}, err
	}

	forecastURL := "https://api.openweathermap.org/data/2.5/forecast?lat=" + lat + "&lon=" + lon + "&appid=" + apiKey + "&units=metric&cnt=2"
	forecastReq, _ := http.NewRequestWithContext(ctx, http.MethodGet, forecastURL, nil)
	forecastReq.Header.Set("User-Agent", "lan-index/1.0")
	forecastRes, err := http.DefaultClient.Do(forecastReq)
	if err == nil {
		defer forecastRes.Body.Close()
		if forecastRes.StatusCode >= 200 && forecastRes.StatusCode <= 299 {
			var forecastResp struct {
				List []struct {
					Main struct {
						Temp float64 `json:"temp"`
					} `json:"main"`
					Weather []struct {
						ID int `json:"id"`
					} `json:"weather"`
					Dt int64 `json:"dt"`
				} `json:"list"`
			}
			if err := json.NewDecoder(forecastRes.Body).Decode(&forecastResp); err == nil && len(forecastResp.List) > 0 {
				if len(forecastResp.List) > 0 && len(forecastResp.List[0].Weather) > 0 {
					todayIcon := GetWeatherIcon(forecastResp.List[0].Weather[0].ID)
					today = &WeatherDay{
						TempMax:         forecastResp.List[0].Main.Temp,
						TempMin:         forecastResp.List[0].Main.Temp,
						TempUnit:        "°C",
						WeatherCode:     forecastResp.List[0].Weather[0].ID,
						Icon:            todayIcon.Icon,
						IconDescription: todayIcon.Desc,
					}
				}
				if len(forecastResp.List) > 1 && len(forecastResp.List[1].Weather) > 0 {
					tomorrowIcon := GetWeatherIcon(forecastResp.List[1].Weather[0].ID)
					tomorrow = &WeatherDay{
						TempMax:         forecastResp.List[1].Main.Temp,
						TempMin:         forecastResp.List[1].Main.Temp,
						TempUnit:        "°C",
						WeatherCode:     forecastResp.List[1].Weather[0].ID,
						Icon:            tomorrowIcon.Icon,
						IconDescription: tomorrowIcon.Desc,
					}
				}
			}
		}
	}

	weatherCode := 0
	if len(currentResp.Weather) > 0 {
		weatherCode = currentResp.Weather[0].ID
	}

	summary := fmt.Sprintf("Now: %.1f°C, %.0f%%, wind %.1f m/s",
		currentResp.Main.Temp, currentResp.Main.Humidity, currentResp.Wind.Speed)

	visibilityKm := float64(currentResp.Visibility) / 1000.0
	iconInfo := GetWeatherIcon(weatherCode)
	current := &WeatherCurrent{
		Temperature:     currentResp.Main.Temp,
		TempUnit:        "°C",
		FeelsLike:       currentResp.Main.FeelsLike,
		Humidity:        currentResp.Main.Humidity,
		WindSpeed:       currentResp.Wind.Speed,
		WindUnit:        "m/s",
		WindDirection:   currentResp.Wind.Deg,
		Pressure:        currentResp.Main.Pressure,
		CloudCover:      currentResp.Clouds.All,
		Visibility:      visibilityKm,
		WeatherCode:     weatherCode,
		Icon:            iconInfo.Icon,
		IconDescription: iconInfo.Desc,
	}

	return WeatherData{
		Summary:  summary,
		Forecast: []string{},
		Current:  current,
		Today:    today,
		Tomorrow: tomorrow,
	}, nil
}

// WeatherAPISummary fetches weather data from WeatherAPI.com.
func WeatherAPISummary(ctx context.Context, lat, lon, apiKey string) (WeatherData, error) {
	if apiKey == "" {
		return WeatherData{}, errors.New("WeatherAPI.com API key required (set in Preferences)")
	}

	u := "https://api.weatherapi.com/v1/forecast.json?key=" + apiKey + "&q=" + lat + "," + lon + "&days=3&aqi=no&alerts=no"
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	req.Header.Set("User-Agent", "lan-index/1.0")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return WeatherData{}, err
	}
	defer func() {
		if closeErr := res.Body.Close(); closeErr != nil {
			log.Printf("Error closing weather response body: %v", closeErr)
		}
	}()
	if res.StatusCode < 200 || res.StatusCode > 299 {
		return WeatherData{}, fmt.Errorf("WeatherAPI.com error: %s", res.Status)
	}

	var raw struct {
		Current struct {
			TempC      float64 `json:"temp_c"`
			FeelsLikeC float64 `json:"feelslike_c"`
			Humidity   float64 `json:"humidity"`
			WindKph    float64 `json:"wind_kph"`
			WindDir    string  `json:"wind_dir"`
			WindDegree int     `json:"wind_degree"`
			PressureMb float64 `json:"pressure_mb"`
			UV         float64 `json:"uv"`
			Cloud      float64 `json:"cloud"`
			VisKm      float64 `json:"vis_km"`
			DewpointC  float64 `json:"dewpoint_c"`
			PrecipMm   float64 `json:"precip_mm"`
			Condition  struct {
				Code int `json:"code"`
			} `json:"condition"`
		} `json:"current"`
		Forecast struct {
			Forecastday []struct {
				Day struct {
					MaxtempC          float64 `json:"maxtemp_c"`
					MintempC          float64 `json:"mintemp_c"`
					DailyChanceOfRain float64 `json:"daily_chance_of_rain"`
					Condition         struct {
						Code int `json:"code"`
					} `json:"condition"`
				} `json:"day"`
				Astro struct {
					Sunrise string `json:"sunrise"`
					Sunset  string `json:"sunset"`
				} `json:"astro"`
			} `json:"forecastday"`
		} `json:"forecast"`
	}
	if err := json.NewDecoder(res.Body).Decode(&raw); err != nil {
		return WeatherData{}, err
	}

	summary := fmt.Sprintf("Now: %.1f°C, %.0f%%, wind %.1f km/h",
		raw.Current.TempC, raw.Current.Humidity, raw.Current.WindKph)

	var forecast []string
	if len(raw.Forecast.Forecastday) > 1 {
		for i := 1; i < len(raw.Forecast.Forecastday) && i <= 3; i++ {
			day := raw.Forecast.Forecastday[i]
			forecast = append(forecast, fmt.Sprintf("%.1f°/%.1f°",
				day.Day.MaxtempC, day.Day.MintempC))
		}
	}

	iconInfo := GetWeatherIcon(raw.Current.Condition.Code)
	current := &WeatherCurrent{
		Temperature:     raw.Current.TempC,
		TempUnit:        "°C",
		FeelsLike:       raw.Current.FeelsLikeC,
		Humidity:        raw.Current.Humidity,
		WindSpeed:       raw.Current.WindKph,
		WindUnit:        "km/h",
		WindDirection:   raw.Current.WindDegree,
		Pressure:        raw.Current.PressureMb,
		UVIndex:         raw.Current.UV,
		CloudCover:      raw.Current.Cloud,
		Visibility:      raw.Current.VisKm,
		DewPoint:        raw.Current.DewpointC,
		PrecipitationProb: func() float64 {
			if raw.Current.PrecipMm > 0 {
				return 100.0
			}
			return 0.0
		}(),
		WeatherCode:     raw.Current.Condition.Code,
		Icon:            iconInfo.Icon,
		IconDescription: iconInfo.Desc,
	}

	var today, tomorrow *WeatherDay
	if len(raw.Forecast.Forecastday) > 0 {
		day0 := raw.Forecast.Forecastday[0]
		todayIcon := GetWeatherIcon(day0.Day.Condition.Code)
		today = &WeatherDay{
			TempMax:           day0.Day.MaxtempC,
			TempMin:           day0.Day.MintempC,
			TempUnit:          "°C",
			PrecipitationProb: day0.Day.DailyChanceOfRain,
			WeatherCode:       day0.Day.Condition.Code,
			Icon:              todayIcon.Icon,
			IconDescription:   todayIcon.Desc,
		}
		if day0.Astro.Sunrise != "" {
			today.Sunrise = day0.Astro.Sunrise
		}
		if day0.Astro.Sunset != "" {
			today.Sunset = day0.Astro.Sunset
		}
	}
	if len(raw.Forecast.Forecastday) > 1 {
		day1 := raw.Forecast.Forecastday[1]
		tomorrowIcon := GetWeatherIcon(day1.Day.Condition.Code)
		tomorrow = &WeatherDay{
			TempMax:           day1.Day.MaxtempC,
			TempMin:           day1.Day.MintempC,
			TempUnit:          "°C",
			PrecipitationProb: day1.Day.DailyChanceOfRain,
			WeatherCode:       day1.Day.Condition.Code,
			Icon:              tomorrowIcon.Icon,
			IconDescription:   tomorrowIcon.Desc,
		}
		if day1.Astro.Sunrise != "" {
			tomorrow.Sunrise = day1.Astro.Sunrise
		}
		if day1.Astro.Sunset != "" {
			tomorrow.Sunset = day1.Astro.Sunset
		}
	}

	return WeatherData{
		Summary:  summary,
		Forecast: forecast,
		Current:  current,
		Today:    today,
		Tomorrow: tomorrow,
	}, nil
}

// GeocodeCity converts a city name to coordinates using Open-Meteo's geocoding API.
func GeocodeCity(ctx context.Context, query string) ([]GeoLocation, error) {
	u := "https://geocoding-api.open-meteo.com/v1/search?name=" + url.QueryEscape(query) + "&count=5&language=en&format=json"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "lan-index/1.0")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() {
		if closeErr := res.Body.Close(); closeErr != nil {
			log.Printf("Error closing geocode response body: %v", closeErr)
		}
	}()
	if res.StatusCode < 200 || res.StatusCode > 299 {
		return nil, errors.New("geocode http status " + res.Status)
	}

	var raw struct {
		Results []struct {
			Name      string  `json:"name"`
			Latitude  float64 `json:"latitude"`
			Longitude float64 `json:"longitude"`
			Country   string  `json:"country"`
			Admin1    string  `json:"admin1"`
		} `json:"results"`
	}
	if err := json.NewDecoder(res.Body).Decode(&raw); err != nil {
		return nil, err
	}

	if len(raw.Results) == 0 {
		return nil, errors.New("no locations found")
	}

	var results []GeoLocation
	for _, r := range raw.Results {
		results = append(results, GeoLocation{
			Name:      r.Name,
			Latitude:  r.Latitude,
			Longitude: r.Longitude,
			Country:   r.Country,
			Admin1:    r.Admin1,
		})
	}
	return results, nil
}
