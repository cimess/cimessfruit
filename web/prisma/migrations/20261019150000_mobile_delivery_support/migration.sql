ALTER TABLE "DeliveryZone" ADD COLUMN "boundary" JSONB;
-- Preserve the existing key so saved addresses and historical orders remain valid.
UPDATE "DeliveryZone" SET "name" = 'Abesan', "area" = 'Abesan / Ipaja' WHERE "id" = 'abesan-estate';
CREATE TABLE "Conversation" (
 "id" UUID NOT NULL, "userId" UUID NOT NULL, "subject" TEXT NOT NULL,
 "productId" UUID, "orderId" UUID, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMPTZ(3) NOT NULL, CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "Conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Conversation_userId_updatedAt_idx" ON "Conversation"("userId", "updatedAt");
CREATE TABLE "ConversationMessage" (
 "id" UUID NOT NULL, "conversationId" UUID NOT NULL, "fromAdmin" BOOLEAN NOT NULL DEFAULT false,
 "body" TEXT NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ConversationMessage_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "ConversationMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ConversationMessage_conversationId_createdAt_idx" ON "ConversationMessage"("conversationId", "createdAt");
