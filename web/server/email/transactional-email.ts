import "server-only";
import { configuredEmailOrigin } from "./email-origin";
export function emailOrigin() {
  const missing = ["RESEND_API_KEY", "MAIL_FROM", "AUTH_URL"].filter(key => !process.env[key]);
  if (missing.length) {
    console.error("Transactional email configuration missing:", missing.join(", "));
    throw new Error("Email configuration missing");
  }
  return configuredEmailOrigin(process.env.AUTH_URL!, process.env.NODE_ENV === "production");
}
export async function sendEmail(email: string, subject: string, text: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.MAIL_FROM, to: [email], subject, text }), signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    console.error("Transactional email provider rejected request", { status: response.status });
    throw new Error("Email delivery failed");
  }
}
