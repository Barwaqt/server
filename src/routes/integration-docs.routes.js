import { Router, urlencoded } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { rateLimit } from "express-rate-limit";

const documentPath = new URL("../../complete_api.md", import.meta.url);
// Store a digest rather than including the shared PIN in the delivered page.
const pinDigest = Buffer.from(
  "6789749a04e4dad572bc0988151a7eac1d34c741c02370999cc527383b652a26",
  "hex",
);
const page = (invalid = false) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Barwaqt developer documentation</title></head>
<body><main><h1>Barwaqt API documentation</h1><p>Enter the developer PIN to access this file.</p>
${invalid ? '<p role="alert">Incorrect PIN. Please try again.</p>' : ""}
<form method="post" action="/integerate/api/complete_api.md">
<label for="pin">PIN</label> <input id="pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autocomplete="off" autofocus>
<button type="submit">Open documentation</button></form></main></body></html>`;

export function createIntegrationDocsRouter() {
  const router = Router();
  router.use((req, res, next) => {
    res.set({
      "Cache-Control": "no-store, private",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    });
    next();
  });
  router.get("/complete_api.md", (req, res) => res.type("html").send(page()));
  router.post(
    "/complete_api.md",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 5,
      skipSuccessfulRequests: true,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: "Too many PIN attempts. Try again in 15 minutes.",
    }),
    urlencoded({ extended: false, limit: "1kb" }),
    async (req, res) => {
      const pin = req.body?.pin;
      const valid =
        typeof pin === "string" &&
        /^[0-9]{6}$/.test(pin) &&
        timingSafeEqual(createHash("sha256").update(pin).digest(), pinDigest);
      if (!valid) return res.status(401).type("html").send(page(true));
      // No public static file or token in the URL; each access requires the PIN.
      const markdown = await readFile(documentPath, "utf8");
      res.type("text/plain").send(markdown);
    },
  );
  return router;
}
