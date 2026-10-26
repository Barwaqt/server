import { searchSuggestions } from "../services/search.service.js";
import * as s from "../services/homepage.service.js";
export const get = async (req, res) => {
  res.set("Cache-Control", "no-store");
  const data = await s.get();
  if (!req.user) {
    data.content.searches.terms = await searchSuggestions(
      data.content.searches,
    );
  }
  res.json({ data });
};
export const publish = async (req, res) =>
  res.json({ data: await s.publish(req.user, req.input.body) });
