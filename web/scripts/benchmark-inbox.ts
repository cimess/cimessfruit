import dotenv from "dotenv";
import { performance } from "node:perf_hooks";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { readConversationInbox } from "../services/conversation-inbox";

dotenv.config({ quiet: true });

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw Error("LOCAL_DATABASE_REQUIRED");
  const db = new PrismaClient({ adapter: new PrismaPg({
    connectionString: url.toString(), max: 1, connectionTimeoutMillis: 5000,
  }) });
  try {
    const report = await db.$transaction(async tx => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const counts = {
        conversations: await tx.conversation.count(),
        messages: await tx.conversationMessage.count(),
      };
      const oldRead = () => tx.conversation.findMany({
        orderBy: { updatedAt: "desc" }, take: 100,
        include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
      });
      const newRead = () => readConversationInbox(tx, 20);
      await oldRead(); await newRead();
      const oldTimes: number[] = [], newTimes: number[] = [];
      let oldBytes = 0, newBytes = 0;
      for (let index = 0; index < 30; index++) {
        for (const mode of index % 2 ? ["new", "old"] : ["old", "new"]) {
          const start = performance.now();
          if (mode === "old") {
            const conversations = await oldRead();
            oldTimes.push(performance.now() - start);
            oldBytes = Buffer.byteLength(JSON.stringify({ conversations }));
          } else {
            const result = await newRead();
            newTimes.push(performance.now() - start);
            newBytes = Buffer.byteLength(JSON.stringify(result));
          }
        }
      }
      const summary = (times: number[], responseBytes: number) => {
        const sorted = [...times].sort((a, b) => a - b);
        return {
          samples: times.length,
          p50Ms: Number(sorted[Math.floor(sorted.length * .5)].toFixed(2)),
          p95Ms: Number(sorted[Math.ceil(sorted.length * .95) - 1].toFixed(2)),
          responseBytes,
        };
      };
      const indexes = await tx.$queryRaw<{ tablename: string; indexname: string; indexdef: string }[]>`
        SELECT tablename, indexname, indexdef FROM pg_indexes
        WHERE schemaname = current_schema()
          AND tablename IN ('Conversation', 'ConversationMessage')
        ORDER BY tablename, indexname`;
      const plan = await tx.$queryRaw<{ "QUERY PLAN": string }[]>`
        EXPLAIN (ANALYZE, BUFFERS)
        SELECT id, "updatedAt" FROM "Conversation"
        ORDER BY "updatedAt" DESC, id DESC LIMIT 21`;
      return {
        scope: "Local read-only warm Prisma reads; excludes HTTP/auth/cloud latency",
        counts, previous: summary(oldTimes, oldBytes), current: summary(newTimes, newBytes),
        indexes, parentQueryPlan: plan.map(row => row["QUERY PLAN"]),
      };
    }, { timeout: 30_000, isolationLevel: "RepeatableRead" });
    console.log(JSON.stringify(report, null, 2));
  } finally { await db.$disconnect(); }
}

main().catch(error => {
  console.error("Local inbox benchmark failed:", error.code ?? "Check local PostgreSQL configuration");
  process.exitCode = 1;
});
