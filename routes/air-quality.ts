import { Hono } from "hono";
import axios from "axios";
import * as airQualityServiceModule from "../services/air-quality-service";

// Import the constants from the service
const BASE_URL = "https://api.openweathermap.org/data/2.5";
let OPENWEATHER_API_KEY: string | undefined;

// Define the environment variables type for Cloudflare Workers
interface Env {
  OPENWEATHER_API_KEY?: string;
  [key: string]: unknown;
}

const app = new Hono<{ Bindings: Env }>();

// Get current air quality data
app.get("/current", async (c) => {
  try {
    const lat = c.req.query("lat") || "37.7749"; // Default to San Francisco
    const lon = c.req.query("lon") || "-122.4194";

    console.log(
      `API request received for current air quality at coordinates: ${lat}, ${lon}`
    );

    // Get API key from the context environment (provided by Cloudflare Workers)
    const apiKey = c.env.OPENWEATHER_API_KEY;

    // Update the global variable for other endpoints to use
    if (apiKey) {
      OPENWEATHER_API_KEY = apiKey;
      console.log(`Found API key in environment: ${apiKey.substring(0, 5)}...`);
      // Set it in the service
      airQualityServiceModule.setApiKey(apiKey);
    } else {
      console.warn("No API key found in Cloudflare Worker environment!");
    }

    // Pass the API key to the service method
    const data = await airQualityServiceModule.getCurrentAirQuality(
      lat,
      lon,
      apiKey
    );

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
    const apiKey = c.env.OPENWEATHER_API_KEY;

    console.log(
      `Fetching air quality components for coordinates: ${lat}, ${lon}`
    );
    const data = await airQualityServiceModule.getAirQualityComponents(
      lat,
      lon,
      apiKey
    );
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
    const apiKey = c.env.OPENWEATHER_API_KEY;

    console.log(
      `Fetching air quality forecast for coordinates: ${lat}, ${lon}`
    );
    const data = await airQualityServiceModule.getAirQualityForecast(
      lat,
      lon,
      apiKey
    );
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
    // Get API key from the context
    const apiKey = c.env.OPENWEATHER_API_KEY;
    if (apiKey) {
      OPENWEATHER_API_KEY = apiKey;
    }

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
