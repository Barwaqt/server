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

// ETA promised for a set of products on the chosen option, in minutes. The
// slowest product wins so the promise holds for everything in the basket.
export function productsEtaMinutes(products, option) {
  if (option === EXPRESS)
    return Math.max(
      ...products.map((product) => Number(product.expressEtaMinutes) || 0),
    );
  return Math.max(...products.map(standardDays)) * 1440;
}

// Express must carry an ETA; turning it off clears any stale promise.
export function applyProductDeliveryFields(fields, current = {}) {
  if (
    fields.expressDelivery === undefined &&
    fields.expressEtaMinutes === undefined &&
    fields.standardDeliveryDays === undefined
  )
    return;
  const express =
    fields.expressDelivery !== undefined
      ? fields.expressDelivery
      : !!current.expressDelivery;
  const eta =
    fields.expressEtaMinutes !== undefined
      ? fields.expressEtaMinutes
      : (current.expressEtaMinutes ?? null);
  if (express && !(Number.isInteger(eta) && eta > 0))
    throw new ApiError(
      422,
      "Express delivery needs a delivery time in minutes",
    );
  fields.expressDelivery = express;
  fields.expressEtaMinutes = express ? eta : null;
}

export function standardDays(product) {
  const days = Number(product.standardDeliveryDays);
  if (!Number.isFinite(days)) return MAX_STANDARD_DAYS;
  return Math.min(MAX_STANDARD_DAYS, Math.max(1, Math.round(days)));
}

export function productsOfferExpress(products) {
  return products.every(
    (product) =>
      product.expressDelivery && Number(product.expressEtaMinutes) > 0,
  );
}

// Options offered for a basket: express only when every product supports it,
// and always a standard option. ETAs are the slowest product's so the promise
// holds for the whole order.
export function deliveryChoices(products) {
  const options = [];
  if (productsOfferExpress(products)) {
    const minutes = productsEtaMinutes(products, EXPRESS);
    options.push({
      option: EXPRESS,
      etaMinutes: minutes,
      label: etaLabel(EXPRESS, minutes),
    });
  }
  const minutes = productsEtaMinutes(products, STANDARD);
  options.push({
    option: STANDARD,
    etaMinutes: minutes,
    label: etaLabel(STANDARD, minutes),
  });
  return options;
}

export function resolveDeliveryOption(products, requested = STANDARD) {
  const options = deliveryChoices(products);
  const chosen = options.find((entry) => entry.option === requested);
  if (!chosen)
    throw new ApiError(
      422,
      "Express delivery is not available for every product in this order",
    );
  return { ...chosen, options };
}
