import test from "node:test";
import assert from "node:assert/strict";
import {
  category,
  categoryUpdate,
} from "../src/validators/management.validator.js";
import { vendor } from "../src/validators/commerce.validator.js";
import { vendorPayout } from "../src/validators/vendor-payout.validator.js";

test("category commissions accept zero, fractional percentages and 100%, but reject invalid rates", () => {
  for (const commissionBps of [0, 1000, 1725, 10000])
    assert.equal(
      category.parse({ name: "Category", slug: "category", commissionBps })
        .commissionBps,
      commissionBps,
    );
  for (const commissionBps of [-1, 10001, 10.5])
    assert.equal(categoryUpdate.safeParse({ commissionBps }).success, false);
  assert.deepEqual(categoryUpdate.parse({ name: "Renamed" }), {
    name: "Renamed",
  });
});

test("payout accounts retain string numbers and require bank names only for banks", () => {
  const account = { accountTitle: "Vendor", accountNumber: "03001234567" };
  assert.equal(
    vendorPayout.safeParse({ ...account, method: "BANK_TRANSFER" }).success,
    false,
  );
  assert.equal(
    vendorPayout.parse({
      ...account,
      method: "BANK_TRANSFER",
      bankName: "Example Bank",
    }).accountNumber,
    "03001234567",
  );
  assert.equal(
    vendorPayout.parse({ ...account, method: "EASYPAISA" }).bankName,
    "Easypaisa",
  );
  assert.equal(
    vendorPayout.parse({ ...account, method: "JAZZCASH" }).bankName,
    "JazzCash",
  );
  for (const input of [
    { ...account, method: "UNKNOWN" },
    { ...account, method: "EASYPAISA", accountNumber: "" },
    { ...account, method: "EASYPAISA", accountTitle: "" },
  ])
    assert.equal(vendorPayout.safeParse(input).success, false);
});

test("vendor registration requires a category and payout account and rejects a client commission override", () => {
  const input = {
    email: "vendor@example.com",
    password: "SecurePassword123!",
    phone: "+923001234567",
    firstName: "Vendor",
    name: "Store",
    slug: "store",
    businessType: "Retail",
    city: "Lahore",
    zone: "Central",
    address: "Main road",
    categoryId: "ddbc7b96-9b2c-4fe0-9ab9-87f6a50fac59",
    bankDetails: {
      method: "EASYPAISA",
      accountTitle: "Vendor",
      accountNumber: "03001234567",
    },
  };
  assert.equal(vendor.safeParse(input).success, true);
  assert.equal(
    vendor.safeParse({ ...input, categoryId: undefined }).success,
    false,
  );
  assert.equal(
    vendor.safeParse({ ...input, bankDetails: undefined }).success,
    false,
  );
  assert.equal(vendor.safeParse({ ...input, commissionBps: 0 }).success, false);
});
