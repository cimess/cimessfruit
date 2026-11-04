import { createAdminAccessHandler } from "@/controllers/admin-access";
import { prisma } from "@/server/database/prisma";
import { getCurrentUser } from "@/server/auth/current-user";
import { readBody, allowAuthAttempt } from "@/server/auth/password-auth";
export const POST = createAdminAccessHandler({ db: prisma, currentUser: getCurrentUser, readBody, allowAttempt: allowAuthAttempt, key: () => process.env.ADMIN_AUTHORIZATION_KEY });
