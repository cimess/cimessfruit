import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/database/prisma";
import { needsGooglePassword } from "@/domain/google-password";
import PasswordSettings from "@/app/components/password-settings";
import { Brand } from "@/app/components/brand";
export default function Complete(props: PageProps<"/auth/complete">) { return <Suspense fallback={<main className="page-loading">Finishing sign-in…</main>}><CompleteAuth searchParams={props.searchParams} /></Suspense>; }
async function CompleteAuth({ searchParams }: Pick<PageProps<"/auth/complete">, "searchParams">) {
  await connection();
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { intent } = await searchParams;
  const destination = intent === "admin" ? "/admin-login" : intent === "checkout" ? "/checkout" : "/account";
  const credentials = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true, accounts: { select: { provider: true } } } });
  if (!needsGooglePassword(credentials)) redirect(destination);
  return <main className="account-page"><Link href="/"><Brand studio={false} /></Link><section className="account-card"><p className="eyebrow">GOOGLE SIGN-IN SUCCESSFUL</p><h1>Welcome, {user.name ?? "friend"}.</h1><p>Your Google account is connected. Add a CimessFruit password if you’d also like to sign in using your email.</p><PasswordSettings hasPassword={false} email={user.email} /><Link className="text-link" href={destination}>Continue without a password →</Link></section></main>;
}
