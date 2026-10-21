import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  homepageContent,
  publishHomepage,
} from "../src/validators/homepage.validator.js";
const original = JSON.parse(
  readFileSync(new URL("../prisma/homepage-default.json", import.meta.url)),
);

test("legacy homepage heroes become one-slide carousels without losing content", () => {
  const parsed = homepageContent.parse(original);
  for (const key of ["heroMain", "heroSide"]) {
    assert.deepEqual(parsed[key], {
      enabled: original[key].enabled,
      slides: [original[key]],
    });
  }
  assert.deepEqual(parsed.upgrade, original.upgrade);
});

test("both hero carousels preserve slide order, content and visibility when publishing", () => {
  const content = homepageContent.parse(original);
  for (const key of ["heroMain", "heroSide"]) {
    content[key].slides.push({
      ...content[key].slides[0],
      title: "Second promotion",
      image: "/api/media/second",
      enabled: false,
    });
    content[key].slides.reverse();
  }
  const parsed = publishHomepage.parse({ version: 1, content });
  assert.deepEqual(parsed.content, content);
  assert.equal(parsed.content.heroMain.slides[0].enabled, false);
});

test("carousel validation rejects unsafe links, malformed slides and excessive slides", () => {
  for (const key of ["heroMain", "heroSide"]) {
    const content = homepageContent.parse(original);
    const slide = content[key].slides[0];
    for (const invalid of [
      { ...slide, href: "javascript:alert(1)" },
      { ...slide, image: "//example.com/image.png" },
      { ...slide, title: "" },
      { ...slide, unexpected: true },
    ]) {
      content[key].slides = [invalid];
      assert.equal(homepageContent.safeParse(content).success, false);
    }
    content[key].slides = Array(13).fill(slide);
    assert.equal(homepageContent.safeParse(content).success, false);
    content[key].slides = [];
    assert.equal(homepageContent.safeParse(content).success, true);
  }
});
