import test from "node:test";
import assert from "node:assert/strict";
import { hash } from "bcryptjs";
import type { Adapter } from "next-auth/adapters";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { normalizedEmailAdapter } from "../server/auth/normalized-email-adapter";
import { createPasswordLogin } from "../controllers/password-login";
import { createRecoveryHandlers } from "../controllers/recovery-handlers";
import { createDeletionHandlers } from "../controllers/account-deletion";

const profile = {
  id: "identity-test", email: "user@example.test", name: null, image: null,
  phone: null, role: "CUSTOMER" as const, isActive: true, emailVerified: null,
};
const request = (body: unknown) => new Request("https://shop.test/api/auth", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

test("OAuth adapter normalizes create/update/lookup without changing account linking", async () => {
  const calls: unknown[] = [];
  const linkAccount: NonNullable<Adapter["linkAccount"]> = async () => {};
  const base: Adapter = {
    createUser: async data => { calls.push(data); return { ...profile, ...data }; },
    updateUser: async data => { calls.push(data); return { ...profile, ...data }; },
    getUserByEmail: async email => { calls.push(email); return { ...profile, email }; },
    linkAccount,
  };
  const adapter = normalizedEmailAdapter(base);
  const created = await adapter.createUser!({ ...profile, email: " USER@Example.TEST " });
  assert.equal(created.email, "user@example.test");
  assert.equal((await adapter.getUserByEmail!(" USER@Example.TEST "))?.email, created.email);
  assert.equal((await adapter.updateUser!({ id: profile.id, email: " OTHER@Example.TEST " })).email, "other@example.test");
  await adapter.updateUser!({ id: profile.id, name: "Changed name" });
  assert.equal("email" in (calls[3] as object), false);
  assert.equal(adapter.linkAccount, linkAccount);
  assert.throws(() => adapter.createUser!({ ...profile, email: "invalid" }));
  assert.throws(() => adapter.getUserByEmail!("invalid"));
  assert.equal(calls.length, 4);
});

test("password login uses normalized unique email/phone lookups and never returns a password hash", async () => {
  const passwordHash = await hash("long-test-password", 4);
  const calls: Prisma.UserFindUniqueArgs[] = [];
  const attempts: string[] = [];
  const login = createPasswordLogin({
    db: { user: { findUnique: async (args: Prisma.UserFindUniqueArgs) => {
      calls.push(args); return { ...profile, passwordHash };
    } } } as unknown as Pick<PrismaClient, "user">,
    readBody: req => req.json(),
    allowAttempt: async value => { attempts.push(value); return true; },
    respond: async user => Response.json({ user }),
  });
  const result = await login(request({ emailOrPhone: " USER@Example.TEST ", password: "long-test-password" }));
  assert.equal(result.status, 200);
  assert.equal("passwordHash" in (await result.json()).user, false);
  assert.deepEqual(calls[0].where, { email: "user@example.test" });
  assert.equal(attempts[0], "user@example.test");
  assert.equal((await login(request({ emailOrPhone: " +2348012345678 ", password: "long-test-password" }))).status, 200);
  assert.deepEqual(calls[1].where, { phone: "+2348012345678" });
  assert.equal((await login(request({ emailOrPhone: profile.email, password: "wrong" }))).status, 401);
});

test("password login preserves inactive/missing/passwordless rejection and rate limits before reads", async () => {
  for (const record of [null, { ...profile, passwordHash: null }, { ...profile, isActive: false, passwordHash: await hash("long-test-password", 4) }]) {
    const login = createPasswordLogin({
      db: { user: { findUnique: async () => record } } as unknown as Pick<PrismaClient, "user">,
      readBody: req => req.json(), allowAttempt: async () => true,
      respond: async () => { throw Error("Must not issue session"); },
    });
    assert.equal((await login(request({ emailOrPhone: profile.email, password: "long-test-password" }))).status, 401);
  }
  const login = createPasswordLogin({
    db: {} as Pick<PrismaClient, "user">,
    readBody: req => req.json(), allowAttempt: async () => false,
    respond: async () => { throw Error("Must not issue session"); },
  });
  assert.equal((await login(request({ emailOrPhone: profile.email, password: "secret" }))).status, 429);
});

test("recovery and deletion share normalized exact email lookups and generic responses", async () => {
  for (const kind of ["reset", "verify", "delete"]) {
    const queries: unknown[] = [];
    const attempts: string[] = [];
    const deps = {
      db: { user: { findUnique: async (args: unknown) => { queries.push(args); return null; } } } as unknown as PrismaClient,
      readBody: (req: Request) => req.json(),
      allowAttempt: async (key: string) => { attempts.push(key); return true; },
      origin: () => "https://shop.test",
      send: async () => { throw Error("Absent account must not send"); },
    };
    const handlers = kind === "delete" ? createDeletionHandlers(deps) : createRecoveryHandlers(deps);
    const response = await handlers.request(request({ email: " USER@Example.TEST ", ...(kind === "delete" ? {} : { kind }) }));
    assert.equal(response.status, 200);
    assert.deepEqual(queries, [{ where: { email: "user@example.test" } }]);
    assert.equal(attempts[0], `${kind === "delete" ? "delete-request" : "recovery"}:user@example.test`);
    assert.equal((await handlers.request(request({ email: "not-an-email", ...(kind === "delete" ? {} : { kind }) }))).status, 400);
    assert.equal(queries.length, 1);
  }
});
