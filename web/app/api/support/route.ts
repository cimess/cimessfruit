import { listConversations, createConversation } from "@/controllers/support";
import { receiveSupportEmail } from "@/controllers/support-email";
import { isSupportWebhook } from "@/server/email/support-webhook";
export const GET = (request: Request) => listConversations(request);
export const POST = (request: Request) => isSupportWebhook(request) ? receiveSupportEmail(request) : createConversation(request);
