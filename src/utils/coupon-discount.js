import { allocate, percentage } from "./money.js";
import { assert } from "./error.js";
export function categoryDiscount(groups, coupon) {
  const selected = new Set(coupon.categoryIds || []);
  const weights = groups.map((items) =>
    items.reduce(
      (sum, item) =>
        sum +
        (selected.has(item.product.categoryId)
          ? item.product.priceMinor * item.quantity
          : 0),
      0,
    ),
  );
  const eligibleSubtotal = weights.reduce((sum, value) => sum + value, 0);
  assert(
    eligibleSubtotal > 0,
    422,
    "Coupon does not apply to the categories in your cart",
  );
  assert(
    eligibleSubtotal >= coupon.minSubtotalMinor,
    422,
    "Eligible category subtotal is below the coupon minimum",
  );
  const discount = Math.min(
    percentage(eligibleSubtotal, coupon.percentBps),
    coupon.maxDiscountMinor,
  );
  // Exclude zero-weight vendors from rounding so they never receive a discount.
  const shares = allocate(
    discount,
    weights.filter((value) => value > 0),
  );
  let index = 0;
  return {
    discount,
    discounts: weights.map((value) => (value > 0 ? shares[index++] : 0)),
  };
}
