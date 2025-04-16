import { Hono } from "hono";
import { logger } from "hono/logger";
import { airQualityRoutes } from "./routes/air-quality";
import { newsRoutes } from "./routes/news-routes";
import { createServer } from "node:http";
import * as dotenv from "dotenv";
import { resolve } from "node:path";
import * as fs from "node:fs";
import * as path from "node:path";
import { osmRoutes } from "./routes/osm-routes";
import { predictionRoutes } from "./routes/prediction-routes";
import { urbanPlanningRoutes } from "./routes/urban-planning-routes";
import { corsMiddleware } from "./middleware/cors-middleware";

// --- START: Load GeoJSON Data ---
// REMOVE or comment out the GeoJSON loading logic as it's no longer needed
/*
let countriesGeoJson: any = null;
const geojsonFilePath = path.resolve(__dirname, "data", "countries.geojson");
try {
  // ... existing loading logic ...
} catch (err) {
  // ... existing error handling ...
}
*/
console.log("GeoJSON country loading skipped as it's no longer used.");
// --- END: Load GeoJSON Data ---

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

// Use our custom CORS middleware instead of the Hono cors middleware
app.use("*", corsMiddleware);

// Middleware
app.use(logger());

// Routes
app.route("/api", airQualityRoutes);
app.route("/api/news", newsRoutes);
// app.route("/api/topology", topologyRoutes); // Remove this line
app.route("/api/osm", osmRoutes); // Add the OSM routes under /api/osm
app.route("/api/predict", predictionRoutes); // Add the prediction routes under /api/predict
app.route("/api/urban-planning", urbanPlanningRoutes); // Add urban planning routes

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
  const server = createServer(async (req, res) => {
    // Make the callback async
    // Since we're now using corsMiddleware in our app, we can simplify this

    // Handle preflight OPTIONS requests at the HTTP server level too as backup
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods":
          "GET, POST, PUT, DELETE, OPTIONS, PATCH",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, Accept, X-Requested-With",
        "Access-Control-Max-Age": "86400",
        "Access-Control-Allow-Credentials": "true",
      });
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

      // --- START: Simplify Route Handling ---
      // Remove specific handlers for routes managed by Hono's app.route

      // Example: Keep handlers for things NOT managed by Hono's app.route if any exist
      // if (url.pathname.startsWith("/some/other/path")) { ... return; }

      // --- END: Simplify Route Handling ---

      // --- Let Hono handle the request ---
      // Convert Node req/res to Fetch API Request
      const method = req.method || "GET";
      const headers = new Headers();
      Object.entries(req.headers).forEach(([key, value]) => {
        if (value)
          headers.set(key, Array.isArray(value) ? value.join(", ") : value);
      });

      const requestInit: RequestInit = { method, headers };
      if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
        requestInit.body = req as any; // Cast req to any to satisfy TypeScript
        (requestInit as any).duplex = "half"; // Required for Node.js v18+ streams
      }

      const request = new Request(url.toString(), requestInit);

      // Fetch response from Hono app
      const response = await app.fetch(request);

      // Convert Hono/Fetch Response back to Node res
      res.statusCode = response.status;
      response.headers.forEach((value, key) => {
        // Avoid setting 'transfer-encoding' if it's chunked, Node handles it.
        if (key.toLowerCase() !== "transfer-encoding") {
          res.setHeader(key, value);
        }
      });

      // Stream the body
      if (response.body) {
        for await (const chunk of response.body) {
          res.write(chunk);
        }
      }
      res.end();
      // --- End Hono Handling ---
    } catch (error) {
      console.error("Server error:", error);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
      }
      if (!res.writableEnded) {
        res.end(
          JSON.stringify({
            error: "Internal Server Error",
            message: error instanceof Error ? error.message : String(error),
          })
        );
      }
    }
  });

  server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(
      `Try accessing: https://uaqmp-api.hanishrishen.workers.dev/api/current?lat=13.04&lon=80.18`
    );
  });
}

export default app; // Export Hono app if needed elsewhere
