import { bearerToken, mobileSessionKey } from "../../server/auth/auth-secrets";
import { changeBus, realtimeEnabled } from "./bus";
import type { ChangeBus } from "./bus";
export type StreamAccount = { id: string; role: string };
export function streamHandler(deps: {
  enabled: () => boolean;
  account: (request: Request) => Promise<StreamAccount | null>;
  bus: () => ChangeBus;
  heartbeatMs?: number;
  durationMs?: number;
}) {
  const counts = new Map<string, number>();
  return async (request: Request) => {
    if (!deps.enabled())
      return Response.json({ error: "Streaming disabled" }, { status: 503 });
    const account = await deps.account(request);
    if (!account)
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    if ((counts.get(account.id) ?? 0) >= 2)
      return Response.json({ error: "Too many streams" }, { status: 429 });
    counts.set(account.id, (counts.get(account.id) ?? 0) + 1);
    const encoder = new TextEncoder();
    let stop = () => { },
      unsubscribe: (() => void) | undefined;
    let ready = false;
    let initialized!: () => void;
    const initialization = new Promise<void>(resolve => { initialized = resolve; });
    const stream = new ReadableStream<Uint8Array>(
      {
        async start(controller) {
          let closed = false,
            checking = false,
            heartbeat: ReturnType<typeof setInterval> | undefined,
            rotation: ReturnType<typeof setTimeout> | undefined;
          const close = () => {
            if (closed) return;
            closed = true;
            const count = (counts.get(account.id) ?? 1) - 1;
            if (count) counts.set(account.id, count);
            else counts.delete(account.id);
            if (heartbeat) clearInterval(heartbeat);
            if (rotation) clearTimeout(rotation);
            unsubscribe?.();
            request.signal.removeEventListener("abort", close);
            try {
              controller.close();
            } catch { }
          };
          stop = close;
          request.signal.addEventListener("abort", close, { once: true });
          const send = (event: string, data: unknown) => {
            if (closed) return;
            if ((controller.desiredSize ?? 0) <= 0) {
              close();
              return;
            }
            controller.enqueue(
              encoder.encode(
                `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
              ),
            );
          };
          try {
            unsubscribe = await deps.bus().subscribe((change) => {
              if (
                change.kind === "order.changed" &&
                change.userId !== account.id
              )
                return;
              send(change.kind, change.entityId ? { id: change.entityId } : {});
            }, close);
            if (closed || request.signal.aborted) {
              unsubscribe();
              close();
              return;
            }
            // Subscription is acknowledged before ready: client now fetches authoritative state.
            send("ready", { reconcile: true });
            ready = !closed;
            heartbeat = setInterval(() => {
              if (checking || closed) return;
              checking = true;
              void deps
                .account(request)
                .then((current) => {
                  if (!current || current.id !== account.id) close();
                  else send("heartbeat", {});
                })
                .catch(close)
                .finally(() => {
                  checking = false;
                });
            }, deps.heartbeatMs ?? 30000);
            rotation = setTimeout(close, deps.durationMs ?? 240000);
          } catch {
            close();
          } finally {
            initialized();
          }
        },
        cancel() {
          stop();
        },
      },
      { highWaterMark: 8 },
    );
    // A failed Redis subscription is not a successful, empty SSE stream.
    await initialization;
    if (!ready) return Response.json(
      { error: "Realtime subscription unavailable" },
      { status: 503, headers: { "Retry-After": "60", "Cache-Control": "no-store" } },
    );
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "private, no-store, no-transform",
        "X-Accel-Buffering": "no",
        "X-Content-Type-Options": "nosniff",
      },
    });
  };
}

async function account(request: Request) {
  const { prisma } = await import("../../server/database/prisma");
  let token: string | null = null;
  if (request.headers.has("authorization")) {
    const bearer = bearerToken(request.headers);
    if (!bearer) return null;
    token = mobileSessionKey(bearer);
  } else {
    const cookies = new Map(
      (request.headers.get("cookie") ?? "").split(";").map((part) => {
        const index = part.indexOf("=");
        return [part.slice(0, index).trim(), part.slice(index + 1)];
      }),
    );
    const base =
      cookies.has("__Secure-authjs.session-token") ||
        cookies.has("__Secure-authjs.session-token.0")
        ? "__Secure-authjs.session-token"
        : "authjs.session-token";
    token =
      cookies.get(base) ??
      [...cookies]
        .filter(([name]) => name.startsWith(`${base}.`))
        .sort(
          ([a], [b]) =>
            Number(a.split(".").at(-1)) - Number(b.split(".").at(-1)),
        )
        .map(([, value]) => value)
        .join("");
  }
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { sessionToken: token },
    select: {
      expires: true,
      user: { select: { id: true, role: true, isActive: true } },
    },
  });
  return session && session.expires > new Date() && session.user.isActive
    ? session.user
    : null;
}

// One shared handler preserves per-account connection limits across requests.
export const streamEvents = streamHandler({
  enabled: realtimeEnabled,
  account,
  bus: changeBus,
});
