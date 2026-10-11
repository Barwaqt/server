import * as s from "../services/finance.service.js";
export const remittance = async (req, res) =>
  res.status(201).json({ data: await s.remittance(req.user, req.input.body) });
export const createSettlement = async (req, res) =>
  res
    .status(201)
    .json({
      data: await s.createSettlement(req.user, req.input.body.vendorId),
    });
export const updateSettlement = async (req, res) =>
  res.json({
    data: await s.updateSettlement(req.user, req.params.id, req.input.body),
  });
export const refund = async (req, res) =>
  res
    .status(201)
    .json({ data: await s.refund(req.user, req.params.id, req.input.body) });
export const settlements = async (req, res) =>
  res.json({ data: await s.settlements(req.user) });
export const summary = async (req, res) =>
  res.json({ data: await s.vendorSummary(req.user) });
