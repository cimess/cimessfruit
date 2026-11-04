import { Suspense } from "react";
import { randomBytes } from "node:crypto";
import { connection } from "next/server";
import { signIn } from "@/auth";
import { getCurrentUser } from "@/server/auth/current-user";
import { hashSecret } from "@/server/auth/mobile-session";
import { prisma } from "@/server/database/prisma";
import { mobileCallback } from "@/lib/mobile-callback";
import ContinueForm from "./continue-form";
import { needsGooglePassword } from "@/domain/google-password";
import PasswordSettings from "@/app/components/password-settings";

export default function MobileAuthPage(props: PageProps<"/mobile-auth">) {
  return <main className="mx-auto max-w-md p-8"><Suspense fallback={<p>Loading sign-in…</p>}>
    <MobileAuth searchParams={props.searchParams} />
  </Suspense></main>;
}
async function MobileAuth({ searchParams }: Pick<PageProps<"/mobile-auth">, "searchParams">) {
  // Auth and the bound Server Action must render only for an actual request.
  await connection();
  const { challenge, callback: requestedCallback } = await searchParams;
  const callback = mobileCallback(requestedCallback, process.env.NODE_ENV === "development", process.env.MOBILE_DEV_CALLBACK_URL);
  if (!callback) return <p>Invalid app callback. Check MOBILE_DEV_CALLBACK_URL on the API server and restart sign-in from the app.</p>;
  if (typeof challenge !== "string" || !/^[a-f0-9]{64}$/.test(challenge)) return <p>Invalid mobile sign-in request.</p>;
  const user = await getCurrentUser();
  const credentials = user ? await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true, accounts: { select: { provider: true } } } }) : null;
  return <>
    <h1 className="mb-4 text-2xl font-bold">Sign in to CimessFruit</h1>
    {user && needsGooglePassword(credentials) && <><PasswordSettings hasPassword={false} email={user.email} /><p className="field-hint">You can also skip password setup and continue to the app below.</p></>}
    <ContinueForm label={user ? `Continue to the app as ${user.email ?? user.name}` : "Continue with Google"} action={async () => {
      "use server";
      const currentUser = await getCurrentUser();
      if (!currentUser) {
        const query = new URLSearchParams({ challenge, callback });
        return await signIn("google", { redirectTo: `/mobile-auth?${query}`, redirect: false }) as string;
      }
      const code = randomBytes(32).toString("hex");
      await prisma.mobileAuthGrant.create({ data: {
        codeHash: hashSecret(code), userId: currentUser.id, challenge,
        expires: new Date(Date.now() + 60_000),
      } });
      const destination = new URL(callback);
      destination.searchParams.set("code", code);
      destination.searchParams.set("state", challenge);
      return destination.toString();
    }} />
  </>;
}
