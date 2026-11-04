ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;
CREATE TABLE "MobileAuthGrant" (
  "codeHash" TEXT PRIMARY KEY,
  "userId" UUID NOT NULL,
  "challenge" TEXT NOT NULL,
  "expires" TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX "MobileAuthGrant_expires_idx" ON "MobileAuthGrant"("expires");
CREATE TABLE "AuthRateLimit" (
  "key" TEXT PRIMARY KEY,
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "expires" TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX "AuthRateLimit_expires_idx" ON "AuthRateLimit"("expires");
