import axios from "axios";
import * as dotenv from "dotenv";

// Ensure environment variables are loaded
dotenv.config();

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;

// Debug the API key (remove in production)
console.log(
  "API Key being used:",
  OPENWEATHER_API_KEY ? "API key is set" : "API key is NOT set"
);

if (!OPENWEATHER_API_KEY) {
  console.error(
    "WARNING: OpenWeather API key is not set in environment variables!"
  );
}

const BASE_URL = "http://api.openweathermap.org/data/2.5";

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

export const airQualityService = {
  async getCurrentAirQuality(lat: string, lon: string) {
    try {
      console.log(
        `Fetching air quality for: ${lat}, ${lon} with API key: ${OPENWEATHER_API_KEY?.substring(
          0,
          5
        )}...`
      );

      const response = await axios.get(`${BASE_URL}/air_pollution`, {
        params: {
          lat,
          lon,
          appid: OPENWEATHER_API_KEY,
        },
      });

      // Log the full response for debugging
      console.log(
        "OpenWeather API Response:",
        JSON.stringify(response.data, null, 2)
      );

      const data = response.data.list[0];
      const openWeatherAqi = data.main.aqi;

      // Convert to standard AQI
      const standardAqi = convertToStandardAQI(openWeatherAqi, data.components);
      const aqiCategory = getAqiCategory(standardAqi);

      console.log(
        `OpenWeather AQI: ${openWeatherAqi}, Converted to standard AQI: ${standardAqi}`
      );
      console.log(`AQI Category: ${aqiCategory.level}`);
      console.log("Air quality components:", data.components);

      return {
        timestamp: data.dt * 1000, // Convert to milliseconds
        aqi: standardAqi, // Use the converted standard AQI
        openWeatherAqi: openWeatherAqi, // Keep original for reference
        level: aqiCategory.level,
        description: aqiCategory.description,
        color: getAqiColor(standardAqi),
        components: data.components,
        location: { lat, lon },
      };
    } catch (error) {
      console.error("Error in getCurrentAirQuality:", error);
      throw error;
    }
  },

  async getAirQualityComponents(lat: string, lon: string) {
    try {
      console.log(`Fetching air quality components for: ${lat}, ${lon}`);

      const response = await axios.get(`${BASE_URL}/air_pollution`, {
        params: {
          lat,
          lon,
          appid: OPENWEATHER_API_KEY,
        },
      });

      const components = response.data.list[0].components;

      return {
        co: { value: components.co, unit: "μg/m³", name: "Carbon Monoxide" },
        no: { value: components.no, unit: "μg/m³", name: "Nitrogen Monoxide" },
        no2: { value: components.no2, unit: "μg/m³", name: "Nitrogen Dioxide" },
        o3: { value: components.o3, unit: "μg/m³", name: "Ozone" },
        so2: { value: components.so2, unit: "μg/m³", name: "Sulphur Dioxide" },
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
      console.error("Error in getAirQualityComponents:", error);
      throw error;
    }
  },

  // Add the missing forecast method
  async getAirQualityForecast(lat: string, lon: string) {
    try {
      console.log(`Fetching air quality forecast for: ${lat}, ${lon}`);

      const response = await axios.get(`${BASE_URL}/air_pollution/forecast`, {
        params: {
          lat,
          lon,
          appid: OPENWEATHER_API_KEY,
        },
      });

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
      console.error("Error in getAirQualityForecast:", error);
      throw error;
    }
  },
};
