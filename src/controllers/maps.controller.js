import * as mapsService from "../services/maps.service.js";

export const config = async (req, res) => {
  res.json({
    data: {
      mapsConfigured: mapsService.mapsConfigured(),
      defaultCenter: { latitude: 33.6844, longitude: 73.0479 },
      country: "PK",
    },
  });
};

export const search = async (req, res) => {
  const query = (req.query.query || req.query.q || "").toString();
  const sessionToken = req.query.sessionToken?.toString();
  const data = await mapsService.searchLocations({ query, sessionToken });
  res.json({ data });
};

export const reverseGeocode = async (req, res) => {
  const latitude = req.query.lat || req.query.latitude;
  const longitude = req.query.lng || req.query.longitude;
  const data = await mapsService.reverseGeocode({ latitude, longitude });
  res.json({ data });
};

export const placeDetails = async (req, res) => {
  const placeId = (req.query.placeId || "").toString();
  const sessionToken = req.query.sessionToken?.toString();
  const data = await mapsService.getPlaceDetails({ placeId, sessionToken });
  res.json({ data });
};

