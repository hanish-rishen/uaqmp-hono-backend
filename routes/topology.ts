import { Hono } from "hono";
import axios from "axios";

const app = new Hono();

// Get elevation data for a grid around a center point
app.get("/elevation-grid", async (c) => {
  try {
    // Get parameters from request
    const centerLat = parseFloat(c.req.query("centerLat") || "0");
    const centerLon = parseFloat(c.req.query("centerLon") || "0");
    const gridSize = parseInt(c.req.query("gridSize") || "10");
    const spacing = parseFloat(c.req.query("spacing") || "0.005");

    console.log(
      `Generating elevation grid for: ${centerLat}, ${centerLon}, size: ${gridSize}`
    );

    // Generate simulated elevation data (since we don't have real OpenTopography API access)
    const points = generateSimulatedElevationData(
      centerLat,
      centerLon,
      gridSize,
      spacing
    );

    // Return the elevation points
    return c.json({
      center: { lat: centerLat, lon: centerLon },
      points: points,
    });
  } catch (error) {
    console.error("Error handling elevation grid request:", error);
    return c.json({ error: "Failed to fetch elevation data" }, 500);
  }
});

// Function to generate simulated elevation data
function generateSimulatedElevationData(
  centerLat: number,
  centerLon: number,
  gridSize: number,
  spacing: number
) {
  const points = [];
  const baseElevation = Math.floor(Math.random() * 200) + 50; // Random base elevation between 50-250m

  // Create a grid of points with simulated elevations
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      const lat = centerLat + (i - gridSize / 2) * spacing;
      const lon = centerLon + (j - gridSize / 2) * spacing;

      // Create a natural-looking elevation pattern with some randomness
      const distFromCenter = Math.sqrt(
        Math.pow(i - gridSize / 2, 2) + Math.pow(j - gridSize / 2, 2)
      );

      // Elevation formula with some noise and gradients
      const noise = Math.sin(i * 0.5) * Math.cos(j * 0.5) * 20;
      const gradient = distFromCenter * 2;
      const elevation = baseElevation + noise + gradient;

      points.push({
        lat,
        lon,
        elevation: Math.max(1, Math.round(elevation)),
      });
    }
  }

  return points;
}

export const topologyRoutes = app;
