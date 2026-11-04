import { applyCredit, creditPlan, settleCredit } from "../features/returns/credit";
import { ReturnError } from "../features/returns/validation";
import { ignoreEvent, orderEvent, type WriteEvent } from "../server/notifications/events";
import { noCache, type DataCache } from "../server/cache/json-cache";
import { addressCoverageError } from "../domain/delivery-geometry";
import { reservationExpired } from "../services/order-maintenance";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { unstable_rethrow } from "next/navigation";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import type { SessionUser } from "../domain/session-user";
import { activeUser } from "../domain/session-user";
import { basketReviewSchema, checkoutSchema, checkoutKeySchema, deliveryAddressSchema, manualPaymentAccount } from "../validation/checkout-validation";
import { reviewBasket } from "../services/checkout-eligibility";
import { fixedProductImage } from "../lib/product-images";
import { adminOrderQuerySchema, orderCursorSchema } from "../validation/order-list-validation";
import { listAdminOrders } from "../services/admin-order-list";
import { databaseUnavailable, databaseUnavailableResponse } from "../server/database/failures";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const include = { items: true, payment: true } as const;
class CheckoutError extends Error { constructor(message: string, public status = 409) { super(message); } }
type CheckoutDependencies = {
  cache?: DataCache;
  notify?: WriteEvent; kick?: () => Promise<void>;
  db: PrismaClient; currentUser: () => Promise<SessionUser | null>; readBody: (request: Request) => Promise<unknown>;
};

// Load production resources only for live calls; tests supply dependencies directly.
async function checkoutDependencies(input?: CheckoutDependencies) {
  if (!input) {
    const { writeEvent } = await import("../server/notifications/events");
    const { kickNotifications } = await import("../server/notifications/publisher");
    const { dataCache } = await import("../server/cache/redis");
    const { prisma } = await import("../server/database/prisma");
    const { getCurrentUser } = await import("../server/auth/current-user");
    const { readBody } = await import("../server/auth/password-auth");
    input = { cache: dataCache, db: prisma, currentUser: getCurrentUser, readBody, notify: writeEvent, kick: () => kickNotifications(prisma) };
  }
  const { db, currentUser, readBody, cache = noCache, notify = ignoreEvent, kick = async () => { } } = input;
  return { db, currentUser, readBody, cache, notify, kick };
}

async function user(deps: Awaited<ReturnType<typeof checkoutDependencies>>, admin = false) {
  const { currentUser } = deps;
  const value = activeUser(await currentUser());
  if (!value) throw new CheckoutError("Please sign in to continue.", 401);
  if (admin && value.role !== "ADMIN") throw new CheckoutError("Administrator access required.", 403);
  return value;
}

async function safely(run: () => Promise<Response>) {
  try { return await run(); } catch (error) {
    unstable_rethrow(error);
    if (databaseUnavailable(error)) return databaseUnavailableResponse();
    if (error instanceof CheckoutError || error instanceof ReturnError) return json({ error: error.message }, error.status);
    const code = error && typeof error === "object" && "code" in error ? error.code : "";
    if (code === "P2034" || code === "P2002") return json({ error: "This order changed. Please retry." }, 409);
    console.error("Checkout request failed", code);
    return json({ error: "Unable to complete checkout. Please try again." }, 500);
  }
}

async function paymentEligibility(deps: Awaited<ReturnType<typeof checkoutDependencies>>, order: Prisma.OrderGetPayload<{ include: typeof include }>) {
  const { db } = deps;
  const issues: string[] = [];
  if (reservationExpired(order.createdAt)) issues.push("The 24-hour payment window has expired. Do not transfer. Contact the store if you already paid.");
  if (order.status !== "PENDING" || order.paymentStatus !== "PENDING") issues.push("This order is not awaiting a new payment.");
  if (order.payment?.provider !== "manual_transfer") issues.push("This order does not use bank transfer.");
  if (!deliveryAddressSchema.safeParse(order.deliveryAddress).success) issues.push("The delivery address is incomplete.");
  const [zone, options] = await Promise.all([
    db.deliveryZone.findUnique({ where: { id: order.deliveryZoneId } }),
    db.productOption.findMany({ where: { id: { in: order.items.map((item) => item.productOptionId) } }, include: { product: true } }),
  ]);
  if (!zone?.isAvailable) issues.push("Delivery is currently unavailable.");
  if (!order.items.length) issues.push("The order has no items.");
  for (const item of order.items) {
    const option = options.find((value) => value.id === item.productOptionId);
    // Stock was already reserved by this order. Zero remaining stock is not a reason to reject its own reservation.
    if (!option?.product.isAvailable) issues.push(`${item.name} is currently unavailable. Do not transfer payment.`);
  }
  if (!order.payment || order.payment.amount !== order.total - (order.creditApplied ?? 0) || order.total <= 0) issues.push("The payment amount needs review.");
  return { eligible: issues.length === 0, issues };
}

async function paymentResponse(deps: Awaited<ReturnType<typeof checkoutDependencies>>, order: Prisma.OrderGetPayload<{ include: typeof include }>, status = 200) {
  const eligibility = await paymentEligibility(deps, order);
  return json({ order, eligibility, account: eligibility.eligible ? manualPaymentAccount : null }, status);
}

export async function reviewCheckout(request: Request, dependencies?: CheckoutDependencies) {
  const deps = await checkoutDependencies(dependencies);
  const { db, readBody } = deps;
  return safely(async () => {
    await user(deps);
    const parsed = basketReviewSchema.safeParse(await readBody(request));
    if (!parsed.success) return json({ error: "Your bag contains invalid or duplicate items. Update your bag." }, 400);
    const [options, zone] = await Promise.all([
      db.productOption.findMany({ where: { id: { in: parsed.data.items.map((item) => item.optionId) } }, include: { product: true } }),
      parsed.data.zoneId ? db.deliveryZone.findUnique({ where: { id: parsed.data.zoneId } }) : db.deliveryZone.findFirst({ where: { isAvailable: true }, orderBy: { id: "asc" } }),
    ]);
    return json(reviewBasket(parsed.data.items, options, zone));
  });
}

export async function getCheckoutSettings(dependencies?: CheckoutDependencies) {
  const deps = await checkoutDependencies(dependencies);
  const { db } = deps;
  return safely(async () => {
    const account = await user(deps);
    const [zones, profile] = await Promise.all([
      db.deliveryZone.findMany({ where: { isAvailable: true }, orderBy: { id: "asc" } }),
      db.user.findUnique({ where: { id: account.id }, select: { phone: true, deliveryAddress: true } }),
    ]);
    return json({ zones, zone: zones[0] ?? null, profile });
  });
}

export async function createCheckout(request: Request, dependencies?: CheckoutDependencies) {
  const deps = await checkoutDependencies(dependencies);
  const { db, readBody, cache, notify, kick } = deps;
  return safely(async () => {
    const account = await user(deps);
    const key = checkoutKeySchema.safeParse(request.headers.get("Idempotency-Key"));
    const parsed = checkoutSchema.safeParse(await readBody(request));
    if (!key.success || !parsed.success) return json({ error: "Check your delivery address, phone number and basket." }, 400);
    const input = parsed.data;
    input.items.sort((a, b) => a.optionId.localeCompare(b.optionId));
    const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const order = await db.$transaction(async (tx) => {
      const previous = await tx.order.findUnique({ where: { userId_idempotencyKey: { userId: account.id, idempotencyKey: key.data } }, include });
      if (previous) {
        if (previous.requestHash !== requestHash) throw new CheckoutError("This checkout reference belongs to a different basket.");
        return previous;
      }
      const zone = await tx.deliveryZone.findUnique({ where: { id: input.deliveryAddress.zoneId } });
      const coverageError = addressCoverageError(input.deliveryAddress, zone);
      if (coverageError) throw new CheckoutError(coverageError);
      if (!zone) throw new CheckoutError("Delivery zone unavailable.");
      const options = await tx.productOption.findMany({ where: { id: { in: input.items.map((item) => item.optionId) } }, include: { product: true } });
      const review = reviewBasket(input.items, options, zone);
      if (!review.eligible) throw new CheckoutError([...review.issues, ...review.lines.filter((line) => line.issue).map((line) => `${line.name}: ${line.issue}`)].join(" "));
      const lines = input.items.map((item) => {
        const option = options.find((value) => value.id === item.optionId && value.productId === item.productId);
        if (!option?.product.isAvailable || option.stock < item.quantity) throw new CheckoutError("A selected size is unavailable or has insufficient stock. Please update your bag.");
        return {
          productOptionId: option.id, name: option.product.name, optionLabel: option.label, optionDetail: option.detail,
          imageUrl: fixedProductImage(option.product), quantity: item.quantity, unitPrice: option.price, subtotal: option.price * item.quantity
        };
      });
      const replacement = input.replacementDisputeId ? await tx.dispute.findFirst({
        where: {
          id: input.replacementDisputeId, userId: account.id, status: "APPROVED", replacementOrderId: null,
          responsibility: { in: ["STORE", "RIDER"] }, credit: { choice: "REPLACEMENT", refundDueAt: { gt: new Date() }, balance: { gt: 0 }, transfers: { none: { state: "PENDING" } } },
        }, select: { id: true, creditId: true }
      }) : null;
      if (input.replacementDisputeId && (!replacement || !input.useReturnCredit)) throw new CheckoutError("This replacement delivery benefit is unavailable. Refresh checkout.");
      const deliveryFee = replacement ? 0 : zone.deliveryFee;
      const itemSubtotal = lines.reduce((sum, line) => sum + line.subtotal, 0);
      const total = itemSubtotal + deliveryFee;
      if (!Number.isSafeInteger(total) || total > 2147483647 || total <= 0) throw new CheckoutError("Order total is outside the supported range.");
      for (const line of lines) {
        const result = await tx.productOption.updateMany({ where: { id: line.productOptionId, stock: { gte: line.quantity } }, data: { stock: { decrement: line.quantity } } });
        if (result.count !== 1) throw new CheckoutError("Stock changed. Please update your bag.");
      }
      const id = randomUUID();
      const credit = input.useReturnCredit ? await creditPlan(tx, account.id, total, replacement?.creditId ?? undefined) : { applied: 0, due: total, plan: [] };
      const creditPaid = credit.due === 0;
      const created = await tx.order.create({
        data: {
          id, userId: account.id, deliveryAddress: input.deliveryAddress, deliveryZoneId: zone.id,
          deliveryFee, itemSubtotal, total, creditApplied: credit.applied,
          ...(creditPaid ? { status: "PAID", paymentStatus: "SUCCESS" } : {}), estimatedDeliveryTime: `${zone.estimatedMinutesMin}-${zone.estimatedMinutesMax} mins`,
          idempotencyKey: key.data, requestHash, items: { create: lines },
          payment: { create: { amount: credit.due, provider: creditPaid ? "return_credit" : "manual_transfer", providerReference: `CF-${id}`, ...(creditPaid ? { status: "SUCCESS", confirmedAt: new Date() } : {}) } },
        }, include
      });
      if (replacement) {
        const claimed = await tx.dispute.updateMany({ where: { id: replacement.id, replacementOrderId: null }, data: { replacementOrderId: id } });
        if (claimed.count !== 1) throw new CheckoutError("Replacement delivery has already been used. Refresh checkout.");
      }
      if (credit.applied) await applyCredit(tx, account.id, id, credit.plan, creditPaid);
      const event = orderEvent(created, "placed");
      if (event) await notify(tx, event);
      return created;
    }, { isolationLevel: "Serializable" });
    await kick();
    await cache.invalidate("products");
    return paymentResponse(deps, order, 201);
  });
}

export async function getOrder(id: string, dependencies?: CheckoutDependencies) {
  const deps = await checkoutDependencies(dependencies);
  const { db } = deps;
  return safely(async () => {
    const account = await user(deps);
    if (!z.uuid().safeParse(id).success) return json({ error: "Invalid order." }, 400);
    const order = await db.order.findFirst({ where: { id, userId: account.id }, include });
    return order ? paymentResponse(deps, order) : json({ error: "Order not found." }, 404);
  });
}

export async function updateOrder(request: Request, id: string, admin = false, dependencies?: CheckoutDependencies) {
  const deps = await checkoutDependencies(dependencies);
  const { db, readBody, cache, notify, kick } = deps;
  return safely(async () => {
    const account = await user(deps, admin);
    const parsed = z.strictObject({ action: z.enum(["reported", "cancel", "verify", "reject", "process", "dispatch", "deliver", "confirm_delivery", "dispute"]), disputeReason: z.string().trim().min(3).max(2000).optional(), disputeCategory: z.enum(["SPOILT", "MISSING_ITEMS", "DAMAGED", "WRONG_ITEMS", "WRONG_ORDER", "OTHER"]).optional() }).safeParse(await readBody(request));
    if (!z.uuid().safeParse(id).success || !parsed.success) return json({ error: "Invalid order action." }, 400);
    const action = parsed.data.action;
    if (!admin && !["reported", "cancel", "confirm_delivery", "dispute"].includes(action)) return json({ error: "Administrator access required." }, 403);
    const order = await db.$transaction(async (tx) => {
      const current = await tx.order.findFirst({ where: { id, ...(!admin ? { userId: account.id } : {}) }, include });
      if (!current || !["manual_transfer", "return_credit"].includes(current.payment?.provider ?? "")) throw new CheckoutError("Order not found.", 404);
      const transitions = { process: ["PAID", "PROCESSING", "PREPARING"], dispatch: ["PROCESSING", "DISPATCHED", "OUT_FOR_DELIVERY"], deliver: ["DISPATCHED", "DELIVERED", "DELIVERED"] } as const;
      if (action === "process" || action === "dispatch" || action === "deliver") {
        const [from, to, deliveryStatus] = transitions[action];
        if (current.paymentStatus !== "SUCCESS") throw new CheckoutError("Verify payment before fulfillment.");
        if (current.status === to) return current;
        if (current.status !== from) throw new CheckoutError("Invalid delivery transition.");
        const updated = await tx.order.update({ where: { id }, data: { status: to, deliveryStatus }, include });
        const event = orderEvent(updated, action);
        if (event) await notify(tx, event);
        return updated;
      }
      if (action === "confirm_delivery") {
        if (current.userId !== account.id) throw new CheckoutError("Order not found.", 404);
        if (current.status !== "DISPATCHED") throw new CheckoutError("Delivery confirmation is only available while your order is out for delivery.");
        const updated = await tx.order.update({ where: { id }, data: { status: "DELIVERED", deliveryStatus: "DELIVERED" }, include });
        const event = orderEvent(updated, "confirm_delivery");
        if (event) await notify(tx, event);
        return updated;
      }
      if (action === "dispute") {
        if (current.userId !== account.id) throw new CheckoutError("Order not found.", 404);
        if (current.status !== "DISPATCHED") throw new CheckoutError("You can only report an issue while your order is out for delivery.");
        if (current.paymentStatus !== "SUCCESS") throw new CheckoutError("Only paid orders can have disputes.");
        const reason = parsed.data.disputeCategory ?? "OTHER";
        const body = parsed.data.disputeReason ?? "Customer reported a delivery issue.";
        const { createDispute } = await import("../features/chat/service");
        const { randomUUID } = await import("node:crypto");
        await createDispute(tx, account.id, {
          key: randomUUID(), orderId: id, reason, body,
          requestedChoice: "CREDIT", evidenceUrls: [], uploadIds: [], items: current.items.map(item => ({ orderItemId: item.id, quantity: item.quantity })),
        });
        const updated = await tx.order.update({ where: { id }, data: { status: "RESOLVED", deliveryStatus: "DELIVERED" }, include });
        const event = orderEvent(updated, "dispute");
        if (event) await notify(tx, event);
        return updated;
      }
      if (action === "reported" && current.paymentStatus === "REVIEW_REQUIRED") return current;
      if (action === "verify" && current.paymentStatus === "SUCCESS") return current;
      if (["cancel", "reject"].includes(action) && current.status === "CANCELLED") return current;
      if (current.status !== "PENDING") throw new CheckoutError("This order can no longer be changed.");
      if (action === "reported" && current.paymentStatus !== "PENDING") throw new CheckoutError("This payment can no longer be reported.");
      if (action === "verify" && current.paymentStatus !== "REVIEW_REQUIRED") throw new CheckoutError("The transfer must be reported before verification.");
      if (action === "cancel" && current.paymentStatus !== "PENDING") throw new CheckoutError("A reported transfer must be reviewed by the store.");
      if (action === "reject" && current.paymentStatus !== "REVIEW_REQUIRED") throw new CheckoutError("Only reported transfers can be rejected.");
      const cancelled = action === "cancel" || action === "reject";
      if (current.creditApplied && (cancelled || action === "verify")) await settleCredit(tx, id, cancelled ? "release" : "spend");
      if (cancelled) for (const line of current.items) await tx.productOption.update({ where: { id: line.productOptionId }, data: { stock: { increment: line.quantity } } });
      const paymentStatus = action === "verify" ? "SUCCESS" as const : cancelled ? "FAILED" as const : "REVIEW_REQUIRED" as const;
      const updated = await tx.order.update({
        where: { id }, data: {
          status: cancelled ? "CANCELLED" : action === "verify" ? "PAID" : "PENDING",
          deliveryStatus: cancelled ? "CANCELLED" : "PENDING_CONFIRMATION",
          paymentStatus, payment: {
            update: {
              status: paymentStatus,
              ...(action === "verify" ? { confirmedAt: new Date(), verifiedResponse: { verifiedBy: account.id, method: "manual_transfer" } } : {}),
            }
          },
        }, include
      });
      const event = orderEvent(updated, action);
      if (event) await notify(tx, event);
      return updated;
    }, { isolationLevel: "Serializable" });
    await kick();
    if (action === "cancel" || action === "reject") await cache.invalidate("products");
    return paymentResponse(deps, order);
  });
}

export async function listOrders(dependencies?: CheckoutDependencies) {
  const deps = await checkoutDependencies(dependencies);
  const { db } = deps;
  return safely(async () => {
    const account = await user(deps);
    return json({ orders: await db.order.findMany({ where: { userId: account.id }, include, orderBy: { createdAt: "desc" }, take: 100 }) });
  });
}

export async function listAdminOrdersHandler(request: Request, dependencies?: CheckoutDependencies) {
  const deps = await checkoutDependencies(dependencies);
  const { db } = deps;
  return safely(async () => {
    await user(deps, true);
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(key => params.getAll(key).length > 1)) {
      return json({ error: "Duplicate query parameters" }, 400);
    }
    const parsed = adminOrderQuerySchema.safeParse(Object.fromEntries(params));
    if (!parsed.success) return json({ error: "Invalid order filters" }, 400);
    let after;
    if (parsed.data.cursor) {
      try {
        after = orderCursorSchema.parse(JSON.parse(
          Buffer.from(parsed.data.cursor, "base64url").toString("utf8"),
        ));
      } catch {
        return json({ error: "Invalid order cursor" }, 400);
      }
    }
    return json(await listAdminOrders(db, parsed.data.limit, after));
  });
}

// Compatibility adapter for callers that inject dependencies (including tests).
export function createCheckoutHandlers(dependencies: CheckoutDependencies) {
  return {
    review: (request: Request) => reviewCheckout(request, dependencies),
    settings: () => getCheckoutSettings(dependencies),
    create: (request: Request) => createCheckout(request, dependencies),
    detail: (id: string) => getOrder(id, dependencies),
    action: (request: Request, id: string, admin = false) => updateOrder(request, id, admin, dependencies),
    list: () => listOrders(dependencies),
    listAdmin: (request: Request) => listAdminOrdersHandler(request, dependencies),
  };
}
