import { Suspense } from "react";
import { randomBytes } from "node:crypto";
import { connection } from "next/server";
import { signIn, signOut } from "@/auth";
import { getCurrentUser } from "@/server/auth/current-user";
import { hashSecret } from "@/server/auth/mobile-session";
import { prisma } from "@/server/database/prisma";
import { mobileCallback } from "@/lib/mobile-callback";
import ContinueForm from "./continue-form";

export default function MobileAuthPage(
  props: PageProps<"/mobile-auth">
) {
  return (
    <main className="mx-auto max-w-md p-8">
      <Suspense fallback={<p>Preparing Google sign-in…</p>}>
        <MobileAuth searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function MobileAuth({
  searchParams,
}: Pick<PageProps<"/mobile-auth">, "searchParams">) {
  await connection();

  const {
    challenge,
    callback: requestedCallback,
    phase,
  } = await searchParams;

  const callback = mobileCallback(
    requestedCallback,
    process.env.NODE_ENV === "development",
    process.env.MOBILE_DEV_CALLBACK_URL
  );

  if (!callback) {
    return <p>Invalid app callback. Restart sign-in from the app.</p>;
  }

  if (
    typeof challenge !== "string" ||
    !/^[a-f0-9]{64}$/.test(challenge)
  ) {
    return <p>Invalid sign-in request. Restart sign-in from the app.</p>;
  }

  const completing = phase === "complete";

  return (
    <ContinueForm
      key={`${challenge}:${completing ? "complete" : "start"}`}
      label={completing ? "Return to app" : "Continue with Google"}
      action={async () => {
        "use server";

        if (!completing) {
          // Remove the existing website session so Google account
          // selection does not accidentally become account linking.
          await signOut({ redirect: false });

          const query = new URLSearchParams({
            challenge,
            callback,
            phase: "complete",
          });

          const destination = await signIn(
            "google",
            {
              redirect: false,
              redirectTo: `/mobile-auth?${query.toString()}`,
            },
            { prompt: "select_account" }
          );

          if (typeof destination !== "string") {
            throw new Error("Unable to start Google sign-in.");
          }

          return destination;
        }

        // Always authenticate again inside the Server Action.
        const user = await getCurrentUser();

        if (!user) {
          throw new Error("Sign-in expired. Restart from the app.");
        }

        const code = randomBytes(32).toString("hex");

        await prisma.mobileAuthGrant.create({
          data: {
            codeHash: hashSecret(code),
            userId: user.id,
            challenge,
            expires: new Date(Date.now() + 60_000),
          },
        });

        const destination = new URL(callback);
        destination.searchParams.set("code", code);
        destination.searchParams.set("state", challenge);

        return destination.toString();
      }}
    />
  );
}