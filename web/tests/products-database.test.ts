import assert from "node:assert/strict";
import test from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { createProductHandlers } from "../controllers/product-handlers";

test("product lifecycle preserves option IDs, hides disabled products and permits reactivation", {
  skip: !process.env.TEST_DATABASE_URL,
}, async () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }) });
  const handlers = createProductHandlers({ db,
    currentUser: async () => ({ id: "admin", name: null, email: null, image: null, phone: null, role: "ADMIN", isActive: true }),
    readBody: async (request) => request.json(),
  });
  const req = (body: unknown) => new Request("http://localhost/api/products", { method: "POST", body: JSON.stringify(body) });
  let id: string | undefined;
  try {
    const response = await handlers.create(req({ name: "Test fruit", category: "FRUIT", options: [
      { size: "SMALL", label: "One", price: 100, stock: 10 },
      { size: "BIG", label: "Basket", price: 900, stock: 2 },
    ] }));
    assert.equal(response.status, 201);
    const created = (await response.json()).product;
    id = created.id;
    assert.ok(id);
    const updated = await handlers.update(req({ options: [{ size: "SMALL", label: "One", price: 200, stock: 5 }] }), id);
    assert.equal(updated.status, 200);
    const product = (await updated.json()).product;
    assert.equal(product.options.length, 2);
    assert.equal(product.options[0].id, created.options[0].id);
    assert.equal(product.options[0].price, 200);
    assert.equal(product.options[1].id, created.options[1].id);
    assert.equal((await handlers.remove(id)).status, 204);
    assert.equal((await handlers.detail(id)).status, 404);
    assert.equal((await handlers.detail(id, true)).status, 200);
    assert.equal((await handlers.remove(id)).status, 204);
    assert.equal((await handlers.update(req({ isAvailable: true }), id)).status, 200);
    assert.equal((await handlers.detail(id)).status, 200);
  } finally {
    if (id) {
      await db.productOption.deleteMany({ where: { productId: id } });
      await db.product.delete({ where: { id } });
    }
    await db.$disconnect();
  }
});
