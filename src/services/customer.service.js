import { db, transaction } from "../config/database.js";
import { assert } from "../utils/error.js";
export const addresses = (user) =>
  db.address.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
export async function saveAddress(user, id, input) {
  if (id) {
    assert(
      await db.address.findFirst({ where: { id, userId: user.id } }),
      404,
      "Address not found",
    );
    return db.address.update({ where: { id }, data: input });
  }
  return db.address.create({ data: { ...input, userId: user.id } });
}
export const deleteAddress = (user, id) =>
  db.address.deleteMany({ where: { id, userId: user.id } });
export const cart = (user) =>
  db.cartItem.findMany({
    where: {
      userId: user.id,
      product: {
        active: true,
        reviewStatus: "APPROVED",
        vendor: { status: "APPROVED" },
      },
    },
    include: {
      product: {
        include: {
          vendor: {
            select: {
              id: true,
              name: true,
              status: true,
              city: true,
              zone: true,
            },
          },
        },
      },
    },
  });
export async function updateCart(user, productId, quantity) {
  if (!quantity)
    return db.cartItem.deleteMany({ where: { userId: user.id, productId } });
  const product = await db.product.findFirst({
    where: {
      id: productId,
      active: true,
      reviewStatus: "APPROVED",
      vendor: { status: "APPROVED" },
    },
  });
  assert(product, 404, "Product not found");
  assert(product.stock >= quantity, 409, "Insufficient stock");
  return db.cartItem.upsert({
    where: { userId_productId: { userId: user.id, productId } },
    create: { userId: user.id, productId, quantity },
    update: { quantity },
  });
}
export const wishlist = (user) =>
  db.wishlistItem.findMany({
    where: {
      userId: user.id,
      product: {
        active: true,
        reviewStatus: "APPROVED",
        vendor: { status: "APPROVED" },
      },
    },
    include: { product: true },
  });
export async function saveWishlist(user, productId) {
  assert(
    await db.product.findFirst({
      where: {
        id: productId,
        active: true,
        reviewStatus: "APPROVED",
        vendor: { status: "APPROVED" },
      },
    }),
    404,
    "Product not found",
  );
  return db.wishlistItem.upsert({
    where: { userId_productId: { userId: user.id, productId } },
    create: { userId: user.id, productId },
    update: {},
  });
}
export const removeWishlist = (user, productId) =>
  db.wishlistItem.deleteMany({ where: { userId: user.id, productId } });
export async function review(user, productId, input) {
  assert(
    await db.orderItem.findFirst({
      where: {
        productId,
        vendorOrder: { status: "DELIVERED", order: { customerId: user.id } },
      },
    }),
    403,
    "Only customers with a delivered purchase can review",
  );
  return db.review.upsert({
    where: { userId_productId: { userId: user.id, productId } },
    create: { userId: user.id, productId, ...input },
    update: input,
  });
}
