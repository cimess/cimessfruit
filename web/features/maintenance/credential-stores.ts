import type { PrismaClient } from "../../generated/prisma/client";
import type { ExpiryStore } from "./credentials";
export function credentialStores(
  db: PrismaClient,
): Record<string, ExpiryStore> {
  return {
    sessions: {
      find: async (before, take) =>
        (
          await db.session.findMany({
            where: { expires: { lt: before } },
            select: { id: true },
            orderBy: [{ expires: "asc" }, { id: "asc" }],
            take,
          })
        ).map((row) => row.id),
      remove: async (ids, before) =>
        (
          await db.session.deleteMany({
            where: { id: { in: ids }, expires: { lt: before } },
          })
        ).count,
    },
    grants: {
      find: async (before, take) =>
        (
          await db.mobileAuthGrant.findMany({
            where: { expires: { lt: before } },
            select: { codeHash: true },
            orderBy: [{ expires: "asc" }, { codeHash: "asc" }],
            take,
          })
        ).map((row) => row.codeHash),
      remove: async (ids, before) =>
        (
          await db.mobileAuthGrant.deleteMany({
            where: { codeHash: { in: ids }, expires: { lt: before } },
          })
        ).count,
    },
    rateLimits: {
      find: async (before, take) =>
        (
          await db.authRateLimit.findMany({
            where: { expires: { lt: before } },
            select: { key: true },
            orderBy: [{ expires: "asc" }, { key: "asc" }],
            take,
          })
        ).map((row) => row.key),
      remove: async (ids, before) =>
        (
          await db.authRateLimit.deleteMany({
            where: { key: { in: ids }, expires: { lt: before } },
          })
        ).count,
    },
    tokens: {
      find: async (before, take) =>
        (
          await db.verificationToken.findMany({
            where: { expires: { lt: before } },
            select: { token: true },
            orderBy: [{ expires: "asc" }, { token: "asc" }],
            take,
          })
        ).map((row) => row.token),
      remove: async (ids, before) =>
        (
          await db.verificationToken.deleteMany({
            where: { token: { in: ids }, expires: { lt: before } },
          })
        ).count,
    },
  };
}
