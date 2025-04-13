import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { airQualityRoutes } from "./routes/air-quality";
import { newsRoutes } from "./routes/news-routes";
import { createServer } from "node:http";
import * as dotenv from "dotenv";
import { resolve } from "path";

// Initialize global variable for storing last air quality data
declare global {
  var lastAirQualityData: {
    aqi: number;
    level: string;
    components: Record<string, number>;
    location: { lat: string; lon: string };
    timestamp: number;
  } | null;
}

// Set initial value
if (typeof global.lastAirQualityData === "undefined") {
  global.lastAirQualityData = null;
  console.log("Initialized global.lastAirQualityData");
}

// Try to load environment variables from different paths to ensure they're found
const envPaths = [
  ".env",
  "../.env",
  resolve(process.cwd(), ".env"),
  resolve(__dirname, ".env"),
];

let envLoaded = false;
for (const path of envPaths) {
  const result = dotenv.config({ path });
  if (result.parsed) {
    console.log(`Environment variables loaded from: ${path}`);
    envLoaded = true;
    break;
  }
}

if (!envLoaded) {
  console.warn("No .env file found! Using environment variables from process.");
}

// Check if the API key is available
console.log("Environment loaded:", {
  PORT: process.env.PORT || "(not set, using default)",
  API_KEY_SET: process.env.OPENWEATHER_API_KEY ? "Yes" : "No",
});

const app = new Hono();

// Middleware
app.use(logger());
app.use(
  cors({
    origin: "*",
    allowMethods: ["GET", "POST"],
    allowHeaders: ["Content-Type", "Authorization"],
    exposeHeaders: ["Content-Length"],
    maxAge: 86400,
  })
);

// Routes
app.route("/api", airQualityRoutes);
app.route("/api/news", newsRoutes);

// Default route
app.get("/", (c) => {
  return c.json({ message: "Welcome to UAQMP API" });
});

// Start server
const PORT = Number(process.env.PORT) || 3001;

// Only start the server if this file is executed directly
if (require.main === module) {
  console.log(`Server is starting on port ${PORT}...`);
  console.log(`Run with: npm run dev`);
  console.log(`Or with: npx tsx alt-index.ts`);

  // Use a simple HTTP server
  const server = createServer((req, res) => {
    // Add CORS headers to every response
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );

    // Handle preflight OPTIONS requests
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // Parse URL
      const url = new URL(
        req.url || "/",
        `http://${req.headers.host || "localhost"}`
      );

      // Log all incoming requests
      console.log(
        `${new Date().toISOString()} [${req.method}] ${url.pathname}${
          url.search
        }`
      );

      // Handle API endpoints directly
      if (url.pathname.startsWith("/api/current")) {
        const lat = url.searchParams.get("lat") || "37.7749";
        const lon = url.searchParams.get("lon") || "-122.4194";

        // Import airQualityService directly - works around the dynamic import issues
        const airQualityService =
          require("./services/air-quality-service").airQualityService;

        airQualityService
          .getCurrentAirQuality(lat, lon)
          .then((data) => {
            res.setHeader("Content-Type", "application/json");
            res.writeHead(200);
            res.end(JSON.stringify(data));
          })
          .catch((error) => {
            console.error("Error fetching air quality:", error);
            res.writeHead(500);
            res.end(
              JSON.stringify({
                error: "Internal Server Error",
                message: error instanceof Error ? error.message : String(error),
              })
            );
          });
        return;
      }

      if (url.pathname.startsWith("/api/components")) {
        const lat = url.searchParams.get("lat") || "37.7749";
        const lon = url.searchParams.get("lon") || "-122.4194";

        // Import airQualityService directly
        const airQualityService =
          require("./services/air-quality-service").airQualityService;

        airQualityService
          .getAirQualityComponents(lat, lon)
          .then((data) => {
            res.setHeader("Content-Type", "application/json");
            res.writeHead(200);
            res.end(JSON.stringify(data));
          })
          .catch((error) => {
            console.error("Error fetching components:", error);
            res.writeHead(500);
            res.end(
              JSON.stringify({
                error: "Internal Server Error",
                message: error instanceof Error ? error.message : String(error),
              })
            );
          });
        return;
      }

      if (url.pathname.startsWith("/api/forecast")) {
        const lat = url.searchParams.get("lat") || "37.7749";
        const lon = url.searchParams.get("lon") || "-122.4194";

        // Import airQualityService directly
        const airQualityService =
          require("./services/air-quality-service").airQualityService;

        airQualityService
          .getAirQualityForecast(lat, lon)
          .then((data) => {
            res.setHeader("Content-Type", "application/json");
            res.writeHead(200);
            res.end(JSON.stringify(data));
          })
          .catch((error) => {
            console.error("Error fetching forecast:", error);
            res.writeHead(500);
            res.end(
              JSON.stringify({
                error: "Internal Server Error",
                message: error instanceof Error ? error.message : String(error),
              })
            );
          });
        return;
      }

      // Add handler for news endpoints
      else if (url.pathname.startsWith("/api/news/air-quality")) {
        const location = url.searchParams.get("location") || "global";

        // Import geminiService directly
        const { geminiService } = require("./services/gemini-service");

        geminiService
          .getAirQualityNews(location)
          .then((data) => {
            res.setHeader("Content-Type", "application/json");
            res.writeHead(200);
            res.end(JSON.stringify(data));
          })
          .catch((error) => {
            console.error("Error fetching air quality news:", error);
            res.writeHead(500);
            res.end(
              JSON.stringify({
                error: "Internal Server Error",
                message: error instanceof Error ? error.message : String(error),
              })
            );
          });
        return;
      }

      // Default route
      if (url.pathname === "/") {
        res.setHeader("Content-Type", "application/json");
        res.writeHead(200);
        res.end(JSON.stringify({ message: "Welcome to UAQMP API" }));
        return;
      }

      // Test route to check CORS
      if (url.pathname === "/test-cors") {
        res.setHeader("Content-Type", "application/json");
        res.writeHead(200);
        res.end(JSON.stringify({ message: "CORS is working!" }));
        return;
      }

      // 404 for everything else
      res.writeHead(404);
      res.end(JSON.stringify({ error: "Not Found" }));
    } catch (error) {
      console.error("Server error:", error);
      res.writeHead(500);
      res.end(
        JSON.stringify({
          error: "Internal Server Error",
          message: error instanceof Error ? error.message : String(error),
        })
      );
    }
  });

  server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(
      `Try accessing: http://localhost:${PORT}/api/current?lat=13.04&lon=80.18`
    );
  });
}

export default app;
