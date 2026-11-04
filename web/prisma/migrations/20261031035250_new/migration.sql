-- DropForeignKey
ALTER TABLE "UploadAsset" DROP CONSTRAINT "UploadAsset_userId_fkey";

-- AddForeignKey
ALTER TABLE "UploadAsset" ADD CONSTRAINT "UploadAsset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
