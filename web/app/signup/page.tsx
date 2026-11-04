import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { getCurrentUser } from "@/server/auth/current-user";
import StoreShell from "../store/store-shell";
import SubmitButton from "../components/submit-button";
import SignupForm from "./signup-form";
export default function SignupPage(props: PageProps<"/signup">) { return <StoreShell><section className="signup-page"><p className="eyebrow">WELCOME TO THE FRESH SIDE</p><h1>A little goodness starts here.</h1><p>One account for the website and the mobile app.</p><Suspense fallback={<p>Preparing signup…</p>}><Signup searchParams={props.searchParams} /></Suspense></section></StoreShell>; }
async function Signup({ searchParams }: Pick<PageProps<"/signup">,"searchParams">) {
  await connection();
  const { intent } = await searchParams;
  const admin = intent === "admin";
  const checkout = intent === "checkout";
  if (await getCurrentUser()) redirect(admin ? "/admin-login" : checkout ? "/checkout" : "/account");
  return <><p className="login-help">Read our <Link href="/terms" className="text-link">Terms and conditions</Link> and <Link href="/privacy" className="text-link">Privacy policy</Link> before creating an account.</p><SignupForm admin={admin} checkout={checkout} /><div className="auth-divider"><span>or join with Google</span></div><form action={async () => { "use server"; await signIn("google", { redirectTo: admin ? "/auth/complete?intent=admin" : checkout ? "/auth/complete?intent=checkout" : "/auth/complete" }); }}><SubmitButton className="button google-button" pendingLabel="Connecting to Google…">Continue with Google ↗</SubmitButton></form><p className="login-help">Already have an account? <Link href={admin ? "/login?intent=admin" : checkout ? "/login?intent=checkout" : "/login"} className="text-link">Sign in</Link></p></>;
}
