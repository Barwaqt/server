import { test } from "node:test";
import assert from "node:assert/strict";
import { errorHandler } from "../src/middlewares/error.middleware.js";
import { ApiError } from "../src/utils/error.js";
function render(error) {
  const res = {
    status(code) {
      this.code = code;
      return this;
    },
    json(body) {
      this.body = body;
    },
  };
  errorHandler(error, { id: "test" }, res, () => {});
  return res;
}
test("explicit unavailable-provider errors remain actionable", () => {
  const result = render(
    new ApiError(
      503,
      "Password-reset email is not configured. Contact support.",
    ),
  );
  assert.equal(result.code, 503);
  assert.equal(
    result.body.error.message,
    "Password-reset email is not configured. Contact support.",
  );
});
test("unexpected server failures never expose internal errors", () => {
  const result = render(new Error("database password is secret"));
  assert.equal(result.code, 500);
  assert.equal(result.body.error.message, "Internal server error");
});
