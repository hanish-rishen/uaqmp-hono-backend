import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { airQualityRoutes } from "./routes/air-quality";
import { newsRoutes } from "./routes/news-routes";
import { predictionRoutes } from "./routes/prediction-routes";
import { urbanPlanningRoutes } from "./routes/urban-planning-routes";

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

// Apply CORS middleware with more explicit configuration
app.use("*", async (c, next) => {
  // Add CORS headers to all responses
  c.header("Access-Control-Allow-Origin", "https://uaqmp.vercel.app");
  c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  c.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Accept, X-Requested-With"
  );
  c.header("Access-Control-Max-Age", "86400");
  c.header("Access-Control-Allow-Credentials", "true");

  // Handle preflight OPTIONS requests
  if (c.req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: c.res.headers,
    });
  }

  await next();
});

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

// Add a catch-all OPTIONS route to handle preflight requests properly
app.options("*", (c) => {
  c.status(204);
  return c.body(null);
});

// For Cloudflare Workers, we need to export the app directly
export default app;
