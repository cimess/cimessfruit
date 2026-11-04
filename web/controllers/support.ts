import { readConversationInbox } from "../services/conversation-inbox";
import { inboxQuerySchema, inboxCursorSchema } from "../validation/support-validation";
import { messageWindow, messagePage } from "../features/chat/history";
import { attachUploads, submission, UploadError } from "../features/uploads/service";
import { choiceAt } from "../features/returns/window";
import { prisma } from "../server/database/prisma";
import { getCurrentUser } from "../server/auth/current-user";
import { json, readBody, allowAuthAttempt } from "../server/auth/password-auth";
import { newConversationSchema, messageSchema } from "../validation/support-validation";
import { z } from "zod";
const messages = { take: 21, orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }] };
export async function listConversations(request?: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Unauthorized" }, 401);
  const params = request ? new URL(request.url).searchParams : new URLSearchParams();
  if ([...params.keys()].some(key => params.getAll(key).length !== 1)) return json({ error: "Invalid inbox parameters" }, 400);
  const parsed = inboxQuerySchema.safeParse(Object.fromEntries(params));
  if (!parsed.success) return json({ error: "Invalid inbox parameters" }, 400);
  let after;
  try { if (parsed.data.cursor) after = inboxCursorSchema.parse(JSON.parse(Buffer.from(parsed.data.cursor, "base64url").toString("utf8"))); } catch { return json({ error: "Invalid inbox cursor" }, 400); }
  return json(await readConversationInbox(prisma, parsed.data.limit, after, parsed.data.kind, user.id));
}
async function createConversationUnsafe(request: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Unauthorized" }, 401);
  const parsed = newConversationSchema.safeParse(await readBody(request));
  if (!parsed.success) return json({ error: "Add a subject and a message (up to 2,000 characters)." }, 400);
  if (!await allowAuthAttempt(`support:new:${user.id}`)) return json({ error: "Too many requests. Try again later." }, 429);
  const { body, productId, orderId, subject, evidenceUrls, uploadIds, key } = parsed.data;
  if (orderId && !await prisma.order.findFirst({ where: { id: orderId, userId: user.id } })) return json({ error: "Order not found." }, 404);
  if (productId && !await prisma.product.findUnique({ where: { id: productId } })) return json({ error: "Product not found." }, 404);
  const conversation = await prisma.$transaction(async tx => {
    const receipt = await submission(tx, key, user.id, "chat:new", parsed.data);
    if (receipt.existing) return tx.conversation.findUniqueOrThrow({ where: { id: receipt.existing.entityId }, include: { messages } });
    const files = await attachUploads(tx, user.id, uploadIds, "EVIDENCE", `chat:${key}`);
    if (files.length + evidenceUrls.length > 3) throw new UploadError("Use up to three evidence images or links.");
    const conversation = await tx.conversation.create({ data: { userId: user.id, subject, productId, orderId, messages: { create: { body, evidenceUrls: [...evidenceUrls, ...files.map(file => file.url)] } } }, include: { messages, dispute: { include: { order: { select: { items: { select: { id: true, name: true, optionLabel: true, unitPrice: true, quantity: true } } } }, credit: { select: { id: true, choice: true, refundDueAt: true, balance: true, reserved: true, locked: true, spent: true, refunded: true } } } } } });
    if (key) await tx.submissionReceipt.create({ data: { key, userId: user.id, scope: "chat:new", hash: receipt.hash, entityId: conversation.id } });
    return conversation;
  }, { isolationLevel: "Serializable" });
  return json({ conversation: messagePage(conversation) }, 201);
}
async function conversationDetailUnsafe(id: string, request?: Request, admin = false, readRequest?: Request) {
  let selection;
  try {
    const params = readRequest ? new URL(readRequest.url).searchParams : new URLSearchParams();
    if ([...params.keys()].some(key => key !== "before" || params.getAll(key).length !== 1) || (params.get("before")?.length ?? 0) > 1000) throw Error();
    selection = messageWindow(id, params.get("before"));
  } catch { return json({ error: "Invalid message cursor" }, 400); }
  const user = await getCurrentUser();
  if (!user) return json({ error: "Unauthorized" }, 401);
  if (admin && user.role !== "ADMIN") return json({ error: "Forbidden" }, 403);
  if (!z.uuid().safeParse(id).success) return json({ error: "Invalid conversation." }, 400);
  const where = admin ? { id } : { id, userId: user.id };
  const existing = await prisma.conversation.findFirst({ where });
  if (!existing) return json({ error: "Conversation not found." }, 404);
  if (request) {
    const parsed = messageSchema.safeParse(await readBody(request));
    if (!parsed.success) return json({ error: "Enter a message of 1–2,000 characters." }, 400);
    if (!await allowAuthAttempt(`support:reply:${user.id}`)) return json({ error: "Too many messages. Try again later." }, 429);
    const conversation = await prisma.$transaction(async tx => {
      const scope = `reply:${id}`;
      const receipt = await submission(tx, parsed.data.key, user.id, scope, parsed.data);
      if (receipt.existing) return tx.conversation.findUniqueOrThrow({ where: { id }, include: { messages, dispute: { include: { credit: { include: { transfers: true } } } } } });
      const files = await attachUploads(tx, user.id, parsed.data.uploadIds, "EVIDENCE", `message:${parsed.data.key}`);
      if (files.length + parsed.data.evidenceUrls.length > 3) throw new UploadError("Use up to three evidence images or links.");
      const conversation = await tx.conversation.update({ where: { id }, data: { updatedAt: new Date(), messages: { create: { body: parsed.data.body, evidenceUrls: [...parsed.data.evidenceUrls, ...files.map(file => file.url)], fromAdmin: admin } } }, include: { messages, dispute: { include: { order: { select: { items: { select: { id: true, name: true, optionLabel: true, unitPrice: true, quantity: true } } } }, credit: { select: { id: true, choice: true, refundDueAt: true, balance: true, reserved: true, locked: true, spent: true, refunded: true, bankDetails: true, transfers: true } } } } } });
      if (parsed.data.key) await tx.submissionReceipt.create({ data: { key: parsed.data.key, userId: user.id, scope, hash: receipt.hash, entityId: id } });
      return conversation;
    }, { isolationLevel: "Serializable" });
    if (conversation.dispute?.credit) conversation.dispute.credit = choiceAt(conversation.dispute.credit);
    return json({ conversation: messagePage(conversation) });
  }
  const conversation = await prisma.conversation.findFirst({ where, include: { messages: selection, dispute: { include: { order: { select: { items: { select: { id: true, name: true, optionLabel: true, unitPrice: true, quantity: true } } } }, credit: { select: { id: true, choice: true, refundDueAt: true, balance: true, reserved: true, locked: true, spent: true, refunded: true, bankDetails: true, transfers: true } } } } } });
  if (conversation?.dispute?.credit) conversation.dispute.credit = choiceAt(conversation.dispute.credit);
  return json({ serverTime: new Date().toISOString(), conversation: messagePage(conversation) });
}

async function safeWrite(run: () => Promise<Response>) {
  try { return await run(); } catch (error) {
    if (error instanceof UploadError) return json({ error: error.message }, error.status);
    return json({ error: "Unable to save message. Keep your draft and retry." }, 503);
  }
}
export const createConversation = (request: Request) => safeWrite(() => createConversationUnsafe(request));
export const conversationDetail = (id: string, request?: Request, admin = false, readRequest?: Request) => safeWrite(() => conversationDetailUnsafe(id, request, admin, readRequest));
