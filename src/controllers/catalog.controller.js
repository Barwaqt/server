import * as s from "../services/catalog.service.js";
export const categories = async (req, res) =>
  res.json({ data: await s.categoryList() });
export const products = async (req, res) =>
  res.json({ data: await s.products(req.input.query) });
export const product = async (req, res) =>
  res.json({ data: await s.product(req.params.id) });
export const vendorProducts = async (req, res) =>
  res.json({ data: await s.vendorProducts(req.user, req.input.query) });
export const create = async (req, res) =>
  res
    .status(201)
    .json({ data: await s.saveProduct(req.user, null, req.input.body) });
export const update = async (req, res) =>
  res.json({
    data: await s.saveProduct(req.user, req.params.id, req.input.body),
  });

export const vendors = async (req, res) =>
  res.json({ data: await s.vendors(req.input.query) });
export const vendor = async (req, res) =>
  res.json({ data: await s.vendor(req.params.vendorId) });
