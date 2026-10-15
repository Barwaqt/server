import * as s from "../services/payment.service.js";
export const accounts = async (req, res) =>
  res.json({ data: await s.accounts(req.user?.role === "ADMIN") });
export const saveAccount = async (req, res) =>
  res.json({ data: await s.saveAccount(req.user, req.input.body) });
export const list = async (req, res) =>
  res.json({ data: await s.list(req.user, req.input.query) });
export const submit = async (req, res) =>
  res
    .status(201)
    .json({ data: await s.submit(req.user, req.params.id, req.input.body) });
export const review = async (req, res) =>
  res.json({ data: await s.review(req.user, req.params.id, req.input.body) });
