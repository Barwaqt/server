import * as s from "../services/order.service.js";
export const checkout = async (req, res) =>
  res.status(201).json({
    data: await s.checkout(
      req.user,
      req.input.body,
      req.get("Idempotency-Key"),
    ),
  });
export const list = async (req, res) =>
  res.json({ data: await s.list(req.user, req.input.query) });
export const get = async (req, res) =>
  res.json({ data: await s.get(req.user, req.params.id) });
export const transition = async (req, res) =>
  res.json({
    data: await s.transition(req.user, req.params.id, req.input.body),
  });
export const assign = async (req, res) =>
  res.json({
    data: await s.assign(req.user, req.params.id, req.input.body.riderId),
  });
export const location = async (req, res) =>
  res.json({ data: await s.location(req.user, req.params.id, req.input.body) });
export const resetPin = async (req, res) =>
  res.json({ data: await s.resetPin(req.user, req.params.id) });
