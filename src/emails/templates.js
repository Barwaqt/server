import { renderEmail } from "./layout.js";

const greeting = (name) => (name ? `Hi ${name},` : "Hello,");

/* Portals use the same emails; the account type only changes the wording a little. */
const portalLabel = { CUSTOMER: "customer", VENDOR: "vendor", RIDER: "rider" };

const expiryChip = (minutes) => ({
  label: `Link expires in ${minutes >= 120 ? `${Math.round(minutes / 60)} hours` : `${minutes} minutes`}`,
});
const singleUseChip = { label: "Single-use link" };

export function verifyEmail({ name, url, code, expiresMinutes = 15 } = {}) {
  const minutes = Math.max(1, Number(expiresMinutes) || 15);
  return {
    subject: "Your Barwaqt verification code",
    ...renderEmail({
      preview: "Enter this code to activate your Barwaqt account.",
      eyebrow: "Signup verification",
      heading: "Confirm your email address",
      paragraphs: [
        greeting(name),
        "Thanks for joining Barwaqt. Enter this code on the verification page to activate your account and start shopping across Pakistan.",
      ],
      code,
      action: url ? { label: "Enter my code", url } : undefined,
      chips: [
        { label: `Code expires in ${minutes} minutes` },
        { label: "Single-use code" },
      ],
      note: "If you did not create a Barwaqt account you can ignore this email — nothing happens until the code is used.",
      footerNote:
        "You received this because someone signed up with this email address.",
    }),
  };
}

export function resetPassword({ name, url, expiresMinutes = 20 } = {}) {
  const minutes = Math.max(1, Number(expiresMinutes) || 20);
  return {
    subject: "Reset your Barwaqt password",
    ...renderEmail({
      preview: "Use this link to choose a new Barwaqt password.",
      eyebrow: "Password reset",
      heading: "Choose a new password",
      paragraphs: [
        greeting(name),
        "A password reset was requested for your Barwaqt account. Choose a new password to get back to your orders, wishlist and saved addresses.",
      ],
      action: { label: "Reset my password", url },
      chips: [expiryChip(minutes), singleUseChip],
      bullets: [
        "At least 12 characters long",
        "A mix of letters, numbers and symbols",
        "Something you have not used on Barwaqt before",
      ],
      note: "If you did not request this, ignore this email — your password stays the same and the link expires on its own.",
      footerNote: "We never ask for your password by email or phone.",
    }),
  };
}

export function passwordChanged({ name, email, when = new Date() } = {}) {
  const moment = when instanceof Date ? when : new Date(when);
  return {
    subject: "Your Barwaqt password was changed",
    ...renderEmail({
      preview: "Your Barwaqt password was updated.",
      eyebrow: "Security notice",
      heading: "Your password was changed",
      paragraphs: [
        greeting(name),
        "Your Barwaqt account password was changed. For your safety every other signed-in session was signed out — sign in again with your new password.",
      ],
      details: [
        { label: "Account", value: email || "your Barwaqt account" },
        {
          label: "Changed",
          value: moment.toISOString().replace("T", " ").slice(0, 16) + " UTC",
        },
      ],
      chips: [{ label: "All other sessions signed out" }],
      note: "If this was not you, reset your password immediately and contact the Barwaqt team straight away.",
      footerNote: "This is an automated security notification.",
    }),
  };
}

export function welcome({ name, url, role = "CUSTOMER" } = {}) {
  const account = portalLabel[role] || "customer";
  return {
    subject: "Welcome to Barwaqt",
    ...renderEmail({
      preview: "Your Barwaqt account is ready.",
      eyebrow: "Welcome aboard",
      heading: "Your account is ready",
      paragraphs: [
        greeting(name),
        `Your Barwaqt ${account} account is active. Explore everyday essentials, the latest electronics, fashion and beauty with delivery across Pakistan.`,
      ],
      action: url ? { label: "Start shopping", url } : undefined,
      steps: [
        "Save your delivery address and phone number so riders reach you on the first attempt",
        "Tap the heart on anything you love to build your wishlist",
        "Track every shipment from your account, down to the live rider location",
      ],
      note: "Deals refresh daily on the homepage — your wishlist tells you the moment a price drops.",
      footerNote: "Thanks for choosing Barwaqt.",
    }),
  };
}

export function accountCreated({
  name,
  email,
  temporaryPassword,
  url,
  role = "VENDOR",
} = {}) {
  const account = portalLabel[role] || "vendor";
  return {
    subject: "Your Barwaqt account is ready",
    ...renderEmail({
      preview: "Sign in with the credentials created for you.",
      eyebrow: "Account created",
      heading: `Your Barwaqt ${account} account is ready`,
      paragraphs: [
        greeting(name),
        `The Barwaqt team created a ${account} account for you. Sign in with the details below and set your own password right after your first sign-in.`,
      ],
      action: url ? { label: "Sign in", url } : undefined,
      details: [
        { label: "Email", value: email || "" },
        ...(temporaryPassword
          ? [{ label: "Temporary password", value: temporaryPassword }]
          : []),
      ],
      chips: [{ label: "Change the password after your first sign-in" }],
      note: "Never share these credentials. Barwaqt staff will never ask for your password.",
      footerNote:
        "Change your password from account settings after signing in.",
    }),
  };
}

export const templates = {
  verifyEmail,
  resetPassword,
  passwordChanged,
  welcome,
  accountCreated,
};
