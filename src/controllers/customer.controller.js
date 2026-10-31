import { assert } from "../utils/error.js";
import { normalizePhone } from "../utils/phone.js";
import * as s from "../services/customer.service.js";
import { db } from "../config/database.js";
import { publicUser } from "../models/user.model.js";
export const profile = async (req, res) => {
  const input = { ...req.input.body };
  if (input.phone) input.phone = normalizePhone(input.phone);
  if (input.phone && input.phone !== req.user.phone) {
    assert(
      req.user.email,
      422,
      "Phone-only accounts cannot change their sign-in number here. Contact support.",
    );
    input.phoneVerifiedAt = null;
  }
  return res.json({
    data: await db.user.update({
      where: { id: req.user.id },
      data: input,
      select: publicUser,
    }),
  });
};
export const addresses = async (req, res) =>
  res.json({ data: await s.addresses(req.user) });
export const createAddress = async (req, res) =>
  res
    .status(201)
    .json({ data: await s.saveAddress(req.user, null, req.input.body) });
export const updateAddress = async (req, res) =>
  res.json({
    data: await s.saveAddress(req.user, req.params.id, req.input.body),
  });
export const deleteAddress = async (req, res) => {
  await s.deleteAddress(req.user, req.params.id);
  res.status(204).end();
};
export const cart = async (req, res) =>
  res.json({ data: await s.cart(req.user) });
export const updateCart = async (req, res) =>
  res.json({
    data: await s.updateCart(req.user, req.params.id, req.input.body.quantity),
  });
export const wishlist = async (req, res) =>
  res.json({ data: await s.wishlist(req.user) });
export const saveWishlist = async (req, res) =>
  res.json({ data: await s.saveWishlist(req.user, req.params.id) });
export const removeWishlist = async (req, res) => {
  await s.removeWishlist(req.user, req.params.id);
  res.status(204).end();
};
export const review = async (req, res) =>
  res.json({ data: await s.review(req.user, req.params.id, req.input.body) });
