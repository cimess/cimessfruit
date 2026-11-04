import type { PrismaClient } from "../generated/prisma/client";
import type { SessionUser } from "../domain/session-user";
import { activeUser } from "../domain/session-user";
import { inboxCursorSchema, inboxQuerySchema } from "../validation/support-validation";
import { readConversationInbox } from "../services/conversation-inbox";
import { databaseUnavailable, databaseUnavailableResponse } from "../server/database/failures";

const json = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "private, no-store" },
});

export function createInboxHandler({ db, currentUser }: {
  db: Pick<PrismaClient, "conversation">;
  currentUser: () => Promise<SessionUser | null>;
}) {
  return async (request: Request) => {
    const user = activeUser(await currentUser());
    if (!user) return json({ error: "Unauthorized" }, 401);
    if (user.role !== "ADMIN") return json({ error: "Forbidden" }, 403);
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(key => params.getAll(key).length > 1)) {
      return json({ error: "Duplicate query parameters" }, 400);
    }
    const parsed = inboxQuerySchema.safeParse(Object.fromEntries(params));
    if (!parsed.success) return json({ error: "Invalid inbox filters" }, 400);
    let after;
    if (parsed.data.cursor) {
      try {
        after = inboxCursorSchema.parse(JSON.parse(
          Buffer.from(parsed.data.cursor, "base64url").toString("utf8"),
        ));
      } catch {
        return json({ error: "Invalid inbox cursor" }, 400);
      }
    }
    try {
      return json(await readConversationInbox(db, parsed.data.limit, after, parsed.data.kind));
    } catch (error) {
      if (databaseUnavailable(error)) return databaseUnavailableResponse();
      return json({ error: "Unable to load inbox. Please retry." }, 500);
    }
  };
}
