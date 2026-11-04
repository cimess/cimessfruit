import { createPasswordHandler } from "@/controllers/account-password";
import { prisma } from "@/server/database/prisma";
import { getCurrentUser } from "@/server/auth/current-user";
import { allowAuthAttempt, readBody } from "@/server/auth/password-auth";

export const POST = createPasswordHandler({ db: prisma, currentUser: getCurrentUser, readBody, allowAttempt: allowAuthAttempt });
