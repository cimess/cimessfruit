import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { prisma } from "@/server/database/prisma";
import PasswordSettings from "@/app/components/password-settings";
import StoreShell from "@/app/store/store-shell";

type Props = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default function Security({ searchParams }: Props) {
  return (
    <StoreShell>
      <section className="signup-page">
        <Link href="/account" className="text-link">
          ← Your account
        </Link>

        <Suspense fallback={<p>Loading security settings…</p>}>
          <Settings searchParams={searchParams} />
        </Suspense>
      </section>
    </StoreShell>
  );
}

async function Settings({ searchParams }: Props) {
  await connection();

  const session = await auth();
  if (!session?.user?.isActive) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      email: true,
      isActive: true,
      passwordHash: true,
      accounts: {
        where: { provider: "google" },
        select: { id: true },
      },
    },
  });

  if (!user?.isActive) redirect("/login");

  const { error } = await searchParams;
  const googleLinked = user.accounts.length > 0;

  return (
    <>
      <h1>Sign-in methods</h1>
      <p>Account: {user.email}</p>

      {error === "GoogleEmailMismatch" && (
        <p role="alert" className="form-error">
          Select the Google account with the same email as your
          CimessFruit account.
        </p>
      )}

      <section>
        <h2>Google</h2>

        {googleLinked ? (
          <p>Google is linked. You can sign in using either method.</p>
        ) : (
          <form
            action={async () => {
              "use server";

              const current = await auth();
              if (!current?.user?.isActive) redirect("/login");

              await signIn("google", {
                redirectTo: "/account/security",
              });
            }}
          >
            <p>
              Link Google using the same email address shown above.
            </p>
            <button type="submit" className="button google-button">
              Link Google
            </button>
          </form>
        )}
      </section>

      <PasswordSettings
        hasPassword={!!user.passwordHash}
        email={user.email}
      />

      <Link href="/recover" className="text-link">
        Set or reset your password by email →
      </Link>
    </>
  );
}