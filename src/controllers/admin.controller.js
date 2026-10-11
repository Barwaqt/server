import * as s from "../services/admin.service.js";
import { db } from "../config/database.js";
export const createVendor = async (req, res) =>
  res
    .status(201)
    .json({ data: await s.createVendor(req.user, req.input.body) });
export const createStaff = async (req, res) =>
  res.status(201).json({ data: await s.createStaff(req.user, req.input.body) });
export const vendors = async (req, res) =>
  res.json({ data: await s.vendors(req.input.query) });
export const updateVendor = async (req, res) =>
  res.json({
    data: await s.updateVendor(req.user, req.params.id, req.input.body),
  });
export const category = async (req, res) =>
  res
    .status(201)
    .json({ data: await db.category.create({ data: req.input.body }) });
export const coupon = async (req, res) =>
  res
    .status(201)
    .json({ data: await db.coupon.create({ data: req.input.body }) });
export const report = async (req, res) => res.json({ data: await s.report() });
export const audits = async (req, res) =>
  res.json({
    data: await db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  });
