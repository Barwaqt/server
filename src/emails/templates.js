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

export function vendorOnboarding({
  name,
  email,
  password,
  shopName,
  businessType,
  categories,
  city,
  zone,
  url,
} = {}) {
  return {
    subject: "Welcome to Barwaqt — your vendor account is ready",
    ...renderEmail({
      preview: "Your vendor account has been created. Sign in and start selling.",
      eyebrow: "Vendor onboarding",
      heading: `Welcome to Barwaqt, ${name ?? "vendor"}!`,
      paragraphs: [
        greeting(name),
        `Your vendor account for **${shopName ?? "your store"}** is now active. You can sign in and start adding products right away.`,
        "Keep this email safe — it contains your sign-in details and store information.",
      ],
      action: url ? { label: "Sign in to your vendor dashboard", url } : undefined,
      details: [
        { label: "Full name", value: name || "" },
        { label: "Email", value: email || "" },
        { label: "Password", value: password || "set during signup" },
        { label: "Shop name", value: shopName || "" },
        { label: "Business type", value: businessType || "" },
        { label: "Category", value: (categories && categories[0]) || "" },
        ...(categories && categories.length > 1
          ? [{ label: "Additional categories", value: categories.slice(1).join(", ") }]
          : []),
        { label: "City", value: city || "" },
        { label: "Zone", value: zone || "" },
      ],
      steps: [
        "Sign in with your email and password",
        "Set a strong password from account settings after your first sign-in",
        "Add your first products from the Products tab in your vendor dashboard",
        "Track orders and payouts from your dashboard once customers start ordering",
      ],
      chips: [
        { label: "Vendor account" },
        { label: "Ready to sell" },
      ],
      note: "Store your password safely and never share it. Barwaqt staff will never ask for your password by email or phone.",
      footerNote: "Questions? Reply to this email or reach the Barwaqt support team.",
    }),
  };
}

export function productApproved({
  vendorName,
  productName,
  productDescription,
  productPrice,
  productCategory,
  productStock,
  url,
} = {}) {
  return {
    subject: "Congratulations — your product is approved on Barwaqt!",
    ...renderEmail({
      preview: "Your product is live and visible to customers.",
      eyebrow: "Product approved",
      heading: `Great news, ${vendorName ?? "vendor"}!`,
      paragraphs: [
        greeting(vendorName),
        `Your product **${productName ?? "your product"}** has been approved and is now visible to customers on Barwaqt.`,
        productDescription
          ? `Here are the details of your approved product:`
          : "Your product is now live for customers to browse and order.",
      ],
      action: url
        ? { label: "View product in your dashboard", url }
        : undefined,
      details: [
        { label: "Product name", value: productName || "" },
        ...(productDescription
          ? [{ label: "Description", value: productDescription }]
          : []),
        ...(productPrice
          ? [{ label: "Price", value: productPrice }]
          : []),
        { label: "Category", value: productCategory || "" },
        ...(productStock !== undefined
          ? [{ label: "Stock", value: String(productStock) }]
          : []),
      ],
      chips: [
        { label: "Approved" },
        { label: "Live on Barwaqt" },
      ],
      note:
        "Your product will appear in search and category listings. Keep your stock updated and respond quickly to customer orders for the best seller ratings.",
      footerNote: "Want to make changes? Update your product from your vendor dashboard.",
    }),
  };
}

export const templates = {
  verifyEmail,
  resetPassword,
  passwordChanged,
  welcome,
  accountCreated,
  vendorOnboarding,
  productApproved,
};
