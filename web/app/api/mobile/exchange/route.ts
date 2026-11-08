import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/server/database/prisma";
import {
  hashSecret,
  issueMobileSession,
  safeUserSelect,
} from "@/server/auth/mobile-session";
import { json, readBody } from "@/server/auth/password-auth";

const schema = z.object({
  code: z.string().regex(/^[a-f0-9]{64}$/),
  verifier: z.string().regex(/^[a-f0-9]{64}$/),
});

export async function POST(request: Request) {
  const requestId = randomUUID();
  const started = Date.now();
  let stage = "read-body";

  const log = (event: string, details: Record<string, unknown> = {}) => {
    console.info("[mobile-exchange]", {
      requestId,
      event,
      stage,
      elapsedMs: Date.now() - started,
      ...details,
    });
  };

  const reply = (body: unknown, status = 200) => {
    log("response", { status });
    const response = json(body, status);
    response.headers.set("x-auth-request-id", requestId);
    return response;
  };

  log("request", {
    method: request.method,
    route: new URL(request.url).pathname,
    contentType: request.headers.get("content-type"),
  });

  try {
    const parsed = schema.safeParse(await readBody(request));

    if (!parsed.success) {
      log("invalid-request-body");
      return reply({ error: "Invalid authorization code" }, 400);
    }

    const codeHash = hashSecret(parsed.data.code);
    const challenge = hashSecret(parsed.data.verifier);

    stage = "find-grant";
    const grant = await prisma.mobileAuthGrant.findUnique({
      where: { codeHash },
    });

    log("grant-checked", {
      found: Boolean(grant),
      challengeMatches: grant ? grant.challenge === challenge : false,
      expired: grant ? grant.expires <= new Date() : null,
    });

    if (
      !grant ||
      grant.challenge !== challenge ||
      grant.expires <= new Date()
    ) {
      return reply(
        { error: "Invalid or expired authorization code" },
        401,
      );
    }

    stage = "consume-grant";
    const consumed = await prisma.mobileAuthGrant.deleteMany({
      where: {
        codeHash,
        challenge,
        expires: { gt: new Date() },
      },
    });

    log("grant-consumed", { count: consumed.count });

    if (consumed.count !== 1) {
      return reply({ error: "Authorization code already used" }, 401);
    }

    stage = "find-user";
    const user = await prisma.user.findUnique({
      where: { id: grant.userId },
      select: safeUserSelect,
    });

    log("user-checked", {
      found: Boolean(user),
      active: Boolean(user?.isActive),
    });

    if (!user?.isActive) {
      return reply({ error: "Unauthorized" }, 401);
    }

    stage = "issue-session";
    const session = await issueMobileSession(user);

    log("session-created");
    return reply(session);
  } catch (error) {
    // Avoid printing raw database errors, which may include private data.
    const candidate =
      typeof error === "object" && error !== null && "code" in error
        ? error.code
        : undefined;

    console.error("[mobile-exchange] failed", {
      requestId,
      stage,
      elapsedMs: Date.now() - started,
      errorType: error instanceof Error ? error.name : typeof error,
      prismaCode:
        typeof candidate === "string" && /^P\d{4}$/.test(candidate)
          ? candidate
          : undefined,
    });

    return reply(
      { error: `Unable to complete Google sign-in. Reference: ${requestId}` },
      500,
    );
  }
}