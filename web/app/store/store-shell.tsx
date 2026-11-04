"use client";
import LiveUpdates from "@/features/realtime/LiveUpdates";
import CreditBanner from "@/features/returns/CreditBanner";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Brand } from "@/app/components/brand";
import { useCart } from "./use-cart";
export default function StoreShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const path = usePathname();
  const { count } = useCart();
  const [user, setUser] = useState<{
    id: string;
    name: string | null;
    role: string;
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/me", { cache: "no-store", signal: controller.signal })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!controller.signal.aborted) setUser(data?.user ?? null);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [path]);
  const links = [
    ["/", "Home"],
    ["/shop", "Shop"],
    ["/orders", "My orders"],
    ["/chat", "Chat"],
    ["/account", "Account"],
  ];
  return (
    <div className="store-site">
      <div className="store-announcement">
        A little goodness, every day.{" "}
        <span>Fresh fruit · Plantain · Smoothies</span>
      </div>
      <header className="store-header">
        <Link href="/" aria-label="CimessFruit home">
          <Brand studio={false} />
        </Link>
        <nav aria-label="Main navigation">
          {links.map(([href, label]) => (
            <Link
              href={href}
              key={href}
              aria-current={path === href ? "page" : undefined}
              className={path === href ? "current" : ""}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="store-header-actions">
          {user?.role === "ADMIN" && (
            <Link href="/admin" className="store-admin-link">
              Workspace ↗
            </Link>
          )}
          <Link href={user ? "/account" : "/login"} className="store-user-link">
            {user ? `Hi, ${user.name?.split(" ")[0] ?? "friend"}` : "Sign in"}
          </Link>
          <Link
            className="bag-link"
            href="/cart"
            aria-label={`Shopping bag, ${count} items`}
          >
            Bag <span>{count}</span>
          </Link>
        </div>
      </header>
      {user && (path === "/" || path === "/shop") && (
        <CreditBanner key={`${user.id}:${path}`} />
      )}
      {user && <LiveUpdates key={user.id} owner={user.id} />}
      <main>{children}</main>
      <footer className="store-footer">
        <div>
          <Brand studio={false} />
          <p>
            Fresh fruit. Favourite blends.
            <br />
            Goodness for your everyday.
          </p>
        </div>
        <div>
          <strong>Make yourself at home</strong>
          <Link href="/shop">Shop the collection</Link>
          <Link href="/account">Your account</Link>
          <Link href="/orders">Your orders</Link>
        </div>
        <div>
          <strong>A little help</strong>
          <Link href="/chat">Chat & disputes</Link>
          <Link href="/signup">Create an account</Link>
          <Link href="/login">Sign in</Link>
          <Link href="/admin-login">Admin sign-in</Link>
          <Link href="/privacy">Privacy policy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/refunds">Refunds</Link>
          <Link href="/delivery">Delivery</Link>
          <Link href="/account-deletion">Delete account</Link>
        </div>
        <div className="store-footer-bottom">
          CimessFruit <span>One account. Web and mobile.</span>
        </div>
      </footer>
      <nav className="store-mobile-nav" aria-label="Mobile navigation">
        {[
          ["/", "⌂", "Home"],
          ["/shop", "▦", "Shop"],
          ["/cart", "◡", `Bag (${count})`],
          ["/chat", "✉", "Chat"],
          ["/account", "◎", "Account"],
        ].map(([href, icon, label]) => (
          <Link
            href={href}
            key={href}
            className={path === href ? "current" : ""}
          >
            <span aria-hidden="true">{icon}</span>
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
