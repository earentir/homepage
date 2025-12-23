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
        // Line 1: Basic data
        const line1 = '<i class="fas fa-thermometer-half" title="Temperature"></i> ' + j.current.temperature.toFixed(0) + (j.current.tempUnit || '°C') +
          ' <i class="fas fa-tint" title="Humidity"></i> ' + j.current.humidity.toFixed(0) + '%' +
          ' <i class="fas fa-wind" title="Wind"></i> ' + j.current.windSpeed.toFixed(0) + (j.current.windUnit || ' km/h');

        // Collect all additional data
        const details = [];
        if (j.current.feelsLike !== undefined) {
          details.push('<i class="fas fa-hand-holding" title="Feels like"></i> ' + j.current.feelsLike.toFixed(0) + '°');
        }
        if (j.current.pressure !== undefined) {
          details.push('<i class="fas fa-compress-arrows-alt" title="Pressure"></i> ' + j.current.pressure.toFixed(0) + ' hPa');
        }
        if (j.current.windDirection !== undefined) {
          const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
          const dir = dirs[Math.round(j.current.windDirection / 22.5) % 16];
          details.push('<i class="fas fa-compass" title="Wind direction"></i> ' + dir + ' (' + j.current.windDirection + '°)');
        }
        if (j.current.uvIndex !== undefined) {
          details.push('<i class="fas fa-sun" title="UV Index"></i> ' + j.current.uvIndex.toFixed(0));
        }
        if (j.current.precipitationProb !== undefined) {
          details.push('<i class="fas fa-cloud-rain" title="Precipitation"></i> ' + j.current.precipitationProb.toFixed(0) + '%');
        }
        if (j.current.cloudCover !== undefined) {
          details.push('<i class="fas fa-cloud" title="Cloud cover"></i> ' + j.current.cloudCover.toFixed(0) + '%');
        }
        if (j.current.visibility !== undefined) {
          details.push('<i class="fas fa-eye" title="Visibility"></i> ' + j.current.visibility.toFixed(1) + ' km');
        }
        if (j.current.dewPoint !== undefined) {
          details.push('<i class="fas fa-droplet" title="Dew point"></i> ' + j.current.dewPoint.toFixed(0) + '°');
        }

        // Split details into 2 lines
        const midPoint = Math.ceil(details.length / 2);
        const line2 = details.slice(0, midPoint);
        const line3 = details.slice(midPoint);

        // Combine all 3 lines in the same div
        let html = '<div>' + line1 + '</div>';
        if (line2.length > 0) {
          html += '<div>' + line2.join(' • ') + '</div>';
        }
        if (line3.length > 0) {
          html += '<div>' + line3.join(' • ') + '</div>';
        }

        nowDataEl.innerHTML = html;
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
        let todayHtml = '<i class="fas fa-temperature-high" title="High"></i> ' + j.today.tempMax.toFixed(0) + '°' +
          ' <i class="fas fa-temperature-low" title="Low"></i> ' + j.today.tempMin.toFixed(0) + '°';
        if (j.today.precipitationProb !== undefined) {
          todayHtml += ' <i class="fas fa-cloud-rain" title="Precipitation"></i> ' + j.today.precipitationProb.toFixed(0) + '%';
        }
        if (j.today.sunrise) {
          todayHtml += ' <i class="fas fa-sun" title="Sunrise"></i> ' + j.today.sunrise;
        }
        if (j.today.sunset) {
          todayHtml += ' <i class="fas fa-moon" title="Sunset"></i> ' + j.today.sunset;
        }
        todayDataEl.innerHTML = todayHtml;
      }

      // Today details - show data that's available for now, today, and tomorrow
      const todayDetailsEl = document.getElementById("weatherTodayDetails");
      const todayDetailsData1 = document.getElementById("weatherTodayDetailsData1");
      const todayDetailsData2 = document.getElementById("weatherTodayDetailsData2");
      if (todayDetailsEl && todayDetailsData1 && todayDetailsData2) {
        const details = [];

        // UV Index Max - available in daily (and current has UV Index)
        if (j.today.uvIndexMax !== undefined && j.current && j.current.uvIndex !== undefined) {
          details.push('<i class="fas fa-sun" title="UV Index Max"></i> ' + j.today.uvIndexMax.toFixed(0));
        }

        // Precipitation probability - available in current and daily
        if (j.today.precipitationProb !== undefined && j.current && j.current.precipitationProb !== undefined) {
          details.push('<i class="fas fa-cloud-rain" title="Precipitation"></i> ' + j.today.precipitationProb.toFixed(0) + '%');
        }

        if (details.length > 0) {
          // Split into two lines if needed
          const midPoint = Math.ceil(details.length / 2);
          const line1 = details.slice(0, midPoint);
          const line2 = details.slice(midPoint);

          todayDetailsData1.innerHTML = line1.join(' • ');
          if (line2.length > 0) {
            todayDetailsData2.innerHTML = line2.join(' • ');
          } else {
            todayDetailsData2.innerHTML = '';
          }
          todayDetailsEl.style.display = 'block';
        } else {
          todayDetailsEl.style.display = 'none';
        }
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
        let tomorrowHtml = '<i class="fas fa-temperature-high" title="High"></i> ' + j.tomorrow.tempMax.toFixed(0) + '°' +
          ' <i class="fas fa-temperature-low" title="Low"></i> ' + j.tomorrow.tempMin.toFixed(0) + '°';
        if (j.tomorrow.precipitationProb !== undefined) {
          tomorrowHtml += ' <i class="fas fa-cloud-rain" title="Precipitation"></i> ' + j.tomorrow.precipitationProb.toFixed(0) + '%';
        }
        if (j.tomorrow.sunrise) {
          tomorrowHtml += ' <i class="fas fa-sun" title="Sunrise"></i> ' + j.tomorrow.sunrise;
        }
        if (j.tomorrow.sunset) {
          tomorrowHtml += ' <i class="fas fa-moon" title="Sunset"></i> ' + j.tomorrow.sunset;
        }
        tomorrowDataEl.innerHTML = tomorrowHtml;
      }

      // Tomorrow details - show data that's available for now, today, and tomorrow
      const tomorrowDetailsEl = document.getElementById("weatherTomorrowDetails");
      const tomorrowDetailsData1 = document.getElementById("weatherTomorrowDetailsData1");
      const tomorrowDetailsData2 = document.getElementById("weatherTomorrowDetailsData2");
      if (tomorrowDetailsEl && tomorrowDetailsData1 && tomorrowDetailsData2) {
        const details = [];

        // UV Index Max - available in daily (and current has UV Index)
        if (j.tomorrow.uvIndexMax !== undefined && j.current && j.current.uvIndex !== undefined) {
          details.push('<i class="fas fa-sun" title="UV Index Max"></i> ' + j.tomorrow.uvIndexMax.toFixed(0));
        }

        // Precipitation probability - available in current and daily
        if (j.tomorrow.precipitationProb !== undefined && j.current && j.current.precipitationProb !== undefined) {
          details.push('<i class="fas fa-cloud-rain" title="Precipitation"></i> ' + j.tomorrow.precipitationProb.toFixed(0) + '%');
        }

        if (details.length > 0) {
          // Split into two lines if needed
          const midPoint = Math.ceil(details.length / 2);
          const line1 = details.slice(0, midPoint);
          const line2 = details.slice(midPoint);

          tomorrowDetailsData1.innerHTML = line1.join(' • ');
          if (line2.length > 0) {
            tomorrowDetailsData2.innerHTML = line2.join(' • ');
          } else {
            tomorrowDetailsData2.innerHTML = '';
          }
          tomorrowDetailsEl.style.display = 'block';
        } else {
          tomorrowDetailsEl.style.display = 'none';
        }
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
    console.error("Error refreshing weather:", err);
  }
}

// Export to window
window.getWeatherIcon = getWeatherIcon;
window.refreshWeather = refreshWeather;
