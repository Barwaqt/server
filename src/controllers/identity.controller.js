import * as service from "../services/identity.service.js";
export const providers = (req, res) => res.json({ data: service.providers() });
export const forgotPassword = async (req, res) =>
  res.json({ data: await service.forgotPassword(req.input.body) });
export const resetPassword = async (req, res) =>
  res.json({ data: await service.resetPassword(req.input.body) });
export const challenge = async (req, res) =>
  res.json({ data: await service.challenge(req.input.body.provider) });
export const social = async (req, res) =>
  res.json({ data: await service.social(req.input.body) });
export const link = async (req, res) =>
  res.json({ data: await service.social(req.input.body, req.user) });
