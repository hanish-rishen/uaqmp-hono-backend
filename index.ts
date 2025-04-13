import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { airQualityRoutes } from "./routes/air-quality";
import { config } from "dotenv";
import { createServer } from "http";

// Load environment variables
config();

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

// Default route
app.get("/", (c) => {
  return c.json({ message: "Welcome to UAQMP API" });
});

// Start server
const PORT = Number(process.env.PORT) || 3001;

// Only start the server if this file is executed directly
if (require.main === module) {
  console.log(`Server is starting on port ${PORT}...`);

  // Create a standard HTTP server with Hono
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(
        req.url || "/",
        `http://${req.headers.host || "localhost"}`
      );

      // Convert Node's req/res to Fetch API Request/Response
      const method = req.method || "GET";
      const headers = new Headers();

      // Add headers from the request
      Object.entries(req.headers).forEach(([key, value]) => {
        if (value)
          headers.set(key, Array.isArray(value) ? value.join(", ") : value);
      });

      // Create request options
      const requestInit: RequestInit = {
        method,
        headers,
      };

      // Add body for non-GET/HEAD requests
      if (!["GET", "HEAD"].includes(method)) {
        // Important: Added duplex option as required by Node.js v20+
        requestInit.body = req;
        requestInit.duplex = "half";
      }

      // Create the request
      const request = new Request(url.toString(), requestInit);

      // Process the request with Hono
      const response = await app.fetch(request);

      // Set status code
      res.statusCode = response.status;

      // Set headers
      response.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });

      // Send the response body
      const responseBody = await response.text();
      res.end(responseBody);
    } catch (error) {
      console.error("Server error:", error);

      // Send a 500 error response
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
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
  });
}

export default app;
