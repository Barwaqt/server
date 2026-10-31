import { env } from "../config/env.js";
import { ApiError, assert } from "../utils/error.js";
export const smsReady = () =>
  !!env.VEEVO_SMS_API_KEY &&
  !/dummy|YOUR_|replace/i.test(env.VEEVO_SMS_API_KEY);
export const whatsappReady = () =>
  !!env.VEEVO_WHATSAPP_API_KEY &&
  !/dummy|YOUR_|replace/i.test(env.VEEVO_WHATSAPP_API_KEY);
async function post(url, body, headers = {}) {
  let response, data;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    });
    data = await response.json();
  } catch {
    throw new ApiError(
      502,
      "Message delivery could not be confirmed. Check the Veevo portal before retrying.",
    );
  }
  if (!response.ok || data?.STATUS !== "SUCCESSFUL") {
    const detail = data?.ERROR_DESCRIPTION
      ? `Veevo error: ${data.ERROR_DESCRIPTION}${data.ERROR_FILTER ? ` (${data.ERROR_FILTER})` : ""}`
      : "Veevo did not accept this message. Check your credentials, balance, sender or template in the Veevo portal.";
    throw new ApiError(
      502,
      detail.replaceAll(env.VEEVO_SMS_API_KEY || "", "[REDACTED]"),
    );
  }
  return {
    providerId: data.MESSAGE_ID == null ? null : String(data.MESSAGE_ID),
  };
}
export async function sendSms(phone, text) {
  assert(
    smsReady(),
    503,
    "SMS is not configured. Add a real Veevo SMS API key.",
  );
  return post("https://api.veevotech.com/v3/sendsms", {
    hash: env.VEEVO_SMS_API_KEY,
    apikey: env.VEEVO_SMS_API_KEY,
    receivernum: phone,
    textmessage: text,
    sendernum: env.VEEVO_SMS_SENDER || "Default",
  });
}
export async function sendWhatsapp(phone, template, reference) {
  assert(
    whatsappReady(),
    503,
    "WhatsApp is not configured. Add a real Veevo WhatsApp API hash.",
  );
  return post(
    "https://wa-api.veevotech.com/wa/v1/send_message",
    {
      to: phone.replace(/^\+/, ""),
      type: "template",
      message_ref: reference,
      template_id: template.templateId,
      header_variables: template.headerVariables,
      body_variables: template.bodyVariables,
      media_url: [],
      priority: 1,
    },
    { hash: env.VEEVO_WHATSAPP_API_KEY },
  );
}
