import { Context, Next } from "hono";

/**
 * CORS middleware for Hono that properly handles preflight requests
 * and sets appropriate CORS headers for all responses
 */
export const corsMiddleware = async (c: Context, next: Next) => {
  // Define allowed origins
  const allowedOrigins = [
    "https://uaqmp.vercel.app",
    "https://uaqmp-git-main-hanishrishen.vercel.app",
    "http://localhost:3000",
    "http://localhost:3001",
  ];

  // Get the origin from the request headers
  const origin = c.req.header("Origin");

  console.log(
    `CORS middleware processing request from origin: ${origin || "unknown"}`
  );

  // Set the appropriate CORS headers based on the origin
  if (origin && allowedOrigins.includes(origin)) {
    c.header("Access-Control-Allow-Origin", origin);
    console.log(`Setting specific origin: ${origin}`);
  } else {
    c.header("Access-Control-Allow-Origin", "*"); // Fallback to allow any origin
    console.log("Setting fallback origin: *");
  }

  // Set other CORS headers
  c.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS, PATCH"
  );
  c.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Accept, X-Requested-With, Origin"
  );
  c.header("Access-Control-Max-Age", "86400"); // 24 hours
  c.header("Access-Control-Allow-Credentials", "true");

  // Handle preflight OPTIONS requests
  if (c.req.method === "OPTIONS") {
    // Return 204 No Content for OPTIONS requests
    console.log("Handling OPTIONS preflight request");
    return c.body(null, 204);
  }

  // Continue to the next middleware or route handler
  await next();
};
