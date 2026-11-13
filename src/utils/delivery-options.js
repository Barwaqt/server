import { ApiError } from "./error.js";

export const EXPRESS = "EXPRESS";
export const STANDARD = "STANDARD";
export const DELIVERY_OPTIONS = [EXPRESS, STANDARD];

const MAX_STANDARD_DAYS = 7;

function durationLabel(option, minutes) {
  if (option === EXPRESS) {
    if (minutes % 60 === 0) {
      const hours = minutes / 60;
      return `${hours} hour${hours === 1 ? "" : "s"}`;
    }
    return `${minutes} minutes`;
  }
  const days = Math.max(1, Math.round(minutes / 1440));
  return `${days} day${days === 1 ? "" : "s"}`;
}

export function etaLabel(option, minutes) {
  return `${option === EXPRESS ? "Express" : "Standard"} delivery within ${durationLabel(option, minutes)}`;
}

// ETA promised by one vendor for the chosen option, in minutes.
export function vendorEtaMinutes(vendor, option) {
  if (option === EXPRESS) return vendor.expressEtaMinutes;
  return standardDays(vendor) * 1440;
}

export function standardDays(vendor) {
  const days = Number(vendor.standardDeliveryDays);
  if (!Number.isFinite(days)) return MAX_STANDARD_DAYS;
  return Math.min(MAX_STANDARD_DAYS, Math.max(1, Math.round(days)));
}

export function vendorsOfferExpress(vendors) {
  return vendors.every(
    (vendor) => vendor.expressDelivery && Number(vendor.expressEtaMinutes) > 0,
  );
}

// Options offered for a basket: express only when every store in the basket
// supports it, and always a standard option. ETAs are the slowest vendor's so
// the promise holds for the whole order.
export function deliveryChoices(vendors) {
  const options = [];
  if (vendorsOfferExpress(vendors)) {
    const minutes = Math.max(
      ...vendors.map((vendor) => Number(vendor.expressEtaMinutes)),
    );
    options.push({
      option: EXPRESS,
      etaMinutes: minutes,
      label: etaLabel(EXPRESS, minutes),
    });
  }
  const minutes =
    Math.max(...vendors.map((vendor) => standardDays(vendor))) * 1440;
  options.push({
    option: STANDARD,
    etaMinutes: minutes,
    label: etaLabel(STANDARD, minutes),
  });
  return options;
}

export function resolveDeliveryOption(vendors, requested = STANDARD) {
  const options = deliveryChoices(vendors);
  const chosen = options.find((entry) => entry.option === requested);
  if (!chosen)
    throw new ApiError(
      422,
      "Express delivery is not available for every store in this order",
    );
  return { ...chosen, options };
}
