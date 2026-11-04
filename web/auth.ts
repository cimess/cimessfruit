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
  providers: [Google],
  session: { strategy: "database" },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "google" && profile?.email_verified !== true) {
        return false;
      }
      const email = emailSchema.safeParse(user.email);
      if (!email.success) return false;
      const existingUser = await prisma.user.findUnique({
        where: { email: email.data },
        select: { isActive: true },
      });
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
});
