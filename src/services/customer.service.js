import { db, transaction } from "../config/database.js";
import { assert } from "../utils/error.js";
import { reverseGeocode } from "./maps.service.js";
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
export async function saveAddressFromLocation(user, input) {
  const geo = await reverseGeocode({
    latitude: input.latitude,
    longitude: input.longitude,
  });

  const firstName = input.firstName || user.firstName || "Customer";
  const lastName = input.lastName ?? (user.lastName || "");
  const userPhone = input.phone || user.phone;
  assert(userPhone, 422, "Phone number is required for delivery contact");

  const addressData = {
    kind: input.kind || "Home",
    firstName,
    lastName,
    phone: userPhone,
    city: input.city || geo.city || "Islamabad",
    zone: input.zone || geo.zone || "Central",
    street: input.street || geo.street || "Main Road",
    building: input.building || "",
    apartment: input.apartment || "",
    directions: input.directions || "",
    latitude: input.latitude,
    longitude: input.longitude,
    userId: user.id,
  };

  return db.address.create({ data: addressData });
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
      variant: true,
    },
  });
export async function updateCart(user, productId, { quantity, variantId }) {
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
  const variants = await db.productVariant.findMany({ where: { productId } });
  assert(
    !variants.length || variantId,
    422,
    "Choose a variant for this product",
  );
  const variant = variantId
    ? variants.find((item) => item.id === variantId)
    : null;
  assert(!variantId || variant, 404, "Variant not found");
  assert(
    (variant ? variant.stock : product.stock) >= quantity,
    409,
    "Insufficient stock",
  );
  return db.cartItem.upsert({
    where: { userId_productId: { userId: user.id, productId } },
    create: { userId: user.id, productId, quantity, variantId: variant?.id },
    update: { quantity, variantId: variant?.id ?? null },
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
