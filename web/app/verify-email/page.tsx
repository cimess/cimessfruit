import { Suspense } from "react";
import { connection } from "next/server";
import { getCurrentUser } from "@/server/auth/current-user";
import StoreShell from "../store/store-shell";
import VerificationForm from "./verification-form";
export default function VerifyEmailPage() {
  return <StoreShell><section className="store-section" style={{ maxWidth: 480, margin: "auto" }}><Suspense fallback={<p role="status">Loading…</p>}><Details /></Suspense></section></StoreShell>;
}
async function Details() {
  await connection();
  const user = await getCurrentUser();
  return <VerificationForm initialEmail={user?.email ?? ""} />;
}
