import { env } from "../config/env.js";
import { assert } from "../utils/error.js";

export function mapsConfigured() {
  const key = env.GOOGLE_MAPS_API_KEY || "";
  return Boolean(
    key &&
      key.length > 15 &&
      !key.toLowerCase().startsWith("dummy") &&
      !key.includes("Dummy"),
  );
}

// Built-in Pakistani locations for development, testing, and offline fallback
export const MOCK_LOCATIONS = [
  {
    placeId: "barwaqt-mock-f7-isb",
    name: "F-7 Markaz (Jinnah Super Market)",
    formattedAddress: "F-7 Markaz, Islamabad, Islamabad Capital Territory, Pakistan",
    street: "Jinnah Super Market, College Road",
    zone: "F-7",
    city: "Islamabad",
    country: "Pakistan",
    latitude: 33.7215,
    longitude: 73.0567,
  },
  {
    placeId: "barwaqt-mock-f6-isb",
    name: "F-6 Super Market",
    formattedAddress: "F-6 Super Market, Islamabad, Islamabad Capital Territory, Pakistan",
    street: "Super Market, School Road",
    zone: "F-6",
    city: "Islamabad",
    country: "Pakistan",
    latitude: 33.7294,
    longitude: 73.0734,
  },
  {
    placeId: "barwaqt-mock-f8-isb",
    name: "F-8 Markaz (Ayub Market)",
    formattedAddress: "F-8 Markaz, Islamabad, Islamabad Capital Territory, Pakistan",
    street: "Ayub Market, Kaghan Road",
    zone: "F-8",
    city: "Islamabad",
    country: "Pakistan",
    latitude: 33.7101,
    longitude: 73.0336,
  },
  {
    placeId: "barwaqt-mock-f10-isb",
    name: "F-10 Markaz",
    formattedAddress: "F-10 Markaz, Islamabad, Islamabad Capital Territory, Pakistan",
    street: "Sumbal Road, F-10 Markaz",
    zone: "F-10",
    city: "Islamabad",
    country: "Pakistan",
    latitude: 33.6931,
    longitude: 73.0084,
  },
  {
    placeId: "barwaqt-mock-f11-isb",
    name: "F-11 Markaz",
    formattedAddress: "F-11 Markaz, Islamabad, Islamabad Capital Territory, Pakistan",
    street: "Hilal Road, F-11 Markaz",
    zone: "F-11",
    city: "Islamabad",
    country: "Pakistan",
    latitude: 33.6844,
    longitude: 72.9885,
  },
  {
    placeId: "barwaqt-mock-bluearea-isb",
    name: "Blue Area",
    formattedAddress: "Blue Area, Islamabad, Islamabad Capital Territory, Pakistan",
    street: "Jinnah Avenue, Blue Area",
    zone: "Blue Area",
    city: "Islamabad",
    country: "Pakistan",
    latitude: 33.7142,
    longitude: 73.0645,
  },
  {
    placeId: "barwaqt-mock-bahria-rwp",
    name: "Bahria Town Phase 4",
    formattedAddress: "Bahria Town Phase 4, Rawalpindi, Punjab, Pakistan",
    street: "Civic Center, Boulevard",
    zone: "Bahria Town",
    city: "Rawalpindi",
    country: "Pakistan",
    latitude: 33.5358,
    longitude: 73.1098,
  },
  {
    placeId: "barwaqt-mock-saddar-rwp",
    name: "Saddar",
    formattedAddress: "Saddar, Rawalpindi, Punjab, Pakistan",
    street: "Bank Road, Saddar",
    zone: "Saddar",
    city: "Rawalpindi",
    country: "Pakistan",
    latitude: 33.5984,
    longitude: 73.0541,
  },
  {
    placeId: "barwaqt-mock-gulberg-lhr",
    name: "Gulberg III",
    formattedAddress: "Gulberg III, Lahore, Punjab, Pakistan",
    street: "Main Boulevard Gulberg",
    zone: "Gulberg",
    city: "Lahore",
    country: "Pakistan",
    latitude: 31.5126,
    longitude: 74.3478,
  },
  {
    placeId: "barwaqt-mock-dha-lhr",
    name: "DHA Phase 5",
    formattedAddress: "DHA Phase 5, Lahore, Punjab, Pakistan",
    street: "Main Commercial Area, DHA Phase 5",
    zone: "DHA Phase 5",
    city: "Lahore",
    country: "Pakistan",
    latitude: 31.4697,
    longitude: 74.3986,
  },
  {
    placeId: "barwaqt-mock-clifton-khi",
    name: "Clifton Block 5",
    formattedAddress: "Clifton Block 5, Karachi, Sindh, Pakistan",
    street: "Boat Basin, Clifton",
    zone: "Clifton",
    city: "Karachi",
    country: "Pakistan",
    latitude: 24.8138,
    longitude: 67.0300,
  },
  {
    placeId: "barwaqt-mock-dha-khi",
    name: "DHA Phase 6",
    formattedAddress: "DHA Phase 6, Karachi, Sindh, Pakistan",
    street: "Khayaban-e-Shahbaz, DHA Phase 6",
    zone: "DHA",
    city: "Karachi",
    country: "Pakistan",
    latitude: 24.7937,
    longitude: 67.0643,
  },
];

function parseAddressComponents(components) {
  let streetNumber = "";
  let route = "";
  let zone = "";
  let city = "";
  let country = "Pakistan";

  for (const c of components || []) {
    const types = c.types || [];
    if (types.includes("street_number")) streetNumber = c.long_name;
    else if (types.includes("route")) route = c.long_name;
    else if (
      types.includes("sublocality") ||
      types.includes("sublocality_level_1") ||
      types.includes("neighborhood")
    ) {
      if (!zone) zone = c.long_name;
    } else if (types.includes("administrative_area_level_3") && !zone) {
      zone = c.long_name;
    } else if (types.includes("locality")) {
      city = c.long_name;
    } else if (types.includes("administrative_area_level_2") && !city) {
      city = c.long_name;
    } else if (types.includes("country")) {
      country = c.long_name;
    }
  }

  const street = [streetNumber, route].filter(Boolean).join(" ") || route || zone || "Main Road";
  return { street, zone: zone || "Central", city: city || "Islamabad", country };
}

function findNearestMockLocation(lat, lng) {
  let best = MOCK_LOCATIONS[0];
  let minDistance = Infinity;
  for (const loc of MOCK_LOCATIONS) {
    const d = Math.hypot(loc.latitude - lat, loc.longitude - lng);
    if (d < minDistance) {
      minDistance = d;
      best = loc;
    }
  }
  return best;
}

export async function searchLocations({ query, sessionToken }) {
  assert(typeof query === "string" && query.trim().length > 0, 422, "Search query is required");
  const cleanQuery = query.trim();

  if (mapsConfigured()) {
    try {
      const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
      url.searchParams.set("input", cleanQuery);
      url.searchParams.set("components", "country:pk");
      url.searchParams.set("language", "en");
      url.searchParams.set("key", env.GOOGLE_MAPS_API_KEY);
      if (sessionToken) url.searchParams.set("sessiontoken", sessionToken);

      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(7000) });
      const json = await res.json();

      if (json.status === "OK" && Array.isArray(json.predictions)) {
        return json.predictions.map((p) => ({
          placeId: p.place_id,
          description: p.description,
          mainText: p.structured_formatting?.main_text || p.description,
          secondaryText: p.structured_formatting?.secondary_text || "",
        }));
      }
    } catch {
      // Fall through to mock search if Google API fails or is unreachable
    }
  }

  // Fallback search across built-in Pakistani locations
  const q = cleanQuery.toLowerCase();
  const matched = MOCK_LOCATIONS.filter(
    (loc) =>
      loc.name.toLowerCase().includes(q) ||
      loc.zone.toLowerCase().includes(q) ||
      loc.city.toLowerCase().includes(q) ||
      loc.formattedAddress.toLowerCase().includes(q) ||
      loc.street.toLowerCase().includes(q),
  );

  const results = matched.length > 0 ? matched : MOCK_LOCATIONS.slice(0, 5);
  return results.map((loc) => ({
    placeId: loc.placeId,
    description: loc.formattedAddress,
    mainText: loc.name,
    secondaryText: `${loc.zone}, ${loc.city}, Pakistan`,
    latitude: loc.latitude,
    longitude: loc.longitude,
    city: loc.city,
    zone: loc.zone,
    street: loc.street,
  }));
}

export async function reverseGeocode({ latitude, longitude }) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  assert(
    !Number.isNaN(lat) && lat >= -90 && lat <= 90,
    422,
    "Valid latitude (-90 to 90) is required",
  );
  assert(
    !Number.isNaN(lng) && lng >= -180 && lng <= 180,
    422,
    "Valid longitude (-180 to 180) is required",
  );

  if (mapsConfigured()) {
    try {
      const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
      url.searchParams.set("latlng", `${lat},${lng}`);
      url.searchParams.set("language", "en");
      url.searchParams.set("key", env.GOOGLE_MAPS_API_KEY);

      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(7000) });
      const json = await res.json();

      if (json.status === "OK" && Array.isArray(json.results) && json.results.length > 0) {
        const top = json.results[0];
        const parsed = parseAddressComponents(top.address_components);
        return {
          formattedAddress: top.formatted_address,
          street: parsed.street,
          zone: parsed.zone,
          city: parsed.city,
          country: parsed.country,
          latitude: lat,
          longitude: lng,
          placeId: top.place_id,
        };
      }
    } catch {
      // Fall through to mock reverse geocode
    }
  }

  // Fallback: estimate from nearest known Pakistani point
  const nearest = findNearestMockLocation(lat, lng);
  return {
    formattedAddress: `${nearest.street}, ${nearest.zone}, ${nearest.city}, Pakistan`,
    street: nearest.street,
    zone: nearest.zone,
    city: nearest.city,
    country: nearest.country,
    latitude: lat,
    longitude: lng,
    placeId: `barwaqt-coords-${lat.toFixed(4)}-${lng.toFixed(4)}`,
  };
}

export async function getPlaceDetails({ placeId, sessionToken }) {
  assert(typeof placeId === "string" && placeId.trim().length > 0, 422, "placeId is required");
  const cleanId = placeId.trim();

  if (mapsConfigured() && !cleanId.startsWith("barwaqt-")) {
    try {
      const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
      url.searchParams.set("place_id", cleanId);
      url.searchParams.set("fields", "place_id,name,formatted_address,geometry,address_components");
      url.searchParams.set("language", "en");
      url.searchParams.set("key", env.GOOGLE_MAPS_API_KEY);
      if (sessionToken) url.searchParams.set("sessiontoken", sessionToken);

      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(7000) });
      const json = await res.json();

      if (json.status === "OK" && json.result) {
        const r = json.result;
        const parsed = parseAddressComponents(r.address_components);
        return {
          placeId: r.place_id,
          name: r.name || "",
          formattedAddress: r.formatted_address || "",
          street: parsed.street,
          zone: parsed.zone,
          city: parsed.city,
          country: parsed.country,
          latitude: r.geometry?.location?.lat || 0,
          longitude: r.geometry?.location?.lng || 0,
        };
      }
    } catch {
      // Fall through
    }
  }

  const found = MOCK_LOCATIONS.find((loc) => loc.placeId === cleanId) || MOCK_LOCATIONS[0];
  return {
    placeId: found.placeId,
    name: found.name,
    formattedAddress: found.formattedAddress,
    street: found.street,
    zone: found.zone,
    city: found.city,
    country: found.country,
    latitude: found.latitude,
    longitude: found.longitude,
  };
}

