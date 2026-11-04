import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { signIn } from "@/auth";
import { getCurrentUser } from "@/server/auth/current-user";
import { Brand } from "@/app/components/brand";
import SubmitButton from "@/app/components/submit-button";
import PasswordLogin from "./password-login";
export default function LoginPage(props: PageProps<"/login">) {
  return <main className="login-page"><section className="login-story"><Brand light studio={false} /><div className="login-story-copy"><p className="eyebrow">A FRESH PERSPECTIVE</p><h1>Good things.<br />Grown with care.<br /><em>Made for you.</em></h1><p>Fresh fruit, favourite blends, and a little goodness every day.</p></div><div className="fruit-art" aria-hidden="true"><div className="fruit-orbit" /><div className="art-orange" /><div className="art-leaf leaf-one" /><div className="art-leaf leaf-two" /><div className="art-label">FRESH BY NATURE.</div></div><p className="login-story-footer">CimessFruit · A little fresher, every day.</p></section><section className="login-form-panel"><div className="login-mobile-brand"><Brand studio={false} /></div><div className="login-form-card"><span className="login-icon" aria-hidden="true">✳</span><p className="eyebrow">WELCOME BACK</p><h2>Let’s grow something good.</h2><p className="login-description">Your favourites are waiting. Sign in to CimessFruit.</p><Suspense fallback={<p role="status">Preparing secure sign-in…</p>}><LoginForm searchParams={props.searchParams} /></Suspense><div className="login-security"><span aria-hidden="true">◇</span> Secure sign-in · One account for web and mobile</div></div><p className="login-bottom">Fresh products. Thoughtful service. CimessFruit.</p></section></main>;
}
async function LoginForm({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  await connection();
  const user = await getCurrentUser();
  const { error, passwordChanged, intent, adminActivated } = await searchParams;
  const destination = intent === "admin" ? "/admin-login" : intent === "checkout" ? "/checkout" : "/account";
  if (user) redirect(destination);
  return <>{adminActivated === "1" && <p className="notice" role="status">Admin access activated. Sign in again to open your workspace.</p>}{passwordChanged === "1" && <p className="notice" role="status">Password changed. Sign in with your new password.</p>}<Link href="/recover">Forgot password?</Link><PasswordLogin destination={destination} /><div className="auth-divider"><span>or continue with</span></div>{error && <p role="alert" className="form-error">{error === "OAuthAccountNotLinked" ? "This email uses another sign-in method. Use your original account to continue." : "We couldn’t complete Google sign-in. Please try again or contact your administrator."}</p>}<form action={async () => { "use server"; await signIn("google", { redirectTo: intent === "admin" ? "/auth/complete?intent=admin" : intent === "checkout" ? "/auth/complete?intent=checkout" : "/auth/complete" }); }}><SubmitButton className="button google-button" pendingLabel="Connecting to Google…"><span className="google-g" aria-hidden="true">G</span> Continue with Google <span aria-hidden="true">↗</span></SubmitButton></form><p className="login-help">New to CimessFruit? <Link href={intent === "admin" ? "/signup?intent=admin" : intent === "checkout" ? "/signup?intent=checkout" : "/signup"} className="text-link">Create an account</Link><br /><Link href="/" className="text-link">← Continue browsing</Link></p></>;
}
