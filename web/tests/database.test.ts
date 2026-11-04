import assert from "node:assert/strict";
import test from "node:test";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { normalizedEmailAdapter } from "../server/auth/normalized-email-adapter";

test("Auth.js adapter persists OAuth accounts and revocable database sessions", {
  skip: !process.env.TEST_DATABASE_URL,
}, async () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL, options: "-c timezone=UTC" }) });
  const adapter = normalizedEmailAdapter(PrismaAdapter(prisma));
  let userId: string | undefined;
  try {
    const user = await adapter.createUser!({ id: crypto.randomUUID(), name: "Test", email: `${crypto.randomUUID()}@example.test`, emailVerified: null, phone: null, role: "CUSTOMER", isActive: true });
    userId = user.id;
    await adapter.linkAccount!({ userId, type: "oidc", provider: "google", providerAccountId: userId });
    assert.equal((await adapter.getUserByAccount!({ provider: "google", providerAccountId: userId }))?.id, userId);
    const sessionToken = crypto.randomUUID();
    await adapter.createSession!({ userId, sessionToken, expires: new Date(Date.now() + 60_000) });
    assert.equal((await adapter.getSessionAndUser!(sessionToken))?.user.id, userId);
    assert.equal(await adapter.getSessionAndUser!("forged-token"), null);
    await adapter.deleteSession!(sessionToken);
    assert.equal(await adapter.getSessionAndUser!(sessionToken), null);
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    assert.equal(stored.role, "CUSTOMER");
    assert.equal(stored.phone, null);
  } finally {
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  }
});

test("database rejects negative inventory and invalid order totals", {
  skip: !process.env.TEST_DATABASE_URL,
}, async () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL, options: "-c timezone=UTC" }) });
  const product = await prisma.product.create({ data: { name: "Constraint test", category: "FRUIT" } });
  try {
    await assert.rejects(prisma.productOption.create({ data: { productId: product.id, size: "SMALL", label: "Small", price: 100, stock: -1 } }));
    await assert.rejects(prisma.productOption.create({ data: { productId: product.id, size: "SMALL", label: "Small", price: 0, stock: 1 } }));
    // Check constraints are evaluated before foreign keys on this deliberately invalid order.
    await assert.rejects(prisma.order.create({ data: { userId: crypto.randomUUID(), deliveryZoneId: "missing", deliveryAddress: {}, deliveryFee: 100, itemSubtotal: 200, total: 1, estimatedDeliveryTime: "30 min", idempotencyKey: crypto.randomUUID(), requestHash: "test" } }), /Order_amounts_valid/);
  } finally {
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.$disconnect();
  }
});

test("mobile grants are one-use under concurrent redemption", {
  skip: !process.env.TEST_DATABASE_URL,
}, async () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL, options: "-c timezone=UTC" }) });
  const codeHash = crypto.randomUUID();
  const challenge = crypto.randomUUID();
  try {
    await prisma.mobileAuthGrant.create({ data: { codeHash, challenge, userId: crypto.randomUUID(), expires: new Date(Date.now() + 60_000) } });
    const attempts = await Promise.all([1, 2].map(() => prisma.mobileAuthGrant.deleteMany({ where: { codeHash, challenge, expires: { gt: new Date() } } })));
    assert.equal(attempts.reduce((sum, result) => sum + result.count, 0), 1);
  } finally {
    await prisma.mobileAuthGrant.deleteMany({ where: { codeHash } });
    await prisma.$disconnect();
  }
});
