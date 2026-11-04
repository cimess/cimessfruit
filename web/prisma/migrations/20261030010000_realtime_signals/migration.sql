CREATE TABLE "RealtimeSignal" ("id" UUID PRIMARY KEY, "kind" TEXT NOT NULL, "userId" UUID, "entityId" UUID NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "RealtimeSignal_createdAt_id_idx" ON "RealtimeSignal"("createdAt", "id");
