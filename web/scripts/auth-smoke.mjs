import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import pg from "pg";

const origin = process.env.AUTH_SMOKE_URL ?? "http://127.0.0.1:3001";
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
const email = `auth-smoke-${randomUUID()}@example.test`;
const password = randomBytes(24).toString("hex");
const digest = (value) => createHash("sha256").update(value).digest("hex");
let userId;
const grantHashes = [];
async function request(path, status, token, body) {
  const response = await fetch(new URL(path, origin), {
    method: body === undefined ? "GET" : "POST",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status, status, `${path}: expected ${status}, got ${response.status}`);
  return response.json();
}
try {
  await db.connect();
  await request("/api/me", 401);
  const signup = await request("/api/mobile/signup", 201, undefined, {
    name: "Auth smoke test", email, phoneNumber: `09${Math.floor(Math.random() * 1e9).toString().padStart(9, "0")}`, password,
  });
  userId = signup.user.id;
  assert.match(signup.token, /^mobile_[a-f0-9]{64}$/);
  assert.equal(signup.user.role, "CUSTOMER");
  assert.equal("passwordHash" in signup.user, false);
  console.log("PASS signup and safe session response");
  const me = await request("/api/me", 200, signup.token);
  assert.equal(me.user.id, userId);
  assert.equal("passwordHash" in me.user, false);
  await request("/api/profile", 200, signup.token);
  await request("/api/admin/orders", 403, signup.token);
  console.log("PASS authenticated profile and RBAC");
  await request("/api/mobile/login", 401, undefined, { emailOrPhone: email, password: "wrong-password" });
  const login = await request("/api/mobile/login", 200, undefined, { emailOrPhone: email, password });
  await request("/api/me", 200, login.token);
  console.log("PASS password rejection and login");
  await db.query('UPDATE "User" SET "isActive" = false WHERE id = $1', [userId]);
  await request("/api/me", 401, login.token);
  await db.query('UPDATE "User" SET "isActive" = true WHERE id = $1', [userId]);
  const expired = await db.query('UPDATE "Session" SET expires = $2 WHERE "sessionToken" = $1', [`mobile-hash:${digest(signup.token)}`, new Date(Date.now() - 60000)]);
  assert.equal(expired.rowCount, 1, "Expiration fixture must update its session");
  await request("/api/me", 401, signup.token);
  console.log("PASS disabled users and expired sessions");
  // Exercise the native handoff independently of Google account authorization.
  const code = randomBytes(32).toString("hex");
  const verifier = randomBytes(32).toString("hex");
  const codeHash = digest(code); grantHashes.push(codeHash);
  await db.query('INSERT INTO "MobileAuthGrant" ("codeHash", "userId", challenge, expires) VALUES ($1, $2, $3, NOW() + INTERVAL \'1 minute\')', [codeHash, userId, digest(verifier)]);
  await request("/api/mobile/exchange", 401, undefined, { code, verifier: randomBytes(32).toString("hex") });
  const exchanged = await request("/api/mobile/exchange", 200, undefined, { code, verifier });
  await request("/api/me", 200, exchanged.token);
  await request("/api/mobile/exchange", 401, undefined, { code, verifier });
  console.log("PASS handoff verifier and one-use code (Google UI not tested)");
  await request("/api/mobile/logout", 200, login.token, {});
  await request("/api/me", 401, login.token);
  await request("/api/me", 200, exchanged.token);
  console.log("PASS logout revokes only its own session");
} finally {
  // Delete only uniquely identified fixtures created by this run.
  if (userId) await db.query('DELETE FROM "User" WHERE id = $1 AND email = $2', [userId, email]);
  for (const codeHash of grantHashes) await db.query('DELETE FROM "MobileAuthGrant" WHERE "codeHash" = $1', [codeHash]);
  const window = Math.floor(Date.now() / (15 * 60 * 1000));
  for (const offset of [-1, 0, 1]) await db.query('DELETE FROM "AuthRateLimit" WHERE key = $1', [digest(`${window + offset}:${email}`)]);
  await db.end();
}
