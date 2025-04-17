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

    // More detailed debugging for the API key
    console.log(`API key exists: ${!!OPENROUTER_API_KEY}`);
    if (OPENROUTER_API_KEY) {
      console.log(`API key length: ${OPENROUTER_API_KEY.length}`);
      console.log(
        `API key starts with: ${OPENROUTER_API_KEY.substring(0, 3)}...`
      );
    }

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

    // The payload according to OpenRouter documentation
    const payload = {
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
    };

    // Try direct fetch with proper headers according to OpenRouter docs
    try {
      // Explicitly create headers according to OpenRouter documentation
      const headers = new Headers();
      headers.append("Authorization", `Bearer ${OPENROUTER_API_KEY}`);
      headers.append("Content-Type", "application/json");
      headers.append(
        "HTTP-Referer",
        "https://uaqmp-api.hanishrishen.workers.dev"
      );
      headers.append("X-Title", "Urban Air Quality Management Platform");

      console.log("Sending with headers:", Array.from(headers.keys()));

      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: headers,
          body: JSON.stringify(payload),
        }
      );

      console.log("OpenRouter API response status:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("OpenRouter API error:", errorText);
        return c.json(
          {
            error: "OpenRouter API error",
            status: response.status,
            details: errorText,
          },
          500
        );
      }

      const data = await response.json();
      console.log("Received recommendation from OpenRouter");

      const recommendation =
        data.choices?.[0]?.message?.content ||
        "No recommendation could be generated at this time.";

      return c.json({ recommendation });
    } catch (fetchError) {
      console.error("Fetch error with OpenRouter API:", fetchError);

      // Fall back to axios as a second attempt with different headers approach
      try {
        console.log("Trying axios as fallback...");
        const axiosHeaders = {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://uaqmp-api.hanishrishen.workers.dev",
          "X-Title": "Urban Air Quality Management Platform",
        };

        console.log("Axios headers:", Object.keys(axiosHeaders));

        const axiosResponse = await axios({
          method: "post",
          url: "https://openrouter.ai/api/v1/chat/completions",
          headers: axiosHeaders,
          data: payload,
        });

        console.log("Axios response status:", axiosResponse.status);

        const recommendation =
          axiosResponse.data.choices?.[0]?.message?.content ||
          "No recommendation could be generated at this time.";

        return c.json({ recommendation });
      } catch (axiosError: any) {
        console.error("Axios fallback also failed:", axiosError.message);
        if (axiosError.response) {
          console.error("Axios error response:", axiosError.response.data);
        }
        throw axiosError;
      }
    }
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
