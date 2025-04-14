import { Hono } from "hono";
import { predictionService } from "../services/prediction-service";

const app = new Hono();

// Get hourly predictions (24 hours)
app.get("/hourly", async (c) => {
  try {
    const lat = c.req.query("lat") || "37.7749"; // Default to San Francisco
    const lon = c.req.query("lon") || "-122.4194";

    console.log(
      `API request received for hourly predictions at coordinates: ${lat}, ${lon}`
    );

    const predictions = await predictionService.getHourlyPredictions(lat, lon);

    console.log(`Returning ${predictions.length} hourly predictions`);

    return c.json(predictions);
  } catch (error) {
    console.error("Error generating hourly predictions:", error);
    return c.json({ error: "Failed to generate predictions" }, 500);
  }
});

// Get weekly predictions
app.get("/weekly", async (c) => {
  try {
    const lat = c.req.query("lat") || "37.7749";
    const lon = c.req.query("lon") || "-122.4194";

    console.log(
      `API request received for weekly predictions at coordinates: ${lat}, ${lon}`
    );

    const predictions = await predictionService.getWeeklyPredictions(lat, lon);

    console.log(`Returning ${predictions.length} weekly predictions`);

    return c.json(predictions);
  } catch (error) {
    console.error("Error generating weekly predictions:", error);
    return c.json({ error: "Failed to generate predictions" }, 500);
  }
});

export const predictionRoutes = app;
