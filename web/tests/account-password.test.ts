import assert from "node:assert/strict";
import test from "node:test";
import { compare, hash } from "bcryptjs";
import type { PrismaClient } from "../generated/prisma/client";
import { createPasswordHandler } from "../controllers/account-password";
import { setPasswordSchema } from "../validation/auth-validation";
import type { SessionUser } from "../domain/session-user";

const user: SessionUser = { id: "google-user", name: "Test", email: "google@example.test", image: null, phone: null, role: "CUSTOMER", isActive: true };
const password = "separate-cimess-password";
const request = (body: unknown) => new Request("http://localhost/api/account/password", { method: "POST", body: JSON.stringify(body) });
function setup(initialHash: string | null = null, session: SessionUser | null = user, google = true) {
  let storedHash = initialHash;
  let revoked = false;
  let reads = 0;
  let conflict = false;
  const db = {
    user: { findUnique: async () => { reads++; return { id: user.id, passwordHash: storedHash, isActive: true, accounts: google ? [{ provider: "google" }] : [] }; } },
    $transaction: async (operation: (tx: unknown) => Promise<void>) => operation({
      user: { updateMany: async ({ where, data }: { where: { id: string; passwordHash: string | null; isActive: boolean }; data: { passwordHash: string } }) => {
        assert.equal(where.id, user.id);
        assert.equal(where.isActive, true);
        if (conflict || where.passwordHash !== storedHash) return { count: 0 };
        storedHash = data.passwordHash;
        return { count: 1 };
      } },
      session: { deleteMany: async ({ where }: { where: { userId: string } }) => { assert.equal(where.userId, user.id); revoked = true; } },
    }),
  } as unknown as Pick<PrismaClient, "user" | "$transaction">;
  const handler = createPasswordHandler({ db, currentUser: async () => session, readBody: async (req) => req.json(), allowAttempt: async () => true });
  return { handler, state: () => ({ storedHash, revoked, reads }), conflict: () => { conflict = true; }, db };
}

test("Google users can set a hashed password on their own account without ending the Google handoff", async () => {
  const fixture = setup();
  const response = await fixture.handler(request({ password, confirmPassword: password }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, signInRequired: false });
  const state = fixture.state();
  assert.notEqual(state.storedHash, password);
  assert.equal(await compare(password, state.storedHash!), true);
  assert.equal(state.revoked, false);
});
test("password changes require the current password and revoke all sessions", async () => {
  const previous = await hash("previous-cimess-password", 4);
  const fixture = setup(previous);
  for (const currentPassword of [undefined, "incorrect-password"]) {
    const response = await fixture.handler(request({ password, confirmPassword: password, currentPassword }));
    assert.equal(response.status, 400);
    assert.equal(fixture.state().storedHash, previous);
    assert.equal(fixture.state().revoked, false);
  }
  const response = await fixture.handler(request({ password, confirmPassword: password, currentPassword: "previous-cimess-password" }));
  assert.deepEqual(await response.json(), { success: true, signInRequired: true });
  assert.equal(fixture.state().revoked, true);
  assert.equal(await compare(password, fixture.state().storedHash!), true);
});
test("unauthenticated and disabled sessions cannot set a password", async () => {
  for (const session of [null, { ...user, isActive: false }]) {
    const fixture = setup(null, session);
    assert.equal((await fixture.handler(request({ password, confirmPassword: password }))).status, 401);
    assert.equal(fixture.state().reads, 0);
  }
});
test("password setup rejects account selection, mismatch and bcrypt truncation", () => {
  for (const body of [
    { password, confirmPassword: "other-password" },
    { password: "short", confirmPassword: "short" },
    { password: "🔐".repeat(20), confirmPassword: "🔐".repeat(20) },
    { password, confirmPassword: password, userId: "victim" },
    { password, confirmPassword: password, email: "victim@example.test" },
  ]) assert.equal(setPasswordSchema.safeParse(body).success, false);
});
test("a concurrent password update cannot be overwritten", async () => {
  const fixture = setup(); fixture.conflict();
  assert.equal((await fixture.handler(request({ password, confirmPassword: password }))).status, 409);
  assert.equal(fixture.state().storedHash, null);
});
test("rate limits stop work before reading credentials", async () => {
  const fixture = setup();
  const handler = createPasswordHandler({ db: fixture.db, currentUser: async () => user, allowAttempt: async () => false,
    readBody: async () => { throw Error("Must not read body"); },
  });
  assert.equal((await handler(request({ password, confirmPassword: password }))).status, 429);
  assert.equal(fixture.state().reads, 0);
});

test("passwordless accounts without a Google connection cannot use Google password setup", async () => {
  const fixture = setup(null, user, false);
  assert.equal((await fixture.handler(request({ password, confirmPassword: password }))).status, 403);
  assert.equal(fixture.state().storedHash, null);
});
