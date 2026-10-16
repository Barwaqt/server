import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { brand } from "../src/emails/layout.js";
import { templates } from "../src/emails/templates.js";

const out = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  ".email-preview",
);
const verifyLink =
  "http://localhost:3000/verify-email#token=sample-verification-token";
const resetLink =
  "http://localhost:3000/reset-password#token=sample-reset-token";
const examples = [
  [
    "1-verify-email",
    templates.verifyEmail({ name: "Ayesha", url: verifyLink }),
  ],
  [
    "2-reset-password",
    templates.resetPassword({ name: "Ayesha", url: resetLink }),
  ],
  [
    "3-password-changed",
    templates.passwordChanged({ name: "Ayesha", email: "ayesha@example.com" }),
  ],
  [
    "4-welcome",
    templates.welcome({ name: "Ayesha", url: "http://localhost:3000/" }),
  ],
  [
    "5-account-created",
    templates.accountCreated({
      name: "Gulberg Market",
      email: "owner@gulberg.example",
      temporaryPassword: "Temporary-pass-123!",
      url: "http://localhost:3001/",
      role: "VENDOR",
    }),
  ],
];

mkdirSync(out, { recursive: true });
const index = [];
for (const [name, { subject, html, text }] of examples) {
  writeFileSync(join(out, `${name}.html`), html);
  writeFileSync(join(out, `${name}.txt`), `${subject}\n\n${text}\n`);
  index.push({ name, subject });
}
writeFileSync(
  join(out, "index.html"),
  `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Barwaqt transactional emails</title>
<style>
  body{margin:0;padding:32px 20px;background:${brand.canvas};color:${brand.ink};font:400 14px/1.6 Arial,Helvetica,sans-serif}
  main{max-width:720px;margin:0 auto}
  h1{font-size:22px;letter-spacing:-.5px;margin:0 0 6px}
  p.lead{color:${brand.muted};margin:0 0 24px}
  a.card{display:block;background:#fff;border:1px solid ${brand.line};border-radius:14px;padding:16px 18px;margin-bottom:12px;text-decoration:none;color:inherit}
  a.card:hover{border-color:${brand.lime}}
  strong{display:block;color:${brand.green};font-size:11px;letter-spacing:1.1px;text-transform:uppercase}
  span{display:block;font-weight:700;margin-top:6px}
  small{display:block;color:${brand.muted};font-family:Consolas,Menlo,monospace;font-size:11px;margin-top:4px;word-break:break-all}
</style></head>
<body><main>
<h1>Barwaqt transactional emails</h1>
<p class="lead">Rendered from src/emails/templates.js. Open any preview to check the HTML part; the matching .txt is the plain-text alternative.</p>
${index
  .map(
    ({ name, subject }) =>
      `<a class="card" href="./${name}.html"><strong>${name.slice(2).replaceAll("-", " ")}</strong><span>${subject}</span><small>./${name}.html</small></a>`,
  )
  .join("")}
</main></body></html>
`,
);
console.log(
  `Rendered ${examples.length} emails (HTML + text) and index.html into ${out}`,
);
