import axios from "axios";

// Define interface for prediction results
interface PredictionResult {
  timestamp: number;
  aqi: number;
  components?: Record<string, number>;
  confidence?: number;
}

// Mock historical data structure
interface HistoricalData {
  timestamp: number;
  aqi: number;
  components: Record<string, number>;
  weather?: {
    temp: number;
    humidity: number;
    windSpeed: number;
    windDirection: number;
  };
}

// Cache for historical data
const historicalDataCache: HistoricalData[] = [];
const CACHE_LIFETIME = 24 * 60 * 60 * 1000; // 24 hours

export const predictionService = {
  /**
   * Generate hourly predictions for the next 24 hours
   */
  async getHourlyPredictions(
    lat: string,
    lon: string
  ): Promise<PredictionResult[]> {
    try {
      // Get current conditions to use as a starting point
      const currentAQ = await this.getCurrentAirQuality(lat, lon);
      const history = await this.getHistoricalData();

      // Generate hourly forecasts
      const hourlyPredictions: PredictionResult[] = [];
      const now = Date.now();
      const hourMs = 60 * 60 * 1000;

      for (let i = 0; i < 24; i++) {
        const timestamp = now + i * hourMs;
        const hour = new Date(timestamp).getHours();

        // Factors that affect hourly AQI
        const hourFactor = this.getHourlyFactor(hour);
        const randomVariation = Math.random() * 10 - 5;

        // Statistical prediction using time patterns
        let aqi = currentAQ.aqi * hourFactor + randomVariation;
        // Keep AQI in reasonable range
        aqi = Math.max(20, Math.min(300, aqi));

        // Components follow from base AQI with some variation
        const components = {
          pm2_5: aqi * 0.6 + Math.random() * 5,
          pm10: aqi * 1.2 + Math.random() * 10,
          o3: Math.max(
            10,
            aqi * 0.3 * this.getOzoneFactor(hour) + Math.random() * 15
          ),
          no2: Math.max(
            5,
            aqi * 0.2 * this.getNO2Factor(hour) + Math.random() * 5
          ),
          so2: Math.max(2, aqi * 0.1 + Math.random() * 3),
          co: Math.max(200, aqi * 5 + Math.random() * 50),
        };

        hourlyPredictions.push({
          timestamp,
          aqi: Math.round(aqi),
          components,
          confidence: 0.7 - i * 0.02, // Confidence decreases with time
        });
      }

      return hourlyPredictions;
    } catch (error) {
      console.error("Error generating hourly predictions:", error);
      throw new Error("Failed to generate hourly predictions");
    }
  },

  /**
   * Generate daily predictions for the next 7 days
   */
  async getWeeklyPredictions(
    lat: string,
    lon: string
  ): Promise<PredictionResult[]> {
    try {
      // Get current conditions to use as a starting point
      const currentAQ = await this.getCurrentAirQuality(lat, lon);
      const history = await this.getHistoricalData();

      // Generate daily forecasts
      const weeklyPredictions: PredictionResult[] = [];
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;

      for (let i = 1; i <= 7; i++) {
        const timestamp = now + i * dayMs;
        const date = new Date(timestamp);
        const dayOfWeek = date.getDay();

        // Factors that affect daily AQI
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const weekdayFactor = isWeekend ? 0.85 : 1.15; // Weekends typically have better air quality

        // Statistical prediction based on day of week and some randomness
        const baseAQI = currentAQ.aqi * weekdayFactor;
        const randomFactor = 0.9 + Math.random() * 0.2; // 0.9-1.1 random multiplier
        let aqi = baseAQI * randomFactor;
        // Keep AQI in reasonable range
        aqi = Math.max(20, Math.min(200, aqi));

        weeklyPredictions.push({
          timestamp,
          aqi: Math.round(aqi),
          confidence: 0.8 - i * 0.1, // Confidence decreases with days ahead
        });
      }

      return weeklyPredictions;
    } catch (error) {
      console.error("Error generating weekly predictions:", error);
      throw new Error("Failed to generate weekly predictions");
    }
  },

  /**
   * Get historical AQI data for model training
   */
  async getHistoricalData(): Promise<HistoricalData[]> {
    // If we have cached data that's still fresh, use it
    if (historicalDataCache.length > 0) {
      const cacheAge = Date.now() - historicalDataCache[0].timestamp;
      if (cacheAge < CACHE_LIFETIME) {
        return historicalDataCache;
      }
    }

    try {
      // In a real implementation, you would fetch from a database or external API
      // For now, return mock data
      const mockData = this.generateMockHistoricalData();

      // Update cache
      historicalDataCache.length = 0;
      historicalDataCache.push(...mockData);

      return mockData;
    } catch (error) {
      console.error("Error fetching historical data:", error);
      return [];
    }
  },

  /**
   * Generate mock historical data for development
   */
  generateMockHistoricalData(): HistoricalData[] {
    const data: HistoricalData[] = [];
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    // Generate 30 days of historical data
    for (let i = 30; i >= 0; i--) {
      const timestamp = now - i * dayMs;
      const date = new Date(timestamp);

      // Create patterns: weekday effect, seasonal trend
      const dayOfWeek = date.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const weekdayFactor = isWeekend ? 0.8 : 1.2;

      // Add some seasonal variation
      const month = date.getMonth();
      const seasonFactor = month >= 5 && month <= 8 ? 1.3 : 1.0; // Summer months have worse air quality

      // Base AQI with patterns
      const baseAQI =
        50 + 20 * Math.sin((i / 7) * Math.PI) * weekdayFactor * seasonFactor;
      const aqi = Math.max(
        20,
        Math.min(150, baseAQI + Math.random() * 20 - 10)
      );

      data.push({
        timestamp,
        aqi,
        components: {
          pm2_5: aqi * 0.6 + Math.random() * 10,
          pm10: aqi * 1.2 + Math.random() * 15,
          o3: Math.max(10, aqi * 0.3 + Math.random() * 20),
          no2: Math.max(5, aqi * 0.2 + Math.random() * 10),
          so2: Math.max(2, aqi * 0.1 + Math.random() * 5),
          co: Math.max(200, aqi * 5 + Math.random() * 100),
        },
        weather: {
          temp: 25 + Math.random() * 10 - 5,
          humidity: 60 + Math.random() * 20 - 10,
          windSpeed: 10 + Math.random() * 10 - 5,
          windDirection: Math.random() * 360,
        },
      });
    }

    return data;
  },

  /**
   * Get current air quality data as a baseline for predictions
   */
  async getCurrentAirQuality(
    lat: string,
    lon: string
  ): Promise<{ aqi: number; components: Record<string, number> }> {
    try {
      // Try to get current AQ from backend API
      const response = await axios.get(
        `http://localhost:3001/api/current?lat=${lat}&lon=${lon}`
      );
      return {
        aqi: response.data.aqi,
        components: response.data.components,
      };
    } catch (error) {
      console.error("Error fetching current air quality:", error);
      // Fallback to default values
      return {
        aqi: 50,
        components: {
          pm2_5: 30,
          pm10: 60,
          o3: 15,
          no2: 10,
          so2: 5,
          co: 250,
        },
      };
    }
  },

  /**
   * Factor based on hour of day for hourly AQI variations
   */
  getHourlyFactor(hour: number): number {
    // AQI typically higher in morning (7-9am) and evening (4-7pm) rush hours
    if (hour >= 7 && hour <= 9) return 1.15;
    if (hour >= 16 && hour <= 19) return 1.2;
    // Lower at night
    if (hour >= 0 && hour <= 5) return 0.85;
    // Default for other hours
    return 1.0;
  },

  /**
   * Factor for ozone levels based on hour (peaks in afternoon)
   */
  getOzoneFactor(hour: number): number {
    // Ozone peaks in afternoon due to sunlight
    if (hour >= 12 && hour <= 18) return 1.4;
    if (hour >= 19 && hour <= 21) return 1.2;
    if (hour >= 0 && hour <= 6) return 0.6;
    return 1.0;
  },

  /**
   * Factor for NO2 levels based on hour (peaks during rush hours)
   */
  getNO2Factor(hour: number): number {
    // NO2 peaks during rush hours due to traffic
    if (hour >= 7 && hour <= 9) return 1.3;
    if (hour >= 16 && hour <= 19) return 1.4;
    if (hour >= 0 && hour <= 5) return 0.7;
    return 1.0;
  },
};
