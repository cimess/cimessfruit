import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/database/prisma";
import PasswordSettings from "@/app/components/password-settings";
import StoreShell from "@/app/store/store-shell";
export default function Security() { return <StoreShell><section className="signup-page"><Link href="/account" className="text-link">← Your account</Link><Suspense fallback={<p>Loading security settings…</p>}><Settings /></Suspense></section></StoreShell>; }
async function Settings() {
  await connection(); const user=await getCurrentUser(); if (!user) redirect("/login");
  const credentials=await prisma.user.findUnique({where:{id:user.id},select:{passwordHash:true}});
  if (!credentials?.passwordHash) redirect("/auth/complete");
  return <PasswordSettings hasPassword email={user.email} />;
}
