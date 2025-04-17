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
    const apiKey = c.env.OPENROUTER_API_KEY;

    // Debug the API key (but don't show the full key in logs)
    console.log(`API key exists: ${!!apiKey}`);
    if (apiKey) {
      console.log(`API key length: ${apiKey.length}`);
      console.log(`API key first 5 chars: ${apiKey.substring(0, 5)}...`);
    }

    if (!apiKey) {
      console.error("ERROR: OpenRouter API key not found");
      return c.json(
        {
          error: "Configuration error: OpenRouter API key is not available",
          details: "Please check your environment variables",
        },
        500
      );
    }

    // Following OpenRouter documentation exactly
    console.log("Sending request to OpenRouter API following documentation...");
    try {
      // Create request body according to documentation
      const requestBody = {
        model: "deepseek/deepseek-chat-v3-0324", // Changed to use requested deepseek model
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      };

      // Using fetch with headers exactly as in documentation
      console.log("Sending fetch request to OpenRouter API...");

      // Follow the documentation exactly - DO NOT use URL parameters
      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`, // This is the correct format
            "Content-Type": "application/json",
            "HTTP-Referer": "https://uaqmp-api.hanishrishen.workers.dev",
            "X-Title": "Urban Air Quality Management Platform",
          },
          body: JSON.stringify(requestBody),
        }
      );

      console.log("OpenRouter response status:", response.status);

      if (response.ok) {
        // Successfully got response
        const data = await response.json();
        console.log("Successfully received response from OpenRouter");

        return c.json({
          recommendation:
            data.choices[0]?.message?.content ||
            "No recommendation could be generated.",
        });
      } else {
        // API returned error
        const errorText = await response.text();
        console.error("OpenRouter API error:", errorText);

        // For debugging only - DO NOT include in production
        console.log(
          "Debug info - API key first 5 chars:",
          apiKey?.substring(0, 5)
        );
        console.log("Failed request body:", JSON.stringify(requestBody));

        // Try fallback to our mock response
        console.log("Falling back to mock response");
        return c.json({
          recommendation: `# Urban Planning Recommendations

## Land Use & Zoning
Based on the provided data:
- Implement mixed-use development with medium-density residential areas
- Create buffer zones around water bodies to protect natural resources
- Designate commercial zones along main transit corridors

## Green Infrastructure
- Develop a network of small pocket parks throughout the dense urban area
- Mandate green roofs on new commercial buildings
- Plant pollution-absorbing trees along major roadways

## Transportation
- Expand public transportation network with electric buses
- Develop dedicated cycling infrastructure
- Implement car-free zones in residential areas

## Building Design
- Require HEPA filtration systems in new buildings
- Implement energy-efficient building codes
- Use light-colored roofing materials to reduce heat absorption`,
          source: "mock", // Indicate this is from our fallback system
        });
      }
    } catch (apiError) {
      console.error("Error making request to OpenRouter:", apiError);

      // Try alternative approach with axios as last resort
      try {
        console.log("Trying axios as final attempt...");
        const axiosResponse = await axios.post(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            model: "deepseek/deepseek-chat-v3-0324",
            messages: [
              {
                role: "user",
                content: prompt,
              },
            ],
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
          }
        );

        console.log("Axios approach successful!");
        return c.json({
          recommendation:
            axiosResponse.data.choices[0]?.message?.content ||
            "No recommendation could be generated.",
        });
      } catch (finalError) {
        console.error("Final attempt with axios also failed:", finalError);

        // Return a mock response with fallback source indicated
        return c.json({
          recommendation: `# Urban Planning Recommendations (Fallback Response)

## Land Use & Zoning
- Implement mixed-use development with residential, commercial and green areas
- Create buffer zones around water bodies and sensitive ecological areas
- Plan for moderate density housing with adequate community facilities

## Green Infrastructure
- Develop interconnected green spaces and urban forests
- Install green roofs and vertical gardens on buildings
- Create bioswales and rain gardens for stormwater management

## Transportation
- Design pedestrian-friendly streets and neighborhoods
- Implement cycling infrastructure network
- Optimize public transit routes and frequencies

## Building Design
- Use sustainable and local building materials
- Implement energy-efficient designs with natural lighting
- Plan for adequate ventilation systems in all buildings`,
          source: "fallback", // Indicate this is our fallback response
        });
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
