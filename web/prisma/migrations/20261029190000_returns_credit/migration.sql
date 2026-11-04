-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'RETURNED';

-- AlterEnum
ALTER TYPE "DeliveryStatus" ADD VALUE 'RETURNED';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "creditApplied" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ReturnCredit" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "userId" UUID,
    "approvalKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "approvedBy" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "approvedAmount" INTEGER NOT NULL,
    "deliveryRefund" INTEGER NOT NULL DEFAULT 0,
    "balance" INTEGER NOT NULL,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "spent" INTEGER NOT NULL DEFAULT 0,
    "locked" INTEGER NOT NULL DEFAULT 0,
    "refunded" INTEGER NOT NULL DEFAULT 0,
    "bankDetails" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refundDueAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ReturnCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnedItem" (
    "id" UUID NOT NULL,
    "creditId" UUID NOT NULL,
    "orderItemId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "restocked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ReturnedItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditAllocation" (
    "id" UUID NOT NULL,
    "creditId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "state" TEXT NOT NULL,

    CONSTRAINT "CreditAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefundTransfer" (
    "id" UUID NOT NULL,
    "creditId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "bankDetails" JSONB NOT NULL,
    "startedBy" UUID NOT NULL,
    "completedBy" UUID,
    "reference" TEXT,
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "RefundTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReturnCredit_approvalKey_key" ON "ReturnCredit"("approvalKey");

-- CreateIndex
CREATE INDEX "ReturnCredit_userId_createdAt_idx" ON "ReturnCredit"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ReturnCredit_orderId_idx" ON "ReturnCredit"("orderId");

-- CreateIndex
CREATE INDEX "ReturnedItem_orderItemId_idx" ON "ReturnedItem"("orderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ReturnedItem_creditId_orderItemId_key" ON "ReturnedItem"("creditId", "orderItemId");

-- CreateIndex
CREATE INDEX "CreditAllocation_orderId_state_idx" ON "CreditAllocation"("orderId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "CreditAllocation_creditId_orderId_key" ON "CreditAllocation"("creditId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "RefundTransfer_key_key" ON "RefundTransfer"("key");

-- CreateIndex
CREATE UNIQUE INDEX "RefundTransfer_reference_key" ON "RefundTransfer"("reference");

-- CreateIndex
CREATE INDEX "RefundTransfer_creditId_state_idx" ON "RefundTransfer"("creditId", "state");

-- AddForeignKey
ALTER TABLE "ReturnCredit" ADD CONSTRAINT "ReturnCredit_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnCredit" ADD CONSTRAINT "ReturnCredit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnedItem" ADD CONSTRAINT "ReturnedItem_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "ReturnCredit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnedItem" ADD CONSTRAINT "ReturnedItem_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditAllocation" ADD CONSTRAINT "CreditAllocation_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "ReturnCredit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditAllocation" ADD CONSTRAINT "CreditAllocation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundTransfer" ADD CONSTRAINT "RefundTransfer_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "ReturnCredit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Ledger conservation and exclusive pending transfer are enforced even outside application code.
ALTER TABLE "ReturnCredit" ADD CONSTRAINT "ReturnCredit_conservation" CHECK (
  "approvedAmount" > 0 AND "balance" >= 0 AND "reserved" >= 0 AND "spent" >= 0 AND "locked" >= 0 AND "refunded" >= 0
  AND "deliveryRefund" >= 0 AND "deliveryRefund" <= "approvedAmount"
  AND "approvedAmount"::bigint = "balance"::bigint + "reserved" + "spent" + "locked" + "refunded"
);
ALTER TABLE "CreditAllocation" ADD CONSTRAINT "CreditAllocation_valid" CHECK ("amount" > 0 AND "state" IN ('RESERVED','SPENT','RELEASED'));
ALTER TABLE "RefundTransfer" ADD CONSTRAINT "RefundTransfer_valid" CHECK ("amount" > 0 AND "state" IN ('PENDING','COMPLETED','CANCELLED'));
ALTER TABLE "ReturnedItem" ADD CONSTRAINT "ReturnedItem_positive" CHECK ("quantity" > 0 AND "amount" > 0);
CREATE UNIQUE INDEX "RefundTransfer_one_pending_per_credit" ON "RefundTransfer" ("creditId") WHERE "state" = 'PENDING';
ALTER TABLE "Order" ADD CONSTRAINT "Order_credit_applied_range" CHECK ("creditApplied" >= 0 AND "creditApplied" <= "total");
