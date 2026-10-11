import { test } from "node:test";
import assert from "node:assert/strict";
import { allocate, percentage } from "../src/utils/money.js";
test("discount allocation conserves minor units for uneven baskets", () => {
  for (let total = 0; total < 100; total++) {
    const result = allocate(total, [123, 7, 90]);
    assert.equal(
      result.reduce((a, b) => a + b, 0),
      total,
    );
    assert.ok(result.every(Number.isInteger));
  }
});
test("commission uses basis points without floating currency", () => {
  assert.equal(percentage(19999, 1000), 1999);
  assert.deepEqual(allocate(1, [1, 1]), [1, 0]);
});
