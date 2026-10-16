import * as s from "../services/homepage.service.js";
export const get = async (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ data: await s.get() });
};
export const publish = async (req, res) =>
  res.json({ data: await s.publish(req.user, req.input.body) });
