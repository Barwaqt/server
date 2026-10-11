import { db } from "../config/database.js";
export const publicUser = {
  id: true,
  email: true,
  phone: true,
  role: true,
  firstName: true,
  lastName: true,
  profile: true,
  active: true,
  createdAt: true,
};
export const findIdentity = (identity) =>
  db.user.findFirst({
    where: { OR: [{ email: identity.toLowerCase() }, { phone: identity }] },
  });
export const findUser = (id) =>
  db.user.findUnique({ where: { id }, select: publicUser });
