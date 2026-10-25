import { isDeepStrictEqual } from "node:util";
const reviewedFields = [
  "name",
  "slug",
  "categoryId",
  "description",
  "priceMinor",
  "images",
  "attributes",
];
export function reviewReset(product, input) {
  const submitted = reviewedFields.some((key) => Object.hasOwn(input, key));
  const changed = reviewedFields.some(
    (key) =>
      Object.hasOwn(input, key) && !isDeepStrictEqual(input[key], product[key]),
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
