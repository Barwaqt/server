import test from "node:test";
import assert from "node:assert/strict";
import { settingsInput } from "../src/validators/settings.validator.js";
import { resolveDeliveryFee } from "../src/utils/delivery-fee.js";

test("delivery fee setting requires a non-negative integer within range", () => {
  assert.equal(
    settingsInput.safeParse({ deliveryFeeMinor: 15000 }).success,
    true,
  );
  assert.equal(settingsInput.safeParse({ deliveryFeeMinor: 0 }).success, true);
  assert.equal(
    settingsInput.safeParse({ deliveryFeeMinor: 1000000 }).success,
    true,
  );
  assert.equal(
    settingsInput.safeParse({ deliveryFeeMinor: -1 }).success,
    false,
  );
  assert.equal(
    settingsInput.safeParse({ deliveryFeeMinor: 1500.5 }).success,
    false,
  );
  assert.equal(
    settingsInput.safeParse({ deliveryFeeMinor: 1000001 }).success,
    false,
  );
  assert.equal(
    settingsInput.safeParse({ deliveryFeeMinor: 100, extra: true }).success,
    false,
  );
  assert.equal(settingsInput.safeParse({}).success, false);
});

test("the saved delivery fee wins and missing or malformed values fall back", () => {
  assert.equal(resolveDeliveryFee({ deliveryFeeMinor: 250 }, 15000), 250);
  assert.equal(resolveDeliveryFee({ deliveryFeeMinor: 0 }, 15000), 0);
  assert.equal(resolveDeliveryFee({}, 15000), 15000);
  assert.equal(resolveDeliveryFee(undefined, 15000), 15000);
  assert.equal(resolveDeliveryFee({ deliveryFeeMinor: -5 }, 15000), 15000);
  assert.equal(resolveDeliveryFee({ deliveryFeeMinor: 1.5 }, 15000), 15000);
  assert.equal(resolveDeliveryFee({ deliveryFeeMinor: "100" }, 15000), 15000);
});
