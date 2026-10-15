import * as s from "../services/return.service.js";
export const list = async (req, res) =>
  res.json({ data: await s.list(req.user, req.input.query) });
export const create = async (req, res) =>
  res.status(201).json({ data: await s.create(req.user, req.input.body) });
export const action = async (req, res) =>
  res.json({ data: await s.action(req.user, req.params.id, req.input.body) });
