import test from "node:test";
import assert from "node:assert/strict";
import { categoryDiscount } from "../src/utils/coupon-discount.js";
import { coupon } from "../src/validators/commerce.validator.js";
const item = (categoryId, priceMinor) => ({
  quantity: 1,
  product: { categoryId, priceMinor },
});
const config = {
  categoryIds: ["a"],
  percentBps: 1000,
  minSubtotalMinor: 0,
  maxDiscountMinor: 100000,
};
test("coupon only discounts selected categories in a mixed cart", () => {
  assert.deepEqual(
    categoryDiscount(
      [[item("a", 1000), item("b", 9000)], [item("b", 5000)]],
      config,
    ),
    { discount: 100, discounts: [100, 0] },
  );
});
test("products listed under the coupon category through a catalog collection are eligible", () => {
  const linked = (categoryId, catalogCategories, priceMinor) => ({
    quantity: 1,
    product: { categoryId, catalogCategories, priceMinor },
  });
  assert.deepEqual(
    categoryDiscount(
      [[linked("b", [{ id: "a" }], 4000), linked("c", [], 6000)]],
      config,
    ),
    { discount: 400, discounts: [400] },
  );
});
test("multiple categories and discount caps are supported", () => {
  assert.deepEqual(
    categoryDiscount([[item("a", 1000)], [item("b", 2000)]], {
      ...config,
      categoryIds: ["a", "b"],
      maxDiscountMinor: 150,
    }),
    { discount: 150, discounts: [50, 100] },
  );
});
test("rounding never discounts ineligible vendors", () => {
  assert.deepEqual(
    categoryDiscount([[item("b", 1000)], [item("a", 1)], [item("a", 1)]], {
      ...config,
      percentBps: 5000,
    }),
    { discount: 1, discounts: [0, 1, 0] },
  );
});
test("unmatched categories and minimums based on ineligible products are rejected", () => {
  assert.throws(() => categoryDiscount([[item("b", 10000)]], config));
  assert.throws(() =>
    categoryDiscount([[item("a", 100), item("b", 10000)]], {
      ...config,
      minSubtotalMinor: 1000,
    }),
  );
  assert.throws(() =>
    categoryDiscount([[item("a", 100)]], { ...config, categoryIds: [] }),
  );
});
test("coupon input requires at least one category", () => {
  const body = {
    code: "TEST",
    percentBps: 1000,
    maxDiscountMinor: 100,
    maxUses: 10,
    expiresAt: "2030-01-01T00:00:00Z",
  };
  assert.equal(coupon.safeParse(body).success, false);
  assert.equal(coupon.safeParse({ ...body, categoryIds: [] }).success, false);
  assert.equal(
    coupon.safeParse({
      ...body,
      categoryIds: ["11111111-1111-4111-8111-111111111111"],
    }).success,
    true,
  );
});
