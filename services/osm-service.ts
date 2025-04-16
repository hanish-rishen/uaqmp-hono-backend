import axios from "axios";

// Import osmtogeojson using require to avoid TypeScript module resolution issues
// @ts-ignore - Ignore the type error for the require statement
const osmtogeojson = require("osmtogeojson");

// Define GeoJSON types inline
namespace GeoJSON {
  export interface FeatureCollection {
    type: "FeatureCollection";
    features: Feature[];
  }

  export interface Feature {
    type: string;
    geometry: any;
    properties: {
      [key: string]: any;
      featureType?: string;
    };
  }
}

// Define allowed feature types
const allowedFeatureTypes = [
  "building",
  "park",
  "hospital",
  "school",
  "industrial",
  "retail",
] as const; // Use 'as const' for stricter typing

// Define the type based on the allowed values
export type OsmFeatureType = (typeof allowedFeatureTypes)[number]; // Add export here

const OVERPASS_API_URL = "https://overpass-api.de/api/interpreter"; // Public Overpass API endpoint

// Map feature types to Overpass query tags
const featureTags: Record<OsmFeatureType, string> = {
  building: `"building"`, // Generic buildings
  park: `"leisure"="park"`, // Parks
  hospital: `"amenity"="hospital"`, // Hospitals
  school: `"amenity"="school"`, // Schools
  industrial: `"landuse"="industrial"`, // Industrial areas
  retail: `"landuse"="retail"`, // Retail areas
};

export const osmService = {
  async getFeaturesInBoundingBox(
    bbox: [number, number, number, number], // [minLon, minLat, maxLon, maxLat]
    featureTypes: OsmFeatureType[]
  ): Promise<GeoJSON.FeatureCollection> {
    if (!featureTypes || featureTypes.length === 0) {
      return { type: "FeatureCollection", features: [] };
    }

    // Construct the Overpass QL query
    // Bbox format for Overpass is (south, west, north, east) -> (minLat, minLon, maxLat, maxLon)
    const bboxString = `(${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]})`;
    let queryParts: string[] = [];

    featureTypes.forEach((type) => {
      if (featureTags[type]) {
        queryParts.push(`
          node[${featureTags[type]}]${bboxString};
          way[${featureTags[type]}]${bboxString};
          relation[${featureTags[type]}]${bboxString};
        `);
      }
    });

    const query = `
      [out:json][timeout:30];
      (
        ${queryParts.join("")}
      );
      out geom;
    `;

    console.log(
      `Overpass Query for ${featureTypes.join(", ")} in ${bboxString}:`,
      query
    );

    try {
      const response = await axios.post(OVERPASS_API_URL, query, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });

      console.log(`Overpass API response status: ${response.status}`);

      // Convert OSM JSON response to GeoJSON
      const geojsonData = osmtogeojson(
        response.data
      ) as GeoJSON.FeatureCollection;

      // Add featureType property for easier frontend styling/filtering
      geojsonData.features.forEach((feature: GeoJSON.Feature) => {
        for (const type of featureTypes) {
          const tagKey = featureTags[type].split("=")[0].replace(/"/g, ""); // e.g., "building", "leisure", "amenity"
          const tagValue = featureTags[type].split("=")[1]?.replace(/"/g, ""); // e.g., "park", "hospital"
          if (feature.properties && feature.properties[tagKey]) {
            if (!tagValue || feature.properties[tagKey] === tagValue) {
              feature.properties.featureType = type;
              break; // Assign first matching type
            }
          }
        }
        // Fallback if no specific type matched (e.g., generic building)
        if (
          feature.properties &&
          !feature.properties.featureType &&
          featureTypes.includes("building") &&
          feature.properties["building"]
        ) {
          feature.properties.featureType = "building";
        }
      });

      console.log(
        `Converted ${geojsonData.features.length} features to GeoJSON.`
      );
      return geojsonData;
    } catch (error: any) {
      console.error(
        "Error querying Overpass API:",
        error.response?.data || error.message
      );
      throw new Error(
        "Failed to fetch data from OpenStreetMap (Overpass API)."
      );
    }
  },
};
