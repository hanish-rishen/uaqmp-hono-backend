import axios from "axios";

// Initialize Serper API
let SERPER_API_KEY: string | undefined = process.env.SERPER_API_KEY || "";
const SERPER_API_URL = "https://google.serper.dev/search";

// Access the API key from Cloudflare Workers environment if available
if (typeof SERPER_API_KEY === "undefined" || SERPER_API_KEY === "") {
  try {
    // Try to access from global scope in Cloudflare Workers
    SERPER_API_KEY =
      (typeof self !== "undefined" && (self as any).SERPER_API_KEY) ||
      (typeof globalThis !== "undefined" && (globalThis as any).SERPER_API_KEY);
  } catch (e) {
    console.error("Error accessing Serper API key from environment:", e);
  }
}

// Log warning if key is still not set
if (!SERPER_API_KEY) {
  console.error("WARNING: Serper API key is not set in environment variables!");
}

// Export a function to update the API key at runtime
export function setSerperApiKey(apiKey: string) {
  if (apiKey) {
    SERPER_API_KEY = apiKey;
    console.log(`Serper API key set manually: ${apiKey.substring(0, 5)}...`);
  }
}

interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
  source: string;
  date?: string;
}

export interface SerperResponse {
  searchResults: SearchResult[];
}

export const serperService = {
  // Search for articles in a single request to reduce API calls
  async search(query: string, apiKey?: string): Promise<SerperResponse> {
    try {
      // If API key is passed directly to this function, use it
      if (apiKey) {
        SERPER_API_KEY = apiKey;
      }

      console.log(`Searching for content about: ${query}`);
      console.log(
        `Using Serper API Key: ${SERPER_API_KEY ? "Available" : "NOT SET"}`
      );

      if (!SERPER_API_KEY) {
        console.error("Cannot search without Serper API key");
        return { searchResults: [] };
      }

      // Make a single request for articles only
      const response = await axios.post(
        SERPER_API_URL,
        {
          q: query + " latest news report data",
          gl: "us",
          hl: "en",
        },
        {
          headers: {
            "X-API-KEY": SERPER_API_KEY,
            "Content-Type": "application/json",
          },
        }
      );

      // Process the response data
      const organicResults = response.data?.organic || [];
      const searchResults = organicResults
        .map((item: any, index: number) => {
          // Extract source from link
          const urlObj = new URL(item.link);
          const source = urlObj.hostname.replace("www.", "");

          // Attempt to extract date if available
          let date: string | undefined = undefined;
          if (item.date) {
            date = item.date;
          }

          return {
            title: item.title || "Untitled",
            link: item.link,
            snippet: item.snippet || "",
            position: index + 1,
            source: source,
            date: date,
          };
        })
        .filter(
          (result: SearchResult) =>
            // Filter out results that are clearly not news articles
            !result.link.includes("youtube.com") &&
            !result.link.includes("google.com/search") &&
            !result.link.includes("pinterest.com") &&
            result.snippet.length > 30
        );

      return {
        searchResults: searchResults.slice(0, 8), // Increased from 5 to 8 articles
      };
    } catch (error) {
      console.error("Error in search:", error);
      if (axios.isAxiosError(error)) {
        console.error("Axios error details:", error.response?.data);
      }
      return { searchResults: [] };
    }
  },
};
