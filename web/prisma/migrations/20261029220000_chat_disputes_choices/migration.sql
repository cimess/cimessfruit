-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'RESOLVED';

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'CHAT';

-- AlterTable
ALTER TABLE "ConversationMessage" ADD COLUMN     "evidenceUrls" JSONB;

-- AlterTable
ALTER TABLE "ReturnCredit" ADD COLUMN     "choice" TEXT NOT NULL DEFAULT 'BANK_REFUND';

-- CreateTable
CREATE TABLE "Dispute" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "conversationId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "requestedChoice" TEXT NOT NULL DEFAULT 'BANK_REFUND',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "responsibility" TEXT,
    "decisionNote" TEXT,
    "decidedBy" UUID,
    "decidedAt" TIMESTAMPTZ(3),
    "creditId" UUID,
    "replacementOrderId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Dispute_key_key" ON "Dispute"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Dispute_conversationId_key" ON "Dispute"("conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "Dispute_creditId_key" ON "Dispute"("creditId");

-- CreateIndex
CREATE UNIQUE INDEX "Dispute_replacementOrderId_key" ON "Dispute"("replacementOrderId");

-- CreateIndex
CREATE INDEX "Dispute_userId_createdAt_idx" ON "Dispute"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Dispute_orderId_idx" ON "Dispute"("orderId");

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "ReturnCredit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_replacementOrderId_fkey" FOREIGN KEY ("replacementOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;


ALTER TABLE "ReturnCredit" ADD CONSTRAINT "ReturnCredit_choice_valid" CHECK ("choice" IN ('BANK_REFUND','CREDIT','REPLACEMENT'));
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_kind_valid" CHECK ("kind" IN ('CHAT','DISPUTE'));
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_status_valid" CHECK ("status" IN ('OPEN','APPROVED','REJECTED'));
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_choice_valid" CHECK ("requestedChoice" IN ('BANK_REFUND','CREDIT','REPLACEMENT'));
CREATE UNIQUE INDEX "Dispute_one_open_case_per_order" ON "Dispute" ("orderId") WHERE "status" = 'OPEN';

ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_responsibility_valid" CHECK ("responsibility" IS NULL OR "responsibility" IN ('STORE','RIDER','CUSTOMER','UNDETERMINED'));
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_decision_consistent" CHECK (
  ("status" = 'OPEN' AND "creditId" IS NULL AND "decidedAt" IS NULL)
  OR ("status" = 'APPROVED' AND "creditId" IS NOT NULL AND "decidedAt" IS NOT NULL)
  OR ("status" = 'REJECTED' AND "creditId" IS NULL AND "decidedAt" IS NOT NULL)
);
