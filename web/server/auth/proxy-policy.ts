import { isSupportWebhook } from "../email/support-webhook";
import { NextResponse, type NextRequest } from "next/server";
import { activeUser, type SessionUser } from "../../domain/session-user";

const under = (path: string, root: string) => path === root || path.startsWith(`${root}/`);

export async function guardRequest(
  request: NextRequest,
  readSession: () => Promise<{ user?: SessionUser } | null>,
) {
  const path = request.nextUrl.pathname;
  const api = under(path, "/api");
  const catalog = under(path, "/api/products") || under(path, "/api/delivery-zones");
  const resolvePin = path === "/api/delivery-zones/resolve" && request.method === "POST";
  const admin = under(path, "/admin") || under(path, "/api/admin") ||
    (catalog && !resolvePin && !["GET", "HEAD", "OPTIONS"].includes(request.method));
  // API routes are private by default; explicitly allow public catalog reads.
  const publicRead = ["GET", "HEAD"].includes(request.method) &&
    (under(path, "/api/products") || under(path, "/api/delivery-zones") || path === "/api/support/contact");
  const publicAuth = ["/api/mobile/login", "/api/mobile/signup", "/api/mobile/exchange", "/api/recovery/request", "/api/recovery/complete", "/api/account-deletion/request", "/api/account-deletion/complete"].includes(path);
  const protectedRoute = admin || (under(path, "/chat") || under(path, "/account") || under(path, "/orders") || under(path, "/checkout")) || (api && !publicRead && !publicAuth);
  const finish = (response: NextResponse) => {
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    return response;
  };
  // Legal documents must remain readable before signup and during auth outages.
  const legalRead = ["GET", "HEAD"].includes(request.method) &&
    (["/privacy", "/terms", "/refunds", "/delivery"].includes(path) || under(path, "/api/policies"));
  if (legalRead) {
    const headers = new Headers(request.headers);
    for (const name of ["x-user-id", "x-user-role", "x-auth-user", "x-auth-mode"]) headers.delete(name);
    headers.set("x-auth-mode", "guest");
    return finish(NextResponse.next({ request: { headers } }));
  }
  if (path === "/api/health" && ["GET", "HEAD"].includes(request.method)) return finish(NextResponse.next());
  // This exact worker route authenticates CRON_SECRET itself, never a customer session.
  if (["/api/cron/maintenance", "/api/cron/uploads", "/api/cron/notifications", "/api/cron/credentials"].includes(path) && request.method === "GET") return finish(NextResponse.next());
  // QStash owns this exact POST route; the handler verifies signature, URL and body.
  if (path === "/api/notifications/worker" && request.method === "POST") return finish(NextResponse.next());
  // Signed Resend deliveries authenticate in the handler before any side effects.
  if (path === "/api/support" && isSupportWebhook(request)) return finish(NextResponse.next());
  // Auth.js handles CSRF on its own endpoints (excluded by the matcher).
  const origin = request.headers.get("origin");
  // Next.js can normalize nextUrl to localhost in development. The incoming
  // Host retains the address actually used by the browser (including LAN IP).
  // Do not trust arbitrary X-Forwarded-Host values for this CSRF decision.
  const host = request.headers.get("host") ?? request.nextUrl.host;
  const expectedOrigin = process.env.NODE_ENV === "production" && process.env.AUTH_URL
    ? new URL(process.env.AUTH_URL).origin
    : new URL(`${request.nextUrl.protocol}//${host}`).origin;
  const nativeRequest = !origin && !request.headers.has("cookie") &&
    !request.headers.has("sec-fetch-site") &&
    (publicAuth || request.headers.has("authorization"));
  // publicAuth routes are secured by OTP/token validation, not session cookies.
  // Allow same-site browser fetches regardless of exact origin match (handles LAN IP vs localhost).
  // Only reject requests with explicit cross-site/cross-origin Sec-Fetch-Site.
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && !nativeRequest) {
    const isCrossSite = secFetchSite === "cross-site" || secFetchSite === "cross-origin";
    let forbidden = false;
    if (publicAuth) {
      if (isCrossSite) {
        forbidden = true;
      } else if (origin) {
        try {
          const originUrl = new URL(origin);
          forbidden = originUrl.host !== host && origin !== expectedOrigin;
        } catch {
          forbidden = true;
        }
      }
    } else {
      forbidden = origin !== expectedOrigin || isCrossSite;
    }
    if (forbidden) {
      return finish(NextResponse.json({ error: "Forbidden origin" }, { status: 403 }));
    }
  }
  let session;
  try {
    session = await readSession();
  } catch {
    return finish(NextResponse.json({ error: "Authentication unavailable" }, { status: 503 }));
  }
  const user = activeUser(session?.user);
  let response: NextResponse;
  if (!user && protectedRoute) {
    response = api
      ? NextResponse.json({ error: "Unauthorized", mode: "guest" }, { status: 401 })
      : NextResponse.redirect(new URL(admin ? "/admin-login" : under(path, "/checkout") ? "/login?intent=checkout" : "/login", request.url));
  } else if (admin && user?.role !== "ADMIN") {
    response = api
      ? NextResponse.json({ error: "Forbidden" }, { status: 403 })
      : NextResponse.redirect(new URL("/admin-login", request.url));
  } else {
    const headers = new Headers(request.headers);
    // Never forward client-supplied identity/role hints as trusted context.
    for (const name of ["x-user-id", "x-user-role", "x-auth-user", "x-auth-mode"]) headers.delete(name);
    headers.set("x-auth-mode", user ? "authenticated" : "guest");
    response = NextResponse.next({ request: { headers } });
  }
  if (!user) {
    for (const cookie of request.cookies.getAll()) {
      if (/^(?:__Secure-)?authjs\.session-token(?:\.\d+)?$/.test(cookie.name)) {
        response.cookies.set(cookie.name, "", {
          maxAge: 0, path: "/", httpOnly: true, sameSite: "lax",
          secure: cookie.name.startsWith("__Secure-"),
        });
      }
    }
  }
  return finish(response);
}
