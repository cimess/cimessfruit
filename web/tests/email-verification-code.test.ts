import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "../generated/prisma/client";
import { createRecoveryHandlers } from "../controllers/recovery-handlers";
const request = (body: unknown) => new Request("https://shop.test/api/recovery", { method: "POST", body: JSON.stringify(body) });
function fixture() {
  const user = { id: "user-1", email: "user@example.test", isActive: true, emailVerified: null as Date | null };
  const records = new Map<string, { identifier: string; token: string; expires: Date }>();
  const emails: string[] = [];
  const attempts = new Map<string, number>();
  const db = {
    user: {
      findUnique: async () => user,
      updateMany: async ({ where, data }: { where: { id: string; email: string; isActive: boolean }; data: { emailVerified: Date } }) => {
        if (where.id !== user.id || where.email !== user.email || where.isActive !== user.isActive) return { count: 0 };
        user.emailVerified = data.emailVerified; return { count: 1 };
      },
    },
    verificationToken: {
      create: async ({ data }: { data: { identifier: string; token: string; expires: Date } }) => { records.set(data.token, data); },
      findUnique: async ({ where }: { where: { token: string } }) => records.get(where.token),
      delete: async ({ where }: { where: { token: string } }) => { records.delete(where.token); },
      deleteMany: async ({ where }: { where: { identifier?: string; token?: string } }) => {
        for (const [key, record] of records) if (record.identifier === where.identifier || key === where.token) records.delete(key);
      },
    },
    $transaction: async (run: (tx: unknown) => Promise<void>) => run(db),
  };
  const handlers = createRecoveryHandlers({ db: db as unknown as PrismaClient, readBody: r => r.json(), origin: () => "https://shop.test", send: async (_email, _subject, text) => { emails.push(text); }, allowAttempt: async key => { const n = (attempts.get(key) ?? 0) + 1; attempts.set(key, n); return n <= 10; } });
  return { user, records, emails, attempts, handlers, code: () => emails.at(-1)!.match(/code is (\d{6})/)![1], send: () => handlers.request(request({ kind: "verify", email: user.email })), complete: (token: string, email = user.email) => handlers.complete(request({ kind: "verify", email, token })) };
}
test("verification emails contain six digits without a link; hashed code verifies only its email once", async () => {
  const f = fixture();
  assert.equal((await f.send()).status, 200);
  const code = f.code(); assert.match(code, /^\d{6}$/); assert.equal(f.emails[0].includes("https://"), false);
  assert.equal(f.records.has(code), false);
  assert.equal((await f.complete(code, "other@example.test")).status, 400);
  assert.equal(f.user.emailVerified, null);
  assert.equal((await f.complete(code, " USER@EXAMPLE.TEST ")).status, 200);
  assert.ok(f.user.emailVerified); assert.equal(f.records.size, 0);
  assert.equal((await f.complete(code)).status, 400);
});
test("resend replaces the stored code; expired and legacy link tokens fail", async () => {
  const f = fixture(); await f.send();
  const oldRecord = [...f.records.values()][0];
  await f.send(); assert.equal(f.records.size, 1); assert.notEqual([...f.records.values()][0], oldRecord);
  const record = [...f.records.values()][0];
  assert.ok(record.expires.getTime() <= Date.now() + 10 * 60 * 1000);
  record.expires = new Date(0);
  assert.equal((await f.complete(f.code())).status, 400);
  assert.equal((await f.complete("a".repeat(64))).status, 400);
  assert.equal(f.user.emailVerified, null);
});
test("changing guesses or resending cannot reset the email-scoped attempt budget", async () => {
  const f = fixture(); await f.send();
  const code = f.code();
  for (let i = 0; i < 10; i++) {
    const wrong = ((Number(code) + i + 1) % 1_000_000).toString().padStart(6, "0");
    assert.equal((await f.complete(wrong)).status, 400);
  }
  await f.send();
  assert.equal((await f.complete(f.code())).status, 429);
  assert.equal(f.user.emailVerified, null);
  assert.equal(f.attempts.get(`verify-complete:${f.user.email}`), 11);
});
test("inactive and already-verified users receive no new verification code", async () => {
  const f = fixture(); f.user.isActive = false;
  assert.equal((await f.send()).status, 200); assert.equal(f.emails.length, 0);
  f.user.isActive = true; f.user.emailVerified = new Date();
  assert.equal((await f.send()).status, 200); assert.equal(f.emails.length, 0);
});
test("a code cannot reactivate a disabled account or reset a password", async () => {
  const f = fixture(); await f.send(); const token = f.code();
  assert.equal((await f.handlers.complete(request({ token, kind: "reactivate" }))).status, 400);
  assert.equal((await f.handlers.complete(request({ token, kind: "reset", password: "long-password-123" }))).status, 400);
  f.user.isActive = false;
  assert.equal((await f.complete(token)).status, 400); assert.equal(f.user.emailVerified, null);
});
