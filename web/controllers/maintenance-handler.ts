import { ignoreEvent, type WriteEvent } from "../server/notifications/events";
import { timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "../generated/prisma/client";
import { noCache, type DataCache } from "../server/cache/json-cache";
import { expireReservations, reservationBatchSize } from "../services/order-maintenance";

export function createMaintenanceHandler({ db, cache = noCache, secret, notify = ignoreEvent, kick = async () => {} }: {
  notify?: WriteEvent; kick?: () => Promise<void>;
  db: PrismaClient; cache?: DataCache; secret: () => string | undefined;
}) {
  return async (request: Request) => {
    const json = (body: unknown, status = 200) => Response.json(body, {
      status, headers: { "Cache-Control": "private, no-store" },
    });
    const configured = secret();
    if (!configured || configured.length < 16) return json({ error: "Maintenance is not configured" }, 503);
    const expected = Buffer.from(`Bearer ${configured}`);
    const supplied = Buffer.from(request.headers.get("authorization") ?? "");
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      return json({ error: "Unauthorized" }, 401);
    }
    try {
      // Drain a bounded daily backlog; keep each transaction small and leave time to respond.
      const deadline = Date.now() + 40_000;
      let expired = 0, batches = 0, count = 0;
      do {
        count = await expireReservations(db, new Date(), cache, notify);
        expired += count;
        batches++;
      } while (count === reservationBatchSize && batches < 10 && Date.now() < deadline);
      if (expired) await kick();
      return json({ expired, batches, batchSize: reservationBatchSize, moreMayRemain: count === reservationBatchSize });
    } catch {
      // Serializable conflicts and temporary outages are safe to retry on a later call.
      return Response.json({ error: "Maintenance failed; retry required" }, {
        status: 503, headers: { "Cache-Control": "private, no-store", "Retry-After": "60" },
      });
    }
  };
}
