// Type definitions for global air quality data

declare global {
  var lastAirQualityData: {
    aqi: number;
    level: string;
    components: Record<string, number>;
    location: { lat: string; lon: string };
    timestamp: number;
  } | null;
}

export {};
