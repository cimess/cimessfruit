import { apiRequest } from "@/lib/api";
import type { FruitFilterKey, ProductCategory, ShopProduct, SortKey } from "./types";

type Product = {
  id: string;
  name: string;
  description: string;
  category: string;
  productType: string | null;
  batchArrivedAt: string | null;
  imageUrl: string | null;
  imageUploadedAt: string | null;
  options: {
    id: string;
    label: string;
    detail: string;
    price: number;
    stock: number;
  }[];
};

export type BrowseProductsInput = {
  category: ProductCategory;
  search: string;
  sort: SortKey;
  fruitFilter: FruitFilterKey;
};

export async function fetchProductPage(
  input: BrowseProductsInput,
  cursor: string | null,
  signal?: AbortSignal,
): Promise<{
  items: ShopProduct[];
  nextCursor: string | null;
  total: number;
}> {
  const params = new URLSearchParams({
    limit: "20",
    category: input.category.toUpperCase(),
    sort: input.sort,
    fruitFilter: input.category === "fruit" ? input.fruitFilter : "all",
  });

  if (input.search.trim()) params.set("search", input.search.trim());
  if (cursor) params.set("cursor", cursor);

  const result = await apiRequest<{
    items: Product[];
    nextCursor: string | null;
    total: number;
  }>(`/api/products?${params}`, { signal }, false);

  const items: ShopProduct[] = result.items.map(p => {
    const images: Record<string, number> = {
      banana: require("@/assets/images/thumbs/banana.webp"), redApple: require("@/assets/images/thumbs/redApple.webp"),
      greenApple: require("@/assets/images/thumbs/greenApple.webp"), pinkApple: require("@/assets/images/thumbs/pinkApple.webp"),
      pears: require("@/assets/images/thumbs/pears.webp"), grapes: require("@/assets/images/thumbs/grapes.webp"),
      pawpaw: require("@/assets/images/thumbs/pawpaw.webp"), watermelon: require("@/assets/images/thumbs/watermelon.webp"),
      coconut: require("@/assets/images/thumbs/coconut.webp"), tangerine: require("@/assets/images/thumbs/tangrin.webp"),
      lemon: require("@/assets/images/thumbs/lemon.webp"), pineapple: require("@/assets/images/thumbs/pineapple.webp"),
      plantain: require("@/assets/images/thumbs/plantain.webp"), smoothie: require("@/assets/images/thumbs/smoothie2.webp"),
    };
    const inferred = p.name.toLowerCase().includes("pineapple") ? "pineapple" : Object.keys(images).find(key => p.name.toLowerCase().includes(key.toLowerCase()));
    const image = images[p.productType ?? inferred ?? (p.category === "PLANTAIN" ? "plantain" : p.category === "SMOOTHIE" ? "smoothie" : "")] ?? require("@/assets/logo/logo.png");

    return {
      id: p.id,
      batchArrivedAt: p.batchArrivedAt,
      liveImageUrl: p.imageUrl,
      liveImageUploadedAt: p.imageUploadedAt,
      name: p.name,
      subtitle: p.description,
      category: p.category.toLowerCase() as ShopProduct["category"],
      fruitType: (
        p.productType?.includes("Apple") ? "apple"
          : p.productType === "pears" ? "pear" : p.productType
      ) as ShopProduct["fruitType"],
      measureType: "size",
      stock: Math.max(0, ...p.options.map(o => o.stock)),
      image,
      options: p.options.map(o => ({ ...o, price: o.price / 100, image })),
      canNegotiate: true,
      canBeBlended: false,
      accent: "#E8F6CF",
      rating: 0,
      tags: [p.productType ?? "", p.name.toLowerCase()],
    };
  });

  return {
    items,
    nextCursor: result.nextCursor,
    total: result.total,
  };
}
