// ================== CONFIG ==================
const GEO_API = "https://geocoding-api.open-meteo.com/v1/search";
const WEATHER_API = "https://api.open-meteo.com/v1/forecast";
const REVERSE_GEO = "https://api.bigdatacloud.net/data/reverse-geocode-client";

// ================== STATE ==================
let currentUnit = "celsius";
let currentWeatherData = null;
let currentCoords = null;
let map = null;
let mapMarker = null;
let refreshTimer = null;

// ================== SETTINGS (localStorage) ==================
const defaultSettings = {
    theme: "dark",
    defaultCity: "Islamabad",
    unit: "celsius",
    refresh: 0,
    favorites: ["Islamabad", "Karachi", "Lahore", "London", "New York"],
};

let settings = JSON.parse(localStorage.getItem("weatherSettings")) || defaultSettings;

// ================== DOM ==================
const $ = (id) => document.getElementById(id);
const cityInput = $("cityInput");
const searchBtn = $("searchBtn");
const locationBtn = $("locationBtn");
const celsiusBtn = $("celsiusBtn");
const fahrenheitBtn = $("fahrenheitBtn");
const loading = $("loading");
const errorBox = $("error");

// ================== WEATHER CODE MAP ==================
const weatherCodes = {
    0: { desc: "Clear Sky", icon: "01d" },
    1: { desc: "Mainly Clear", icon: "02d" },
    2: { desc: "Partly Cloudy", icon: "03d" },
    3: { desc: "Overcast", icon: "04d" },
    45: { desc: "Fog", icon: "50d" },
    48: { desc: "Rime Fog", icon: "50d" },
    51: { desc: "Light Drizzle", icon: "09d" },
    53: { desc: "Drizzle", icon: "09d" },
    55: { desc: "Dense Drizzle", icon: "09d" },
    61: { desc: "Slight Rain", icon: "10d" },
    63: { desc: "Moderate Rain", icon: "10d" },
    65: { desc: "Heavy Rain", icon: "10d" },
    71: { desc: "Slight Snow", icon: "13d" },
    73: { desc: "Moderate Snow", icon: "13d" },
    75: { desc: "Heavy Snow", icon: "13d" },
    80: { desc: "Rain Showers", icon: "09d" },
    81: { desc: "Showers", icon: "09d" },
    82: { desc: "Violent Showers", icon: "09d" },
    95: { desc: "Thunderstorm", icon: "11d" },
    96: { desc: "Thunder + Hail", icon: "11d" },
    99: { desc: "Heavy Thunder", icon: "11d" },
};

const getWeatherInfo = (c) => weatherCodes[c] || { desc: "Unknown", icon: "01d" };
const iconUrl = (icon) => `https://openweathermap.org/img/wn/${icon}@2x.png`;

// ================== HELPERS ==================
function showLoading(s) { loading.classList.toggle("hidden", !s); }
function showError(m) { errorBox.textContent = m; errorBox.classList.remove("hidden"); }
function clearError() { errorBox.classList.add("hidden"); }

function convertTemp(c, unit = currentUnit) {
    return unit === "fahrenheit" ? (c * 9) / 5 + 32 : c;
}
function formatTemp(c) { return Math.round(convertTemp(c)) + "°"; }

// ================== THEME ==================
function applyTheme(theme) {
    document.body.classList.toggle("light-mode", theme === "light");
    const icon = $("themeToggle").querySelector("i");
    if (theme === "light") {
        icon.className = "fa-solid fa-sun";
        $("themeToggle").innerHTML = '<i class="fa-solid fa-sun"></i> Light Mode';
    } else {
        $("themeToggle").innerHTML = '<i class="fa-solid fa-moon"></i> Dark Mode';
    }
    settings.theme = theme;
    localStorage.setItem("weatherSettings", JSON.stringify(settings));
}

$("themeToggle").addEventListener("click", () => {
    applyTheme(settings.theme === "dark" ? "light" : "dark");
});

// ================== NAVIGATION TABS ==================
document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
        document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
        btn.classList.add("active");
        $(`tab-${btn.dataset.tab}`).classList.add("active");

        if (btn.dataset.tab === "map") initMap();
        if (btn.dataset.tab === "alerts") renderAlerts();
        if (btn.dataset.tab === "activity") renderActivities();
    });
});

// ================== API CALLS ==================
async function getCoordinates(city) {
    const res = await fetch(`${GEO_API}?name=${encodeURIComponent(city)}&count=1&language=en&format=json`);
    if (!res.ok) throw new Error("Geocoding failed");
    const data = await res.json();
    if (!data.results?.length) throw new Error(`City "${city}" not found.`);
    const r = data.results[0];
    return { lat: r.latitude, lon: r.longitude, name: r.name, country: r.country || "" };
}

async function getWeather(lat, lon) {
    const url = `${WEATHER_API}?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,pressure_msl,uv_index,visibility` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,sunrise,sunset` +
        `&hourly=temperature_2m` +
        `&timezone=auto&forecast_days=7`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Weather fetch failed");
    return res.json();
}

// ================== MAIN LOAD ==================
async function fetchWeatherByCity(city) {
    try {
        showLoading(true);
        clearError();
        const loc = await getCoordinates(city);
        const weather = await getWeather(loc.lat, loc.lon);
        currentWeatherData = { loc, weather };
        currentCoords = loc;
        renderWeather();
        renderReport();
        renderActivities();
        renderAlerts();
    } catch (err) {
        showError(err.message);
    } finally {
        showLoading(false);
    }
}

async function fetchWeatherByCoords(lat, lon, name = "My Location") {
    try {
        showLoading(true);
        clearError();
        const weather = await getWeather(lat, lon);
        currentWeatherData = { loc: { name, country: "", lat, lon }, weather };
        currentCoords = { lat, lon, name };
        renderWeather();
        renderReport();
        renderActivities();
        renderAlerts();
    } catch (err) {
        showError(err.message);
    } finally {
        showLoading(false);
    }
}

// ================== RENDER: DASHBOARD ==================
function renderWeather() {
    if (!currentWeatherData) return;
    const { loc, weather } = currentWeatherData;
    const cur = weather.current;
    const daily = weather.daily;
    const info = getWeatherInfo(cur.weather_code);

    $("cityName").textContent = `${loc.name}${loc.country ? ", " + loc.country : ""}`;
    $("dateTime").textContent = new Date().toLocaleString("en-US", {
        weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    });

    $("temperature").textContent = formatTemp(cur.temperature_2m);
    $("condition").textContent = info.desc;
    $("weatherIcon").src = iconUrl(info.icon);
    $("humidity").textContent = cur.relative_humidity_2m + "%";
    $("windSpeed").textContent = Math.round(cur.wind_speed_10m) + " km/h";
    $("feelsLike").textContent = formatTemp(cur.apparent_temperature);
    $("pressure").textContent = cur.pressure_msl + " hPa";
    $("activityCity").textContent = loc.name;

    // Forecast
    const fc = $("forecastContainer");
    fc.innerHTML = "";
    for (let i = 1; i <= 5; i++) {
        const date = new Date(daily.time[i]);
        const dayName = date.toLocaleDateString("en-US", { weekday: "short" });
        const dayInfo = getWeatherInfo(daily.weather_code[i]);
        fc.innerHTML += `
            <div class="forecast-card">
                <p>${dayName}</p>
                <img src="${iconUrl(dayInfo.icon)}" alt="${dayInfo.desc}"/>
                <p class="fc-temp">${formatTemp(daily.temperature_2m_max[i])} / ${formatTemp(daily.temperature_2m_min[i])}</p>
                <p>${dayInfo.desc}</p>
            </div>`;
    }
}

// ================== RENDER: REPORT ==================
function renderReport() {
    if (!currentWeatherData) return;
    const { weather } = currentWeatherData;
    const cur = weather.current;
    const daily = weather.daily;

    const sunrise = new Date(daily.sunrise[0]).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    const sunset = new Date(daily.sunset[0]).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

    $("reportContent").innerHTML = `
        <div class="report-item"><h4>Max Temp Today</h4><h2>${formatTemp(daily.temperature_2m_max[0])}</h2></div>
        <div class="report-item"><h4>Min Temp Today</h4><h2>${formatTemp(daily.temperature_2m_min[0])}</h2></div>
        <div class="report-item"><h4>Humidity</h4><h2>${cur.relative_humidity_2m}%</h2></div>
        <div class="report-item"><h4>Wind Speed</h4><h2>${Math.round(cur.wind_speed_10m)} km/h</h2></div>
        <div class="report-item"><h4>Pressure</h4><h2>${cur.pressure_msl} hPa</h2></div>
        <div class="report-item"><h4>UV Index</h4><h2>${cur.uv_index ?? "--"}</h2><p>${getUVLevel(cur.uv_index)}</p></div>
        <div class="report-item"><h4>Rain Chance</h4><h2>${daily.precipitation_probability_max[0]}%</h2></div>
        <div class="report-item"><h4>Sunrise</h4><h2>${sunrise}</h2></div>
        <div class="report-item"><h4>Sunset</h4><h2>${sunset}</h2></div>
    `;

    // Temp chart (7 days)
    const chart = $("tempChart");
    chart.innerHTML = "";
    const maxT = Math.max(...daily.temperature_2m_max.slice(0, 7));
    for (let i = 0; i < 7; i++) {
        const date = new Date(daily.time[i]);
        const dayName = date.toLocaleDateString("en-US", { weekday: "short" });
        const val = daily.temperature_2m_max[i];
        const heightPct = (convertTemp(val) / convertTemp(maxT)) * 85;
        chart.innerHTML += `
            <div class="chart-bar">
                <div class="bar-value">${formatTemp(val)}</div>
                <div class="bar-fill" style="height:${heightPct}%"></div>
                <div class="bar-label">${dayName}</div>
            </div>`;
    }
}

function getUVLevel(uv) {
    if (uv == null) return "--";
    if (uv < 3) return "Low";
    if (uv < 6) return "Moderate";
    if (uv < 8) return "High";
    if (uv < 11) return "Very High";
    return "Extreme";
}

// ================== RENDER: ALERTS ==================
function renderAlerts() {
    if (!currentWeatherData) return;
    const { weather } = currentWeatherData;
    const cur = weather.current;
    const daily = weather.daily;
    const alerts = [];

    // Heavy rain
    if ([65, 82, 95, 96, 99].includes(cur.weather_code)) {
        alerts.push({ type: "danger", icon: "fa-cloud-showers-heavy", title: "Severe Weather Alert", msg: "Thunderstorm or heavy rain expected. Avoid outdoor travel." });
    }
    // High wind
    if (cur.wind_speed_10m > 40) {
        alerts.push({ type: "warning", icon: "fa-wind", title: "High Wind Warning", msg: `Wind speed is ${Math.round(cur.wind_speed_10m)} km/h. Secure loose objects.` });
    }
    // Heat wave
    if (cur.temperature_2m > 38) {
        alerts.push({ type: "danger", icon: "fa-temperature-high", title: "Heat Wave Alert", msg: `Temperature is ${Math.round(cur.temperature_2m)}°C. Stay hydrated, avoid sun.` });
    }
    // Cold wave
    if (cur.temperature_2m < 5) {
        alerts.push({ type: "info", icon: "fa-temperature-low", title: "Cold Weather", msg: `Temperature is ${Math.round(cur.temperature_2m)}°C. Wear warm clothes.` });
    }
    // High UV
    if ((cur.uv_index ?? 0) > 7) {
        alerts.push({ type: "warning", icon: "fa-sun", title: "High UV Index", msg: "Use sunscreen and sunglasses when outdoors." });
    }
    // Rain probability tomorrow
    if (daily.precipitation_probability_max[1] > 70) {
        alerts.push({ type: "info", icon: "fa-umbrella", title: "Rain Tomorrow", msg: `${daily.precipitation_probability_max[1]}% chance of rain tomorrow. Carry an umbrella.` });
    }

    // Good weather
    if (alerts.length === 0) {
        alerts.push({ type: "success", icon: "fa-circle-check", title: "All Clear", msg: "No severe weather alerts. Enjoy your day!" });
    }

    $("alertsContainer").innerHTML = alerts.map((a) => `
        <div class="alert-item ${a.type}">
            <i class="fa-solid ${a.icon}"></i>
            <div><h4>${a.title}</h4><p>${a.msg}</p></div>
        </div>`).join("");

    // Badge
    const dangerCount = alerts.filter((a) => a.type === "danger" || a.type === "warning").length;
    const badge = $("alertBadge");
    if (dangerCount > 0) {
        badge.textContent = dangerCount;
        badge.classList.remove("hidden");
    } else {
        badge.classList.add("hidden");
    }
}

// ================== RENDER: ACTIVITIES ==================
function renderActivities() {
    if (!currentWeatherData) return;
    const cur = currentWeatherData.weather.current;
    const temp = cur.temperature_2m;
    const code = cur.weather_code;
    const wind = cur.wind_speed_10m;
    const isRain = [51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99].includes(code);
    const isClear = [0, 1].includes(code);

    const activities = [
        {
            icon: "fa-person-hiking",
            title: "Hiking",
            good: !isRain && temp > 10 && temp < 30 && wind < 25,
            reason: isRain ? "Rain expected" : temp > 30 ? "Too hot" : temp < 10 ? "Too cold" : "Perfect conditions",
        },
        {
            icon: "fa-person-swimming",
            title: "Swimming",
            good: !isRain && temp > 24 && wind < 20,
            reason: temp < 24 ? "Too cool to swim" : isRain ? "Rainy" : "Great for swimming!",
        },
        {
            icon: "fa-bicycle",
            title: "Cycling",
            good: !isRain && wind < 20 && temp > 12 && temp < 32,
            reason: isRain ? "Rainy roads" : wind > 20 ? "Too windy" : "Nice for a ride",
        },
        {
            icon: "fa-mug-hot",
            title: "Cafe Visit",
            good: true,
            reason: "Always a good idea ☕",
        },
        {
            icon: "fa-umbrella-beach",
            title: "Beach Day",
            good: isClear && temp > 25 && wind < 25,
            reason: isClear && temp > 25 ? "Sunny & warm" : "Not ideal weather",
        },
        {
            icon: "fa-camera",
            title: "Photography",
            good: isClear || [2, 3].includes(code),
            reason: "Good lighting conditions",
        },
    ];

    $("activityContainer").innerHTML = activities.map((a) => `
        <div class="activity-card ${a.good ? "good" : "poor"}">
            <i class="fa-solid ${a.icon}"></i>
            <h4>${a.title}</h4>
            <p>${a.good ? "✅ " : "⚠️ "}${a.reason}</p>
        </div>`).join("");
}

// ================== MAP ==================
function initMap() {
    if (map) return;
    map = L.map("map").setView([30.3753, 69.3451], 4);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 18,
    }).addTo(map);

    map.on("click", async (e) => {
        const { lat, lng } = e.latlng;
        showLoading(true);
        try {
            const weather = await getWeather(lat, lng);
            const cur = weather.current;
            const info = getWeatherInfo(cur.weather_code);

            if (mapMarker) map.removeLayer(mapMarker);
            mapMarker = L.marker([lat, lng]).addTo(map)
                .bindPopup(`<b>${Math.round(cur.temperature_2m)}°C</b><br/>${info.desc}`)
                .openPopup();

            $("mapWeatherInfo").classList.remove("hidden");
            $("mapWeatherInfo").innerHTML = `
                <h3>📍 ${lat.toFixed(2)}, ${lng.toFixed(2)}</h3>
                <p><b>${info.desc}</b> — ${formatTemp(cur.temperature_2m)}</p>
                <p>Humidity: ${cur.relative_humidity_2m}% | Wind: ${Math.round(cur.wind_speed_10m)} km/h</p>`;
        } catch (err) {
            showError("Could not fetch weather for this point");
        } finally {
            showLoading(false);
        }
    });
}

// ================== TRAVEL ==================
$("compareBtn").addEventListener("click", async () => {
    const from = $("travelFrom").value.trim();
    const to = $("travelTo").value.trim();
    if (!from || !to) return showError("Enter both cities");

    try {
        showLoading(true);
        clearError();
        const [locA, locB] = await Promise.all([getCoordinates(from), getCoordinates(to)]);
        const [wA, wB] = await Promise.all([getWeather(locA.lat, locA.lon), getWeather(locB.lat, locB.lon)]);

        const render = (loc, w) => {
            const info = getWeatherInfo(w.current.weather_code);
            return `
                <div class="travel-card">
                    <h3>${loc.name}, ${loc.country}</h3>
                    <img src="${iconUrl(info.icon)}"/>
                    <p class="travel-temp">${formatTemp(w.current.temperature_2m)}</p>
                    <p>${info.desc}</p>
                    <p>💧 ${w.current.relative_humidity_2m}% | 💨 ${Math.round(w.current.wind_speed_10m)} km/h</p>
                </div>`;
        };
        $("travelResults").innerHTML = render(locA, wA) + render(locB, wB);
    } catch (err) {
        showError(err.message);
    } finally {
        showLoading(false);
    }
});

// ================== SETTINGS ==================
function loadSettingsUI() {
    $("defaultCityInput").value = settings.defaultCity;
    $("unitSelect").value = settings.unit;
    $("refreshSelect").value = settings.refresh;
    $("themeSelect").value = settings.theme;
    $("favoritesList").innerHTML = settings.favorites
        .map((f) => `<span class="fav-chip">${f}</span>`).join("");
}

$("saveSettingsBtn").addEventListener("click", () => {
    settings.defaultCity = $("defaultCityInput").value.trim() || "Islamabad";
    settings.unit = $("unitSelect").value;
    settings.refresh = parseInt($("refreshSelect").value, 10);
    settings.theme = $("themeSelect").value;
    localStorage.setItem("weatherSettings", JSON.stringify(settings));

    applyTheme(settings.theme);
    currentUnit = settings.unit;
    updateUnitButtons();
    setupAutoRefresh();
    fetchWeatherByCity(settings.defaultCity);
    alert("✅ Settings saved!");
});

function updateUnitButtons() {
    celsiusBtn.classList.toggle("active", currentUnit === "celsius");
    fahrenheitBtn.classList.toggle("active", currentUnit === "fahrenheit");
}

function setupAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    if (settings.refresh > 0 && currentCoords) {
        refreshTimer = setInterval(() => {
            fetchWeatherByCoords(currentCoords.lat, currentCoords.lon, currentCoords.name);
        }, settings.refresh * 60 * 1000);
    }
}

// ================== SEARCH & EVENTS ==================
searchBtn.addEventListener("click", () => {
    const city = cityInput.value.trim();
    if (city) fetchWeatherByCity(city);
});
cityInput.addEventListener("keypress", (e) => { if (e.key === "Enter") searchBtn.click(); });

locationBtn.addEventListener("click", () => {
    if (!navigator.geolocation) return showError("Geolocation not supported");
    showLoading(true);
    navigator.geolocation.getCurrentPosition(
        (pos) => fetchWeatherByCoords(pos.coords.latitude, pos.coords.longitude),
        () => { showLoading(false); showError("Location permission denied"); }
    );
});

celsiusBtn.addEventListener("click", () => {
    currentUnit = "celsius"; updateUnitButtons();
    renderWeather(); renderReport(); renderActivities();
});
fahrenheitBtn.addEventListener("click", () => {
    currentUnit = "fahrenheit"; updateUnitButtons();
    renderWeather(); renderReport(); renderActivities();
});

// ================== INIT ==================
window.addEventListener("load", () => {
    applyTheme(settings.theme);
    currentUnit = settings.unit;
    updateUnitButtons();
    loadSettingsUI();
    fetchWeatherByCity(settings.defaultCity);
    setupAutoRefresh();
});