import { Hono } from "hono";
import { osmService, OsmFeatureType } from "../services/osm-service"; // Import OsmFeatureType

const app = new Hono();

// Define allowed feature types (can still be used for validation)
const allowedFeatureTypes: ReadonlyArray<OsmFeatureType> = [
  // Use OsmFeatureType here
  "building",
  "park",
  "hospital",
  "school",
  "industrial",
  "retail",
];

// Endpoint to get OSM features within a bounding box
// Expects bbox as comma-separated string: minLon,minLat,maxLon,maxLat
// Expects types as comma-separated string: building,park,hospital,...
app.get("/features", async (c) => {
  const bboxParam = c.req.query("bbox");
  const typesParam = c.req.query("types");

  if (!bboxParam || !typesParam) {
    return c.json(
      { error: "Missing required query parameters: bbox, types" },
      400
    );
  }

  // Validate and parse bbox
  const bboxParts = bboxParam.split(",").map(Number);
  if (bboxParts.length !== 4 || bboxParts.some(isNaN)) {
    return c.json(
      { error: "Invalid bbox format. Expected: minLon,minLat,maxLon,maxLat" },
      400
    );
  }
  const bbox: [number, number, number, number] = [
    bboxParts[0],
    bboxParts[1],
    bboxParts[2],
    bboxParts[3],
  ];

  // Validate and parse feature types
  const requestedTypes = typesParam.split(",");
  // Filter and assert the type more strongly
  const validTypes = requestedTypes.filter((type): type is OsmFeatureType =>
    allowedFeatureTypes.includes(type as OsmFeatureType)
  );

  if (validTypes.length === 0) {
    return c.json(
      {
        error: `No valid feature types provided. Allowed types: ${allowedFeatureTypes.join(
          ", "
        )}`,
      },
      400
    );
  }

  try {
    console.log(
      `API request received for OSM features: types=${validTypes.join(
        ","
      )}, bbox=${bbox.join(",")}`
    );
    // No cast should be needed now if the filter correctly narrows the type
    const geojsonData = await osmService.getFeaturesInBoundingBox(
      bbox,
      validTypes // Pass validTypes directly
    );
    console.log(`Returning ${geojsonData.features.length} OSM features.`);
    return c.json(geojsonData);
  } catch (error: any) {
    console.error("Error fetching OSM features:", error.message);
    return c.json(
      {
        error: "Failed to fetch OpenStreetMap features",
        details: error.message,
      },
      500
    );
  }
});

export const osmRoutes = app;

// Remove the local definition of OsmFeatureType as it's now imported
// type OsmFeatureType = (typeof allowedFeatureTypes)[number];
