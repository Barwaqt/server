import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL ||= "postgresql://test:test@localhost/barwaqt_test";
process.env.JWT_SECRET ||= "veevo-unit-test-secret-more-than-32-characters";
process.env.VEEVO_SMS_API_KEY = "unit-sms-key";
process.env.VEEVO_WHATSAPP_API_KEY = "unit-whatsapp-key";
process.env.VEEVO_SMS_SENDER = "Barwaqt";
const { env } = await import("../src/config/env.js");
const { sendSms, sendWhatsapp, smsReady } =
  await import("../src/services/veevo.service.js");
const { internationalPhone } = await import("../src/utils/phone.js");
const original = globalThis.fetch;
after(() => {
  globalThis.fetch = original;
});
test("normalize Pakistan and international phone numbers; reject malformed inputs", () => {
  for (const input of [
    "03001234567",
    "923001234567",
    "00923001234567",
    "+92 (300) 1234567",
  ])
    assert.equal(internationalPhone.parse(input), "+923001234567");
  for (const input of ["abc", "123", "+00000000000"])
    assert.equal(internationalPhone.safeParse(input).success, false);
});
test("SMS uses the documented POST body and never puts credentials in a URL", async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://api.veevotech.com/v3/sendsms");
    assert.equal(options.method, "POST");
    assert.equal(options.redirect, "error");
    assert.deepEqual(JSON.parse(options.body), {
      hash: "unit-sms-key",
      apikey: "unit-sms-key",
      receivernum: "+923001234567",
      textmessage: "hello",
      sendernum: "Barwaqt",
    });
    return Response.json({ STATUS: "SUCCESSFUL", MESSAGE_ID: "sms-1" });
  };
  assert.deepEqual(await sendSms("+923001234567", "hello"), {
    providerId: "sms-1",
  });
});
test("WhatsApp templates use hash authentication, variable arrays and digits-only recipient", async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://wa-api.veevotech.com/wa/v1/send_message");
    assert.equal(options.headers.hash, "unit-whatsapp-key");
    assert.deepEqual(JSON.parse(options.body), {
      to: "923001234567",
      type: "template",
      message_ref: "ref-1",
      template_id: 42,
      header_variables: ["Sale"],
      body_variables: ["50%"],
      media_url: [],
      priority: 1,
    });
    return Response.json({ STATUS: "SUCCESSFUL", MESSAGE_ID: "wa-1" });
  };
  assert.equal(
    (
      await sendWhatsapp(
        "+923001234567",
        { templateId: 42, headerVariables: ["Sale"], bodyVariables: ["50%"] },
        "ref-1",
      )
    ).providerId,
    "wa-1",
  );
});
test("HTTP 200 provider errors, malformed JSON and timeouts never count as success or leak credentials", async () => {
  for (const response of [
    () =>
      Response.json({ STATUS: "FAILED", ERROR_DESCRIPTION: "unit-sms-key" }),
    () => new Response("<html>bad gateway</html>", { status: 502 }),
    () => {
      throw Error("unit-sms-key timeout");
    },
  ]) {
    globalThis.fetch = async () => response();
    await assert.rejects(
      sendSms("+923001234567", "hello"),
      (error) =>
        error.status === 502 && !error.message.includes("unit-sms-key"),
    );
  }
});
test("dummy keys fail closed without a network request", async () => {
  env.VEEVO_SMS_API_KEY = "dummy_replace_with_key";
  assert.equal(smsReady(), false);
  globalThis.fetch = async () => {
    assert.fail("Dummy key must not send");
  };
  await assert.rejects(
    sendSms("+923001234567", "hello"),
    (error) => error.status === 503,
  );
  env.VEEVO_SMS_API_KEY = "unit-sms-key";
});
