// Returns the saved delivery fee when it is a valid non-negative integer,
// otherwise the configured fallback. Used by both the admin settings read and
// order pricing so a missing or malformed value never breaks checkout.
export function resolveDeliveryFee(content, fallback) {
  const value = content?.deliveryFeeMinor;
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}
