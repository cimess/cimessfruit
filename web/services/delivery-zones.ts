import type { PrismaClient, Prisma } from "../generated/prisma/client";
import { noCache, type DataCache } from "../server/cache/json-cache";

// Only the reusable zone dataset is cached, never a user's coordinates or response.
type DeliveryZoneDependencies = { db: Pick<PrismaClient, "deliveryZone">; cache?: DataCache };

// Load production resources only for live calls; tests supply dependencies directly.
async function deliveryZoneDependencies(input?: DeliveryZoneDependencies) {
  if (!input) {
    const { prisma } = await import("../server/database/prisma");
    const { dataCache } = await import("../server/cache/redis");
    input = { db: prisma, cache: dataCache };
  }
  const { db, cache = noCache } = input;
  return { db, cache };
}

export async function saveDeliveryZone(data: Prisma.DeliveryZoneUncheckedCreateInput, dependencies?: DeliveryZoneDependencies) {
  const deps = await deliveryZoneDependencies(dependencies);
  const { db, cache } = deps;
  const zone = await db.deliveryZone.upsert({ where: { id: data.id }, create: data, update: data });
  await cache.invalidate("delivery-zones");
  return zone;
}

export async function listAvailableDeliveryZones(orderBy: "name" | "id", dependencies?: DeliveryZoneDependencies) {
  const deps = await deliveryZoneDependencies(dependencies);
  const { db, cache } = deps;
  return cache.remember("delivery-zones", `available:${orderBy}`, 300,
    () => db.deliveryZone.findMany({
      where: { isAvailable: true },
      orderBy: orderBy === "name" ? [{ name: "asc" }, { id: "asc" }] : [{ id: "asc" }],
    }));
}

// Compatibility adapter for callers that inject dependencies (including tests).
export function createDeliveryZoneService(db: Pick<PrismaClient, "deliveryZone">, cache: DataCache = noCache) {
  const dependencies = { db, cache };
  return {
    save: (data: Prisma.DeliveryZoneUncheckedCreateInput) => saveDeliveryZone(data, dependencies),
    available: (orderBy: "name" | "id") => listAvailableDeliveryZones(orderBy, dependencies),
  };
}
