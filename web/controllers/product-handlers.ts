import { UploadError } from "../features/uploads/service";
import { productEvent, type EventInput } from "../server/notifications/events";
import { noCache, type DataCache } from "../server/cache/json-cache";
import type { PrismaClient, Prisma } from "../generated/prisma/client";
import type { SessionUser } from "../domain/session-user";
import { activeUser } from "../domain/session-user";
import { databaseUnavailable, databaseUnavailableResponse } from "../server/database/failures";
import { createProductSchema, updateProductSchema, productIdSchema, productQuerySchema, productCursorSchema } from "../validation/product-validation";

const json = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "private, no-store" },
});
const include = { options: { orderBy: [{ price: "asc" }, { id: "asc" }] } } satisfies Prisma.ProductInclude;

// Dependencies keep the HTTP contract testable without a running auth server.
type ProductDependencies = {
  photo?: (tx: Pick<PrismaClient, "product">, owner: string, uploadId: string | null | undefined, productId: string, previousUrl?: string | null) => Promise<{ imageUrl: string | null; imageUploadedAt: Date | null } | undefined>;
  receipt?: (tx: Pick<PrismaClient, "product">, owner: string, key: string | undefined, scope: string, payload: unknown, entityId?: string) => Promise<string | null>;
  db: Pick<PrismaClient, "product">;
  cache?: DataCache;
  mutate?: <T>(run: (db: Pick<PrismaClient, "product">, notify: (event: EventInput) => Promise<void>) => Promise<T>) => Promise<T>;
  kick?: () => Promise<void>;
  currentUser: () => Promise<SessionUser | null>;
  readBody: (request: Request) => Promise<unknown>;
};

// Load production resources only for live calls; tests supply dependencies directly.
async function productDependencies(input?: ProductDependencies) {
  if (!input) {
    const { recordChange } = await import("../features/realtime/publication");
    const { productPhoto, submission } = await import("../features/uploads/service");
    const { writeEvent } = await import("../server/notifications/events");
    const { kickNotifications } = await import("../server/notifications/publisher");
    const { dataCache } = await import("../server/cache/redis");
    const { prisma } = await import("../server/database/prisma");
    const { getCurrentUser } = await import("../server/auth/current-user");
    const { readBody } = await import("../server/auth/password-auth");
    input = {
      cache: dataCache, db: prisma, currentUser: getCurrentUser, readBody,
      mutate: run => prisma.$transaction(async tx => { const result = await run(tx, event => writeEvent(tx, event)); const product = result as { id?: string } | null; if (product?.id) await recordChange(tx, { kind: "catalogue", entityId: product.id }); return result; }, { isolationLevel: "Serializable" }),
      photo: (tx, owner, uploadId, productId, previousUrl) => productPhoto(tx as Prisma.TransactionClient, owner, uploadId, productId, previousUrl),
      receipt: async (db, owner, key, scope, payload, entityId) => {
        const tx = db as Prisma.TransactionClient;
        const result = await submission(tx, key, owner, scope, payload);
        if (key && entityId && !result.existing) await tx.submissionReceipt.create({ data: { key, userId: owner, scope, hash: result.hash, entityId } });
        return result.existing?.entityId ?? null;
      },
      kick: () => kickNotifications(prisma),
    };
  }
  const { db, currentUser, readBody, cache = noCache, mutate = async run => run(db, async () => { }), kick = async () => { }, photo, receipt } = input;
  return { db, currentUser, readBody, cache, mutate, kick, photo, receipt };
}

async function admin(deps: Awaited<ReturnType<typeof productDependencies>>) {
  const { currentUser } = deps;
  const user = activeUser(await currentUser());
  if (!user) return json({ error: "Unauthorized" }, 401);
  if (user.role !== "ADMIN") return json({ error: "Forbidden" }, 403);
}

async function safely(operation: () => Promise<Response>) {
  try { return await operation(); }
  catch (error) {
    if (error instanceof UploadError) return json({ error: error.message }, error.status);
    if (databaseUnavailable(error)) return databaseUnavailableResponse();
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    if (code === "P2025") return json({ error: "Product not found" }, 404);
    if (code === "P2002" || code === "P2034") return json({ error: "Product changed concurrently. Please retry." }, 409);
    console.error("Product request failed", error);
    return json({ error: "Unable to complete product request" }, 500);
  }
}

export async function listProducts(request: Request, adminView = false, dependencies?: ProductDependencies) {
  const deps = await productDependencies(dependencies);
  const { db, cache } = deps;
  return safely(async () => {
    if (adminView) { const denied = await admin(deps); if (denied) return denied; }
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some((key) => params.getAll(key).length > 1)) {
      return json({ error: "Duplicate query parameters" }, 400);
    }
    const parsed = productQuerySchema.safeParse(Object.fromEntries(params));
    if (!parsed.success) return json({ error: "Invalid product filters", details: parsed.error.issues }, 400);

    const {
      limit,
      category,
      search,
      cursor,
      sort = "newest",
      fruitFilter = "all",
    } = parsed.data;

    if (fruitFilter !== "all" && category !== "FRUIT") {
      return json({ error: "Fruit filters require the FRUIT category" }, 400);
    }

    const scope = JSON.stringify([
      adminView,
      category ?? null,
      search ?? null,
      sort,
      fruitFilter,
    ]);

    let after:
      | { scope: string; id: string; value: string | number }
      | undefined;

    if (cursor) {
      try {
        after = productCursorSchema.parse(
          JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
        );
      } catch {
        return json({ error: "Invalid product cursor" }, 400);
      }

      if (
        after.scope !== scope ||
        (sort === "name"
          ? typeof after.value !== "string"
          : typeof after.value !== "number")
      ) {
        return json({ error: "Cursor does not match these filters" }, 400);
      }
    }

    const conditions: Prisma.ProductWhereInput[] = adminView
      ? []
      : [{ isAvailable: true }, { options: { some: {} } }];

    if (category) conditions.push({ category });

    if (search) {
      conditions.push({
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
        ],
      });
    }

    if (fruitFilter !== "all") {
      const productTypes =
        fruitFilter === "apple"
          ? ["redApple", "greenApple", "pinkApple"]
          : [fruitFilter];

      conditions.push({
        OR: [
          { productType: { in: productTypes } },
          { name: { equals: fruitFilter, mode: "insensitive" } },
        ],
      });
    }

    const loadMatches = () =>
      db.product.findMany({
        where: { AND: conditions },
        include,
      });

    // Bounded catalogue assumption: fewer than ~100 varieties.
    // Cache public browsing matches; keep arbitrary search text uncached.
    const products = !adminView && !search
      ? await cache.remember(
        "products",
        JSON.stringify(["cursor-matches-v1", category ?? null, fruitFilter]),
        30,
        loadMatches,
      )
      : await loadMatches();

    const keyOf = (product: (typeof products)[number]): string | number => {
      if (sort === "name") return product.name.toLowerCase();

      if (sort === "price-asc" || sort === "price-desc") {
        // `include.options` is already ordered by price.
        return product.options[0]?.price ?? 0;
      }

      // Redis JSON turns Date objects into strings.
      return product.createdAt instanceof Date
        ? product.createdAt.getTime()
        : Date.parse(String(product.createdAt));
    };

    const direction =
      sort === "newest" || sort === "price-desc" ? -1 : 1;

    const compare = (
      a: { id: string; value: string | number },
      b: { id: string; value: string | number },
    ) => {
      const byValue =
        a.value < b.value ? -1 : a.value > b.value ? 1 : 0;
      const byId = a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

      return direction * (byValue || byId);
    };

    const ordered = products
      .map((product) => ({
        product,
        id: product.id,
        value: keyOf(product),
      }))
      .sort(compare);

    const boundary = after;
    const remaining = boundary
      ? ordered.filter((entry) => compare(entry, boundary) > 0)
      : ordered;

    const selected = remaining.slice(0, limit);
    const last = selected.at(-1);

    const nextCursor =
      remaining.length > limit && last
        ? Buffer.from(
          JSON.stringify({
            scope,
            id: last.id,
            value: last.value,
          }),
        ).toString("base64url")
        : null;

    return json({
      items: selected.map((entry) => entry.product),
      nextCursor,
      total: ordered.length,
      limit,
    });
  });
}

export async function getProduct(id: string, adminView = false, dependencies?: ProductDependencies) {
  const deps = await productDependencies(dependencies);
  const { db, cache } = deps;
  return safely(async () => {
    if (adminView) { const denied = await admin(deps); if (denied) return denied; }
    if (!productIdSchema.safeParse(id).success) return json({ error: "Invalid product ID" }, 400);
    const load = () => db.product.findFirst({ where: { id, ...(!adminView ? { isAvailable: true } : {}) }, include });
    const product = adminView ? await load() : await cache.remember("products", `detail:${id}`, 30, load);
    return product ? json({ product }) : json({ error: "Product not found" }, 404);
  });
}

export async function createProduct(request: Request, dependencies?: ProductDependencies) {
  const deps = await productDependencies(dependencies);
  const { currentUser, readBody, cache, mutate, kick, photo, receipt } = deps;
  return safely(async () => {
    const denied = await admin(deps); if (denied) return denied;
    const parsed = createProductSchema.safeParse(await readBody(request));
    if (!parsed.success) return json({ error: "Invalid product", details: parsed.error.issues }, 400);
    const { options, uploadId, submissionKey, newBatch, ...data } = parsed.data;
    const owner = (await currentUser())!.id;
    // Prisma nested writes atomically create the product and its options.
    const product = await mutate(async (tx, notify) => {
      const existingId = await receipt?.(tx, owner, submissionKey, "product:new", parsed.data);
      if (existingId) return tx.product.findUniqueOrThrow({ where: { id: existingId }, include });
      const created = await tx.product.create({ data: { ...data, ...(newBatch ? { batchArrivedAt: new Date() } : {}), options: { create: options } }, include });
      if (photo && uploadId) {
        const values = await photo(tx, owner, uploadId, created.id);
        Object.assign(created, await tx.product.update({ where: { id: created.id }, data: values ?? {}, include }));
      }
      await receipt?.(tx, owner, submissionKey, "product:new", parsed.data, created.id);
      const event = productEvent(null, created);
      if (event) await notify(event);
      return created;
    });
    await kick();
    await cache.invalidate("products");
    return json({ product }, 201);
  });
}

export async function updateProduct(request: Request, id: string, dependencies?: ProductDependencies) {
  const deps = await productDependencies(dependencies);
  const { currentUser, readBody, cache, mutate, kick, photo, receipt } = deps;
  return safely(async () => {
    const denied = await admin(deps); if (denied) return denied;
    if (!productIdSchema.safeParse(id).success) return json({ error: "Invalid product ID" }, 400);
    const parsed = updateProductSchema.safeParse(await readBody(request));
    if (!parsed.success) return json({ error: "Invalid product update", details: parsed.error.issues }, 400);
    const { options, uploadId, submissionKey, newBatch, ...data } = parsed.data;
    const owner = (await currentUser())!.id;
    const product = await mutate(async (tx, notify) => {
      const existingId = await receipt?.(tx, owner, submissionKey, `product:${id}`, parsed.data);
      if (existingId) return tx.product.findUniqueOrThrow({ where: { id: existingId }, include });
      const before = await tx.product.findFirst({ where: { id }, include });
      if (!before) return null;
      const values = await photo?.(tx, owner, uploadId, id, before.imageUrl);
      // Upsert by size: keep existing option IDs and omitted sizes/order references.
      const product = await tx.product.update({
        where: { id }, data: {
          ...data, ...values, ...(newBatch ? { batchArrivedAt: new Date() } : {}),
          ...(options ? {
            options: {
              upsert: options.map((option) => ({
                where: { productId_size: { productId: id, size: option.size } },
                create: option, update: option,
              }))
            }
          } : {}),
        }, include
      });
      await receipt?.(tx, owner, submissionKey, `product:${id}`, parsed.data, id);
      const event = productEvent(before, product);
      if (event) await notify(event);
      return product;
    });
    if (!product) return json({ error: "Product not found" }, 404);
    await kick();
    await cache.invalidate("products");
    return json({ product });
  });
}

export async function deleteProduct(id: string, dependencies?: ProductDependencies) {
  const deps = await productDependencies(dependencies);
  const { cache, mutate, kick } = deps;
  return safely(async () => {
    const denied = await admin(deps); if (denied) return denied;
    if (!productIdSchema.safeParse(id).success) return json({ error: "Invalid product ID" }, 400);
    await mutate(tx => tx.product.update({ where: { id }, data: { isAvailable: false } }));
    await kick();
    await cache.invalidate("products");
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  });
}

// Compatibility adapter for callers that inject dependencies (including tests).
export function createProductHandlers(dependencies: ProductDependencies) {
  return {
    list: (request: Request, adminView = false) => listProducts(request, adminView, dependencies),
    detail: (id: string, adminView = false) => getProduct(id, adminView, dependencies),
    create: (request: Request) => createProduct(request, dependencies),
    update: (request: Request, id: string) => updateProduct(request, id, dependencies),
    remove: (id: string) => deleteProduct(id, dependencies),
  };
}
