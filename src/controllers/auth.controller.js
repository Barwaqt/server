import * as service from "../services/auth.service.js";
import { findUser } from "../models/user.model.js";
export const register = async (req, res) =>
  res.status(201).json({ data: await service.register(req.input.body) });
export const login = async (req, res) =>
  res.json({ data: await service.login(req.input.body) });
export const refresh = async (req, res) =>
  res.json({ data: await service.refresh(req.input.body.refreshToken) });
export const logout = async (req, res) => {
  await service.logout(req.sessionId);
  res.status(204).end();
};
export const me = async (req, res) =>
  res.json({ data: await findUser(req.user.id) });
export const changePassword = async (req, res) =>
  res.json({ data: await service.changePassword(req.user, req.input.body) });
