import { createHash } from "node:crypto";
import { productTypes, fixedProductImage } from "./product-images";

// Add a type and its bundled image in product-images.ts, then run db:seed.
export const defaultCatalogue = Object.entries(productTypes).map(([productType, [name]]) => {
  const hash = createHash("sha256").update(`cimessfruit/catalogue/${productType}`).digest("hex");
  const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  return { id, name, productType, category: productType === "plantain" ? "PLANTAIN" as const : productType === "smoothie" ? "SMOOTHIE" as const : "FRUIT" as const };
});

export function existingCatalogueProduct(
  products: { id: string; name: string; category: string; productType: string | null }[],
  entry: typeof defaultCatalogue[number],
) {
  return products.find((product) => product.id === entry.id || product.productType === entry.productType)
    ?? products.find((product) => !product.productType && fixedProductImage(product) === fixedProductImage(entry));
}
