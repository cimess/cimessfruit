import "server-only";
import { attachDatabasePool } from "@vercel/functions";
import { createRuntimeDatabase } from "./runtime-client";

const globalForPrisma = globalThis as unknown as { database?: ReturnType<typeof createRuntimeDatabase> };

const database = globalForPrisma.database ?? createRuntimeDatabase({ attachPool: attachDatabasePool });
export const prisma = database.prisma;
export const databasePoolStatus = database.status;

if (process.env.NODE_ENV !== "production") globalForPrisma.database = database;
