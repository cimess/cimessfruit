import VerifyEmail from "./verify-email";
import ClearDrafts from "@/features/uploads/ClearDrafts";
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current-user";
import { signOut } from "@/auth";
import { prisma } from "@/server/database/prisma";
import StoreShell from "../store/store-shell";
import ProfileForm from "./profile-form";
export default function AccountPage() { return <StoreShell><Suspense fallback={<section className="store-section" role="status">Loading your account…</section>}><AccountDetails /></Suspense></StoreShell>; }
async function AccountDetails() {
  await connection();
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const profile = await prisma.user.findUnique({ where:{id:user.id},select:{freeShipping:true,name:true,phone:true,notificationsEnabled:true,passwordHash:true,emailVerified:true} });
  if (!profile) redirect("/login");
  return <><section className="store-page-heading"><p className="eyebrow">YOUR LITTLE CORNER OF CIMESSFRUIT</p><h1>Hello, {user.name?.split(" ")[0] ?? "friend"}.</h1><p>One account, all your favourites. Make yourself at home.</p></section><section className="store-section customer-account-layout"><aside className="customer-account-menu"><span className="avatar avatar-large">{(user.name ?? user.email ?? "U").slice(0,1).toUpperCase()}</span><strong>{user.name}</strong><p>{user.email}</p><Link href="#edit-profile" className="button">Edit profile</Link>{!profile.emailVerified && user.email && <VerifyEmail />}<Link href="/orders">Your orders →</Link><Link href="/cart">Your shopping bag →</Link><Link href="/account/security">Password & security →</Link><Link href="/account-deletion">Disable my account →</Link><Link href={user.role === "ADMIN" ? "/admin" : "/admin-login"}>{user.role === "ADMIN" ? "Admin workspace" : "Admin access"} ↗</Link><form action={async () => { "use server"; await signOut({redirectTo:"/login"}); }}><ClearDrafts /></form></aside><div id="edit-profile" className="customer-account-panel"><p className="eyebrow">THE EVERYDAY DETAILS</p><h2>Your profile</h2><p className="muted">Keep your name and phone number up to date.</p><ProfileForm freeShipping={profile.freeShipping} email={user.email ?? ""} emailVerified={!!profile.emailVerified} name={profile.name} phone={profile.phone} notificationsEnabled={profile.notificationsEnabled} /><div className="account-security-note"><strong>{profile.passwordHash ? "Password sign-in is ready" : "You’re connected with Google"}</strong><p>{profile.passwordHash ? "Use the same email and password on web and mobile." : "You can optionally add a CimessFruit password after Google sign-in."}</p><Link href={profile.passwordHash ? "/account/security" : "/auth/complete"} className="text-link">{profile.passwordHash ? "Manage password" : "Set up password sign-in"} →</Link></div></div></section></>;
}
