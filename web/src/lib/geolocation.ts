export type GeoLocation = {
  city: string;
  province: string;
  country: string;
  postalCode: string;
  latitude: number;
  longitude: number;
};

/**
 * Fetch geolocation based on client IP address
 * Uses multiple fallbacks for reliability
 */
export async function fetchGeoLocation(): Promise<GeoLocation | null> {
  try {
    // Try ipapi.co first (free, no key required, ~3 requests/sec)
    try {
      const response = await fetch("https://ipapi.co/json/", { 
        method: "GET",
        mode: "cors",
        cache: "no-store"
      });
      if (response.ok) {
        const data = await response.json();
        return {
          city: data.city || "Unknown",
          province: data.region || data.region_code || "Unknown",
          country: data.country_name || "South Africa",
          postalCode: data.postal || "0000",
          latitude: data.latitude || 0,
          longitude: data.longitude || 0,
        };
      }
    } catch (e) {
      console.warn("ipapi.co fallback:", e);
    }

    // Fallback: try geolocation-db
    try {
      const response = await fetch("https://geolocation-db.com/json/", { 
        method: "GET",
        mode: "cors",
        cache: "no-store"
      });
      if (response.ok) {
        const data = await response.json();
        return {
          city: data.city || "Unknown",
          province: data.state || "Unknown",
          country: data.country_name || "South Africa",
          postalCode: data.postal || "0000",
          latitude: data.latitude || 0,
          longitude: data.longitude || 0,
        };
      }
    } catch (e) {
      console.warn("geolocation-db fallback:", e);
    }

    // Last fallback: default to Johannesburg, Gauteng
    return {
      city: "Johannesburg",
      province: "Gauteng",
      country: "South Africa",
      postalCode: "2000",
      latitude: -26.1676,
      longitude: 28.0567,
    };
  } catch (e) {
    console.error("Geolocation fetch failed:", e);
    return null;
  }
}

/**
 * Format geolocation as a displayable string
 */
export function formatGeoLocation(geo: GeoLocation | null): string {
  if (!geo) return "Unknown";
  return `${geo.city}, ${geo.province}, ${geo.country}`;
}
