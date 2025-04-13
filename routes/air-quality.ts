import { Hono } from "hono";
import { airQualityService } from "../services/air-quality-service";

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

export const airQualityRoutes = app;
