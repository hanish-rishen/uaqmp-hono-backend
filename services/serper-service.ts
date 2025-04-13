import axios from "axios";

// Initialize Serper API
const SERPER_API_KEY = process.env.SERPER_API_KEY || "";
const SERPER_API_URL = "https://google.serper.dev/search";

if (!SERPER_API_KEY) {
  console.error("WARNING: Serper API key is not set in environment variables!");
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
  async search(query: string): Promise<SerperResponse> {
    try {
      console.log(`Searching for content about: ${query}`);

      // Make a single request for articles only
      const response = await axios.post(
        SERPER_API_URL,
        {
          q: query + " latest news report data",
          gl: "us",
          hl: "en",
          num: 10, // Increased from 5 to 10 results
          tbs: "qdr:m", // Last month only for recency
        },
        {
          headers: {
            "X-API-KEY": SERPER_API_KEY,
            "Content-Type": "application/json",
          },
        }
      );

      console.log("Serper API response status:", response.status);

      const results = response.data;
      console.log("Organic results count:", results.organic?.length || 0);

      // Process and extract news results
      const searchResults: SearchResult[] = (results.organic || [])
        .map((item: any, index: number) => {
          // Try to parse date from snippet or title if available
          const dateMatch =
            (item.snippet &&
              item.snippet.match(
                /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}\b/
              )) ||
            (item.title &&
              item.title.match(
                /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}\b/
              ));

          const date = dateMatch ? dateMatch[0] : "";

          // Extract source from link
          const urlObj = new URL(item.link);
          const source = urlObj.hostname.replace("www.", "");

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
