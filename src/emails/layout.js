import { env } from "../config/env.js";

/* Barwaqt storefront palette, mirrored from web/app/(globals.css + components/auth.module.css)
   so every transactional email looks like the site it was sent from. */
export const brand = {
  ink: "#021016",
  lime: "#93de1e",
  limeDark: "#98d92d",
  limeWash: "#eff9e4",
  limeChipInk: "#3d7a17",
  green: "#16733c",
  greenDeep: "#098a42",
  body: "#475569",
  muted: "#64748b",
  faint: "#94a3b8",
  line: "#e5e7eb",
  hairline: "#eef2f6",
  panel: "#f8fafc",
  field: "#f5f8fb",
  canvas: "#f1f5f9",
  noteBg: "#fffdeb",
  noteLine: "#f2e6c2",
  noteInk: "#6c5a2a",
  footMuted: "#7f8f86",
  footFaint: "#6b7a72",
};

export const sans = "Arial,Helvetica,sans-serif";

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/* Email clients strip SVG, so the header uses the hosted raster logo. EMAIL_LOGO_URL
   can point at a CDN; the default falls back to the logo served by the storefront. */
export function logoUrl() {
  return (
    env.EMAIL_LOGO_URL ||
    `${String(env.WEB_URL).replace(/\/+$/, "")}/brand/logo-email.png`
  );
}

function masthead() {
  return `<tr><td class="pad" align="center" style="background:#ffffff;padding:32px 32px 20px">
    <img src="${escapeHtml(logoUrl())}" alt="Barwaqt" width="84" height="55" style="display:block;width:84px;height:auto;border:0;outline:none;text-decoration:none">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:16px auto 0">
      <tr><td width="42" height="3" style="width:42px;height:3px;background:${brand.lime};border-radius:3px;font-size:0;line-height:0">&nbsp;</td></tr>
    </table>
  </td></tr>
  <tr><td height="1" style="height:1px;background:${brand.hairline};font-size:0;line-height:0">&nbsp;</td></tr>`;
}

function chipRow(chips) {
  if (!chips?.length) return "";
  const pills = chips
    .map(
      ({ label, value }) =>
        `<span style="display:inline-block;background:${brand.field};border:1px solid ${brand.line};border-radius:999px;padding:7px 13px;margin:0 6px 8px 0;font:600 11px/1.45 ${sans};color:${brand.body}"><span style="color:${brand.limeDark}">&#9679;</span>&nbsp;${escapeHtml(label)}${
          value
            ? `<b style="color:${brand.ink}">&nbsp;${escapeHtml(value)}</b>`
            : ""
        }</span>`,
    )
    .join("");
  return `<tr><td style="padding:6px 0 2px">${pills}</td></tr>`;
}

function bulletList(bullets) {
  if (!bullets?.length) return "";
  const rows = bullets
    .map(
      (bullet) => `<tr>
        <td width="18" valign="top" style="width:18px;padding:0 0 10px;font:700 12px/1.7 ${sans};color:${brand.limeDark}">&#9679;</td>
        <td valign="top" style="padding:0 0 10px;font:400 14px/1.7 ${sans};color:${brand.body}">${escapeHtml(bullet)}</td>
      </tr>`,
    )
    .join("");
  return `<tr><td style="padding:8px 0 4px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rows}</table>
  </td></tr>`;
}

function stepList(steps) {
  if (!steps?.length) return "";
  const rows = steps
    .map(
      (step, index) => `<tr>
        <td width="30" valign="top" style="width:30px;padding:0 0 14px">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td width="24" height="24" align="center" bgcolor="${brand.limeWash}" style="width:24px;height:24px;border-radius:999px;font:700 11px/24px ${sans};color:${brand.green}">${index + 1}</td>
          </tr></table>
        </td>
        <td valign="top" style="padding:2px 0 14px;font:400 14px/1.6 ${sans};color:${brand.body}">${escapeHtml(step)}</td>
      </tr>`,
    )
    .join("");
  return `<tr><td style="padding:10px 0 4px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rows}</table>
  </td></tr>`;
}

function actionBlock(action) {
  if (!action) return "";
  const { label, url } = action;
  /* Full-width, like the storefront's primary buttons, so the tap target stays generous on
     phones and clients that strip <style> still render it correctly. */
  return `<tr><td style="padding:14px 0 4px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
      <td align="center" bgcolor="${brand.lime}" style="border-radius:8px">
        <a href="${escapeHtml(url)}" target="_blank" style="display:block;width:100%;box-sizing:border-box;padding:17px 18px;font:700 13px/1 ${sans};letter-spacing:1px;text-align:center;text-transform:uppercase;color:${brand.ink};text-decoration:none;border-radius:8px">${escapeHtml(label)}</a>
      </td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:20px 0 6px;font:400 12px/1.7 ${sans};color:${brand.muted}">
    Button not working? Copy this link into your browser:
  </td></tr>
  <tr><td style="padding:0 0 4px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td style="background:${brand.field};border:1px solid ${brand.line};border-radius:10px;padding:12px 14px;font:400 12px/1.6 Consolas,Menlo,monospace;color:${brand.muted};word-break:break-all">${escapeHtml(url)}</td>
      </tr>
    </table>
  </td></tr>`;
}

/* One short code, spaced out so it can be read and retyped from a phone. */
function codeBlock(code) {
  if (!code) return "";
  return `<tr><td style="padding:12px 0 4px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td align="center" style="background:${brand.panel};border:1px dashed ${brand.line};border-radius:12px;padding:18px 14px;font:700 30px/1.2 Consolas,Menlo,monospace;letter-spacing:9px;text-indent:9px;color:${brand.ink}">${escapeHtml(code)}</td>
      </tr>
    </table>
  </td></tr>`;
}

function detailsBlock(details) {
  if (!details?.length) return "";
  const rows = details
    .map(
      ({ label, value }, index) => `<tr>
        <td style="padding:${index ? "16px" : "0"} 0 0;font:700 10px/1.4 ${sans};letter-spacing:1.1px;text-transform:uppercase;color:${brand.faint}">${escapeHtml(label)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0 0;font:700 15px/1.5 ${sans};color:${brand.ink};word-break:break-word">${escapeHtml(value)}</td>
      </tr>`,
    )
    .join("");
  return `<tr><td style="padding:20px 0 4px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${brand.panel};border:1px solid ${brand.line};border-radius:12px">
      <tr><td style="padding:18px 20px 20px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rows}</table>
      </td></tr>
    </table>
  </td></tr>`;
}

function noteBlock(note) {
  if (!note) return "";
  return `<tr><td style="padding:16px 0 0">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${brand.noteBg};border:1px solid ${brand.noteLine};border-radius:10px">
      <tr><td style="padding:14px 16px;font:400 12px/1.7 ${sans};color:${brand.noteInk}">${escapeHtml(note)}</td></tr>
    </table>
  </td></tr>`;
}

function footer({ footerNote, helpText }) {
  return `<tr><td class="foot" bgcolor="${brand.ink}" style="background:${brand.ink};border-top:4px solid ${brand.lime};padding:26px 32px 24px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr><td style="padding:0 0 6px;font:700 13px/1.4 ${sans};letter-spacing:3px;color:#ffffff">BARWAQT</td></tr>
      <tr><td style="padding:0 0 16px;font:400 11px/1.6 ${sans};color:#9fb3a8">Your favourites, right on time.</td></tr>
      <tr><td height="1" style="height:1px;background:#16262d;font-size:0;line-height:0">&nbsp;</td></tr>
      <tr><td style="padding:16px 0 0;font:400 11px/1.8 ${sans};color:${brand.footMuted}">${escapeHtml(helpText || "Need help? Just reply to this email and our team will take a look.")}</td></tr>
      ${
        footerNote
          ? `<tr><td style="padding:6px 0 0;font:400 11px/1.8 ${sans};color:${brand.footMuted}">${escapeHtml(footerNote)}</td></tr>`
          : ""
      }
      <tr><td style="padding:10px 0 0;font:400 10px/1.8 ${sans};color:${brand.footFaint}">Barwaqt Marketplace &middot; Pakistan &middot; &copy; ${new Date().getFullYear()} Barwaqt. All rights reserved.</td></tr>
    </table>
  </td></tr>`;
}

/**
 * Builds the branded HTML and the plain-text alternative for one transactional email.
 * Every colour, radius and label style is shared with the storefront so the message
 * looks like the page the customer just came from.
 */
export function renderEmail({
  preview = "",
  eyebrow = "",
  heading,
  paragraphs = [],
  bullets = [],
  chips = [],
  code = "",
  action,
  details,
  steps = [],
  note,
  footerNote = "",
  helpText = "",
}) {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(heading)}</title>
<style>
  body{margin:0;padding:0;-webkit-text-size-adjust:100%;background:${brand.canvas}}
  table{border-collapse:collapse}
  img{border:0;outline:none;text-decoration:none}
  a{text-decoration:none}
  @media (max-width:620px){
    .wrap{padding:18px 10px!important}
    .pad{padding-left:22px!important;padding-right:22px!important}
    .h1{font-size:21px!important}
    .body-copy{font-size:15px!important}
    .foot{padding:22px 22px 20px!important}
  }
</style>
</head>
<body style="margin:0;padding:0;background:${brand.canvas}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(preview)}&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${brand.canvas}">
  <tr><td class="wrap" align="center" style="padding:30px 16px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${brand.line};border-radius:18px;overflow:hidden;box-shadow:0 18px 45px -30px rgba(2,16,22,.35)">
      ${masthead()}
      <tr><td class="pad" style="padding:26px 32px 32px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          ${
            eyebrow
              ? `<tr><td style="padding:0 0 14px"><span style="display:inline-block;background:${brand.limeWash};color:${brand.limeChipInk};border-radius:999px;padding:6px 12px;font:700 10px/1 ${sans};letter-spacing:1.2px;text-transform:uppercase">${escapeHtml(eyebrow)}</span></td></tr>`
              : ""
          }
          <tr><td class="h1" style="padding:0 0 16px;font:750 23px/1.32 ${sans};letter-spacing:-.5px;color:${brand.ink}">${escapeHtml(heading)}</td></tr>
          ${paragraphs
            .map(
              (paragraph) =>
                `<tr><td class="body-copy" style="padding:0 0 14px;font:400 15px/1.7 ${sans};color:${brand.body}">${escapeHtml(paragraph)}</td></tr>`,
            )
            .join("")}
          ${codeBlock(code)}
          ${bulletList(bullets)}
          ${chipRow(chips)}
          ${actionBlock(action)}
          ${detailsBlock(details)}
          ${stepList(steps)}
          ${noteBlock(note)}
        </table>
      </td></tr>
      ${footer({ footerNote, helpText })}
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const text = [
    heading,
    "",
    ...paragraphs,
    ...(code ? ["", `Verification code: ${code}`] : []),
    ...(bullets.length ? ["", ...bullets.map((b) => `- ${b}`)] : []),
    ...(chips.length
      ? [
          "",
          ...chips.map(({ label, value }) =>
            value ? `- ${label}: ${value}` : `- ${label}`,
          ),
        ]
      : []),
    ...(action ? ["", `${action.label}:`, action.url] : []),
    ...(details?.length
      ? ["", ...details.map(({ label, value }) => `${label}: ${value}`)]
      : []),
    ...(steps.length
      ? ["", ...steps.map((step, index) => `${index + 1}. ${step}`)]
      : []),
    ...(note ? ["", note] : []),
    "",
    helpText ||
      "Need help? Just reply to this email and our team will take a look.",
    ...(footerNote ? [footerNote] : []),
    "Barwaqt Marketplace - Pakistan - (c) " +
      new Date().getFullYear() +
      " Barwaqt. All rights reserved.",
  ].join("\n");

  return { html, text };
}
