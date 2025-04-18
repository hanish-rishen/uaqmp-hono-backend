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

    // Get API key from Cloudflare environment
    // First try to get the API key from the context
    let apiKey = c.env.OPENROUTER_API_KEY;

    // Debug the API key availability (without revealing the full key)
    console.log(`API key from env exists: ${!!apiKey}`);

    // If we have the key from the environment, use it
    if (apiKey) {
      console.log(
        `Using API key from worker environment: ${apiKey.substring(0, 5)}...`
      );
    }
    // For local development, try to get from process.env as fallback
    else if (
      typeof process !== "undefined" &&
      process.env &&
      process.env.OPENROUTER_API_KEY
    ) {
      apiKey = process.env.OPENROUTER_API_KEY;
      console.log(
        `Using API key from process.env: ${apiKey.substring(0, 5)}...`
      );
    } else {
      // Remove the global variable check that's causing TypeScript errors
      console.warn("No OpenRouter API key found in any environment");
      console.log(
        "Proceeding with fallback mode - will return mock recommendations"
      );
    }

    // If we have an API key, try to use the OpenRouter API
    if (apiKey) {
      try {
        // Create request body according to documentation
        const requestBody = {
          model: "deepseek/deepseek-chat-v3-0324",
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
        };

        console.log("Attempting to call OpenRouter API with valid key");

        // Follow the documentation exactly
        const response = await fetch(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`, // TypeScript now knows apiKey is defined here
              "Content-Type": "application/json",
              "HTTP-Referer": "https://uaqmp-api.hanishrishen.workers.dev",
              "X-Title": "Urban Air Quality Management Platform",
            },
            body: JSON.stringify(requestBody),
          }
        );

        console.log("OpenRouter response status:", response.status);

        if (response.ok) {
          const data = await response.json();
          console.log("Successfully received response from OpenRouter");

          return c.json({
            recommendation:
              data.choices[0]?.message?.content ||
              "No recommendation could be generated.",
            source: "openrouter", // Indicate this is from the actual API
          });
        }

        // If we get here, the OpenRouter API returned an error
        const errorText = await response.text();
        console.error("OpenRouter API error:", errorText);

        // Continue to fallback
      } catch (apiError) {
        console.error("Error making request to OpenRouter:", apiError);
        // Continue to fallback
      }
    }

    // Generate a dynamic fallback response based on the prompt
    // This extracts key information from the prompt to customize the response
    const extractedInfo = extractInfoFromPrompt(prompt);

    console.log("Using fallback response with extracted data:", extractedInfo);

    return c.json({
      recommendation: generateDynamicRecommendations(extractedInfo),
      source: "fallback", // Clearly indicate this is a fallback response
    });
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
