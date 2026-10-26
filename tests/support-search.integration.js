import { test, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
if (
  process.env.NODE_ENV !== "test" ||
  !process.env.DATABASE_URL?.includes("barwaqt_test")
)
  throw Error("Use an isolated barwaqt_test database");
const { app } = await import("../src/app.js");
const { db } = await import("../src/config/database.js");
const { env } = await import("../src/config/env.js");
after(() => db.$disconnect());
async function actor(role) {
  const user = await db.user.create({
    data: {
      email: `${randomUUID()}@category.test`,
      role,
      passwordHash: "test-only-disabled",
      firstName: role,
    },
  });
  const session = await db.session.create({
    data: {
      userId: user.id,
      tokenHash: randomUUID(),
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  return {
    ...user,
    token: jwt.sign({ sid: session.id }, env.JWT_SECRET, {
      subject: user.id,
      issuer: "barwaqt",
      audience: "barwaqt-api",
      expiresIn: "1h",
    }),
  };
}
function call(method, path, user, body) {
  let r = request(app)[method]("/api/v1" + path);
  if (user) r = r.set("Authorization", "Bearer " + user.token);
  return body ? r.send(body) : r;
}
async function ok(p) {
  const r = await p;
  assert.ok(r.status < 300, `${r.status}: ${JSON.stringify(r.body)}`);
  return r.body.data;
}

test("admin support contacts and ranked customer search tags persist", async () => {
  const admin = await actor("ADMIN"),
    customer = await actor("CUSTOMER");
  const contacts = {
    phone: "+923001234567",
    phone2: "",
    email: "support@example.com",
    whatsapp: "+923001234567",
  };
  assert.equal(
    (await call("put", "/admin/support", customer, contacts)).status,
    403,
  );
  await ok(call("put", "/admin/support", admin, contacts));
  assert.deepEqual(await ok(call("get", "/catalog/support")), contacts);
  assert.equal(
    (
      await call("put", "/admin/support", admin, {
        ...contacts,
        email: "invalid",
      })
    ).status,
    422,
  );
  const suffix = randomUUID().slice(0, 8),
    term = "rice " + suffix;
  await ok(call("post", "/catalog/searches", null, { term }));
  await ok(
    call("post", "/catalog/searches", null, { term: term.toUpperCase() }),
  );
  assert.equal((await db.searchTerm.findUnique({ where: { term } })).count, 2);
  const { searchSuggestions } =
    await import("../src/services/search.service.js");
  assert.deepEqual(
    await searchSuggestions({
      terms: ["Manual", "manual"],
      limit: 1,
      dynamic: true,
    }),
    ["manual"],
  );
  assert.deepEqual(
    await searchSuggestions({ terms: [], limit: 5, dynamic: false }),
    [],
  );
  assert.equal(
    (await call("post", "/catalog/searches", null, { term: "" })).status,
    422,
  );
  const document = await ok(call("get", "/admin/homepage", admin));
  document.content.searches = {enabled:true,title:"Popular Searches",terms:["Pinned"],limit:2,dynamic:true};
  await db.storefrontPage.update({where:{key:"homepage"},data:{content:document.content}});
  const publicHome = await ok(call("get", "/catalog/homepage"));
  assert.equal(publicHome.content.searches.terms[0], "pinned");
  assert.equal(publicHome.content.searches.terms.length, 2);
  const adminHome = await ok(call("get", "/admin/homepage", admin));
  assert.deepEqual(adminHome.content.searches.terms, ["Pinned"]);

});
