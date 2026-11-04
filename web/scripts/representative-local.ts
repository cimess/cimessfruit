import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    process.env.LOCAL_VERIFICATION_DATABASE !== "1" ||
    url.hostname !== "127.0.0.1" ||
    url.pathname !== "/verification"
  )
    throw Error("Disposable verification database required");
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url.toString(), max: 2 }),
  });
  try {
    const users = Array.from({ length: 1000 }, (_, i) => ({
      id: randomUUID(),
      email: `fixture-${i}@representative.test`,
      name: "Synthetic customer",
    }));
    const zones = Array.from({ length: 25 }, (_, i) => ({
      id: randomUUID(),
      name: `Synthetic zone ${i}`,
      area: "Fixture",
      state: "Lagos",
      deliveryFee: 100,
      estimatedMinutesMin: 10,
      estimatedMinutesMax: 20,
    }));
    const products = Array.from({ length: 100 }, (_, i) => ({
      id: randomUUID(),
      name: `${["Pineapple", "Banana", "Apple"][i % 3]} ${i}`,
      category: "FRUIT" as const,
      productType: ["pineapple", "banana", "redApple"][i % 3],
      description: "Synthetic benchmark fruit",
      createdAt: new Date(Date.now() - i * 60000),
    }));
    const options = products.map((product) => ({
      id: randomUUID(),
      productId: product.id,
      size: "SMALL" as const,
      label: "One",
      price: 100,
      stock: 100,
    }));
    const orders = Array.from({ length: 1000 }, (_, i) => ({
      id: randomUUID(),
      userId: users[i].id,
      deliveryZoneId: zones[i % zones.length].id,
      deliveryAddress: { fixture: true },
      deliveryFee: 100,
      itemSubtotal: 100,
      total: 200,
      estimatedDeliveryTime: "20 minutes",
      idempotencyKey: randomUUID(),
      requestHash: "synthetic-only",
      createdAt: new Date(Date.now() - i * 120000),
    }));
    const conversations = users.map((user, i) => ({
      id: randomUUID(),
      userId: user.id,
      subject: `Synthetic message ${i}`,
      updatedAt: new Date(Date.now() - i * 60000),
    }));
    await db.user.createMany({ data: users });
    await db.deliveryZone.createMany({ data: zones });
    await db.product.createMany({ data: products });
    await db.productOption.createMany({ data: options });
    await db.order.createMany({ data: orders });
    await db.orderItem.createMany({
      data: orders.map((order, i) => ({
        orderId: order.id,
        productOptionId: options[i % options.length].id,
        name: "Synthetic fruit",
        optionLabel: "One",
        optionDetail: "Fixture",
        quantity: 1,
        unitPrice: 100,
        subtotal: 100,
      })),
    });
    await db.payment.createMany({
      data: orders.map((order) => ({
        orderId: order.id,
        amount: 200,
        provider: "manual_transfer",
        providerReference: randomUUID(),
      })),
    });
    await db.conversation.createMany({ data: conversations });
    await db.conversationMessage.createMany({
      data: conversations.flatMap((conversation) =>
        [false, true].map((fromAdmin) => ({
          conversationId: conversation.id,
          fromAdmin,
          body: "Synthetic support message",
        })),
      ),
    });
    await db.verificationToken.createMany({
      data: users.map((user, i) => ({
        identifier: `recovery:reset:${user.id}:${user.email}`,
        token: randomUUID(),
        expires: new Date(Date.now() + (i % 2 ? -1 : 1) * 3600000),
      })),
    });
    await db.session.createMany({
      data: users.map((user, i) => ({
        userId: user.id,
        sessionToken: randomUUID(),
        expires: new Date(Date.now() + (i % 2 ? -1 : 1) * 3600000),
      })),
    });
    await db.$executeRaw`ANALYZE`;
    console.log(
      JSON.stringify({
        syntheticOnly: true,
        users: users.length,
        products: products.length,
        orders: orders.length,
        conversations: conversations.length,
        zones: zones.length,
      }),
    );
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error("Local disposable benchmark failed");
  process.exitCode = 1;
});
