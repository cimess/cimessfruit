import { prisma } from "@/server/database/prisma";
import { sessionResponse } from "@/server/auth/mobile-session";
import { allowAuthAttempt, readBody } from "@/server/auth/password-auth";
import { createPasswordLogin } from "@/controllers/password-login";

export const POST = createPasswordLogin({
  db: prisma, readBody, allowAttempt: allowAuthAttempt, respond: sessionResponse,
});
