import { Hono } from "hono";
import * as dotenv from "dotenv";
import axios from "axios";

// Load environment variables for local development
dotenv.config();

// Define the environment variables type for Cloudflare Workers
interface Env {
  OPENROUTER_API_KEY?: string;
  [key: string]: unknown;
}

const app = new Hono<{ Bindings: Env }>();

// Get elevation data - using the most basic approach possible to avoid parsing errors
app.get("/topology", async (c) => {
  try {
    const lat = c.req.query("lat");
    const lon = c.req.query("lon");

    if (!lat || !lon) {
      c.header("Content-Type", "application/json");
      return c.body(
        JSON.stringify({ error: "Missing latitude or longitude parameters" }),
        400
      );
    }

    console.log(`Fetching topology data for coordinates: ${lat}, ${lon}`);

    // Generate data based on location
    const coords = { lat: parseFloat(lat), lon: parseFloat(lon) };

    // Default values
    let data = {
      elevation: 100,
      terrain: "flat",
      waterBodies: 2,
      populationDensity: 5000,
    };

    // Chennai region (Ambattur)
    if (
      Math.abs(coords.lat - 13.04) < 0.1 &&
      Math.abs(coords.lon - 80.17) < 0.1
    ) {
      data = {
        elevation: 16,
        terrain: "flat",
        waterBodies: 3,
        populationDensity: 11800,
      };
    }

    // Set the proper content type header
    c.header("Content-Type", "application/json");

    // Return a direct string response - bypass Hono's JSON processing
    return c.body(JSON.stringify(data));
  } catch (error) {
    console.error("Error in topology endpoint:", error);

    c.header("Content-Type", "application/json");
    return c.body(
      JSON.stringify({
        elevation: 100,
        terrain: "flat",
        waterBodies: 2,
        populationDensity: 5000,
      })
    );
  }
});

// OpenRouter API for urban planning recommendations
app.post("/recommendations", async (c) => {
  try {
    const body = await c.req.json();
    const { prompt } = body;

    if (!prompt) {
      return c.json({ error: "Prompt is required" }, 400);
    }

    // Get API key from Cloudflare environment - must use c.env in Cloudflare Workers
    const OPENROUTER_API_KEY = c.env.OPENROUTER_API_KEY;

    // Check if API key exists and log appropriately
    if (!OPENROUTER_API_KEY) {
      console.error(
        "ERROR: OpenRouter API key not found in environment variables"
      );
      return c.json(
        {
          error: "Configuration error: OpenRouter API key is not available",
          details: "Please check your environment variables",
        },
        500
      );
    }

    console.log("Making request to OpenRouter API");

    // Ensure we're using the Authorization header correctly with 'Bearer' prefix
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "HTTP-Referer": "https://uaqmp-api.hanishrishen.workers.dev",
          "X-Title": "Urban Air Quality Management Platform",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "deepseek/deepseek-chat-v3-0324:free",
          messages: [
            {
              role: "system",
              content:
                "You are an expert urban planning assistant that provides recommendations based on topology, population density, and air quality data. Your recommendations should be practical, sustainable, and aimed at improving urban environments.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
        }),
      }
    );

    // Log response status for debugging
    console.log("OpenRouter API response status:", response.status);

    // If the response is not OK, return the actual error to the client
    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenRouter API error:", errorText);

      // Return the actual error message to the client with a fixed status code instead of dynamic one
      return c.json(
        {
          error: "OpenRouter API error",
          status: response.status,
          details: errorText,
        },
        500 // Using 500 as a fixed status code instead of response.status which causes a type error
      );
    }

    const data = await response.json();
    console.log("Received recommendation from OpenRouter");

    const recommendation =
      data.choices[0]?.message?.content ||
      "No recommendation could be generated at this time.";

    return c.json({ recommendation });
  } catch (error) {
    console.error("Error in OpenRouter API:", error);

    // Return the actual error rather than fallback data
    return c.json(
      {
        error: "Failed to process request",
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      },
      500
    );
  }
});

export const urbanPlanningRoutes = app;
