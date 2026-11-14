import test from "node:test";
import assert from "node:assert/strict";
import {
  deliveryChoices,
  etaLabel,
  resolveDeliveryOption,
} from "../src/utils/delivery-options.js";
import { checkout } from "../src/validators/commerce.validator.js";

const product = (overrides = {}) => ({
  expressDelivery: true,
  expressEtaMinutes: 120,
  standardDeliveryDays: 7,
  ...overrides,
});

test("standard delivery is always offered and uses the slowest product", () => {
  const options = deliveryChoices([
    product({ expressDelivery: false, standardDeliveryDays: 3 }),
    product({ standardDeliveryDays: 7 }),
  ]);
  assert.deepEqual(options, [
    {
      option: "STANDARD",
      etaMinutes: 7 * 1440,
      label: "Standard delivery within 7 days",
    },
  ]);
});

test("express is offered only when every product supports it", () => {
  const options = deliveryChoices([
    product({ expressEtaMinutes: 90 }),
    product({ expressEtaMinutes: 240 }),
  ]);
  assert.deepEqual(
    options.map((entry) => entry.option),
    ["EXPRESS", "STANDARD"],
  );
  assert.equal(options[0].etaMinutes, 240);
  assert.equal(options[0].label, "Express delivery within 4 hours");
});

test("requesting express for a mixed basket is rejected", () => {
  assert.throws(
    () =>
      resolveDeliveryOption(
        [product(), product({ expressDelivery: false })],
        "EXPRESS",
      ),
    (error) => error.status === 422,
  );
});

test("express must be configured with an ETA", () => {
  assert.deepEqual(
    deliveryChoices([product({ expressEtaMinutes: null })]).map(
      (o) => o.option,
    ),
    ["STANDARD"],
  );
});

test("ETA labels read naturally", () => {
  assert.equal(etaLabel("EXPRESS", 30), "Express delivery within 30 minutes");
  assert.equal(etaLabel("EXPRESS", 60), "Express delivery within 1 hour");
  assert.equal(etaLabel("STANDARD", 1440), "Standard delivery within 1 day");
});

test("checkout accepts the delivery option and defaults to standard", () => {
  const addressId = "11111111-1111-4111-8111-111111111111";
  assert.equal(checkout.parse({ addressId }).deliveryOption, "STANDARD");
  assert.equal(
    checkout.parse({ addressId, deliveryOption: "EXPRESS" }).deliveryOption,
    "EXPRESS",
  );
  assert.throws(() =>
    checkout.parse({ addressId, deliveryOption: "SAME_DAY" }),
  );
});
