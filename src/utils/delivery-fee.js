// Returns the saved delivery fee when it is a valid non-negative integer,
// otherwise the configured fallback. Used by both the admin settings read and
// order pricing so a missing or malformed value never breaks checkout.
export function resolveDeliveryFee(content, fallback) {
  const value = content?.deliveryFeeMinor;
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

// Standard uses the original deliveryFeeMinor field. Express falls back to the
// standard fee until an admin saves a separate express price.
export function resolveDeliveryFees(content, fallback) {
  const standard = resolveDeliveryFee(content, fallback);
  return {
    STANDARD: standard,
    EXPRESS: resolveDeliveryFee(
      { deliveryFeeMinor: content?.expressDeliveryFeeMinor },
      standard,
    ),
  };
}
