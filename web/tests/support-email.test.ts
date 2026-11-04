import test from "node:test";
import assert from "node:assert/strict";
import { Webhook } from "svix";
import { NextRequest } from "next/server";
import { receiveSupportEmail, listSupportEmails, replySupportEmail } from "../controllers/support-email";
import { guardRequest } from "../server/auth/proxy-policy";
import type { PrismaClient } from "../generated/prisma/client";
const secret = `whsec_${Buffer.from("test-secret-for-support-webhooks").toString("base64")}`;
const id = "11111111-1111-4111-8111-111111111111";
function fixture() {
  let saved = false;
  const calls: string[] = [];
  const deps = {
    env: { RESEND_WEBHOOK_SECRET: secret, RESEND_API_KEY: "test", SUPPORT_EMAIL_ADDRESS: "support@cimessfruit.cimessinvest.com", MAIL_FROM: "Support <support@cimessfruit.cimessinvest.com>" },
    now: () => new Date(), currentUser: async () => null,
    db: { supportEmail: { findUnique: async () => saved ? { id } : null, upsert: async () => { saved = true; } } } as unknown as PrismaClient,
    fetch: (async (url: string | URL | Request) => { calls.push(String(url)); return Response.json({ id, from: "customer@example.com", to: ["support@cimessfruit.cimessinvest.com"], subject: "Help", text: "Order question" }); }) as typeof fetch,
  };
  return { deps, calls };
}
function delivery(valid = true) {
  const body = JSON.stringify({ type: "email.received", data: { email_id: id } });
  const now = new Date();
  return new Request("https://fruit.example/api/support", { method: "POST", body, headers: { "svix-id": "msg_test", "svix-timestamp": String(Math.floor(now.getTime() / 1000)), "svix-signature": valid ? new Webhook(secret).sign("msg_test", now, body) : "invalid" } });
}
test("signed email is persisted once and duplicate deliveries do not fetch again", async () => {
  const { deps, calls } = fixture();
  assert.equal((await receiveSupportEmail(delivery(), deps)).status, 200);
  assert.equal((await (await receiveSupportEmail(delivery(), deps)).json()).duplicate, true);
  assert.equal(calls.length, 1);
});
test("invalid signatures fail before provider or database access", async () => {
  const { deps, calls } = fixture();
  deps.db.supportEmail.findUnique = () => { throw Error("must not access database"); };
  assert.equal((await receiveSupportEmail(delivery(false), deps)).status, 401);
  assert.equal(calls.length, 0);
});
test("email inbox and replies require an admin", async () => {
  const { deps } = fixture();
  assert.equal((await listSupportEmails(new Request("https://fruit.example/api/admin/support/emails"), deps)).status, 401);
  assert.equal((await replySupportEmail(new Request("https://fruit.example", { method: "POST" }), id, deps)).status, 401);
});
test("only webhook-marked support POST bypasses session and browser origin checks", async () => {
  const signed = new NextRequest(delivery());
  assert.equal((await guardRequest(signed, async () => { throw Error("no session required"); })).headers.get("x-middleware-next"), "1");
  const chat = new NextRequest("https://fruit.example/api/support", { method: "POST", headers: { origin: "https://fruit.example" } });
  assert.equal((await guardRequest(chat, async () => null)).status, 401);
  const admin = new NextRequest("https://fruit.example/api/admin/support/emails", { method: "POST", headers: { "svix-id": "forged" } });
  assert.equal((await guardRequest(admin, async () => null)).status, 403);
});
test("admin replies use Resend with a stable retry key and support Reply-To", async () => {
  const { deps } = fixture();
  const key = "22222222-2222-4222-8222-222222222222";
  let sent = false;
  let sends = 0;
  const reply = { id: key, emailId: id, adminId: "admin", body: "We can help.", from: deps.env.MAIL_FROM, to: "customer@example.com", replyTo: deps.env.SUPPORT_EMAIL_ADDRESS, subject: "Re: Help", inReplyTo: "<original@example.com>", createdAt: new Date(), state: "PENDING" };
  const adminDeps = { ...deps, currentUser: async () => ({ id: "admin", name: null, email: "admin@example.com", image: null, phone: null, role: "ADMIN" as const, isActive: true }),
    db: { supportEmail: { findUnique: async () => ({ id, from: "customer@example.com", subject: "Help" }) }, supportEmailReply: { upsert: async () => ({ ...reply, state: sent ? "SENT" : "PENDING" }), update: async () => { sent = true; return { ...reply, state: "SENT" }; } } } as unknown as PrismaClient,
    fetch: (async (url, options) => {
      sends++;
      assert.equal(url, "https://api.resend.com/emails");
      assert.equal(new Headers(options?.headers).get("Idempotency-Key"), `support-reply/${key}`);
      const payload = JSON.parse(String(options?.body));
      assert.deepEqual(payload.to, ["customer@example.com"]);
      assert.equal(payload.reply_to, deps.env.SUPPORT_EMAIL_ADDRESS);
      assert.equal(payload.headers["In-Reply-To"], "<original@example.com>");
      return Response.json({ id: "provider-id" });
    }) as typeof fetch,
  };
  const request = () => new Request("https://fruit.example", { method: "POST", body: JSON.stringify({ key, body: reply.body }) });
  assert.equal((await replySupportEmail(request(), id, adminDeps)).status, 200);
  assert.equal((await replySupportEmail(request(), id, adminDeps)).status, 200);
  assert.equal(sends, 1);
});
