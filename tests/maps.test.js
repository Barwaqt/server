import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ||= "postgresql://test:test@localhost/barwaqt_test";
process.env.JWT_SECRET ||= "maps-unit-test-secret-more-than-32-characters";
process.env.GOOGLE_MAPS_API_KEY = "dummy_for_tests";

const mapsService = await import("../src/services/maps.service.js");
const originalFetch = globalThis.fetch;

after(() => {
  globalThis.fetch = originalFetch;
});

test("mapsConfigured returns false for dummy or empty API keys", () => {
  assert.equal(mapsService.mapsConfigured(), false);
});

test("searchLocations validates query and returns matches", async () => {
  await assert.rejects(
    async () => mapsService.searchLocations({ query: "" }),
    { status: 422 },
  );

  const results = await mapsService.searchLocations({ query: "F-7" });
  assert.ok(Array.isArray(results));
  assert.ok(results.length > 0);
  assert.ok(results[0].placeId);
  assert.ok(results[0].description.includes("F-7") || results[0].mainText.includes("F-7"));
});

test("reverseGeocode validates coordinates and returns formatted components", async () => {
  await assert.rejects(
    async () => mapsService.reverseGeocode({ latitude: 120, longitude: 73 }),
    { status: 422 },
  );
  await assert.rejects(
    async () => mapsService.reverseGeocode({ latitude: 33, longitude: 200 }),
    { status: 422 },
  );

  const loc = await mapsService.reverseGeocode({ latitude: 33.7215, longitude: 73.0567 });
  assert.ok(loc.formattedAddress);
  assert.ok(loc.city);
  assert.ok(loc.zone);
  assert.equal(loc.latitude, 33.7215);
  assert.equal(loc.longitude, 73.0567);
});

test("getPlaceDetails returns place coordinates and address", async () => {
  await assert.rejects(
    async () => mapsService.getPlaceDetails({ placeId: "" }),
    { status: 422 },
  );

  const details = await mapsService.getPlaceDetails({ placeId: "barwaqt-mock-f7-isb" });
  assert.equal(details.placeId, "barwaqt-mock-f7-isb");
  assert.equal(details.city, "Islamabad");
  assert.equal(details.zone, "F-7");
  assert.equal(details.latitude, 33.7215);
  assert.equal(details.longitude, 73.0567);
});

test("Google Maps API parses real Google Geocode and Places payloads when configured", async () => {
  const { env } = await import("../src/config/env.js");
  const previousKey = env.GOOGLE_MAPS_API_KEY;
  env.GOOGLE_MAPS_API_KEY = "AIzaSyRealApiKeyForTestingParsing123456";

  try {
    globalThis.fetch = async (url) => {
      const u = new URL(url);
      if (u.pathname.includes("autocomplete")) {
        return Response.json({
          status: "OK",
          predictions: [
            {
              place_id: "google-place-1",
              description: "Kohsar Market, F-6/3, Islamabad, Pakistan",
              structured_formatting: {
                main_text: "Kohsar Market",
                secondary_text: "F-6/3, Islamabad, Pakistan",
              },
            },
          ],
        });
      }
      if (u.pathname.includes("geocode")) {
        return Response.json({
          status: "OK",
          results: [
            {
              place_id: "google-geo-1",
              formatted_address: "Street 10, F-7/1, Islamabad, Pakistan",
              address_components: [
                { long_name: "10", types: ["street_number"] },
                { long_name: "Street 10", types: ["route"] },
                { long_name: "F-7", types: ["neighborhood", "sublocality"] },
                { long_name: "Islamabad", types: ["locality"] },
                { long_name: "Pakistan", types: ["country"] },
              ],
            },
          ],
        });
      }
      return Response.json({ status: "ZERO_RESULTS" });
    };

    assert.equal(mapsService.mapsConfigured(), true);

    const searchRes = await mapsService.searchLocations({ query: "Kohsar" });
    assert.equal(searchRes[0].placeId, "google-place-1");
    assert.equal(searchRes[0].mainText, "Kohsar Market");

    const geoRes = await mapsService.reverseGeocode({ latitude: 33.72, longitude: 73.05 });
    assert.equal(geoRes.placeId, "google-geo-1");
    assert.equal(geoRes.city, "Islamabad");
    assert.equal(geoRes.zone, "F-7");
    assert.equal(geoRes.street, "10 Street 10");
  } finally {
    env.GOOGLE_MAPS_API_KEY = previousKey;
    globalThis.fetch = originalFetch;
  }
});

