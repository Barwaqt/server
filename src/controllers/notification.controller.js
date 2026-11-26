import * as service from "../services/notification.service.js";
export const list = async (req, res) =>
  res.json({ data: await service.list(req.user) });
export const markRead = async (req, res) =>
  res.json({ data: await service.markRead(req.user, req.params.id) });
export const badges = async (req, res) =>
  res.json({ data: await service.badgeCounts(req.user) });
export const registerDevice = async (req, res) =>
  res
    .status(201)
    .json({ data: await service.registerDevice(req.user, req.input.body) });
export const unregisterDevice = async (req, res) =>
  res.json({
    data: await service.unregisterDevice(req.user, req.input.body.token),
  });
