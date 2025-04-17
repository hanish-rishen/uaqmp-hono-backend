import { GoogleGenerativeAI } from "@google/generative-ai";
import { serperService, setSerperApiKey } from "./serper-service";
import * as airQualityServiceModule from "./air-quality-service";

// Initialize Gemini API
let GEMINI_API_KEY: string | undefined = process.env.GEMINI_API_KEY || "";

// Export a function to update the API key at runtime
export function setGeminiApiKey(apiKey: string) {
  if (apiKey) {
    GEMINI_API_KEY = apiKey;
    console.log(`Gemini API key set manually: ${apiKey.substring(0, 5)}...`);

    // Re-initialize genAI with the new key
    if (GEMINI_API_KEY) {
      // @ts-ignore - Update the module variable
      genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      console.log("✓ Gemini API client re-initialized with new key");
    }
  }
}

// Initialize GenAI only if we have a key
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

// Cache for news data to avoid repeated API calls
const newsCache: Record<
  string,
  { timestamp: number; data: AirQualityNewsResponse }
> = {};
const CACHE_TTL = 60 * 60 * 1000; // 1 hour cache lifetime

interface NewsArticle {
  title: string;
  summary: string;
  source: string;
  url: string;
  date: string;
}

interface AirQualityNewsResponse {
  articles: NewsArticle[];
  aiSummary: string;
}

export const geminiService = {
  // Fetch articles and generate AI summary
  async getAirQualityNews(
    location: string,
    env?: any
  ): Promise<AirQualityNewsResponse> {
    try {
      console.log(`Fetching news for location: ${location}`);

      // Debug the environment being passed
      if (env) {
        console.log(`Environment passed to gemini-service:`, Object.keys(env));
        console.log(`GEMINI_API_KEY available in env: ${!!env.GEMINI_API_KEY}`);
      } else {
        console.warn("No environment object was passed to getAirQualityNews");
      }

      // Check cache first
      const cacheKey = location.toLowerCase();
      const cachedData = newsCache[cacheKey];
      const now = Date.now();

      if (cachedData && now - cachedData.timestamp < CACHE_TTL) {
        console.log(`Using cached news data for ${location}`);
        return cachedData.data;
      }

      // Set API keys from Cloudflare environment if available
      if (env) {
        if (env.GEMINI_API_KEY) {
          console.log(`Setting Gemini API key from Cloudflare environment`);
          setGeminiApiKey(env.GEMINI_API_KEY);
        }
        if (env.SERPER_API_KEY) {
          console.log(`Setting Serper API key from Cloudflare environment`);
          setSerperApiKey(env.SERPER_API_KEY);
        }
        if (env.OPENWEATHER_API_KEY) {
          console.log(
            `Setting OpenWeather API key from Cloudflare environment`
          );
          airQualityServiceModule.setApiKey(env.OPENWEATHER_API_KEY);
        }
      }

      // Verify Gemini API is initialized after setting keys
      if (!genAI) {
        console.error("Gemini API not initialized after environment setup!");
        throw new Error(
          "Gemini API client could not be initialized with provided API key"
        );
      }

      // 1. Search for articles using Serper - single request
      console.log("Searching for articles via Serper API...");
      const searchQuery = `air quality pollution ${location}`;
      const { searchResults } = await serperService.search(
        searchQuery,
        env?.SERPER_API_KEY
      );

      console.log(`Found ${searchResults.length} articles from Serper API`);

      // If no search results, check if we have cached data that's older
      if (searchResults.length === 0 && cachedData) {
        console.log(
          `No new articles found, using older cached data for ${location}`
        );
        return cachedData.data;
      }

      // 2. Ensure we have air quality data - if not in global var, try to get it
      let airQualityData = global.lastAirQualityData;

      console.log(
        "Air quality data available for summary:",
        airQualityData ? "Yes" : "No"
      );

      if (airQualityData) {
        console.log(
          `- AQI: ${airQualityData.aqi}, Level: ${airQualityData.level}`
        );
        console.log(`- PM2.5: ${airQualityData.components.pm2_5} μg/m³`);
      }

      // If no data is available in global var, try to get the latest data
      if (!airQualityData) {
        console.log(
          "No OpenWeather data available in global var. Getting current data."
        );
        try {
          // Get the current air quality data directly from OpenWeather API
          // Instead of using hardcoded values
          const lat = "13.039835226912825"; // Default coords for Ambattur
          const lon = "80.17812278961485";

          // Use the existing airQualityService to get real-time data
          const currentData =
            await airQualityServiceModule.getCurrentAirQuality(lat, lon);

          airQualityData = {
            aqi: currentData.aqi,
            level: currentData.level,
            components: currentData.components,
            location: currentData.location,
            timestamp: currentData.timestamp,
          };

          console.log(
            "Retrieved real-time air quality data with AQI:",
            airQualityData.aqi
          );
          console.log("Real-time pollutant levels:", {
            "PM2.5": airQualityData.components.pm2_5,
            PM10: airQualityData.components.pm10,
            CO: airQualityData.components.co,
            O3: airQualityData.components.o3,
          });
        } catch (fetchError) {
          console.error("Error fetching current air quality:", fetchError);
          // Fall back to default data only if API call fails
          airQualityData = {
            aqi: 50,
            level: "Moderate",
            components: {
              co: 200,
              no: 0.5,
              no2: 10,
              o3: 50,
              so2: 5,
              pm2_5: 25,
              pm10: 30,
              nh3: 1.0,
            },
            location: { lat: "0", lon: "0" },
            timestamp: Date.now(),
          };
          console.log("Using fallback data due to API error");
        }
      }

      // 3. Generate AI summary from both data sources - let errors propagate
      const aiSummary = await generateAirQualitySummary(
        location,
        airQualityData,
        searchResults
      );

      // 4. Process articles
      const articles = searchResults.map((result) => ({
        title: result.title,
        summary: result.snippet,
        source: result.source,
        url: result.link,
        date: result.date || "Recent",
      }));

      const responseData = {
        articles,
        aiSummary,
      };

      // Update cache
      newsCache[cacheKey] = {
        timestamp: now,
        data: responseData,
      };

      return responseData;
    } catch (error) {
      console.error("Error in getAirQualityNews:", error);

      // Check if we have cached data to fall back to
      const cacheKey = location.toLowerCase();
      const cachedData = newsCache[cacheKey];

      if (cachedData) {
        console.log(`API error, falling back to cached data for ${location}`);
        return cachedData.data;
      }

      // If no cached data, return the error message in the AI summary
      return {
        articles: [],
        aiSummary: `Error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  },
};

// Generate AI summary using Gemini
async function generateAirQualitySummary(
  location: string,
  airQualityData: any,
  searchResults: any[]
): Promise<string> {
  // Check if Gemini API is available
  if (!genAI) {
    throw new Error("Gemini API not initialized - missing API key");
  }

  // Create model with correct parameters
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash", // Using correct model
  });

  if (searchResults.length === 0 && !airQualityData) {
    throw new Error(
      `No information available about air quality in ${location}.`
    );
  }

  // Create air quality context using the passed data
  const openWeatherContext = `
    Current Air Quality Index (AQI): ${airQualityData.aqi}
    Quality Level: ${airQualityData.level}
    Pollutant Components:
    - PM2.5 (Fine particles): ${airQualityData.components.pm2_5} μg/m³
    - PM10 (Coarse particles): ${airQualityData.components.pm10} μg/m³
    - O3 (Ozone): ${airQualityData.components.o3} μg/m³
    - NO2 (Nitrogen Dioxide): ${airQualityData.components.no2} μg/m³
    - SO2 (Sulfur Dioxide): ${airQualityData.components.so2} μg/m³
    - CO (Carbon Monoxide): ${airQualityData.components.co} μg/m³
  `;

  // Create context from search results
  const articleContext =
    searchResults && searchResults.length > 0
      ? searchResults
          .map(
            (result) => `Article: ${result.title}\nSummary: ${result.snippet}`
          )
          .join("\n\n")
      : "No recent news articles available for this location.";

  console.log("Creating AI summary with OpenWeather data available");
  console.log(
    `Air quality in ${location}: AQI ${airQualityData.aqi}, Level: ${airQualityData.level}`
  );
  console.log(
    "Number of articles for summary:",
    searchResults ? searchResults.length : 0
  );

  // Create a more direct prompt that forces the AI to use the OpenWeather data
  const prompt = `
    Create a comprehensive air quality summary for ${location} using the data provided below.
    
    Your summary MUST be structured in exactly TWO paragraphs:
    
    PARAGRAPH 1: Analyze the OpenWeather data provided. You MUST mention the specific AQI value of ${
      airQualityData.aqi
    } 
    and the air quality level "${
      airQualityData.level
    }". Explain what this means for residents and which pollutants 
    (like PM2.5 at ${
      airQualityData.components.pm2_5
    } μg/m³) are most significant.
    
    PARAGRAPH 2: ${
      searchResults && searchResults.length > 0
        ? "Summarize key points from the news articles, focusing on local pollution sources, health impacts, and improvement initiatives in " +
          location +
          " or nearby areas."
        : "Discuss general implications of the current air quality levels for residents, including any health precautions that should be taken based on the pollutant levels."
    }
    
    Be factual and concise. NEVER say data is unavailable - work with the data provided.
    
    OpenWeather Data:
    ${openWeatherContext}
    
    ${
      searchResults && searchResults.length > 0
        ? "News Information:"
        : "Note: Use general knowledge about air quality impacts since specific news articles are not available."
    }
    ${articleContext}
  `;

  // Add retry logic for Gemini API with exponential backoff
  let attempts = 0;
  const maxAttempts = 3; // Increase to 3 attempts
  let lastError: any = null;
  const baseDelay = 1000; // 1 second

  while (attempts < maxAttempts) {
    try {
      attempts++;
      console.log(`Gemini API attempt ${attempts}/${maxAttempts}`);

      // Request with correct format
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 800,
        },
      });

      const summaryText = result.response.text().trim();

      // Validate we got a real response, not just an error message
      if (summaryText.length < 50) {
        console.warn(
          "Gemini response too short, may be an error:",
          summaryText
        );
        throw new Error("Response too short, likely an error");
      }

      console.log(
        "✓ Received valid summary from Gemini API:",
        summaryText.substring(0, 100) + "..."
      );

      return summaryText;
    } catch (attemptError) {
      console.error(`Gemini API attempt ${attempts} failed:`, attemptError);
      lastError = attemptError;

      // Wait before retrying with exponential backoff
      if (attempts < maxAttempts) {
        const delay = baseDelay * Math.pow(2, attempts - 1); // Exponential backoff
        console.log(`Waiting ${delay}ms before next attempt...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // If we get here, all attempts failed - throw the error
  console.error("All Gemini API attempts failed:", lastError);
  throw new Error(`API Error: ${lastError?.message || "Unknown error"}`);
}

// Create mock results when APIs fail
function getMockResults(location: string): AirQualityNewsResponse {
  return {
    articles: [
      {
        title: `Air Quality Alert: Latest Updates for ${location}`,
        summary: `Recent reports show moderate to poor air quality levels in ${location} due to increased pollution. Local authorities recommend limiting outdoor activities during peak hours.`,
        source: "Environmental News Network",
        url: "https://example.com/air-quality-update",
        date: new Date().toLocaleDateString(),
      },
      {
        title: `${location} Takes Measures to Improve Air Quality`,
        summary: `The city of ${location} has implemented new emission reduction measures targeting industrial facilities and vehicular traffic. Early data suggests a 10% improvement in air quality readings over the past month.`,
        source: "City Environment Department",
        url: "https://example.com/emission-measures",
        date: new Date(
          Date.now() - 7 * 24 * 60 * 60 * 1000
        ).toLocaleDateString(),
      },
      {
        title: "Health Effects of Poor Air Quality on Urban Residents",
        summary:
          "Medical researchers have noted increased respiratory complaints in areas with poor air quality. Vulnerable populations are advised to use air purifiers indoors and check daily air quality forecasts.",
        source: "Public Health Journal",
        url: "https://example.com/health-effects",
        date: new Date(
          Date.now() - 14 * 24 * 60 * 60 * 1000
        ).toLocaleDateString(),
      },
    ],
    aiSummary: `Air quality in ${location} has shown moderate to poor levels in recent months. Primary pollutants include particulate matter (PM2.5) and nitrogen dioxide from vehicle emissions and industrial activities. Residents with respiratory conditions are advised to limit outdoor activities during peak pollution hours. Local authorities have implemented emission reduction measures that may improve conditions in coming months.`,
  };
}
