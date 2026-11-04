-- AlterTable
ALTER TABLE "User" ADD COLUMN     "catalogueNotificationsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PushInstallation" (
    "id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PushInstallation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationEvent" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "userId" UUID,
    "entityId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "cursor" UUID,
    "fanoutDone" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMPTZ(3),
    "publishedAt" TIMESTAMPTZ(3),
    "leaseId" UUID,
    "leaseUntil" TIMESTAMPTZ(3),

    CONSTRAINT "NotificationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "installationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "receiptChecks" INTEGER NOT NULL DEFAULT 0,
    "ticket" TEXT,
    "error" TEXT,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushInstallation_token_key" ON "PushInstallation"("token");

-- CreateIndex
CREATE INDEX "PushInstallation_userId_idx" ON "PushInstallation"("userId");

-- CreateIndex
CREATE INDEX "PushInstallation_sessionId_idx" ON "PushInstallation"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationEvent_key_key" ON "NotificationEvent"("key");

-- CreateIndex
CREATE INDEX "NotificationEvent_completedAt_publishedAt_idx" ON "NotificationEvent"("completedAt", "publishedAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_eventId_state_idx" ON "NotificationDelivery"("eventId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_eventId_installationId_key" ON "NotificationDelivery"("eventId", "installationId");

-- AddForeignKey
ALTER TABLE "PushInstallation" ADD CONSTRAINT "PushInstallation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushInstallation" ADD CONSTRAINT "PushInstallation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationEvent" ADD CONSTRAINT "NotificationEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "NotificationEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "PushInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

