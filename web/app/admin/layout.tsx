import ClearDrafts from "@/features/uploads/ClearDrafts";
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current-user";
import { signOut } from "@/auth";
import { Brand } from "@/app/components/brand";
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<main className="page-loading" role="status">Opening your workspace…</main>}><AdminShell>{children}</AdminShell></Suspense>;
}
async function AdminShell({ children }: { children: React.ReactNode }) {
  await connection();
  const user = await getCurrentUser();
  if (!user) redirect("/admin-login");
  if (user.role !== "ADMIN") redirect("/admin-login");
  return <div className="admin-shell">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <aside className="sidebar">
      <Link href="/admin" className="brand-link"><Brand /></Link>
      <div className="workspace-label">WORKSPACE</div>
      <nav aria-label="Admin navigation"><Link href="/admin" className="nav-item active" aria-current="page"><span aria-hidden="true">▦</span> Product catalogue <span className="nav-dot" /></Link><Link href="/admin/support/emails" className="nav-item">Support email</Link><Link href="/admin/support" className="nav-item">Chat & disputes</Link><Link href="/admin/delivery-zones" className="nav-item">Delivery zones</Link><Link href="/admin/orders" className="nav-item">Orders & payments</Link><Link href="/account?view=profile" className="nav-item"><span aria-hidden="true">◎</span> Your account</Link></nav>
      <div className="sidebar-note"><span className="mini-leaf" aria-hidden="true">✳</span><strong>A little care.<br />A fresher catalogue.</strong><p>Keep your prices, availability and stock up to date.</p></div>
      <div className="sidebar-user"><span className="avatar">{(user.name ?? user.email ?? "A").slice(0, 1).toUpperCase()}</span><div><strong>{user.name ?? "Administrator"}</strong><small>Administrator</small></div></div>
      <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}><ClearDrafts /></form>
    </aside>
    <div className="workspace"><header className="topbar"><div><span className="muted">Workspace</span><span className="breadcrumb-divider">/</span><strong>Products</strong></div><span className="workspace-badge"><span /> Admin workspace</span></header><main id="main-content" className="workspace-content">{children}</main><footer className="workspace-footer">CimessFruit <span>Good food starts with good care.</span></footer></div>
  </div>;
}
