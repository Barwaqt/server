import { env } from "../config/env.js";
import { db } from "../config/database.js";

let messagingPromise = null;

export const pushConfigured = () =>
  Boolean(
    env.FIREBASE_PROJECT_ID &&
      env.FIREBASE_CLIENT_EMAIL &&
      env.FIREBASE_PRIVATE_KEY,
  );

async function getMessaging() {
  if (!pushConfigured()) return null;
  if (!messagingPromise) {
    messagingPromise = (async () => {
      const { initializeApp, getApps, cert } = await import(
        "firebase-admin/app"
      );
      const { getMessaging: getFcm } = await import("firebase-admin/messaging");
      const app =
        getApps()[0] ||
        initializeApp({
          credential: cert({
            projectId: env.FIREBASE_PROJECT_ID,
            clientEmail: env.FIREBASE_CLIENT_EMAIL,
            privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
          }),
        });
      return getFcm(app);
    })().catch((error) => {
      messagingPromise = null;
      throw error;
    });
  }
  return messagingPromise;
}

// Send an FCM notification to every registered device of a user.
// Push delivery is best effort: a provider outage must never fail the
// business action that triggered it.
export async function sendPushToUser(userId, { title, body, data, link }) {
  try {
    const devices = await db.deviceToken.findMany({
      where: { userId },
      select: { token: true },
    });
    if (!devices.length) return;
    const messaging = await getMessaging();
    if (!messaging) return;
    // Data-only messages let the rider service worker (and the open page)
    // render the notification once, avoiding duplicate system notifications.
    const response = await messaging.sendEachForMulticast({
      tokens: devices.map((device) => device.token),
      data: {
        ...Object.fromEntries(
          Object.entries(data || {}).map(([key, value]) => [
            key,
            String(value),
          ]),
        ),
        title,
        body,
        ...(link ? { link } : {}),
      },
    });
    const stale = response.responses
      .map((result, index) =>
        result.error?.code === "messaging/registration-token-not-registered" ||
        result.error?.code === "messaging/invalid-argument"
          ? devices[index].token
          : null,
      )
      .filter(Boolean);
    if (stale.length)
      await db.deviceToken.deleteMany({ where: { token: { in: stale } } });
  } catch (error) {
    console.warn("FCM push failed:", error?.message || error);
  }
}
