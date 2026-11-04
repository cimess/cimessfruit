import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current-user";
import { Brand } from "@/app/components/brand";
import AdminAccessForm from "./access-form";
export default function AdminLoginPage() { return <main className="account-page"><Link href="/"><Brand /></Link><section className="account-card admin-access-card"><span className="login-icon">◇</span><p className="eyebrow">STORE TEAM</p><h1>Admin access</h1><Suspense fallback={<p>Checking your account…</p>}><Access /></Suspense><Link href="/" className="text-link">← Back to the shop</Link></section></main>; }
async function Access() {
  await connection();
  const user = await getCurrentUser();
  if (user?.role === "ADMIN") redirect("/admin");
  if (!user) return <><p>Sign in to your account first. Existing administrators go straight to their workspace. New team members can activate access with the store owner’s authorization key.</p><Link href="/login?intent=admin" className="button button-primary">Sign in as admin →</Link><Link href="/signup?intent=admin" className="text-link">Create an account</Link></>;
  return <><p>Signed in as <strong>{user.email}</strong>. Enter your authorization key to enable administrator permissions for this account.</p><AdminAccessForm /></>;
}
