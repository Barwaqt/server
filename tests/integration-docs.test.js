import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import request from "supertest";
import { createIntegrationDocsRouter } from "../src/routes/integration-docs.routes.js";

function app() {
  const instance = express();
  instance.use("/integerate/api", createIntegrationDocsRouter());
  return instance;
}
const path = "/integerate/api/complete_api.md";
test("documentation is hidden without a correct POSTed PIN", async () => {
  const server = app();
  const gate = await request(server)
    .get(path + "?pin=264785")
    .expect(200);
  assert.match(gate.text, /Enter the developer PIN/);
  assert.doesNotMatch(gate.text, /264785|# Barwaqt complete API reference/);
  assert.match(gate.headers["cache-control"], /no-store/);
  await request(server)
    .post(path)
    .type("form")
    .send({ pin: "000000" })
    .expect(401);
  const result = await request(server)
    .post(path)
    .type("form")
    .send({ pin: "264785" })
    .expect(200);
  assert.match(result.text, /# Barwaqt complete API reference/);
  assert.match(result.headers["content-type"], /text\/plain/);
  assert.match(result.headers["cache-control"], /no-store/);
  assert.match(result.headers["x-robots-tag"], /noindex/);
  const again = await request(server).get(path).expect(200);
  assert.doesNotMatch(again.text, /# Barwaqt complete API reference/);
});
test("five failed attempts block subsequent PIN attempts", async () => {
  const server = app();
  for (let i = 0; i < 5; i++) {
    await request(server)
      .post(path)
      .type("form")
      .send({ pin: "000000" })
      .expect(401);
  }
  await request(server)
    .post(path)
    .type("form")
    .send({ pin: "264785" })
    .expect(429);
});
