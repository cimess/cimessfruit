import test from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "../generated/prisma/client";
import { createRecoveryHandlers } from "../controllers/recovery-handlers";
import { createDeletionHandlers } from "../controllers/account-deletion";
const request = (body: unknown) => new Request("https://shop.test", { method: "POST", body: JSON.stringify(body) });
function fixture() {
  const user = { id: "customer", email: "customer@example.test", isActive: true, selfDisabledAt: null as Date | null, emailVerified: null as Date | null, role: "CUSTOMER" };
  const records = new Map<string, { token: string; identifier: string; expires: Date }>();
  let sessions = 2, grants = 1, link = "";
  const db = {
    user: {
      findUnique: async () => user, findFirst: async () => user.isActive ? user : null, count: async () => 0,
      update: async ({ data }: { data: Partial<typeof user> }) => Object.assign(user, data),
      updateMany: async ({ where, data }: { where: { isActive: boolean; selfDisabledAt?: unknown }; data: Partial<typeof user> }) => {
        if (where.isActive !== user.isActive || (where.selfDisabledAt && !user.selfDisabledAt)) return { count: 0 };
        Object.assign(user, data); return { count: 1 };
      },
    },
    verificationToken: {
      create: async ({ data }: { data: { token: string; identifier: string; expires: Date } }) => { records.set(data.token, data); },
      findUnique: async ({ where }: { where: { token: string } }) => records.get(where.token),
      delete: async ({ where }: { where: { token: string } }) => { records.delete(where.token); },
      deleteMany: async () => { records.clear(); },
    },
    session: { deleteMany: async () => { sessions = 0; } },
    mobileAuthGrant: { deleteMany: async () => { grants = 0; } },
    $transaction: async (fn: (tx: unknown) => Promise<void>) => fn(db),
  };
  const deps = { db: db as unknown as PrismaClient, readBody: (r: Request) => r.json(), allowAttempt: async () => true, origin: () => "https://shop.test", send: async (_email: string, _subject: string, text: string) => { link = text.match(/https:\/\/\S+/)![0]; } };
  return { user, records, deps, recovery: createRecoveryHandlers(deps), disabling: createDeletionHandlers(deps), token: () => new URLSearchParams(new URL(link).hash.slice(1)).get("token")!, counts: () => ({ sessions, grants }), hasLink: () => !!link };
}
test("disabling and verified reactivation preserve identity and revoke sessions", async () => {
  const f = fixture();
  await f.disabling.request(request({ email: f.user.email })); const token = f.token();
  assert.equal((await f.disabling.complete(request({ token, confirmation: "DELETE" }))).status, 400);
  assert.equal(f.user.isActive, true);
  assert.equal((await f.disabling.complete(request({ token, confirmation: "DISABLE" }))).status, 200);
  assert.equal(f.user.isActive, false); assert.ok(f.user.selfDisabledAt);
  assert.deepEqual(f.counts(), { sessions: 0, grants: 0 });
  assert.equal((await f.disabling.complete(request({ token, confirmation: "DISABLE" }))).status, 400);
  await f.recovery.request(request({ email: f.user.email, kind: "reactivate" })); const reactivation = f.token();
  assert.equal((await f.recovery.complete(request({ token: reactivation, kind: "verify" }))).status, 400);
  assert.equal(f.user.isActive, false);
  assert.equal((await f.recovery.complete(request({ token: reactivation, kind: "reactivate" }))).status, 200);
  assert.equal(f.user.isActive, true); assert.equal(f.user.selfDisabledAt, null);
  assert.equal(f.user.id, "customer"); assert.ok(f.user.emailVerified);
  assert.equal((await f.recovery.complete(request({ token: reactivation, kind: "reactivate" }))).status, 400);
});
test("administratively disabled accounts cannot request or redeem reactivation", async () => {
  const f = fixture(); f.user.isActive = false;
  await f.recovery.request(request({ email: f.user.email, kind: "reactivate" })); assert.equal(f.hasLink(), false);
  f.user.selfDisabledAt = new Date(); await f.recovery.request(request({ email: f.user.email, kind: "reactivate" }));
  f.user.selfDisabledAt = null;
  assert.equal((await f.recovery.complete(request({ token: f.token(), kind: "reactivate" }))).status, 400);
  assert.equal(f.user.isActive, false);
});
test("expired reactivation tokens are rejected", async () => {
  const f = fixture(); f.user.isActive = false; f.user.selfDisabledAt = new Date();
  await f.recovery.request(request({ email: f.user.email, kind: "reactivate" }));
  for (const record of f.records.values()) record.expires = new Date(0);
  assert.equal((await f.recovery.complete(request({ token: f.token(), kind: "reactivate" }))).status, 400);
  assert.equal(f.user.isActive, false);
});
test("last active administrator cannot disable their account", async () => {
  const f = fixture(); f.user.role = "ADMIN"; await f.disabling.request(request({ email: f.user.email }));
  assert.equal((await f.disabling.complete(request({ token: f.token(), confirmation: "DISABLE" }))).status, 409);
  assert.equal(f.user.isActive, true); assert.deepEqual(f.counts(), { sessions: 2, grants: 1 });
});

