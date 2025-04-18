import { Hono } from "hono";
import * as dotenv from "dotenv";
import axios from "axios";

// Load environment variables for local development
dotenv.config();

// Define the environment variables type for Cloudflare Workers
interface Env {
  OPENROUTER_API_KEY?: string; // Changed back to OPENROUTER_API_KEY
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

    // Log request details for debugging
    console.log(
      `Received urban planning recommendation request with prompt length: ${prompt.length} characters`
    );
    console.log(`Request environment info: ${Object.keys(c.env).join(", ")}`);

    // Get API key from Cloudflare environment directly - no fallbacks
    const apiKey = c.env.OPENROUTER_API_KEY;

    // Enhanced debugging for API key
    console.log(`API key exists in environment: ${!!apiKey}`);

    // MORE DETAILED DEBUGGING FOR API KEY
    if (apiKey) {
      // Log key details without exposing the full key
      console.log(`API key length: ${apiKey.length}`);
      console.log(`API key first 5 chars: ${apiKey.substring(0, 5)}...`);

      // Log entire key with asterisks to see overall structure
      const maskedKey =
        apiKey.substring(0, 5) +
        "".padStart(apiKey.length - 10, "*") +
        apiKey.substring(apiKey.length - 5);
      console.log(`Masked API key: ${maskedKey}`);

      // Check key format more extensively
      console.log(
        `API key format check: ${
          apiKey.startsWith("sk-or-") ? "Valid prefix" : "Invalid prefix"
        }`
      );
      console.log(`API key contains spaces: ${apiKey.includes(" ")}`);
      console.log(`API key contains newlines: ${apiKey.includes("\n")}`);
      console.log(
        `API key contains carriage returns: ${apiKey.includes("\r")}`
      );
      console.log(`API key contains tabs: ${apiKey.includes("\t")}`);
      console.log(
        `API key contains other whitespace: ${
          /\s/.test(apiKey) &&
          !apiKey.includes(" ") &&
          !apiKey.includes("\n") &&
          !apiKey.includes("\r") &&
          !apiKey.includes("\t")
        }`
      );

      // Check if key has any unusual encodings or characters
      console.log(
        `API key character code analysis (first 5 chars): ${Array.from(
          apiKey.substring(0, 5)
        )
          .map((c) => c.charCodeAt(0))
          .join(", ")}`
      );
      console.log(
        `API key character code analysis (last 5 chars): ${Array.from(
          apiKey.substring(apiKey.length - 5)
        )
          .map((c) => c.charCodeAt(0))
          .join(", ")}`
      );

      console.log(`Using API key from Cloudflare environment variables`);
    } else {
      console.error(
        "⚠️ CRITICAL: OPENROUTER_API_KEY is not set in environment"
      );
      console.log(
        "⚠️ Make sure to set OPENROUTER_API_KEY in Cloudflare Worker environment variables"
      );
    }

    // If we have an API key, try to use the OpenRouter API
    if (apiKey) {
      try {
        // Create request body according to documentation
        const requestBody = {
          model: "deepseek/deepseek-chat-v3-0324:free",
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
        };

        console.log(
          "📡 Making request to OpenRouter API with model: deepseek/deepseek-chat-v3-0324"
        );

        // Create auth header with different formats to test
        const cleanApiKey = apiKey.trim();
        const authHeader1 = `Bearer ${cleanApiKey}`;
        const authHeader2 = `Bearer ${cleanApiKey.replace(/\s+/g, "")}`;

        console.log(`📝 Auth header option 1 length: ${authHeader1.length}`);
        console.log(
          `📝 Auth header option 1 starts with: Bearer ${cleanApiKey.substring(
            0,
            5
          )}...`
        );
        console.log(`📝 Auth header option 2 length: ${authHeader2.length}`);

        // Try without 'Bearer ' prefix as a test
        const authHeader3 = cleanApiKey;
        console.log(
          `📝 Testing auth header without Bearer prefix (length: ${authHeader3.length})`
        );

        console.log(
          `📝 Request Headers: Authorization, Content-Type, HTTP-Referer, X-Title`
        );

        console.log("🔍 MAKING API REQUEST NOW...");

        // Follow the documentation exactly but try different header format
        const response = await fetch(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            headers: {
              // Try without the 'Bearer ' prefix as a test - OpenRouter might expect just the token
              Authorization: authHeader3,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://uaqmp-api.hanishrishen.workers.dev",
              "X-Title": "Urban Air Quality Management Platform",
            },
            body: JSON.stringify(requestBody),
          }
        );

        console.log("🔍 API REQUEST COMPLETED");

        console.log(`OpenRouter API response status: ${response.status}`);
        console.log(
          `OpenRouter API response status text: ${response.statusText}`
        );

        if (response.ok) {
          const data = await response.json();
          console.log("✅ Successfully received response from OpenRouter");
          console.log(
            `📄 Response choices length: ${data.choices?.length || 0}`
          );

          if (data.choices && data.choices.length > 0) {
            const contentLength =
              data.choices[0]?.message?.content?.length || 0;
            console.log(
              `📄 Response content length: ${contentLength} characters`
            );
          }

          return c.json({
            recommendation:
              data.choices[0]?.message?.content ||
              "No recommendation could be generated.",
            source: "openrouter",
          });
        }

        // If we get here, the OpenRouter API returned an error
        const errorText = await response.text();
        console.error(
          `❌ OpenRouter API error (${response.status}): ${errorText}`
        );
        console.error(
          "❌ This indicates an issue with the OpenRouter API request or authentication"
        );

        // Return an error response instead of using fallback
        return c.json(
          {
            error: `OpenRouter API error: ${response.status}`,
            message:
              errorText.substring(0, 200) +
              (errorText.length > 200 ? "..." : ""),
            recommendation:
              "Unable to generate AI recommendations at this time. Please try again later.",
          },
          500
        );
      } catch (apiError) {
        console.error("❌ Error making request to OpenRouter:", apiError);
        return c.json(
          {
            error: "API Request Failed",
            message:
              apiError instanceof Error
                ? apiError.message
                : "Unknown error connecting to AI service",
            recommendation:
              "Unable to connect to the AI recommendation service. Please try again later.",
          },
          500
        );
      }
    } else {
      // Return a clear error when API key is missing
      console.error("❌ Cannot proceed without OPENROUTER_API_KEY");
      return c.json(
        {
          error: "Configuration Error",
          message: "OpenRouter API key is not configured",
          recommendation:
            "Unable to generate recommendations due to server configuration issues.",
        },
        500
      );
    }
  } catch (error) {
    console.error("⚠️ Request processing error:", error);
    return c.json(
      {
        error: "Request failed",
        message: error instanceof Error ? error.message : "Unknown error",
        recommendation: "An unexpected error occurred. Please try again.",
      },
      500
    );
  }
});

// Helper function to extract key information from the prompt
function extractInfoFromPrompt(prompt: string): any {
  const info: any = {
    elevation: 100,
    terrain: "flat",
    waterBodies: 2,
    density: 5000,
    aqi: 50,
    aqiLevel: "Moderate",
  };

  // Extract elevation
  const elevationMatch = prompt.match(/Elevation\s+(\d+)m/i);
  if (elevationMatch && elevationMatch[1]) {
    info.elevation = parseInt(elevationMatch[1]);
  }

  // Extract terrain type
  const terrainMatch = prompt.match(/terrain\s+(\w+)/i);
  if (terrainMatch && terrainMatch[1]) {
    info.terrain = terrainMatch[1].toLowerCase();
  }

  // Extract water bodies
  const waterMatch = prompt.match(/(\d+)\s+water\s+bodies/i);
  if (waterMatch && waterMatch[1]) {
    info.waterBodies = parseInt(waterMatch[1]);
  }

  // Extract population density
  const densityMatch =
    prompt.match(/Density:\s+(\d+)/i) ||
    prompt.match(/(\d+)\s+people\s+per\s+square\s+km/i);
  if (densityMatch && densityMatch[1]) {
    info.density = parseInt(densityMatch[1]);
  }

  // Extract AQI
  const aqiMatch = prompt.match(/AQI\s+of\s+(\d+)/i);
  if (aqiMatch && aqiMatch[1]) {
    info.aqi = parseInt(aqiMatch[1]);
  }

  // Extract AQI level
  const aqiLevelMatch = prompt.match(/AQI\s+of\s+\d+\s+\(([^)]+)\)/i);
  if (aqiLevelMatch && aqiLevelMatch[1]) {
    info.aqiLevel = aqiLevelMatch[1];
  }

  return info;
}

// Generate recommendations based on the extracted information
function generateDynamicRecommendations(info: any): string {
  return `# Urban Planning Recommendations

## Land Use & Zoning
Based on the ${info.terrain} terrain with elevation of ${
    info.elevation
  }m, and population density of ${info.density} people per square km:
- Implement mixed-use development with ${
    info.density > 10000 ? "high" : "medium"
  }-density residential areas
- Create ${
    info.waterBodies > 0
      ? `buffer zones around the ${info.waterBodies} water bodies`
      : "green corridors"
  } to protect natural resources
- Designate commercial zones along main transit corridors ${
    info.aqi > 100 ? "with strict emission controls" : ""
  }

## Green Infrastructure
- Develop a network of ${
    info.density > 10000 ? "small pocket parks" : "large parks"
  } throughout the ${info.density > 10000 ? "dense urban" : "residential"} area
- Mandate green roofs on new commercial buildings to reduce urban heat island effect
- Plant pollution-absorbing trees along major roadways ${
    info.aqi > 100
      ? "to improve air quality (AQI currently at " + info.aqi + ")"
      : ""
  }
${
  info.waterBodies > 0
    ? "- Implement rainwater harvesting systems near water bodies to maintain water quality"
    : ""
}

## Transportation
- Expand public transportation network with ${
    info.aqi > 100 ? "electric" : "low-emission"
  } buses
- Develop dedicated cycling infrastructure ${
    info.density > 10000 ? "with protected lanes" : "and pedestrian walkways"
  }
- Implement ${
    info.aqi > 100
      ? "car-free zones in residential areas"
      : "traffic calming measures in neighborhood streets"
  }
${
  info.terrain === "hilly"
    ? "- Design multi-level transportation systems to accommodate the hilly terrain"
    : ""
}

## Building Design
- Require ${
    info.aqi > 100 ? "HEPA filtration systems" : "enhanced ventilation"
  } in new buildings
- Implement energy-efficient building codes with solar panel requirements
- Use light-colored roofing materials to reduce heat absorption
${
  info.waterBodies > 0
    ? "- Design buildings to minimize runoff into nearby water bodies"
    : ""
}`;
}

export const urbanPlanningRoutes = app;
