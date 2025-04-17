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

    // Get API key from Cloudflare environment
    const OPENROUTER_API_KEY = c.env.OPENROUTER_API_KEY;

    // Debug the API key (but don't show the full key in logs)
    console.log(`API key exists: ${!!OPENROUTER_API_KEY}`);
    if (OPENROUTER_API_KEY) {
      console.log(`API key length: ${OPENROUTER_API_KEY.length}`);
      console.log(
        `API key starts with: ${OPENROUTER_API_KEY.substring(0, 3)}...`
      );
    }

    if (!OPENROUTER_API_KEY) {
      console.error("ERROR: OpenRouter API key not found");
      return c.json(
        {
          error: "Configuration error: OpenRouter API key is not available",
          details: "Please check your environment variables",
        },
        500
      );
    }

    // Construct a simpler request object using undici fetch, which is used by Cloudflare Workers
    try {
      console.log("Sending OpenRouter request with undici fetch");

      // Create a simple object payload
      const requestBody = {
        model: "anthropic/claude-3-opus:beta", // Trying a different model
        messages: [
          {
            role: "system",
            content:
              "You are an expert urban planning assistant that provides recommendations based on topology, population density, and air quality data.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      };

      // Using a plain object for headers
      const requestOptions = {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://uaqmp-api.hanishrishen.workers.dev",
          "X-Title": "Urban Air Quality Management Platform",
        },
        body: JSON.stringify(requestBody),
      };

      // Print exactly what we're sending (without the full API key)
      console.log(
        "Request URL:",
        "https://openrouter.ai/api/v1/chat/completions"
      );
      console.log("Request headers:", Object.keys(requestOptions.headers));

      // Use the fetch API directly
      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        requestOptions
      );

      console.log("Response status:", response.status);
      console.log("Response headers:", [...response.headers.entries()]);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Error response body:", errorText);

        // Create a direct curl command that can be executed for debugging
        const curlCommand = `curl -X POST "https://openrouter.ai/api/v1/chat/completions" \\
          -H "Authorization: Bearer YOUR_API_KEY" \\
          -H "Content-Type: application/json" \\
          -H "HTTP-Referer: https://uaqmp-api.hanishrishen.workers.dev" \\
          -H "X-Title: Urban Air Quality Management Platform" \\
          -d '${JSON.stringify(requestBody)}'`;

        console.log(
          "Debug curl command (replace YOUR_API_KEY with actual key):",
          curlCommand
        );

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
      console.log("Response received successfully");

      const recommendation =
        data.choices?.[0]?.message?.content ||
        "No recommendation could be generated at this time.";

      return c.json({ recommendation });
    } catch (error) {
      console.error("Error making OpenRouter request:", error);

      // Let's try one more approach with axios without complex settings
      console.log("Trying simple axios approach as last resort");
      try {
        const axiosResponse = await axios({
          method: "post",
          url: "https://openrouter.ai/api/v1/chat/completions",
          headers: {
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
          },
          data: {
            model: "openai/gpt-3.5-turbo", // Using a different model as last resort
            messages: [
              {
                role: "user",
                content:
                  "Please provide urban planning recommendations for the following area: " +
                  prompt,
              },
            ],
          },
        });

        return c.json({
          recommendation:
            axiosResponse.data?.choices?.[0]?.message?.content ||
            "Generated using fallback method.",
        });
      } catch (finalError: any) {
        console.error("Final attempt failed:", finalError.message);
        if (finalError.response) {
          console.error("Response data:", finalError.response.data);
        }

        return c.json(
          {
            error: "API Authentication failed",
            message:
              "Unable to authenticate with OpenRouter API. Please verify your API key.",
          },
          500
        );
      }
    }
  } catch (error) {
    console.error("Request processing error:", error);
    return c.json(
      {
        error: "Request failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

export const urbanPlanningRoutes = app;
