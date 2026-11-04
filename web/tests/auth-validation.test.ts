import test from "node:test";
import assert from "node:assert/strict";
import { signupSchema, loginSchema, emailSchema } from "../validation/auth-validation";

const signup = { name: "Test User", email: "USER@example.com", phoneNumber: "08012345678", password: "long-password-for-testing" };
test("signup normalizes identity and cannot accept roles or active flags", () => {
  const user = signupSchema.parse({ ...signup, role: "ADMIN", isActive: true });
  assert.equal(user.email, "user@example.com");
  assert.equal("role" in user, false);
  assert.equal("isActive" in user, false);
});
test("signup rejects weak passwords and bcrypt UTF-8 truncation", () => {
  assert.equal(signupSchema.safeParse({ ...signup, password: "short" }).success, false);
  assert.equal(signupSchema.safeParse({ ...signup, password: "🔐".repeat(20) }).success, false);
  assert.equal(signupSchema.safeParse({ ...signup, password: "a".repeat(72) }).success, true);
});
test("signup validates phone numbers and address structure", () => {
  assert.equal(signupSchema.safeParse({ ...signup, phoneNumber: "invalid-phone" }).success, false);
  assert.equal(signupSchema.safeParse({ ...signup, deliveryAddress: { role: "ADMIN" } }).success, false);
});
test("login rejects oversized payload fields", () => {
  assert.equal(loginSchema.safeParse({ emailOrPhone: "a".repeat(255), password: "password" }).success, false);
});

test("email normalization trims before validation and preserves distinct mailbox names", () => {
  assert.equal(signupSchema.parse({ ...signup, email: "  USER@Example.COM  " }).email, "user@example.com");
  assert.equal(loginSchema.parse({ emailOrPhone: " USER@Example.COM ", password: "secret" }).emailOrPhone, "user@example.com");
  assert.equal(loginSchema.parse({ emailOrPhone: " +2348012345678 ", password: "secret" }).emailOrPhone, "+2348012345678");
  assert.equal(emailSchema.parse(" First.Last+shop@Example.com "), "first.last+shop@example.com");
  for (const email of ["", "a b@example.com", "invalid", "a@", "a".repeat(255)]) {
    assert.equal(emailSchema.safeParse(email).success, false);
  }
});
