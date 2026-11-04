-- New approvals encourage buying again only during the original 20-minute window.
ALTER TABLE "ReturnCredit" ALTER COLUMN "choice" SET DEFAULT 'CREDIT';
ALTER TABLE "Dispute" ALTER COLUMN "requestedChoice" SET DEFAULT 'CREDIT';
ALTER TABLE "Dispute" ADD COLUMN "approvedItems" JSONB;
