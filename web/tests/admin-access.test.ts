import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "../generated/prisma/client";
import { createAdminAccessHandler, matchesAdminKey } from "../controllers/admin-access";
import type { SessionUser } from "../domain/session-user";

const key = "test-only-authorization-key-0123456789-abcdefgh";
const customer: SessionUser = { id: "customer", name: null, email: "test@example.test", phone: null, image: null, role: "CUSTOMER", isActive: true };
const req = (authorizationKey: string, extra = {}) => new Request("https://example.test/api/account/admin-access", { method: "POST", body: JSON.stringify({ authorizationKey, ...extra }) });
function fixture(user: SessionUser | null = customer, configured: string | undefined = key, allowed = true) {
  let promoted = false; let revoked = false;
  const db = { $transaction: async (operation: (tx: unknown) => Promise<number>) => operation({
    user: { updateMany: async ({ where, data }: { where: { id: string; role: string; isActive: boolean }; data: { role: string } }) => {
      assert.deepEqual(where, { id: customer.id, isActive: true, role: "CUSTOMER" });
      assert.equal(data.role, "ADMIN"); promoted = true; return { count: 1 };
    } },
    session: { deleteMany: async ({ where }: { where: { userId: string } }) => { assert.equal(where.userId, customer.id); revoked = true; } },
  }) } as unknown as Pick<PrismaClient, "$transaction">;
  const handler = createAdminAccessHandler({ db, currentUser: async () => user, key: () => configured, readBody: async request => request.json(), allowAttempt: async () => allowed });
  return { handler, state: () => ({ promoted, revoked }) };
}
test("only the exact configured strong key matches", () => {
  assert.equal(matchesAdminKey(key, key), true);
  for (const value of ["", "incorrect", key + " ", key.toUpperCase()]) assert.equal(matchesAdminKey(value, key), false);
  assert.equal(matchesAdminKey("short", "short"), false);
  assert.equal(matchesAdminKey(key, undefined), false);
});
test("customer with the correct key becomes admin and must sign in again", async () => {
  const f = fixture(); const response = await f.handler(req(key));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, signInRequired: true });
  assert.deepEqual(f.state(), { promoted: true, revoked: true });
});
test("invalid keys, account injection, guests and disabled users cannot gain admin access", async () => {
  for (const [user, request, status] of [[null, req(key), 401], [{ ...customer, isActive: false }, req(key), 401], [customer, req("invalid"), 403], [customer, req(key, { userId: "someone-else" }), 403]] as const) {
    const f = fixture(user); assert.equal((await f.handler(request)).status, status); assert.equal(f.state().promoted, false);
  }
});
test("activation fails closed when unconfigured or rate-limited", async () => {
  assert.equal((await fixture(customer, "").handler(req(key))).status, 503);
  const f = fixture(customer, key, false); assert.equal((await f.handler(req(key))).status, 429); assert.equal(f.state().promoted, false);
});
test("existing admins are not re-promoted or signed out", async () => {
  const f = fixture({ ...customer, role: "ADMIN" });
  assert.deepEqual(await (await f.handler(req(""))).json(), { alreadyAdmin: true });
  assert.deepEqual(f.state(), { promoted: false, revoked: false });
});
