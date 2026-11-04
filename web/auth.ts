import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/server/database/prisma";
import { normalizedEmailAdapter } from "@/server/auth/normalized-email-adapter";
import { emailSchema } from "@/validation/auth-validation";

const adapter = normalizedEmailAdapter(PrismaAdapter(prisma));
// Reject disabled users during validation, including the public session endpoint.
const getSessionAndUser = adapter.getSessionAndUser!;
adapter.getSessionAndUser = async (token) => {
  // Native token hashes are not usable as browser session credentials.
  if (token.startsWith("mobile-hash:")) return null;
  const result = await getSessionAndUser(token);
  return result?.user.isActive === true ? result : null;
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter,
providers: [
  Google({
    authorization: {
      params: { prompt: "select_account" },
    },
  }),
],
  session: { strategy: "database" },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
async signIn({ user, account, profile }): Promise<boolean | string> {
  if (account?.provider !== "google") return false;
  if (profile?.email_verified !== true) return false;

  const googleEmail = emailSchema.safeParse(profile.email);
  if (!googleEmail.success) return false;

  // Auth.js links to the current browser session's user.
  // Require the Google email to match that user's email.
  const session = await auth();

  if (session?.user) {
    const currentEmail = emailSchema.safeParse(session.user.email);

    if (
      !session.user.isActive ||
      !currentEmail.success ||
      currentEmail.data !== googleEmail.data
    ) {
      return "/account/security?error=GoogleEmailMismatch";
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { email: true, isActive: true },
    });

    return (
      currentUser?.isActive === true &&
      currentUser.email === googleEmail.data
    );
  }

  // Normal Google login: preserve disabled-account protection.
  const email = emailSchema.safeParse(user.email);
  if (!email.success) return false;

  const existingUser = await prisma.user.findUnique({
    where: { email: email.data },
    select: { isActive: true },
  });

  // Auth.js still rejects an unlinked existing account here.
  // The user must password-login first and explicitly link Google.
  return existingUser?.isActive ?? true;
},
    session({ session, user }) {
      // Explicit allowlist: never expose OAuth tokens or adapter session fields.
      return {
        expires: session.expires,
        user: {
          id: user.id, name: user.name ?? null, email: user.email,
          image: user.image ?? null, phone: user.phone ?? null,
          role: user.role, isActive: user.isActive,
        },
      };
    },
  },
  events: {
  async signIn({ user, account, profile }) {
    if (
      account?.provider !== "google" ||
      profile?.email_verified !== true
    ) {
      return;
    }

    const googleEmail = emailSchema.safeParse(profile.email);
    if (!googleEmail.success) return;

    // Update only the authenticated user whose email matches Google.
    await prisma.user.updateMany({
      where: {
        id: user.id,
        email: googleEmail.data,
        isActive: true,
        emailVerified: null,
      },
      data: {
        emailVerified: new Date(),
      },
    });
  },
},
});
