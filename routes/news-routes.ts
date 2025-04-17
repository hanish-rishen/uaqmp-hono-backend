import { Hono } from "hono";
import { geminiService } from "../services/gemini-service";

// Define the environment variables type for Cloudflare Workers
interface Env {
  OPENWEATHER_API_KEY?: string;
  SERPER_API_KEY?: string;
  GEMINI_API_KEY?: string;
  [key: string]: unknown;
}

const app = new Hono<{ Bindings: Env }>();

// Get air quality news for a location with caching
const newsCache = new Map<string, any>();
const CACHE_DURATION = 30 * 60 * 1000; // Reduced to 30 minutes to get updated data more frequently

app.get("/air-quality", async (c) => {
  try {
    const location = c.req.query("location") || "global";
    const aqi = c.req.query("aqi");
    const level = c.req.query("level");

    console.log(`Fetching news for location: ${location}`);

    // If AQI and level are provided in the query params, update the global variable
    if (aqi && level && global.lastAirQualityData) {
      global.lastAirQualityData.aqi = parseInt(aqi, 10);
      global.lastAirQualityData.level = level;
      console.log(
        `Updated global air quality data from query params: AQI=${aqi}, Level=${level}`
      );
    }

    // Log air quality data availability
    console.log(
      "Air quality data available for summary:",
      global.lastAirQualityData ? "Yes" : "No"
    );
    if (global.lastAirQualityData) {
      console.log(
        `- AQI: ${global.lastAirQualityData.aqi}, Level: ${global.lastAirQualityData.level}`
      );
      console.log(
        `- PM2.5: ${global.lastAirQualityData.components.pm2_5} μg/m³`
      );
    }

    // Create cache key that includes AQI to ensure we get fresh data when AQI changes
    const cacheKey = `news-${location}-${
      global.lastAirQualityData?.aqi || "unknown"
    }`;
    const cachedData = newsCache.get(cacheKey);

    if (cachedData && Date.now() - cachedData.timestamp < CACHE_DURATION) {
      console.log(`Using cached news data for ${location}`);
      return c.json(cachedData.data);
    }

    // If not in cache or expired, fetch fresh data
    const news = await geminiService.getAirQualityNews(location, c.env);

    // Store in cache
    newsCache.set(cacheKey, {
      data: news,
      timestamp: Date.now(),
    });

    return c.json(news);
  } catch (error) {
    console.error("Error fetching air quality news:", error);
    return c.json(
      {
        error: "Failed to fetch news data",
        articles: [],
        aiSummary: `The air quality in ${
          c.req.query("location") || "your area"
        } varies based on urban pollution sources including vehicle emissions, industrial activities, and seasonal factors. While specific data may be limited, residents should monitor local air quality reports and take precautions during periods of poor air quality, especially those with respiratory conditions. Local environmental initiatives continue to address pollution through emission controls and urban greening efforts.`,
      },
      500
    );
  }
});

export const newsRoutes = app;
