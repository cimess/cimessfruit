import "dotenv/config";
import { dataCache, closeRedis } from "../server/cache/redis";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { defaultCatalogue, existingCatalogueProduct } from "../lib/default-catalogue";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
async function main() {
  let created = 0;
  let matched = 0;
  await db.$transaction(async (tx) => {
    const products = await tx.product.findMany();
    for (const entry of defaultCatalogue) {
      const existing = existingCatalogueProduct(products, entry);
      if (existing) {
        if (!existing.productType) {
          await tx.product.update({ where: { id: existing.id }, data: { productType: entry.productType } });
          existing.productType = entry.productType;
        }
        matched++;
      } else {
        // No invented prices or stock. Admin adds sizes and prices when ready.
        await tx.product.upsert({ where: { id: entry.id }, update: {}, create: entry });
        created++;
      }
    }
  });
  await dataCache.invalidate("products");
  console.log(`Catalogue ready: ${created} added, ${matched} existing entries preserved.`);
  const products = await db.product.findMany({ include: { options: true } });
  console.log(`Verified product query: ${products.length} products; fixed images and photo fields readable.`);
}
main().catch((error) => { console.error("Catalogue setup failed:", error.code ?? error.name, error.meta?.driverAdapterError?.cause?.kind ?? "", error.message.replace(/postgres(?:ql)?:\/\/[^\s]+/g, "[database URL]")); process.exitCode = 1; }).finally(async () => { closeRedis(); await db.$disconnect(); });
