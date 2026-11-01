import { Router } from "express";
import * as c from "../controllers/maps.controller.js";

export const mapsRouter = Router();

mapsRouter.get("/config", c.config);
mapsRouter.get("/search", c.search);
mapsRouter.get("/autocomplete", c.search);
mapsRouter.get("/reverse-geocode", c.reverseGeocode);
mapsRouter.get("/place-details", c.placeDetails);

