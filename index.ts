import { Hono } from "hono";
import { logger } from "hono/logger";
import { airQualityRoutes } from "./routes/air-quality";
import { newsRoutes } from "./routes/news-routes";
import { predictionRoutes } from "./routes/prediction-routes";
import { urbanPlanningRoutes } from "./routes/urban-planning-routes";
import { corsMiddleware } from "./middleware/cors-middleware";

// Initialize global variable for AQ data
declare global {
  var lastAirQualityData: {
    aqi: number;
    level: string;
    components: Record<string, number>;
    location: { lat: string; lon: string };
    timestamp: number;
  } | null;
}

// Set initial value if not already defined
if (typeof global.lastAirQualityData === "undefined") {
  global.lastAirQualityData = null;
}

const app = new Hono();

// Apply our custom CORS middleware to all routes
app.use("*", corsMiddleware);

// Apply logger middleware
app.use(logger());

// Routes
app.route("/api", airQualityRoutes);
app.route("/api/news", newsRoutes);
app.route("/api/predict", predictionRoutes);
app.route("/api/urban-planning", urbanPlanningRoutes);

// Default route
app.get("/", (c) => {
  return c.json({
    message: "Welcome to UAQMP API",
    version: "1.0.0",
    endpoints: [
      "/api/current",
      "/api/components",
      "/api/forecast",
      "/api/store-air-quality",
      "/api/news/air-quality",
      "/api/predict/hourly",
      "/api/predict/weekly",
      "/api/urban-planning/recommendations",
    ],
  });
});

// Add a global catch-all OPTIONS route as a fallback
app.options("*", (c) => {
  return c.body(null, 204);
});

// For Cloudflare Workers, we need to export the app directly
export default app;
