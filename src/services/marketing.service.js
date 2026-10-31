import { z } from "zod";
import { db, transaction } from "../config/database.js";
import { internationalPhone } from "../utils/phone.js";
import { assert } from "../utils/error.js";
import { hashToken } from "../utils/security.js";
import {
  sendSms,
  sendWhatsapp,
  smsReady,
  whatsappReady,
} from "./veevo.service.js";
export const campaignInput = z
  .object({
    name: z.string().trim().min(1).max(100),
    channels: z
      .array(z.enum(["SMS", "WHATSAPP"]))
      .min(1)
      .max(2)
      .refine((v) => new Set(v).size === v.length),
    recipients: z
      .array(internationalPhone)
      .min(1)
      .max(100)
      .transform((v) => [...new Set(v)]),
    smsText: z.string().trim().min(1).max(1600).optional(),
    whatsapp: z
      .object({
        templateId: z.number().int().positive(),
        headerVariables: z.array(z.string().max(1000)).max(1).default([]),
        bodyVariables: z.array(z.string().max(1000)).max(20).default([]),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.channels.includes("SMS") && !v.smsText)
      ctx.addIssue({
        code: "custom",
        message: "SMS text is required",
        path: ["smsText"],
      });
    if (v.channels.includes("WHATSAPP") && !v.whatsapp)
      ctx.addIssue({
        code: "custom",
        message: "WhatsApp template is required",
        path: ["whatsapp"],
      });
  });
export const configuration = () => ({
  smsConfigured: smsReady(),
  whatsappConfigured: whatsappReady(),
  maxRecipients: 100,
});
export async function createCampaign(actor, input, key) {
  assert(
    typeof key === "string" && /^[a-zA-Z0-9_-]{8,100}$/.test(key),
    422,
    "Provide an Idempotency-Key header.",
  );
  const requestHash = hashToken(JSON.stringify(input));
  return transaction(async (tx) => {
    const old = await tx.marketingCampaign.findUnique({
      where: { actorId_requestKey: { actorId: actor.id, requestKey: key } },
      include: { messages: true },
    });
    if (old) {
      assert(
        old.requestHash === requestHash,
        409,
        "This request key belongs to another campaign.",
      );
      return old;
    }
    assert(
      !input.channels.includes("SMS") || smsReady(),
      503,
      "Configure a real Veevo SMS API key before sending.",
    );
    assert(
      !input.channels.includes("WHATSAPP") || whatsappReady(),
      503,
      "Configure a real Veevo WhatsApp API hash before sending.",
    );
    const campaign = await tx.marketingCampaign.create({
      data: {
        actorId: actor.id,
        requestKey: key,
        requestHash,
        name: input.name,
        channels: input.channels,
        content: {
          ...(input.smsText ? { smsText: input.smsText } : {}),
          ...(input.whatsapp ? { whatsapp: input.whatsapp } : {}),
        },
        messages: {
          create: input.recipients.flatMap((phone) =>
            input.channels.map((channel) => ({ phone, channel })),
          ),
        },
      },
      include: { messages: true },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "MARKETING_CAMPAIGN_QUEUED",
        entityId: campaign.id,
        metadata: {
          channels: input.channels,
          recipients: input.recipients.length,
        },
      },
    });
    return campaign;
  });
}
export async function campaigns() {
  return db.marketingCampaign.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { messages: true },
  });
}
// Claim before network I/O. Never automatically retry an uncertain send: doing so
// could charge twice or deliver the same campaign twice after a timeout/crash.
export async function processNextMessage() {
  await db.phoneOtp.updateMany({
    where: {
      expiresAt: { lt: new Date() },
      status: { in: ["PENDING", "SENT", "FAILED"] },
    },
    data: { status: "EXPIRED", codeHash: "", pending: {} },
  });
  await db.marketingMessage.updateMany({
    where: {
      status: "SENDING",
      updatedAt: { lt: new Date(Date.now() - 60000) },
    },
    data: {
      status: "UNKNOWN",
      error:
        "Delivery unconfirmed after interruption. Check the Veevo portal before retrying.",
    },
  });
  const next = await db.marketingMessage.findFirst({
    where: { status: "QUEUED" },
    orderBy: { createdAt: "asc" },
    include: { campaign: true },
  });
  if (!next) return;
  const claimed = await db.marketingMessage.updateMany({
    where: { id: next.id, status: "QUEUED" },
    data: { status: "SENDING" },
  });
  if (!claimed.count) return;
  let result;
  try {
    result =
      next.channel === "SMS"
        ? await sendSms(next.phone, next.campaign.content.smsText)
        : await sendWhatsapp(
            next.phone,
            next.campaign.content.whatsapp,
            next.id,
          );
  } catch (error) {
    await db.marketingMessage.update({
      where: { id: next.id },
      data: {
        status: error.status === 503 ? "FAILED" : "UNKNOWN",
        error:
          error.message ||
          "Message not confirmed. Check provider configuration and the Veevo portal before resending.",
      },
    });
    return;
  }
  await db.marketingMessage.update({
    where: { id: next.id },
    data: { status: "ACCEPTED", providerId: result.providerId, error: null },
  });
}
export function startMarketingWorker() {
  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await processNextMessage();
    } catch {
      console.error("Marketing worker could not process a message.");
    } finally {
      busy = false;
    }
  }, 1000);
  timer.unref();
  return () => clearInterval(timer);
}
