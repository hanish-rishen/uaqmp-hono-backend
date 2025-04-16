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

// Apply CORS middleware globally to all routes
app.use(
  "*",
  cors({
    origin: ["https://uaqmp.vercel.app", "http://localhost:3000"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    exposeHeaders: ["Content-Length"],
    maxAge: 86400,
  })
);

app.use(logger());

// Routes
app.route("/api", airQualityRoutes);
app.route("/api/news", newsRoutes);
app.route("/api/predict", predictionRoutes);
app.route("/api/urban-planning", urbanPlanningRoutes);

// Default route
app.get("/", (c) => {
  return c.json({ message: "Welcome to UAQMP API" });
});

// For Cloudflare Workers, we need to export the app directly
// Do NOT use the "if (require.main === module)" pattern here
export default app;
