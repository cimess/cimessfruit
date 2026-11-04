const missing = [];
for (const key of ["DATABASE_URL", "AUTH_SECRET", "AUTH_URL", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "ADMIN_AUTHORIZATION_KEY", "RESEND_API_KEY", "MAIL_FROM", "CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"]) {
  if (!process.env[key]?.trim()) missing.push(`${key} is required`);
}
for (const key of ["AUTH_SECRET", "ADMIN_AUTHORIZATION_KEY"]) if ((process.env[key]?.length ?? 0) < 32) missing.push(`${key} must have at least 32 characters`);
try {
  const url = new URL(process.env.AUTH_URL);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash || ["localhost", "127.0.0.1"].includes(url.hostname)) missing.push("AUTH_URL must be your public HTTPS origin");
} catch { missing.push("AUTH_URL must be a valid URL"); }
if (missing.length) { console.error(missing.join("\n")); process.exitCode = 1; }
else console.log("Production environment checks passed. Provider connectivity and device acceptance still need verification.");
