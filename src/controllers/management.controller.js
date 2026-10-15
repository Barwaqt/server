import * as s from "../services/management.service.js";
export const categories = async (req, res) =>
  res.json({ data: await s.categories(req.input.query) });
export const createCategory = async (req, res) =>
  res
    .status(201)
    .json({ data: await s.saveCategory(req.user, null, req.input.body) });
export const updateCategory = async (req, res) =>
  res.json({
    data: await s.saveCategory(req.user, req.params.id, req.input.body),
  });
export const deleteCategory = async (req, res) => {
  await s.deleteCategory(req.user, req.params.id);
  res.status(204).end();
};
export const coupons = async (req, res) =>
  res.json({ data: await s.coupons(req.input.query) });
export const createCoupon = async (req, res) =>
  res
    .status(201)
    .json({ data: await s.saveCoupon(req.user, null, req.input.body) });
export const updateCoupon = async (req, res) =>
  res.json({
    data: await s.saveCoupon(req.user, req.params.id, req.input.body),
  });
export const deleteCoupon = async (req, res) => {
  await s.deleteCoupon(req.user, req.params.id);
  res.status(204).end();
};
