/**
 * OpenWeather Air Quality Index (AQI) Explanation
 *
 * OpenWeather API uses a scale from 1-5 for AQI:
 *
 * 1 - Good: Air quality is satisfactory, and air pollution poses little or no risk.
 * 2 - Fair: Air quality is acceptable. However, there may be a risk for some people, particularly those who are unusually sensitive to air pollution.
 * 3 - Moderate: Members of sensitive groups may experience health effects. The general public is less likely to be affected.
 * 4 - Poor: Some members of the general public may experience health effects; members of sensitive groups may experience more serious health effects.
 * 5 - Very Poor: Health alert: The risk of health effects is increased for everyone.
 *
 * This differs from other AQI standards like US EPA which uses a scale from 0-500.
 *
 * Pollutant concentration thresholds for components:
 * - PM2.5: >10 μg/m³ is considered moderate
 * - PM10: >20 μg/m³ is considered moderate
 * - O3 (Ozone): >60 μg/m³ is considered moderate
 * - NO2: >40 μg/m³ is considered moderate
 * - SO2: >20 μg/m³ is considered moderate
 * - CO: >4000 μg/m³ is considered moderate
 *
 * These thresholds might vary in different regions and countries.
 */

export {}; // This makes the file a module
