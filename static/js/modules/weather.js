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
        nowDataEl.innerHTML =
          '<i class="fas fa-thermometer-half" title="Temperature"></i> ' + j.current.temperature.toFixed(0) + (j.current.tempUnit || '°C') +
          ' <i class="fas fa-tint" title="Humidity"></i> ' + j.current.humidity.toFixed(0) + '%' +
          ' <i class="fas fa-wind" title="Wind"></i> ' + j.current.windSpeed.toFixed(0) + (j.current.windUnit || ' km/h');
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
        todayDataEl.innerHTML =
          '<i class="fas fa-temperature-high" title="High"></i> ' + j.today.tempMax.toFixed(0) + '°' +
          ' <i class="fas fa-temperature-low" title="Low"></i> ' + j.today.tempMin.toFixed(0) + '°';
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
        tomorrowDataEl.innerHTML =
          '<i class="fas fa-temperature-high" title="High"></i> ' + j.tomorrow.tempMax.toFixed(0) + '°' +
          ' <i class="fas fa-temperature-low" title="Low"></i> ' + j.tomorrow.tempMin.toFixed(0) + '°';
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
