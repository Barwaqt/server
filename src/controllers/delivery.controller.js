import * as s from "../services/delivery.service.js";
export const list = async (req, res) =>
  res.json({ data: await s.list(req.user, req.input.query) });
export const create = async (req, res) =>
  res.status(201).json({ data: await s.save(req.user, null, req.input.body) });
export const update = async (req, res) =>
  res.json({ data: await s.save(req.user, req.params.id, req.input.body) });
