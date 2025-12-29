// Weather module

function getWeatherIcon(code) {
  const icons = {
    0: { icon: 'fa-sun', desc: 'Clear sky' },
    1: { icon: 'fa-sun', desc: 'Mainly clear' },
    2: { icon: 'fa-cloud-sun', desc: 'Partly cloudy' },
    3: { icon: 'fa-cloud', desc: 'Overcast' },
    45: { icon: 'fa-smog', desc: 'Fog' },
    48: { icon: 'fa-smog', desc: 'Depositing rime fog' },
    51: { icon: 'fa-cloud-rain', desc: 'Light drizzle' },
    53: { icon: 'fa-cloud-rain', desc: 'Moderate drizzle' },
    55: { icon: 'fa-cloud-rain', desc: 'Dense drizzle' },
    61: { icon: 'fa-cloud-showers-heavy', desc: 'Slight rain' },
    63: { icon: 'fa-cloud-showers-heavy', desc: 'Moderate rain' },
    65: { icon: 'fa-cloud-showers-heavy', desc: 'Heavy rain' },
    71: { icon: 'fa-snowflake', desc: 'Slight snow' },
    73: { icon: 'fa-snowflake', desc: 'Moderate snow' },
    75: { icon: 'fa-snowflake', desc: 'Heavy snow' },
    80: { icon: 'fa-cloud-showers-heavy', desc: 'Slight showers' },
    81: { icon: 'fa-cloud-showers-heavy', desc: 'Moderate showers' },
    82: { icon: 'fa-cloud-showers-heavy', desc: 'Violent showers' },
    95: { icon: 'fa-bolt', desc: 'Thunderstorm' },
    96: { icon: 'fa-bolt', desc: 'Thunderstorm with hail' },
    99: { icon: 'fa-bolt', desc: 'Thunderstorm with heavy hail' }
  };
  return icons[code] || { icon: 'fa-question', desc: 'Unknown' };
}

async function refreshWeather() {
  try {
    // Get saved location from localStorage
    let weatherUrl = "/api/weather";
    let locationName = "";
    try {
      const savedLoc = localStorage.getItem('weatherLocation');
      if (savedLoc) {
        const loc = JSON.parse(savedLoc);
        weatherUrl += "?lat=" + loc.latitude + "&lon=" + loc.longitude;
        locationName = loc.name || "";
      }
    } catch (e) {}

    // Update location display
    const locationEl = document.getElementById("weatherLocation");
    if (locationEl) {
      locationEl.textContent = locationName ? "• " + locationName : "";
    }

    const res = await fetch(weatherUrl, {cache:"no-store"});
    const j = await res.json();

    // Now - current weather
    if (j.current) {
      const nowWeather = getWeatherIcon(j.current.weatherCode);
      const nowIconEl = document.getElementById("weatherNowIcon");
      if (nowIconEl) {
        nowIconEl.innerHTML = '<i class="fas ' + nowWeather.icon + '" title="' + nowWeather.desc + '"></i>';
        nowIconEl.setAttribute('title', nowWeather.desc);
      }
      const nowDataEl = document.getElementById("weatherNowData");
      if (nowDataEl) {
        const items = [];
        
        // Wrap each icon+value pair in a span to prevent breaking
        items.push('<span style="white-space: nowrap;"><i class="fas fa-thermometer-half" title="Temperature"></i> ' + j.current.temperature.toFixed(0) + (j.current.tempUnit || '°C') + '</span>');
        items.push('<span style="white-space: nowrap;"><i class="fas fa-tint" title="Humidity"></i> ' + j.current.humidity.toFixed(0) + '%</span>');
        items.push('<span style="white-space: nowrap;"><i class="fas fa-wind" title="Wind"></i> ' + j.current.windSpeed.toFixed(0) + (j.current.windUnit || ' km/h') + '</span>');
        
        if (j.current.feelsLike !== undefined) {
          items.push('<span style="white-space: nowrap;"><i class="fas fa-hand-holding" title="Feels like"></i> ' + j.current.feelsLike.toFixed(0) + '°</span>');
        }
        if (j.current.pressure !== undefined) {
          items.push('<span style="white-space: nowrap;"><i class="fas fa-compress-arrows-alt" title="Pressure"></i> ' + j.current.pressure.toFixed(0) + ' hPa</span>');
        }
        if (j.current.windDirection !== undefined) {
          const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
          const dir = dirs[Math.round(j.current.windDirection / 22.5) % 16];
          items.push('<span style="white-space: nowrap;"><i class="fas fa-compass" title="Wind direction"></i> ' + dir + ' (' + j.current.windDirection + '°)</span>');
        }
        if (j.current.uvIndex !== undefined) {
          items.push('<span style="white-space: nowrap;"><i class="fas fa-sun" title="UV Index"></i> ' + j.current.uvIndex.toFixed(0) + '</span>');
        }
        if (j.current.precipitationProb !== undefined) {
          items.push('<span style="white-space: nowrap;"><i class="fas fa-cloud-rain" title="Precipitation"></i> ' + j.current.precipitationProb.toFixed(0) + '%</span>');
        }
        if (j.current.cloudCover !== undefined) {
          items.push('<span style="white-space: nowrap;"><i class="fas fa-cloud" title="Cloud cover"></i> ' + j.current.cloudCover.toFixed(0) + '%</span>');
        }
        if (j.current.visibility !== undefined) {
          items.push('<span style="white-space: nowrap;"><i class="fas fa-eye" title="Visibility"></i> ' + j.current.visibility.toFixed(1) + ' km</span>');
        }
        if (j.current.dewPoint !== undefined) {
          items.push('<span style="white-space: nowrap;"><i class="fas fa-droplet" title="Dew point"></i> ' + j.current.dewPoint.toFixed(0) + '°</span>');
        }

        nowDataEl.innerHTML = items.join(' • ');
      }
    } else {
      const nowIconEl = document.getElementById("weatherNowIcon");
      if (nowIconEl) {
        nowIconEl.innerHTML = "—";
        nowIconEl.removeAttribute('title');
      }
      const nowDataEl = document.getElementById("weatherNowData");
      if (nowDataEl) {
        nowDataEl.textContent = j.summary || "—";
      }
    }

    // Today
    if (j.today) {
      const todayWeather = getWeatherIcon(j.today.weatherCode);
      const todayIconEl = document.getElementById("weatherTodayIcon");
      if (todayIconEl) {
        todayIconEl.innerHTML = '<i class="fas ' + todayWeather.icon + '" title="' + todayWeather.desc + '"></i>';
        todayIconEl.setAttribute('title', todayWeather.desc);
      }
      const todayDataEl = document.getElementById("weatherTodayData");
      if (todayDataEl) {
        const items = [];
        
        // Wrap each icon+value pair in a span to prevent breaking
        items.push('<span style="white-space: nowrap;"><i class="fas fa-temperature-high" title="High"></i> ' + j.today.tempMax.toFixed(0) + '°</span>');
        items.push('<span style="white-space: nowrap;"><i class="fas fa-temperature-low" title="Low"></i> ' + j.today.tempMin.toFixed(0) + '°</span>');
        
        if (j.today.precipitationProb !== undefined) {
          items.push('<span style="white-space: nowrap;"><i class="fas fa-cloud-rain" title="Precipitation"></i> ' + j.today.precipitationProb.toFixed(0) + '%</span>');
        }
        
        if (j.today.sunrise) {
          items.push('<span style="white-space: nowrap;"><i class="fas fa-sun" title="Sunrise"></i> ' + j.today.sunrise + '</span>');
        }
        
        if (j.today.sunset) {
          items.push('<span style="white-space: nowrap;"><i class="fas fa-moon" title="Sunset"></i> ' + j.today.sunset + '</span>');
        }
        
        // UV Index Max - available in daily (and current has UV Index)
        if (j.today.uvIndexMax !== undefined && j.current && j.current.uvIndex !== undefined) {
          items.push('<span style="white-space: nowrap;"><i class="fas fa-sun" title="UV Index Max"></i> ' + j.today.uvIndexMax.toFixed(0) + '</span>');
        }
        
        todayDataEl.innerHTML = items.join(' • ');
      }

      // Hide details section since everything is in the main data line
      const todayDetailsEl = document.getElementById("weatherTodayDetails");
      if (todayDetailsEl) {
        todayDetailsEl.style.display = 'none';
      }
    } else {
      const todayIconEl = document.getElementById("weatherTodayIcon");
      if (todayIconEl) {
        todayIconEl.innerHTML = "—";
        todayIconEl.removeAttribute('title');
      }
      const todayDataEl = document.getElementById("weatherTodayData");
      if (todayDataEl) {
        todayDataEl.textContent = "—";
      }
    }

    // Tomorrow
    if (j.tomorrow) {
      const tomorrowWeather = getWeatherIcon(j.tomorrow.weatherCode);
      const tomorrowIconEl = document.getElementById("weatherTomorrowIcon");
      if (tomorrowIconEl) {
        tomorrowIconEl.innerHTML = '<i class="fas ' + tomorrowWeather.icon + '" title="' + tomorrowWeather.desc + '"></i>';
        tomorrowIconEl.setAttribute('title', tomorrowWeather.desc);
      }
      const tomorrowDataEl = document.getElementById("weatherTomorrowData");
      if (tomorrowDataEl) {
        const items = [];
        
        // Wrap each icon+value pair in a span to prevent breaking
        items.push('<span style="white-space: nowrap;"><i class="fas fa-temperature-high" title="High"></i> ' + j.tomorrow.tempMax.toFixed(0) + '°</span>');
        items.push('<span style="white-space: nowrap;"><i class="fas fa-temperature-low" title="Low"></i> ' + j.tomorrow.tempMin.toFixed(0) + '°</span>');
        
        if (j.tomorrow.precipitationProb !== undefined) {
          items.push('<span style="white-space: nowrap;"><i class="fas fa-cloud-rain" title="Precipitation"></i> ' + j.tomorrow.precipitationProb.toFixed(0) + '%</span>');
        }
        
        if (j.tomorrow.sunrise) {
          items.push('<span style="white-space: nowrap;"><i class="fas fa-sun" title="Sunrise"></i> ' + j.tomorrow.sunrise + '</span>');
        }
        
        if (j.tomorrow.sunset) {
          items.push('<span style="white-space: nowrap;"><i class="fas fa-moon" title="Sunset"></i> ' + j.tomorrow.sunset + '</span>');
        }
        
        // UV Index Max - available in daily (and current has UV Index)
        if (j.tomorrow.uvIndexMax !== undefined && j.current && j.current.uvIndex !== undefined) {
          items.push('<span style="white-space: nowrap;"><i class="fas fa-sun" title="UV Index Max"></i> ' + j.tomorrow.uvIndexMax.toFixed(0) + '</span>');
        }
        
        tomorrowDataEl.innerHTML = items.join(' • ');
      }

      // Hide details section since everything is in the main data line
      const tomorrowDetailsEl = document.getElementById("weatherTomorrowDetails");
      if (tomorrowDetailsEl) {
        tomorrowDetailsEl.style.display = 'none';
      }
    } else {
      const tomorrowIconEl = document.getElementById("weatherTomorrowIcon");
      if (tomorrowIconEl) {
        tomorrowIconEl.innerHTML = "—";
        tomorrowIconEl.removeAttribute('title');
      }
      const tomorrowDataEl = document.getElementById("weatherTomorrowData");
      if (tomorrowDataEl) {
        tomorrowDataEl.textContent = "—";
      }
    }

    window.startTimer("weather");
  } catch(err) {
    if (window.debugError) window.debugError('weather', "Error refreshing weather:", err);
  }
}

// Export to window
window.getWeatherIcon = getWeatherIcon;
window.refreshWeather = refreshWeather;
