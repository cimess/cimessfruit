import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { compare, hash } from "bcryptjs";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createRecoveryHandlers } from "../controllers/recovery-handlers";
const request = (body: unknown) => new Request("https://shop.test/api/recovery", { method: "POST", body: JSON.stringify(body) });
test("recovery consumes links once, isolates purposes, verifies email and revokes sessions", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL, options: "-c timezone=UTC" }) });
  const id = randomUUID(), email = `${id}@example.test`;
  let token = "";
  const handlers = createRecoveryHandlers({ db, readBody: r => r.json(), allowAttempt: async () => true, origin: () => "https://shop.test", send: async (_email, _subject, text) => { token = text.match(/code is (\d{6})/)?.[1] ?? new URLSearchParams(new URL(text.match(/https:\/\/[^\s]+/)![0]).hash.slice(1)).get("token")!; } });
  try {
    await db.user.create({ data: { id, email, passwordHash: await hash("old-password-123", 12) } });
    await db.session.create({ data: { userId: id, sessionToken: randomUUID(), expires: new Date(Date.now()+60000) } });
    assert.equal((await handlers.request(request({ email, kind: "reset" }))).status, 200);
    assert.ok(token);
    assert.equal((await handlers.complete(request({ token, kind: "verify", email }))).status, 400);
    assert.equal((await handlers.complete(request({ token, kind: "reset", password: "new-password-123" }))).status, 200);
    assert.equal(await db.session.count({ where: { userId: id } }), 0);
    assert.ok(await compare("new-password-123", (await db.user.findUniqueOrThrow({ where: { id } })).passwordHash!));
    assert.equal((await handlers.complete(request({ token, kind: "reset", password: "other-password-123" }))).status, 400);
    await handlers.request(request({ email, kind: "verify" }));
    assert.equal((await handlers.complete(request({ token, kind: "verify", email }))).status, 200);
    assert.ok((await db.user.findUniqueOrThrow({ where: { id } })).emailVerified);
    await handlers.request(request({ email, kind: "reset" }));
    await db.verificationToken.updateMany({ where: { identifier: { contains: id } }, data: { expires: new Date(0) } });
    assert.equal((await handlers.complete(request({ token, kind: "reset", password: "other-password-123" }))).status, 400);
  } finally {
    await db.verificationToken.deleteMany({ where: { identifier: { contains: id } } });
    await db.user.deleteMany({ where: { id } }); await db.$disconnect();
  }
});
