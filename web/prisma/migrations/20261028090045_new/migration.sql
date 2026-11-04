-- DropIndex
DROP INDEX "Product_category_isAvailable_idx";

-- CreateIndex
CREATE INDEX "Product_isAvailable_createdAt_id_idx" ON "Product"("isAvailable", "createdAt" DESC, "id" DESC);
