import * as service from "../services/notification.service.js";
export const list = async (req, res) =>
  res.json({ data: await service.list(req.user) });
export const markRead = async (req, res) =>
  res.json({ data: await service.markRead(req.user, req.params.id) });
