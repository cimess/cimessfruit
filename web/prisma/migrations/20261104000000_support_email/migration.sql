CREATE TABLE "SupportEmail" (
    "id" UUID NOT NULL,
    "resendId" UUID NOT NULL,
    "webhookId" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "replyTo" TEXT,
    "to" TEXT[] NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "messageId" TEXT,
    "attachments" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "receivedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupportEmail_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SupportEmail_status_check" CHECK ("status" IN ('OPEN', 'CLOSED'))
);
CREATE UNIQUE INDEX "SupportEmail_resendId_key" ON "SupportEmail"("resendId");
CREATE UNIQUE INDEX "SupportEmail_webhookId_key" ON "SupportEmail"("webhookId");
CREATE INDEX "SupportEmail_status_createdAt_id_idx" ON "SupportEmail"("status", "createdAt", "id");
CREATE INDEX "SupportEmail_createdAt_id_idx" ON "SupportEmail"("createdAt", "id");
CREATE TABLE "SupportEmailReply" (
    "id" UUID NOT NULL,
    "emailId" UUID NOT NULL,
    "adminId" UUID NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "replyTo" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "inReplyTo" TEXT,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "resendId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMPTZ(3),
    CONSTRAINT "SupportEmailReply_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SupportEmailReply_state_check" CHECK ("state" IN ('PENDING', 'SENT')),
    CONSTRAINT "SupportEmailReply_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "SupportEmail"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SupportEmailReply_resendId_key" ON "SupportEmailReply"("resendId");
CREATE INDEX "SupportEmailReply_emailId_createdAt_idx" ON "SupportEmailReply"("emailId", "createdAt");
