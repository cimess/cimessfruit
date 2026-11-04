import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { auth, signIn } from "@/auth";
import { prisma } from "@/server/database/prisma";
import StoreShell from "../store/store-shell";

export default function VerifyEmailPage() {
  return (
    <StoreShell>
      <section
        className="store-section"
        style={{ maxWidth: 480, margin: "auto" }}
      >
        <Suspense fallback={<p>Loading…</p>}>
          <Details />
        </Suspense>
      </section>
    </StoreShell>
  );
}

async function Details() {
  await connection();

  const session = await auth();

  if (!session?.user?.isActive) {
    return (
      <>
        <h1>Verify and link Google</h1>
        <p>
          Sign in to your existing CimessFruit account first.
          Then open Verify email from your profile.
        </p>
        <Link href="/login" className="button button-primary">
          Sign in
        </Link>
      </>
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      email: true,
      isActive: true,
      emailVerified: true,
      accounts: {
        where: { provider: "google" },
        select: { id: true },
      },
    },
  });

  if (!user?.isActive) return <p>Please sign in again.</p>;

  if (user.emailVerified && user.accounts.length > 0) {
    return (
      <>
        <h1>Email verified</h1>
        <p>Google is linked to {user.email}.</p>
        <Link href="/account">Back to your account</Link>
      </>
    );
  }

  return (
    <>
      <h1>Verify your email with Google</h1>
      <p>
        Select <strong>{user.email}</strong> in Google to verify
        your email and link Google sign-in to this account.
      </p>

      <form
        action={async () => {
          "use server";

          const current = await auth();
          if (!current?.user?.isActive) {
            throw new Error("Please sign in before linking Google.");
          }

          await signIn("google", {
            redirectTo: "/verify-email",
          });
        }}
      >
        <button type="submit" className="button google-button">
          Verify and link Google
        </button>
      </form>
    </>
  );
}