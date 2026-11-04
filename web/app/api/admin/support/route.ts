import { createInboxHandler } from "@/controllers/conversation-inbox";
import { prisma } from "@/server/database/prisma";
import { getCurrentUser } from "@/server/auth/current-user";

export const GET = createInboxHandler({ db: prisma, currentUser: getCurrentUser });
