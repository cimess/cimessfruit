import { Webhook } from "svix";
import { convert } from "html-to-text";
import { z } from "zod";
import type { PrismaClient } from "../generated/prisma/client";
import type { SessionUser } from "../domain/session-user";

const json = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
});
class SupportError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
type Dependencies = {
  db: PrismaClient;
  currentUser: () => Promise<SessionUser | null>;
  fetch: typeof fetch;
  env: Record<string, string | undefined>;
  now: () => Date;
};
async function dependencies(input?: Dependencies): Promise<Dependencies> {
  if (input) return input;
  const { prisma } = await import("../server/database/prisma");
  return {
    db: prisma, fetch, env: process.env, now: () => new Date(),
    currentUser: async () => (await import("../server/auth/current-user")).getCurrentUser(),
  };
}
async function safe(run: () => Promise<Response>) {
  try { return await run(); }
  catch (error) {
    if (error instanceof SupportError) return json({ error: error.message }, error.status);
    // Do not log incoming content, addresses, credentials or provider response bodies.
    console.error("Support email operation failed");
    return json({ error: "Email support is temporarily unavailable. Please retry." }, 503);
  }
}
async function admin(deps: Dependencies) {
  const user = await deps.currentUser();
  if (!user?.isActive) throw new SupportError("Please sign in.", 401);
  if (user.role !== "ADMIN") throw new SupportError("Administrator access required.", 403);
  return user;
}
function uuid(value: string) {
  if (!z.uuid().safeParse(value).success) throw new SupportError("Invalid email reference.", 400);
}
// Parse one mailbox only. Never turn an untrusted display name into extra recipients.
export function mailbox(value: string): string | null {
  if (/[\r\n]/.test(value)) return null;
  const address = (value.match(/^[^<>]*<([^<>]+)>\s*$/)?.[1] ?? value).trim();
  return z.email().safeParse(address).success ? address.toLowerCase() : null;
}
function configured(deps: Dependencies) {
  const key = deps.env.RESEND_API_KEY?.trim();
  const address = mailbox(deps.env.SUPPORT_EMAIL_ADDRESS ?? "");
  if (!key || !address) throw new SupportError("Configure RESEND_API_KEY and SUPPORT_EMAIL_ADDRESS for email support.", 503);
  return { key, address };
}
async function boundedText(message: Request | Response, limit: number) {
  if (Number(message.headers.get("content-length")) > limit) throw new SupportError("Email payload is too large.", 413);
  const reader = message.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > limit) { await reader.cancel(); throw new SupportError("Email payload is too large.", 413); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString("utf8");
}
async function provider(deps: Dependencies, path: string, options: RequestInit = {}) {
  const { key } = configured(deps);
  const response = await deps.fetch(`https://api.resend.com${path}`, {
    ...options, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...options.headers },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new SupportError("Resend could not complete the request. Retry with the same reply draft if sending.", 503);
  return JSON.parse(await boundedText(response, 2 * 1024 * 1024)) as unknown;
}
const receivedSchema = z.object({
  id: z.uuid(), from: z.string().max(2000), to: z.array(z.string()).max(100),
  received_for: z.array(z.string()).optional(),
  reply_to: z.array(z.string()).optional(), subject: z.string().max(4000),
  text: z.string().nullable().optional(), html: z.string().nullable().optional(),
  message_id: z.string().max(2000).optional(), created_at: z.string().optional(),
  attachments: z.array(z.object({
    id: z.string(), filename: z.string().nullable().optional(),
    content_type: z.string().optional(),
  })).max(100).default([]),
});

export async function receiveSupportEmail(request: Request, input?: Dependencies) {
  return safe(async () => {
    // Verify the exact raw body before any provider request or persistence.
    const env = input?.env ?? process.env;
    const secret = env.RESEND_WEBHOOK_SECRET?.trim();
    if (!secret) throw new SupportError("Receiving webhook is not configured.", 503);
    const raw = await boundedText(request, 256 * 1024);
    let event: unknown;
    try {
      new Webhook(secret).verify(raw, {
        "svix-id": request.headers.get("svix-id") ?? "",
        "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
        "svix-signature": request.headers.get("svix-signature") ?? "",
      });
      event = JSON.parse(raw);
    } catch { throw new SupportError("Invalid webhook signature.", 401); }
    const envelope = z.object({ type: z.string() }).safeParse(event);
    if (!envelope.success) throw new SupportError("Invalid webhook event.", 400);
    if (envelope.data.type !== "email.received") return json({ ignored: true });
    const parsed = z.object({ data: z.object({ email_id: z.uuid() }) }).safeParse(event);
    if (!parsed.success) throw new SupportError("Invalid received email event.", 400);
    const deps = await dependencies(input);
    const { address } = configured(deps);
    const resendId = parsed.data.data.email_id;
    if (await deps.db.supportEmail.findUnique({ where: { resendId }, select: { id: true } })) return json({ received: true, duplicate: true });
    const email = receivedSchema.parse(await provider(deps, `/emails/receiving/${resendId}?html_format=cid`));
    if (email.id !== resendId) throw new SupportError("Received email reference mismatch.", 503);
    if (![...email.to, ...(email.received_for ?? [])].some(value => mailbox(value) === address)) return json({ ignored: true });
    const body = email.text?.trim() || convert(email.html ?? "", {
      wordwrap: false,
      selectors: [{ selector: "img", format: "skip" }, { selector: "a", options: { ignoreHref: true } }],
    });
    const receivedAt = email.created_at ? new Date(email.created_at) : deps.now();
    // Provider retries and concurrent deliveries resolve to one durable inbox item.
    await deps.db.supportEmail.upsert({
      where: { resendId }, update: {},
      create: {
        resendId, webhookId: request.headers.get("svix-id")!, from: email.from,
        replyTo: email.reply_to?.length ? mailbox(email.reply_to[0]) : null,
        to: email.to, subject: email.subject, body: body || "(No text content)",
        messageId: email.message_id && !/[\r\n]/.test(email.message_id) ? email.message_id : null,
        attachments: email.attachments,
        receivedAt: Number.isFinite(receivedAt.getTime()) ? receivedAt : deps.now(),
      },
    });
    return json({ received: true });
  });
}

export async function listSupportEmails(request: Request, input?: Dependencies) {
  return safe(async () => {
    const deps = await dependencies(input);
    await admin(deps);
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(key => !["status", "before"].includes(key) || params.getAll(key).length !== 1)) throw new SupportError("Invalid inbox filters.", 400);
    const status = params.get("status") ?? "OPEN";
    if (!["OPEN", "CLOSED", "ALL"].includes(status)) throw new SupportError("Invalid status.", 400);
    let before: { createdAt: string; id: string } | undefined;
    try {
      if (params.has("before")) before = z.object({ createdAt: z.iso.datetime(), id: z.uuid() }).parse(JSON.parse(Buffer.from(params.get("before")!.slice(0, 1000), "base64url").toString("utf8")));
    } catch { throw new SupportError("Invalid inbox cursor.", 400); }
    const emails = await deps.db.supportEmail.findMany({
      where: { ...(status !== "ALL" ? { status } : {}), ...(before ? { OR: [
        { createdAt: { lt: new Date(before.createdAt) } }, { createdAt: new Date(before.createdAt), id: { lt: before.id } },
      ] } : {}) },
      select: { id: true, from: true, subject: true, status: true, receivedAt: true, createdAt: true, _count: { select: { replies: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 26,
    });
    const page = emails.slice(0, 25), last = page.at(-1);
    return json({ emails: page, nextCursor: emails.length > 25 && last ? Buffer.from(JSON.stringify({ createdAt: last.createdAt.toISOString(), id: last.id })).toString("base64url") : null });
  });
}
export async function getSupportEmail(id: string, input?: Dependencies) {
  return safe(async () => {
    const deps = await dependencies(input);
    await admin(deps); uuid(id);
    const email = await deps.db.supportEmail.findUnique({ where: { id }, include: { replies: { orderBy: { createdAt: "asc" } } } });
    if (!email) throw new SupportError("Email not found.", 404);
    return json({ email, recipient: email.replyTo ?? mailbox(email.from) });
  });
}
export async function updateSupportEmail(request: Request, id: string, input?: Dependencies) {
  return safe(async () => {
    const deps = await dependencies(input);
    await admin(deps); uuid(id);
    let value: unknown;
    try { value = JSON.parse(await boundedText(request, 2048)); } catch { throw new SupportError("Invalid status.", 400); }
    const parsed = z.object({ status: z.enum(["OPEN", "CLOSED"]) }).safeParse(value);
    if (!parsed.success) throw new SupportError("Invalid status.", 400);
    const result = await deps.db.supportEmail.updateMany({ where: { id }, data: parsed.data });
    if (!result.count) throw new SupportError("Email not found.", 404);
    return json({ ok: true });
  });
}
export async function replySupportEmail(request: Request, id: string, input?: Dependencies) {
  return safe(async () => {
    const deps = await dependencies(input);
    const account = await admin(deps); uuid(id);
    let value: unknown;
    try { value = JSON.parse(await boundedText(request, 48 * 1024)); } catch { throw new SupportError("Invalid reply.", 400); }
    const parsed = z.object({ key: z.uuid(), body: z.string().trim().min(1).max(10000) }).safeParse(value);
    if (!parsed.success) throw new SupportError("Write a reply of 1–10,000 characters.", 400);
    const email = await deps.db.supportEmail.findUnique({ where: { id } });
    if (!email) throw new SupportError("Email not found.", 404);
    const recipient = email.replyTo ?? mailbox(email.from);
    if (!recipient) throw new SupportError("This email has no valid reply address.", 400);
    const { address } = configured(deps);
    const from = deps.env.MAIL_FROM?.trim() ?? "";
    if (!mailbox(from)) throw new SupportError("Configure MAIL_FROM with a verified sending address.", 503);
    const reply = await deps.db.supportEmailReply.upsert({
      where: { id: parsed.data.key }, update: {},
      create: {
        id: parsed.data.key, emailId: id, adminId: account.id, body: parsed.data.body,
        from, to: recipient, replyTo: address,
        subject: /^re:/i.test(email.subject) ? email.subject : `Re: ${email.subject || "Your support request"}`,
        inReplyTo: email.messageId,
      },
    });
    if (reply.emailId !== id || reply.adminId !== account.id || reply.body !== parsed.data.body) throw new SupportError("This reply reference belongs to a different message. Reload the email.", 409);
    if (reply.state === "SENT") return json({ reply });
    // Resend only deduplicates for 24 hours. Never blindly resend an old uncertain request.
    if (deps.now().getTime() - reply.createdAt.getTime() >= 23 * 60 * 60 * 1000) throw new SupportError("This reply is too old to retry safely. Check its send status in Resend before composing another message.", 409);
    const result = z.object({ id: z.string().min(1) }).parse(await provider(deps, "/emails", {
      method: "POST", headers: { "Idempotency-Key": `support-reply/${reply.id}` },
      body: JSON.stringify({
        from: reply.from, to: [reply.to], reply_to: reply.replyTo, subject: reply.subject, text: reply.body,
        ...(reply.inReplyTo ? { headers: { "In-Reply-To": reply.inReplyTo, References: reply.inReplyTo } } : {}),
      }),
    }));
    const saved = await deps.db.supportEmailReply.update({ where: { id: reply.id }, data: { state: "SENT", resendId: result.id, sentAt: deps.now() } });
    return json({ reply: saved });
  });
}
