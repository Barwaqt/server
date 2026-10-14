import * as service from "../services/vendor.service.js";
export const profile = (req, res) => res.json({ data: req.user.vendor });
export const updateProfile = async (req, res) =>
  res.json({ data: await service.updateProfile(req.user, req.input.body) });
