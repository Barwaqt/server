import { isDeepStrictEqual } from "node:util";
const reviewedFields = [
  "name",
  "slug",
  "categoryId",
  "description",
  "priceMinor",
  "images",
  "attributes",
  "variants",
  "expressDelivery",
  "expressEtaMinutes",
  "standardDeliveryDays",
];
// Variant rows carry ids and timestamps; compare only the reviewable content so
// resubmitting unchanged variants does not reset an approved product.
const comparable = (key, value) =>
  key !== "variants"
    ? value
    : [...(value || [])]
        .map(({ name, priceMinor }) => ({ name, priceMinor }))
        .sort((a, b) => a.name.localeCompare(b.name));
export function reviewReset(product, input) {
  const submitted = reviewedFields.some((key) => Object.hasOwn(input, key));
  const changed = reviewedFields.some(
    (key) =>
      Object.hasOwn(input, key) &&
      !isDeepStrictEqual(
        comparable(key, input[key]),
        comparable(key, product[key]),
      ),
  );
  return changed || (product.reviewStatus === "REJECTED" && submitted)
    ? {
        reviewStatus: "PENDING",
        rejectionReason: null,
        reviewedAt: null,
        reviewedById: null,
      }
    : {};
}
