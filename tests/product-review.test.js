import { test } from "node:test";
import assert from "node:assert/strict";
import { reviewReset } from "../src/utils/product-review.js";
import { productReview } from "../src/validators/admin.validator.js";
const approved = {
  reviewStatus: "APPROVED",
  name: "Title",
  slug: "title",
  categoryId: "category",
  description: "Description",
  priceMinor: 1000,
  images: ["/one.png"],
  attributes: { Size: "Large", Color: "Blue" },
};
test("listing edits require review; inventory and visibility changes do not", () => {
  for (const input of [
    { name: "Changed" },
    { slug: "changed" },
    { categoryId: "other" },
    { description: "Changed" },
    { priceMinor: 2000 },
    { images: ["/two.png"] },
    { attributes: { Size: "Small" } },
  ])
    assert.equal(reviewReset(approved, input).reviewStatus, "PENDING");
  for (const input of [
    { stock: 10 },
    { active: true },
    { ...approved, attributes: { Color: "Blue", Size: "Large" } },
  ])
    assert.deepEqual(reviewReset(approved, input), {});
  assert.equal(
    reviewReset({ ...approved, reviewStatus: "REJECTED" }, { name: "Title" })
      .reviewStatus,
    "PENDING",
  );
  assert.deepEqual(
    reviewReset({ ...approved, reviewStatus: "REJECTED" }, { active: true }),
    {},
  );
});
test("variant content edits require review but variant stock changes do not", () => {
  const withVariants = {
    ...approved,
    variants: [{ id: "v1", name: "Size: M", priceMinor: 1200, stock: 2 }],
  };
  assert.deepEqual(
    reviewReset(withVariants, {
      variants: [{ id: "v1", name: "Size: M", priceMinor: 1200, stock: 9 }],
    }),
    {},
  );
  for (const variants of [
    [{ id: "v1", name: "Size: L", priceMinor: 1200, stock: 2 }],
    [{ id: "v1", name: "Size: M", priceMinor: 1500, stock: 2 }],
    [
      { id: "v1", name: "Size: M", priceMinor: 1200, stock: 2 },
      { name: "Size: L", priceMinor: 1500, stock: 1 },
    ],
    [],
  ])
    assert.equal(
      reviewReset(withVariants, { variants }).reviewStatus,
      "PENDING",
    );
});
test("review decisions require a current version and rejection reason", () => {
  assert.equal(
    productReview.safeParse({
      decision: "REJECTED",
      reviewVersion: 1,
      reason: "   ",
    }).success,
    false,
  );
  assert.equal(
    productReview.safeParse({ decision: "APPROVED" }).success,
    false,
  );
  assert.equal(
    productReview.safeParse({
      decision: "APPROVED",
      reviewVersion: 1,
      active: true,
    }).success,
    false,
  );
  assert.equal(
    productReview.parse({
      decision: "REJECTED",
      reviewVersion: 1,
      reason: "  Fix images  ",
    }).reason,
    "Fix images",
  );
});
