import * as s from "../services/rider.service.js";
export const shift = async (req, res) =>
  res.json({ data: await s.shift(req.user, req.input.body.action) });
export const shifts = async (req, res) =>
  res.json({ data: await s.shifts(req.user) });
