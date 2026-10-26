import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSearch, popularTerms } from "../src/utils/search-terms.js";
import { homepageContent } from "../src/validators/homepage.validator.js";
import { readFileSync } from "node:fs";
test("search terms normalize, deduplicate and honor admin priority and limit", () => {
  assert.equal(normalizeSearch("  Rice   FLOUR "), "rice flour");
  assert.deepEqual(
    popularTerms([" Milk ", "RICE"], ["milk", "eggs", "bread"], 3),
    ["milk", "rice", "eggs"],
  );
});
test("homepage search controls default correctly and reject invalid limits", () => {
  const raw = JSON.parse(
    readFileSync(new URL("../prisma/homepage-default.json", import.meta.url)),
  );
  const parsed = homepageContent.parse(raw);
  assert.equal(parsed.searches.limit, 10);
  assert.equal(parsed.searches.dynamic, true);
  for (const limit of [0, 101, 2.5])
    assert.equal(
      homepageContent.safeParse({
        ...raw,
        searches: { ...raw.searches, limit },
      }).success,
      false,
    );
});
