import { Hono } from "hono";
import axios from "axios";
import { airQualityService } from "../services/air-quality-service";

// Import constants from air-quality-service.ts
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const BASE_URL = "https://api.openweathermap.org/data/2.5";

const app = new Hono();

// Get current air quality data
app.get("/current", async (c) => {
  try {
    const lat = c.req.query("lat") || "37.7749"; // Default to San Francisco
    const lon = c.req.query("lon") || "-122.4194";

    console.log(
      `API request received for current air quality at coordinates: ${lat}, ${lon}`
    );

    const data = await airQualityService.getCurrentAirQuality(lat, lon);

    console.log(
      `Returning air quality data: AQI=${data.aqi}, Level=${data.level}`
    );

    // Store this data in a global variable for use in the AI summary
    global.lastAirQualityData = {
      aqi: data.aqi,
      level: data.level,
      components: data.components,
      location: { lat, lon },
      timestamp: data.timestamp,
    };

    console.log("✓ Successfully stored OpenWeather data in global variable");

    return c.json(data);
  } catch (error) {
    console.error("Error fetching air quality data:", error);
    return c.json({ error: "Failed to fetch air quality data" }, 500);
  }
});

// Get air quality components data
app.get("/components", async (c) => {
  try {
    const lat = c.req.query("lat") || "37.7749";
    const lon = c.req.query("lon") || "-122.4194";
    console.log(
      `Fetching air quality components for coordinates: ${lat}, ${lon}`
    );
    const data = await airQualityService.getAirQualityComponents(lat, lon);
    return c.json(data);
  } catch (error) {
    console.error("Error fetching air quality components:", error);
    return c.json({ error: "Failed to fetch air quality components" }, 500);
  }
});

// Get forecast air quality data (24 hours)
app.get("/forecast", async (c) => {
  try {
    const lat = c.req.query("lat") || "37.7749";
    const lon = c.req.query("lon") || "-122.4194";
    console.log(
      `Fetching air quality forecast for coordinates: ${lat}, ${lon}`
    );
    const data = await airQualityService.getAirQualityForecast(lat, lon);
    return c.json(data);
  } catch (error) {
    console.error("Error fetching forecast data:", error);
    return c.json({ error: "Failed to fetch forecast data" }, 500);
  }
});

// Store air quality data - additional endpoint for the frontend to update backend data
app.post("/store-air-quality", async (c) => {
  try {
    const data = await c.req.json();

    if (!data.aqi || !data.level || !data.components) {
      return c.json({ error: "Missing required air quality data" }, 400);
    }

    // Store this data in a global variable for use in the AI summary
    global.lastAirQualityData = {
      aqi: data.aqi,
      level: data.level,
      components: data.components,
      location: data.location || { lat: "0", lon: "0" },
      timestamp: Date.now(),
    };

    console.log(
      "✓ Successfully stored air quality data from frontend:",
      data.aqi,
      data.level
    );

    return c.json({ success: true });
  } catch (error) {
    console.error("Error storing air quality data:", error);
    return c.json({ error: "Failed to store air quality data" }, 500);
  }
});

// Add a debug endpoint to test AQI fetching
app.get("/debug-aqi", async (c) => {
  try {
    const lat = c.req.query("lat") || "37.7749";
    const lon = c.req.query("lon") || "-122.4194";

    console.log(`DEBUG: Fetching air quality for coordinates: ${lat}, ${lon}`);

    // Check if we have an API key
    if (!OPENWEATHER_API_KEY) {
      return c.json(
        {
          error: "Missing OpenWeather API key",
          message: "API key is not configured correctly",
        },
        500
      );
    }

    // Attempt to fetch directly from OpenWeather
    try {
      const response = await axios.get(`${BASE_URL}/air_pollution`, {
        params: {
          lat,
          lon,
          appid: OPENWEATHER_API_KEY,
        },
      });

      // Log the full response
      console.log(
        "DEBUG: Raw OpenWeather response:",
        JSON.stringify(response.data, null, 2)
      );

      // Return the raw data for debugging
      return c.json({
        success: true,
        rawData: response.data,
        apiKey: OPENWEATHER_API_KEY
          ? "Configured (first 5 chars: " +
            OPENWEATHER_API_KEY.substring(0, 5) +
            "...)"
          : "Not configured",
      });
    } catch (owError: any) {
      return c.json(
        {
          error: "OpenWeather API Error",
          message: owError.message,
          response: owError.response?.data,
          apiKey: OPENWEATHER_API_KEY
            ? "Configured (first 5 chars: " +
              OPENWEATHER_API_KEY.substring(0, 5) +
              "...)"
            : "Not configured",
        },
        500
      );
    }
  } catch (error) {
    console.error("Error in debug-aqi endpoint:", error);
    return c.json(
      { error: "Failed to debug AQI fetching", message: String(error) },
      500
    );
  }
});

export const airQualityRoutes = app;
