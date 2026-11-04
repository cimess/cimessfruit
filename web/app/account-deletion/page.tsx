"use client";
import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import StoreShell from "../store/store-shell";

function subscribeFragment(listener: () => void) {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}

const readHashParams = () => new URLSearchParams(window.location.hash.slice(1));

export default function AccountDeletionPage() {
  const hashParams = useSyncExternalStore(subscribeFragment, readHashParams, () => new URLSearchParams());
  const token = hashParams.get("token") ?? "";
  const initialEmail = hashParams.get("email") ?? "";

  const [step, setStep] = useState<"REQUEST" | "VERIFY_CODE">("REQUEST");
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Request 6-digit confirmation code via email
  async function requestOtp(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !email.trim()) return;
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/account-deletion/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to send verification code.");
      setMessage(data.message || "A 6-digit verification code has been sent to your email.");
      setStep("VERIFY_CODE");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reach server.");
    } finally {
      setBusy(false);
    }
  }

  // Complete disabling using either 6-digit code or direct link token
  async function confirmDisable(event: React.FormEvent) {
    event.preventDefault();
    if (busy || confirmation !== "DISABLE") return;
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const payload = token
        ? { token, confirmation: "DISABLE" as const }
        : { code: code.trim(), email: email.trim(), confirmation: "DISABLE" as const };

      const response = await fetch("/api/account-deletion/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Confirmation failed. Please try again.");

      setMessage(data.message);
      setDone(true);
      window.history.replaceState(null, "", window.location.pathname);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to confirm disabling.");
    } finally {
      setBusy(false);
    }
  }

  const isLinkFlow = Boolean(token);

  return (
    <StoreShell>
      <section className="store-section" style={{ maxWidth: 680, margin: "auto", padding: "30px 20px" }}>
        <div style={{ marginBottom: 24 }}>
          <p className="eyebrow" style={{ color: "#dc2626", fontWeight: 800 }}>SECURITY & ACCOUNT STATUS</p>
          <h1 style={{ fontSize: "2rem", fontWeight: 800, margin: "6px 0 12px" }}>
            Disable your CimessFruit account
          </h1>
          <p style={{ color: "#4b5563", fontSize: "0.95rem", lineHeight: 1.6 }}>
            Disabling your account signs you out on all devices and prevents unauthorized sign-ins.
            Your profile, orders, and wallet balance are safely preserved, and you can reactivate anytime.
          </p>
        </div>

        {done ? (
          <div style={{ padding: 24, borderRadius: 16, backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0", marginBottom: 24 }}>
            <h3 style={{ margin: "0 0 8px", color: "#166534", fontSize: "1.2rem", fontWeight: 800 }}>
              ✓ Account Successfully Disabled
            </h3>
            <p style={{ margin: "0 0 16px", color: "#15803d", fontSize: "0.95rem", lineHeight: 1.6 }}>
              {message}
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link href="/login" className="button button-primary">
                Return to Sign In
              </Link>
              <Link href="/recover#kind=reactivate" className="button">
                Reactivate Account
              </Link>
            </div>
          </div>
        ) : (
          <div style={{ padding: 26, borderRadius: 20, backgroundColor: "#ffffff", border: "1px solid #e5e7eb", boxShadow: "0 4px 16px rgba(0,0,0,0.05)" }}>
            {error && (
              <div style={{ padding: 12, borderRadius: 10, backgroundColor: "#fef2f2", color: "#dc2626", marginBottom: 18, fontSize: "0.9rem", fontWeight: 600 }}>
                {error}
              </div>
            )}
            {message && (
              <div style={{ padding: 12, borderRadius: 10, backgroundColor: "#ecfdf5", color: "#065f46", marginBottom: 18, fontSize: "0.9rem", fontWeight: 600 }}>
                {message}
              </div>
            )}

            {/* STEP 1: Enter email for OTP code (unless arrived via direct link) */}
            {!isLinkFlow && step === "REQUEST" && (
              <form onSubmit={requestOtp}>
                <div style={{ marginBottom: 18 }}>
                  <label htmlFor="account-email" style={{ display: "block", fontSize: "0.9rem", fontWeight: 700, marginBottom: 8 }}>
                    Enter Account Email Address
                  </label>
                  <input
                    id="account-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    maxLength={254}
                    required
                    placeholder="you@example.com"
                    style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: "1px solid #d1d5db", fontSize: "1rem" }}
                  />
                  <small style={{ color: "#6b7280", display: "block", marginTop: 6 }}>
                    We will send a 6-digit confirmation code to verify account ownership.
                  </small>
                </div>

                <button
                  type="submit"
                  className="button button-primary"
                  disabled={busy || !email.trim()}
                  style={{ width: "100%", padding: "13px", fontSize: "0.95rem", fontWeight: 800, borderRadius: 12 }}
                >
                  {busy ? "Sending Code…" : "Send Confirmation Code →"}
                </button>
              </form>
            )}

            {/* STEP 2: Enter 6-digit code or Direct Link + Type DISABLE */}
            {(isLinkFlow || step === "VERIFY_CODE") && (
              <form onSubmit={confirmDisable}>
                <div style={{ marginBottom: 18 }}>
                  <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 700, marginBottom: 6 }}>
                    Account Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLinkFlow || busy}
                    required
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid #d1d5db", backgroundColor: "#f9fafb" }}
                  />
                </div>

                {!isLinkFlow && (
                  <div style={{ marginBottom: 18 }}>
                    <label htmlFor="otp-code" style={{ display: "block", fontSize: "0.9rem", fontWeight: 700, marginBottom: 6 }}>
                      6-Digit Confirmation Code
                    </label>
                    <input
                      id="otp-code"
                      type="text"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                      placeholder="123456"
                      required
                      autoFocus
                      style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1px solid #d1d5db", fontSize: "1.3rem", letterSpacing: "0.3em", textAlign: "center", fontWeight: 800 }}
                    />
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                      <small style={{ color: "#6b7280" }}>Check your inbox / spam folder for the code.</small>
                      <button
                        type="button"
                        onClick={() => { setStep("REQUEST"); setCode(""); setError(""); }}
                        style={{ background: "none", border: "none", color: "#16a34a", fontSize: "0.82rem", fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}
                      >
                        Resend / change email
                      </button>
                    </div>
                  </div>
                )}

                <div style={{ marginBottom: 22, padding: 16, borderRadius: 12, backgroundColor: "#fef2f2", border: "1px solid #fee2e2" }}>
                  <label htmlFor="confirm-disable" style={{ display: "block", fontSize: "0.88rem", fontWeight: 700, color: "#991b1b", marginBottom: 6 }}>
                    Type <code style={{ backgroundColor: "#fee2e2", padding: "2px 6px", borderRadius: 4 }}>DISABLE</code> below to confirm:
                  </label>
                  <input
                    id="confirm-disable"
                    type="text"
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                    autoComplete="off"
                    required
                    pattern="DISABLE"
                    placeholder="DISABLE"
                    style={{ width: "100%", padding: "11px 14px", borderRadius: 8, border: "1px solid #f87171", fontWeight: 800, fontSize: "0.95rem" }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={busy || confirmation !== "DISABLE" || (!isLinkFlow && code.length !== 6)}
                  style={{
                    width: "100%",
                    padding: "13px",
                    fontSize: "0.95rem",
                    fontWeight: 800,
                    borderRadius: 12,
                    backgroundColor: confirmation === "DISABLE" && (isLinkFlow || code.length === 6) ? "#dc2626" : "#fca5a5",
                    color: "#ffffff",
                    border: "none",
                    cursor: confirmation === "DISABLE" ? "pointer" : "not-allowed",
                  }}
                >
                  {busy ? "Processing…" : "Yes, Disable My Account"}
                </button>
              </form>
            )}
          </div>
        )}

        <div style={{ marginTop: 24, textAlign: "center", fontSize: "0.9rem", color: "#6b7280" }}>
          <span>Changed your mind or want to reactivate? </span>
          <Link href="/recover#kind=reactivate" style={{ color: "#16a34a", fontWeight: 700 }}>
            Reactivate your account here
          </Link>
        </div>
      </section>
    </StoreShell>
  );
}
