import { GoogleGenerativeAI } from "@google/generative-ai";
import { serperService } from "./serper-service";
import { airQualityService } from "./air-quality-service";

// Initialize Gemini API
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

if (!GEMINI_API_KEY) {
  console.error("WARNING: Gemini API key is not set in environment variables!");
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

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
  async getAirQualityNews(location: string): Promise<AirQualityNewsResponse> {
    try {
      console.log(`Fetching air quality news for location: ${location}`);

      // 1. Search for articles using Serper - single request
      const searchQuery = `air quality pollution ${location}`;
      const { searchResults } = await serperService.search(searchQuery);

      console.log(`Found ${searchResults.length} articles`);

      // 2. Ensure we have air quality data - if not in global var, try to get it
      let airQualityData = global.lastAirQualityData;

      console.log(
        "Global air quality data:",
        airQualityData ? "Available" : "Not available"
      );

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
          const currentData = await airQualityService.getCurrentAirQuality(
            lat,
            lon
          );

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

      // 3. Generate AI summary from both data sources
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

      return {
        articles,
        aiSummary,
      };
    } catch (error) {
      console.error("Error in getAirQualityNews:", error);
      return getMockResults(location);
    }
  },
};

// Generate AI summary using Gemini
async function generateAirQualitySummary(
  location: string,
  airQualityData: any,
  searchResults: any[]
): Promise<string> {
  try {
    // Create model with correct parameters
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash", // Using correct model
    });

    if (searchResults.length === 0 && !airQualityData) {
      return `No information available about air quality in ${location}.`;
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
    const articleContext = searchResults
      .map((result) => `Article: ${result.title}\nSummary: ${result.snippet}`)
      .join("\n\n");

    console.log("Creating AI summary with OpenWeather data available");
    console.log(
      `Air quality in ${location}: AQI ${airQualityData.aqi}, Level: ${airQualityData.level}`
    );
    console.log("Number of articles for summary:", searchResults.length);

    // Create a more direct prompt that forces the AI to use the OpenWeather data
    const prompt = `
      Create a comprehensive air quality summary for ${location} using the data provided below.
      
      Your summary MUST be structured in exactly TWO paragraphs:
      
      PARAGRAPH 1: Analyze the OpenWeather data provided. You MUST mention the specific AQI value of ${airQualityData.aqi} 
      and the air quality level "${airQualityData.level}". Explain what this means for residents and which pollutants 
      (like PM2.5 at ${airQualityData.components.pm2_5} μg/m³) are most significant.
      
      PARAGRAPH 2: Summarize key points from the news articles, focusing on local pollution sources, 
      health impacts, and improvement initiatives in ${location} or nearby areas.
      
      Be factual and concise. NEVER say data is unavailable - work with the data provided.
      
      OpenWeather Data:
      ${openWeatherContext}
      
      News Information:
      ${articleContext}
    `;

    try {
      console.log("Sending request to Gemini API");
      // Request with correct format
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 400,
        },
      });

      const summaryText = result.response.text().trim();
      console.log(
        "Received summary from Gemini API:",
        summaryText.substring(0, 100) + "..."
      );
      return summaryText;
    } catch (apiError) {
      console.error("API error during content generation:", apiError);

      // Fall back to a hardcoded summary if all else fails
      return createHardcodedSummary(location, airQualityData);
    }
  } catch (error) {
    console.error("Error generating AI summary:", error);
    return createHardcodedSummary(
      location,
      airQualityData || {
        aqi: 50,
        level: "Moderate",
        components: { pm2_5: 25, pm10: 30, o3: 40, no2: 10, so2: 5, co: 300 },
      }
    );
  }
}

// Create a hardcoded summary if API calls fail
function createHardcodedSummary(location: string, data: any): string {
  return `The current Air Quality Index (AQI) in ${location} is ${data.aqi}, indicating ${data.level} conditions. PM2.5 levels of ${data.components.pm2_5} μg/m³ and PM10 levels of ${data.components.pm10} μg/m³ are the primary pollutants, which can cause respiratory irritation for sensitive groups. At this level, individuals with respiratory or heart conditions, the elderly, and children should limit prolonged outdoor exertion.

Recent reports indicate that ${location}'s air quality is influenced by local traffic patterns, industrial activities, and regional weather conditions. Local authorities have implemented various measures including vehicle emission controls, industrial regulations, and urban greening initiatives to address pollution concerns. Air quality monitoring stations continue to track pollution levels, with data suggesting seasonal variations that residents should be aware of when planning outdoor activities.`;
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
