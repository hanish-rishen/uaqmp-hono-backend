import axios from "axios";
import * as dotenv from "dotenv";

// Try to load environment variables, but this won't work in Cloudflare Workers
// This is just for local development
try {
  dotenv.config();
} catch (e) {
  console.log(
    "dotenv not available, running in Cloudflare Workers environment"
  );
}

// For Cloudflare Workers, environment variables are accessible through the global variable
// See: https://developers.cloudflare.com/workers/platform/environment-variables/
let OPENWEATHER_API_KEY: string | undefined;
// In Cloudflare Workers, environment variables aren't available in the global scope
// Cloudflare Workers specific way to access environment variables
if (typeof OPENWEATHER_API_KEY === "undefined") {
  try {
    // Access directly from global scope in Cloudflare Workers
    OPENWEATHER_API_KEY =
      OPENWEATHER_API_KEY ||
      (typeof self !== "undefined" && (self as any).OPENWEATHER_API_KEY) ||
      (typeof globalThis !== "undefined" &&
        (globalThis as any).OPENWEATHER_API_KEY);
    // Fallback to Node.js environment variables (for local development)
    if (!OPENWEATHER_API_KEY && typeof process !== "undefined" && process.env) {
      OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
    }
  } catch (e) {
    console.error("Error accessing environment variables:", e);
  }
}

// Debug the API key (remove in production)
console.log(
  "API Key being used:",
  OPENWEATHER_API_KEY
    ? `${OPENWEATHER_API_KEY.substring(0, 5)}... (${
        OPENWEATHER_API_KEY.length
      } chars)`
    : "API key is NOT SET"
);

if (!OPENWEATHER_API_KEY) {
  console.error(
    "⚠️ CRITICAL ERROR: OpenWeather API key is not set! Make sure to add it in the Cloudflare dashboard under Settings > Variables."
  );
}

const BASE_URL = "https://api.openweathermap.org/data/2.5";

// AQI level descriptions with standard AQI range values
const AQI_LEVELS = [
  {
    level: "Good",
    description:
      "Air quality is satisfactory, and air pollution poses little or no risk.",
    range: "0-50",
  },
  {
    level: "Fair",
    description:
      "Air quality is acceptable. However, there may be a risk for some people, particularly those who are unusually sensitive to air pollution.",
    range: "51-100",
  },
  {
    level: "Moderate",
    description:
      "Members of sensitive groups may experience health effects. The general public is less likely to be affected.",
    range: "101-150",
  },
  {
    level: "Poor",
    description:
      "Some members of the general public may experience health effects; members of sensitive groups may experience more serious health effects.",
    range: "151-200",
  },
  {
    level: "Very Poor",
    description:
      "Health alert: The risk of health effects is increased for everyone.",
    range: "201-300+",
  },
];

// Convert OpenWeather's AQI (1-5) to a standard AQI scale (0-500)
// This is an approximation based on common AQI scales
function convertToStandardAQI(openWeatherAQI: number, components: any): number {
  // Using PM2.5, PM10, O3, NO2, SO2, CO to calculate a more accurate AQI
  // These formulas are approximations based on US EPA standards

  // Extract component values
  const pm25 = components.pm2_5; // μg/m³
  const pm10 = components.pm10; // μg/m³
  const o3 = components.o3; // μg/m³
  const no2 = components.no2; // μg/m³
  const so2 = components.so2; // μg/m³
  const co = components.co; // μg/m³

  // Calculate individual AQI values for each pollutant
  // PM2.5 calculation (simplified formula based on US EPA breakpoints)
  let pm25AQI = 0;
  if (pm25 <= 12) {
    pm25AQI = linearScale(pm25, 0, 12, 0, 50);
  } else if (pm25 <= 35.4) {
    pm25AQI = linearScale(pm25, 12.1, 35.4, 51, 100);
  } else if (pm25 <= 55.4) {
    pm25AQI = linearScale(pm25, 35.5, 55.4, 101, 150);
  } else if (pm25 <= 150.4) {
    pm25AQI = linearScale(pm25, 55.5, 150.4, 151, 200);
  } else if (pm25 <= 250.4) {
    pm25AQI = linearScale(pm25, 150.5, 250.4, 201, 300);
  } else if (pm25 <= 350.4) {
    pm25AQI = linearScale(pm25, 250.5, 350.4, 301, 400);
  } else {
    pm25AQI = linearScale(pm25, 350.5, 500, 401, 500);
  }

  // PM10 calculation
  let pm10AQI = 0;
  if (pm10 <= 54) {
    pm10AQI = linearScale(pm10, 0, 54, 0, 50);
  } else if (pm10 <= 154) {
    pm10AQI = linearScale(pm10, 55, 154, 51, 100);
  } else if (pm10 <= 254) {
    pm10AQI = linearScale(pm10, 155, 254, 101, 150);
  } else if (pm10 <= 354) {
    pm10AQI = linearScale(pm10, 255, 354, 151, 200);
  } else {
    pm10AQI = linearScale(pm10, 355, 500, 201, 300);
  }

  // O3 calculation (simplified)
  let o3AQI = 0;
  if (o3 <= 108) {
    // ~0.054 ppm
    o3AQI = linearScale(o3, 0, 108, 0, 50);
  } else if (o3 <= 140) {
    // ~0.070 ppm
    o3AQI = linearScale(o3, 108.1, 140, 51, 100);
  } else if (o3 <= 170) {
    // ~0.085 ppm
    o3AQI = linearScale(o3, 140.1, 170, 101, 150);
  } else if (o3 <= 210) {
    // ~0.105 ppm
    o3AQI = linearScale(o3, 170.1, 210, 151, 200);
  } else {
    o3AQI = linearScale(o3, 210.1, 400, 201, 300);
  }

  // Take the highest AQI value as the overall AQI
  const aqiValues = [pm25AQI, pm10AQI, o3AQI];
  const calculatedAQI = Math.max(...aqiValues);
  console.log("Individual pollutant AQI values:", {
    PM2_5: Math.round(pm25AQI),
    PM10: Math.round(pm10AQI),
    O3: Math.round(o3AQI),
    combined: Math.round(calculatedAQI),
    openWeatherAQI,
  });
  return Math.round(calculatedAQI);
}

// Linear scaling function to map one range to another
function linearScale(
  value: number,
  fromMin: number,
  fromMax: number,
  toMin: number,
  toMax: number
): number {
  return ((value - fromMin) * (toMax - toMin)) / (fromMax - fromMin) + toMin;
}

// Get color for AQI value
function getAqiColor(aqi: number): string {
  if (aqi <= 50) return "green";
  if (aqi <= 100) return "yellow";
  if (aqi <= 150) return "orange";
  if (aqi <= 200) return "red";
  if (aqi <= 300) return "purple";
  return "maroon";
}

// Get descriptive category for AQI value
function getAqiCategory(aqi: number): { level: string; description: string } {
  if (aqi <= 50) {
    return {
      level: "Good",
      description:
        "Air quality is satisfactory, and air pollution poses little or no risk.",
    };
  } else if (aqi <= 100) {
    return {
      level: "Moderate",
      description:
        "Air quality is acceptable. However, there may be a risk for some people, particularly those who are unusually sensitive to air pollution.",
    };
  } else if (aqi <= 150) {
    return {
      level: "Unhealthy for Sensitive Groups",
      description:
        "Members of sensitive groups may experience health effects. The general public is less likely to be affected.",
    };
  } else if (aqi <= 200) {
    return {
      level: "Unhealthy",
      description:
        "Some members of the general public may experience health effects; members of sensitive groups may experience more serious health effects.",
    };
  } else if (aqi <= 300) {
    return {
      level: "Very Unhealthy",
      description:
        "Health alert: The risk of health effects is increased for everyone.",
    };
  } else {
    return {
      level: "Hazardous",
      description:
        "Health warning of emergency conditions: everyone is more likely to be affected.",
    };
  }
}

// Add a new function to set the API key that can be called from routes
export function setApiKey(apiKey: string) {
  if (apiKey) {
    OPENWEATHER_API_KEY = apiKey;
    console.log(
      `API key set manually: ${apiKey.substring(0, 5)}... (${
        apiKey.length
      } chars)`
    );
  }
}

export async function getCurrentAirQuality(
  lat: string,
  lon: string,
  apiKey?: string
) {
  try {
    // If API key is passed directly to this function, use it
    if (apiKey) {
      OPENWEATHER_API_KEY = apiKey;
    }

    // For local development, try process.env as fallback
    if (!OPENWEATHER_API_KEY && typeof process !== "undefined" && process.env) {
      OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
    }

    console.log(
      `Fetching air quality for: ${lat}, ${lon} with API key: ${
        OPENWEATHER_API_KEY
          ? `${OPENWEATHER_API_KEY.substring(0, 5)}... (${
              OPENWEATHER_API_KEY.length
            } chars)`
          : "NOT SET"
      }`
    );

    // Add explicit error handling for API key issues
    if (!OPENWEATHER_API_KEY) {
      console.error("⚠️ CRITICAL: Cannot make API request without API key");
      throw new Error(
        "OpenWeather API key is missing. Make sure it's set in Cloudflare Worker environment variables."
      );
    }

    // Add more debugging information and validation
    if (isNaN(parseFloat(lat)) || isNaN(parseFloat(lon))) {
      console.error(`Invalid coordinates provided: lat=${lat}, lon=${lon}`);
      throw new Error("Invalid coordinates provided");
    }

    // Make the API request with retry logic
    const MAX_RETRIES = 3;
    let retryCount = 0;
    let lastError;

    while (retryCount < MAX_RETRIES) {
      try {
        // Enhanced debugging for API request details
        const fullRequestUrl = `${BASE_URL}/air_pollution?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}`;
        const maskedUrl = `${BASE_URL}/air_pollution?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY.substring(
          0,
          3
        )}...`;

        console.log(
          `⚠️ OPENWEATHER API KEY LENGTH: ${OPENWEATHER_API_KEY.length}`
        );
        console.log(
          `⚠️ FIRST 5 CHARS OF API KEY: ${OPENWEATHER_API_KEY.substring(0, 5)}`
        );
        console.log(`🔄 API REQUEST ATTEMPT ${retryCount + 1}/${MAX_RETRIES}`);
        console.log(`📡 Masked URL: ${maskedUrl}`);
        console.log(`🕒 Timestamp: ${new Date().toISOString()}`);

        // Use a simpler and more compatible API test approach for Cloudflare Workers
        try {
          console.log(`🔍 ATTEMPTING DIRECT API TEST...`);
          // Use a simplified axios call that's more compatible with serverless environments
          const testResponse = await axios({
            method: "get",
            url: `${BASE_URL}/air_pollution`,
            params: {
              lat,
              lon,
              appid: OPENWEATHER_API_KEY,
            },
            timeout: 8000, // Shorter timeout for test - reduced for Cloudflare's limits
            headers: {
              Accept: "application/json",
              "User-Agent": "UAQMP/1.0 (Cloudflare Worker)",
            },
            decompress: true, // Handle gzip responses automatically
            validateStatus: null, // Don't throw on any status code
          });
          console.log(
            `✅ DIRECT API TEST STATUS: ${testResponse.status} ${
              testResponse.statusText || ""
            }`
          );

          // Safe stringification of response
          try {
            const responseStr = JSON.stringify(testResponse.data).substring(
              0,
              200
            );
            console.log(`📄 DIRECT API TEST RESPONSE: ${responseStr}...`);
          } catch (error: unknown) {
            const jsonError = error as Error;
            console.log(
              `📄 Could not stringify test response: ${jsonError.message}`
            );
          }
        } catch (error: unknown) {
          const directApiError = error as Error;
          console.error(`❌ DIRECT API TEST FAILED: ${directApiError.message}`);
        }

        // Start timing the actual axios request
        const startTime = Date.now();
        console.log(`⏱️ Starting axios request with 30s timeout...`);

        // Simplified axios config suitable for Cloudflare Workers environment
        const axiosConfig = {
          method: "get",
          url: `${BASE_URL}/air_pollution`,
          params: {
            lat,
            lon,
            appid: OPENWEATHER_API_KEY,
          },
          timeout: 25000, // Reduce from 30s for Cloudflare's limits
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "User-Agent": "UAQMP/1.0 (Cloudflare Worker)",
            "Cache-Control": "no-cache",
          },
          // Remove the Node.js specific https agent options
          maxRedirects: 5,
          decompress: true,
        };
        console.log(
          `📡 Request Config:`,
          JSON.stringify(
            axiosConfig,
            (key, value) => (key === "appid" ? "***masked***" : value),
            2
          )
        );

        // Define response variable in the outer scope so it's accessible outside the try-catch
        let response;

        // Use try-catch for the main request with more specific error handling
        try {
          response = await axios(axiosConfig);

          // Log request duration
          const duration = Date.now() - startTime;
          console.log(`⏱️ Request completed in ${duration}ms`);
          console.log(`✅ API RESPONSE RECEIVED:`);
          console.log(`📊 Status: ${response.status} ${response.statusText}`);
          console.log(`📦 Headers:`, JSON.stringify(response.headers, null, 2));

          // Safe way to log response structure
          try {
            console.log(
              `📋 Full response data:`,
              JSON.stringify(response.data).substring(0, 500)
            );
          } catch (error: unknown) {
            // Fixed: Added proper type annotation for the error
            const jsonError = error as Error;
            console.log(
              `📋 Could not stringify response data:`,
              jsonError.message
            );
          }
        } catch (axiosError: any) {
          // Handle this specific axios error separately with better diagnostics
          console.error(`⚠️ Axios request failed with error:`, {
            message: axiosError.message,
            code: axiosError.code || "UNKNOWN",
            name: axiosError.name,
            config: axiosError.config
              ? {
                  url: axiosError.config.url,
                  method: axiosError.config.method,
                  timeout: axiosError.config.timeout,
                }
              : "No config available",
            response: axiosError.response
              ? {
                  status: axiosError.response.status,
                  statusText: axiosError.response.statusText,
                  headers: axiosError.response.headers || {},
                  data:
                    typeof axiosError.response.data === "string"
                      ? axiosError.response.data.substring(0, 200)
                      : JSON.stringify(
                          axiosError.response.data || {}
                        ).substring(0, 200),
                }
              : "No response available",
          });
          // Re-throw to be caught by the outer try-catch
          throw axiosError;
        }

        // Now check if we have a valid response object
        if (!response) {
          throw new Error("No response received from OpenWeather API");
        }

        // Add additional validation for response structure
        if (!response.data) {
          throw new Error("Empty response from OpenWeather API");
        }

        if (!response.data.list) {
          console.error(
            "API response missing 'list' property:",
            JSON.stringify(response.data)
          );
          throw new Error(
            "Invalid API response structure: missing 'list' property"
          );
        }

        if (response.data.list.length === 0) {
          throw new Error("OpenWeather API returned empty list");
        }

        if (response.data && response.data.list) {
          console.log(`📈 List items count: ${response.data.list.length}`);
          if (response.data.list.length > 0) {
            console.log(
              `🔍 First item structure:`,
              Object.keys(response.data.list[0] || {})
            );
            console.log(
              `🧪 Components available:`,
              Object.keys(response.data.list[0].components || {})
            );
            console.log(
              `🔢 AQI value from API: ${response.data.list[0].main?.aqi}`
            );
            console.log(
              `🧩 First few component values:`,
              `PM2.5=${response.data.list[0].components?.pm2_5 || "N/A"}`,
              `PM10=${response.data.list[0].components?.pm10 || "N/A"}`,
              `O3=${response.data.list[0].components?.o3 || "N/A"}`
            );
          }
        }

        // Verify that the response contains the expected data
        if (
          !response.data ||
          !response.data.list ||
          response.data.list.length === 0
        ) {
          console.error(
            "❌ OpenWeather API returned empty or invalid data structure:",
            JSON.stringify(response.data)
          );
          throw new Error("OpenWeather API returned empty or invalid data");
        }

        const data = response.data.list[0];
        const openWeatherAqi = data.main.aqi;

        // Convert to standard AQI
        const standardAqi = convertToStandardAQI(
          openWeatherAqi,
          data.components
        );
        const aqiCategory = getAqiCategory(standardAqi);
        console.log(
          `OpenWeather AQI: ${openWeatherAqi}, Converted to standard AQI: ${standardAqi}`
        );
        console.log(`AQI Category: ${aqiCategory.level}`);

        return {
          timestamp: data.dt * 1000, // Convert to milliseconds
          aqi: standardAqi, // Use the converted standard AQI
          openWeatherAqi: openWeatherAqi, // Keep original for reference
          level: aqiCategory.level,
          description: aqiCategory.description,
          color: getAqiColor(standardAqi),
          components: data.components,
          location: { lat, lon },
          error: false, // Explicitly mark as not an error
        };
      } catch (error: any) {
        lastError = error;
        retryCount++;

        // Enhanced error logging
        console.error(
          `❌ API REQUEST FAILED (Attempt ${retryCount}/${MAX_RETRIES}):`
        );
        console.error(`🚨 Error name: ${error.name}`);
        console.error(`📝 Error message: ${error.message}`);
        console.error(`🔍 ERROR STACK: ${error.stack}`);

        if (error.code) {
          console.error(`🔢 Error code: ${error.code}`);
        }

        if (error.response) {
          // The server responded with a status code outside of 2xx range
          console.error(`🔴 Response status: ${error.response.status}`);
          console.error(`🔴 Response statusText: ${error.response.statusText}`);
          console.error(
            `📄 Response headers:`,
            JSON.stringify(error.response.headers || {}, null, 2)
          );
          // Safely log response data
          try {
            const responseDataStr = JSON.stringify(error.response.data);
            console.error(`📑 Response data:`, responseDataStr);
          } catch (jsonError) {
            console.error(
              `📑 Response data: [Could not stringify]`,
              error.response.data
            );
          }
        } else if (error.request) {
          // The request was made but no response was received
          console.error(`🟠 No response received - Network or CORS issue`);
          console.error(`🟠 Request was made but no response`);
          // Try to log request details
          try {
            console.error(
              `📡 Request URL:`,
              error.request.path || error.config?.url || "URL not available"
            );
          } catch (error: unknown) {
            // Fixed: Added proper type annotation for the error
            const e = error as Error;
            console.error(`📡 Could not access request details:`, e.message);
          }
        } else {
          // Something happened in setting up the request
          console.error(`🟡 Request setup error: ${error.message}`);
        }

        // Add network utilities for diagnosis
        try {
          const dns = require("dns");
          // Fixed: Added proper types for the callback parameters
          dns.lookup(
            "api.openweathermap.org",
            (
              err: NodeJS.ErrnoException | null,
              address: string,
              family: number
            ) => {
              if (err) {
                console.error(`❌ DNS lookup failed:`, err);
              } else {
                console.log(
                  `✅ DNS lookup success: api.openweathermap.org -> ${address} (IPv${family})`
                );
              }
            }
          );
        } catch (error: unknown) {
          // Fixed: Added proper type annotation for the error
          const dnsError = error as Error;
          console.error(`❌ DNS utility not available:`, dnsError.message);
        }

        // Wait a bit before retrying (increasing backoff)
        if (retryCount < MAX_RETRIES) {
          const delay = retryCount * 1000; // Increasing delay with each retry
          console.log(`⏳ Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // If we got here, all retries failed
    console.error("❌ ALL RETRY ATTEMPTS FAILED");
    console.error(
      "📊 Final error details:",
      lastError?.message || "Unknown error"
    );
    throw lastError || new Error("All API retry attempts failed");
  } catch (error: any) {
    // Propagate the error to be handled by the route handler
    console.error(
      "❌ FATAL ERROR: Failed to fetch air quality data after multiple attempts:",
      error.message
    );
    // Log stack trace for debugging
    console.error("📚 Error stack trace:", error.stack);

    throw error;
  }
}

export async function getAirQualityComponents(
  lat: string,
  lon: string,
  apiKey?: string
) {
  try {
    // If API key is passed directly to this function, use it
    if (apiKey) {
      OPENWEATHER_API_KEY = apiKey;
    }

    // For local development, try process.env as fallback
    if (!OPENWEATHER_API_KEY && typeof process !== "undefined" && process.env) {
      OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
    }
    console.log(`Fetching air quality components for: ${lat}, ${lon}`);

    if (!OPENWEATHER_API_KEY) {
      console.error("Cannot make components API request without API key");
      throw new Error(
        "OpenWeather API key is missing. Check your environment variables."
      );
    }

    // Add retry logic for reliability
    const MAX_RETRIES = 3;
    let retryCount = 0;
    let lastError;

    while (retryCount < MAX_RETRIES) {
      try {
        console.log(
          `Making components API request (Attempt ${
            retryCount + 1
          }/${MAX_RETRIES})`
        );

        const response = await axios.get(`${BASE_URL}/air_pollution`, {
          params: {
            lat,
            lon,
            appid: OPENWEATHER_API_KEY,
          },
          timeout: 30000, // 30 second timeout
        });

        // Basic validation
        if (!response.data || !response.data.list || !response.data.list[0]) {
          console.error("Invalid data structure returned from OpenWeather API");
          throw new Error("Invalid response structure from OpenWeather API");
        }

        const components = response.data.list[0].components;

        return {
          co: {
            value: components.co,
            unit: "μg/m³",
            name: "Carbon Monoxide",
          },
          no: {
            value: components.no,
            unit: "μg/m³",
            name: "Nitrogen Monoxide",
          },
          no2: {
            value: components.no2,
            unit: "μg/m³",
            name: "Nitrogen Dioxide",
          },
          o3: { value: components.o3, unit: "μg/m³", name: "Ozone" },
          so2: {
            value: components.so2,
            unit: "μg/m³",
            name: "Sulphur Dioxide",
          },
          pm2_5: {
            value: components.pm2_5,
            unit: "μg/m³",
            name: "Fine Particles",
          },
          pm10: {
            value: components.pm10,
            unit: "μg/m³",
            name: "Coarse Particles",
          },
          nh3: { value: components.nh3, unit: "μg/m³", name: "Ammonia" },
        };
      } catch (error) {
        lastError = error;
        retryCount++;
        console.error(
          `Components API request failed (Attempt ${retryCount}/${MAX_RETRIES}):`,
          error
        );

        // Wait before retrying with increasing backoff
        if (retryCount < MAX_RETRIES) {
          const delay = retryCount * 1000;
          console.log(`Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // If we got here, all retries failed
    throw lastError || new Error("All API retry attempts failed");
  } catch (error) {
    console.error("Error in getAirQualityComponents:", error);
    throw error; // Propagate the error to be handled by the route handler
  }
}

// Add the missing forecast method with retry logic and no fallbacks
export async function getAirQualityForecast(
  lat: string,
  lon: string,
  apiKey?: string
) {
  try {
    // If API key is passed directly to this function, use it
    if (apiKey) {
      OPENWEATHER_API_KEY = apiKey;
    }

    // For local development, try process.env as fallback
    if (!OPENWEATHER_API_KEY && typeof process !== "undefined" && process.env) {
      OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
    }

    console.log(`Fetching air quality forecast for: ${lat}, ${lon}`);

    if (!OPENWEATHER_API_KEY) {
      throw new Error(
        "OpenWeather API key is missing. Check your environment variables."
      );
    }

    // Add retry logic
    const MAX_RETRIES = 3;
    let retryCount = 0;
    let lastError;

    while (retryCount < MAX_RETRIES) {
      try {
        console.log(
          `Making forecast API request (Attempt ${
            retryCount + 1
          }/${MAX_RETRIES})`
        );

        const response = await axios.get(`${BASE_URL}/air_pollution/forecast`, {
          params: {
            lat,
            lon,
            appid: OPENWEATHER_API_KEY,
          },
          timeout: 30000, // 30 second timeout
        });

        if (
          !response.data ||
          !response.data.list ||
          response.data.list.length === 0
        ) {
          throw new Error(
            "Invalid forecast data received from OpenWeather API"
          );
        }

        // Extract the next 24 hours (usually 24 data points, 1 per hour)
        const next24Hours = response.data.list.slice(0, 24).map((item: any) => {
          // Convert OpenWeather AQI to standard AQI for each forecast item
          const openWeatherAqi = item.main.aqi;
          const standardAqi = convertToStandardAQI(
            openWeatherAqi,
            item.components
          );
          return {
            timestamp: item.dt * 1000, // Convert to milliseconds
            airQuality: standardAqi, // Use the converted standard AQI
            openWeatherAqi: openWeatherAqi, // Keep original for reference
            level: getAqiCategory(standardAqi).level,
            color: getAqiColor(standardAqi),
            components: item.components,
          };
        });

        return {
          forecast: next24Hours,
          location: { lat, lon },
        };
      } catch (error) {
        lastError = error;
        retryCount++;
        console.error(
          `Forecast API request failed (Attempt ${retryCount}/${MAX_RETRIES}):`,
          error
        );

        // Wait before retrying with increasing backoff
        if (retryCount < MAX_RETRIES) {
          const delay = retryCount * 1000;
          console.log(`Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // If we got here, all retries failed
    throw lastError || new Error("All API retry attempts failed");
  } catch (error) {
    console.error("Error in getAirQualityForecast:", error);
    throw error; // Propagate the error to be handled by the route handler
  }
}

// Keep this for backward compatibility
export const airQualityService = {
  setApiKey,
  getCurrentAirQuality,
  getAirQualityComponents,
  getAirQualityForecast,
};
