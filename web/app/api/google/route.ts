import { NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { z } from "zod";
import { prisma } from "@/server/database/prisma";
import { issueMobileSession, safeUserSelect } from "@/server/auth/mobile-session";
import { normalizeIdentity } from "@/validation/auth-validation";

const requestSchema = z.object({
  idToken: z.string().min(1, "Google ID token is required"),
});

// Matches AUTH_GOOGLE_ID or GOOGLE_WEB_CLIENT_ID
const webClientId = process.env.AUTH_GOOGLE_ID || process.env.GOOGLE_WEB_CLIENT_ID;
const client = new OAuth2Client(webClientId);

export async function POST(request: Request) {
  try {
    const rawBody = await request.json().catch(() => null);
    const parsed = requestSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parsed.error.issues },
        { status: 400 }
      );
    }

    if (!webClientId) {
      console.error("[google-auth] AUTH_GOOGLE_ID is not configured on the server");
      return NextResponse.json(
        { error: "Server authentication misconfigured" },
        { status: 500 }
      );
    }

    // 1. Verify the Google ID token
    const ticket = await client.verifyIdToken({
      idToken: parsed.data.idToken,
      audience: webClientId,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email || !payload.sub) {
      return NextResponse.json(
        { error: "Invalid Google token payload" },
        { status: 401 }
      );
    }

    if (payload.email_verified !== true) {
      return NextResponse.json(
        { error: "Google account email is not verified" },
        { status: 401 }
      );
    }

    const email = normalizeIdentity(payload.email);
    const googleId = payload.sub;

    // 2. Look for an existing account linked with Google
    const existingAccount = await prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: "google",
          providerAccountId: googleId,
        },
      },
      include: {
        user: { select: safeUserSelect },
      },
    });

    let user = existingAccount?.user;

    if (!user) {
      // 3. Check if a user with this email already exists
      const existingUser = await prisma.user.findUnique({
        where: { email },
        select: safeUserSelect,
      });

      if (existingUser) {
        // Link Google account to existing user
        await prisma.account.create({
          data: {
            userId: existingUser.id,
            type: "oidc",
            provider: "google",
            providerAccountId: googleId,
          },
        });
        user = existingUser;
      } else {
        // 4. Create new user + linked Google account
        user = await prisma.user.create({
          data: {
            email,
            name: payload.name ?? "User",
            image: payload.picture ?? null,
            emailVerified: new Date(),
            role: "CUSTOMER",
            isActive: true,
            accounts: {
              create: {
                type: "oidc",
                provider: "google",
                providerAccountId: googleId,
              },
            },
          },
          select: safeUserSelect,
        });
      }
    }

    // 5. Ensure account is active
    if (!user.isActive) {
      return NextResponse.json(
        { error: "This account has been deactivated" },
        { status: 403 }
      );
    }

    // 6. Issue mobile session compatible with the mobile app
    const session = await issueMobileSession(user);

    return NextResponse.json(session, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[google-auth] Error during native Google authentication:", error);
    return NextResponse.json(
      { error: "Google sign-in authentication failed" },
      { status: 401 }
    );
  }
}