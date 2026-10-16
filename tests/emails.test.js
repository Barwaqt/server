import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { templates } from "../src/emails/templates.js";
import { brand, escapeHtml } from "../src/emails/layout.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const link = "https://shop.barwaqt.example/reset#token=abc-123";
const bodies = [
  ["verifyEmail", templates.verifyEmail({ name: "Ayesha", url: link })],
  ["resetPassword", templates.resetPassword({ name: "Ayesha", url: link })],
  ["passwordChanged", templates.passwordChanged({ name: "Ayesha" })],
  ["welcome", templates.welcome({ name: "Ayesha", url: link })],
  [
    "accountCreated",
    templates.accountCreated({
      name: "Gulberg Market",
      email: "owner@example.test",
      temporaryPassword: "Temporary-pass-123!",
      url: link,
      role: "VENDOR",
    }),
  ],
];

/* Renders a template in a fresh process so env-driven branches stay deterministic. */
function render(overrides, expression) {
  const script = `import {templates} from ${JSON.stringify(
    pathToFileURL(join(root, "src", "emails", "templates.js")).href,
  )};process.stdout.write(${expression});`;
  return execFileSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: root,
    env: { ...process.env, ...overrides },
    encoding: "utf8",
  });
}

test("every template ships a subject, branded HTML and a plain-text alternative", () => {
  for (const [name, message] of bodies) {
    assert.ok(message.subject.length > 0, `${name} subject is empty`);
    assert.match(message.html, /^<!doctype html>/, `${name} doctype`);
    assert.match(message.html, /<html lang="en">/, `${name} language`);
    assert.match(
      message.html,
      /name="viewport"/,
      `${name} is not mobile ready`,
    );
    assert.match(
      message.html,
      /display:none;max-height:0/,
      `${name} has no preheader`,
    );
    assert.doesNotMatch(
      message.text,
      /<(a|table|div|span|p|img)\b/,
      `${name} text part contains markup`,
    );
    assert.ok(message.text.trim().length > 80, `${name} text part too short`);
    assert.ok(
      Buffer.byteLength(message.html) < 102400,
      `${name} HTML exceeds the Gmail clipping limit`,
    );
  }
});

test("the layout reuses the storefront surfaces, palette and radii", () => {
  for (const [name, message] of bodies) {
    assert.ok(
      message.html.includes("max-width:600px") &&
        message.html.includes("border-radius:18px"),
      `${name} does not use the storefront card`,
    );
    assert.ok(
      message.html.includes(`background:${brand.canvas}`),
      `${name} is off the storefront canvas colour`,
    );
    assert.ok(
      message.html.includes(`letter-spacing:-.5px;color:${brand.ink}`),
      `${name} heading is off-brand`,
    );
    assert.ok(
      message.html.includes("max-width:620px"),
      `${name} has no mobile stylesheet`,
    );
  }
});

test("action emails use the lime storefront button and show the raw link", () => {
  for (const [name, message] of bodies.filter(
    ([n]) => n !== "passwordChanged",
  )) {
    assert.ok(message.html.includes(`href="${link}"`), `${name} html link`);
    assert.ok(message.text.includes(link), `${name} text link`);
    assert.match(
      message.html,
      /bgcolor="#93de1e"/,
      `${name} action button is off-brand`,
    );
    assert.ok(
      message.html.includes("text-transform:uppercase"),
      `${name} action label does not match the storefront button style`,
    );
  }
});

test("verification and reset emails state the expiry and single-use rule", () => {
  const verify = templates.verifyEmail({
    name: "Ayesha",
    url: link,
    expiresMinutes: 1440,
  });
  assert.ok(verify.html.includes("Link expires in 24 hours"));
  assert.ok(verify.text.includes("Link expires in 24 hours"));
  assert.ok(verify.text.includes("Single-use link"));
  assert.ok(verify.text.includes("ignore this email"));

  const reset = templates.resetPassword({ name: "Ayesha", url: link });
  assert.ok(reset.html.includes("Link expires in 20 minutes"));
  assert.ok(reset.text.includes("Link expires in 20 minutes"));
  assert.ok(reset.text.includes("ignore this email"));
  assert.equal(reset.subject, "Reset your Barwaqt password");
  for (const bullet of [
    "At least 12 characters long",
    "A mix of letters, numbers and symbols",
  ]) {
    assert.ok(reset.html.includes(bullet), `reset bullet missing: ${bullet}`);
    assert.ok(
      reset.text.includes(bullet),
      `reset text bullet missing: ${bullet}`,
    );
  }
});

test("welcome email lists the storefront onboarding steps as numbered items", () => {
  const message = templates.welcome({ name: "Ayesha", url: link });
  assert.ok(message.html.includes("border-radius:999px;font:700 11px/24px"));
  assert.ok(message.text.includes("1. "));
  assert.ok(message.text.includes("2. "));
  assert.ok(message.text.includes("3. "));
});

test("user supplied values are escaped in both parts", () => {
  const attack = '<img src=x onerror="alert(1)">';
  const message = templates.resetPassword({ name: attack, url: link });
  assert.ok(!message.html.includes("<img src=x"), "raw html was rendered");
  assert.ok(message.html.includes(escapeHtml(attack)), "name was not escaped");

  const injected = templates.verifyEmail({
    url: 'https://x.test/#token="onmouseover="alert(1)',
  });
  assert.ok(
    !injected.html.includes('href="https://x.test/#token="onmouseover'),
    "url broke out of the href attribute",
  );
});

test("password-changed email shows the account and warns about unknown changes", () => {
  const message = templates.passwordChanged({
    name: "Ayesha",
    email: "ayesha@example.test",
    when: new Date("2026-10-15T12:34:56Z"),
  });
  assert.ok(message.html.includes("ayesha@example.test"));
  assert.ok(message.text.includes("2026-10-15 12:34 UTC"));
  assert.match(message.text, /not you/i);
});

test("the header loads the hosted storefront logo and honours EMAIL_LOGO_URL", () => {
  const expression = `templates.welcome({url:${JSON.stringify(link)}}).html`;
  const hosted = render({ EMAIL_LOGO_URL: "" }, expression);
  assert.ok(
    hosted.includes('src="http://localhost:3000/brand/logo-email.png"'),
    "default hosted logo missing",
  );
  assert.ok(hosted.includes('alt="Barwaqt"'), "logo has no accessible name");
  assert.ok(
    !hosted.includes("logo.svg"),
    "email must not depend on SVG assets",
  );

  const trimmed = render(
    { EMAIL_LOGO_URL: "", WEB_URL: "https://shop.barwaqt.example/" },
    expression,
  );
  assert.ok(
    trimmed.includes('src="https://shop.barwaqt.example/brand/logo-email.png"'),
    "trailing slash on WEB_URL was not trimmed",
  );

  const withLogo = render(
    { EMAIL_LOGO_URL: "https://cdn.barwaqt.example/logo.png" },
    expression,
  );
  assert.ok(
    withLogo.includes('src="https://cdn.barwaqt.example/logo.png"'),
    "configured logo was not used",
  );
  assert.ok(
    !withLogo.includes("localhost:3000/brand/logo-email.png"),
    "storefront fallback leaked into the configured logo",
  );
});
