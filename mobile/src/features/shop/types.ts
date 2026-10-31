export type ProductCategory = "fruit" | "plantain" | "smoothie";

export type ProductMeasureType = "size" | "weight";

export type SortKey = "newest" | "price-asc" | "price-desc" | "name";

export type FruitKind =
  | "apple"
  | "banana"
  | "coconut"
  | "grapes"
  | "lemon"
  | "pawpaw"
  | "pear"
  | "pineapple"
  | "tangerine"
  | "watermelon";

export type FruitFilterKey =
  | "all"
  | "grapes"
  | "tangerine"
  | "pineapple"
  | "apple";

export type ProductOption = {
  id: string;
  stock?: number;
  label: string;
  detail: string;
  price: number;
  image: number | { uri: string };
};

export type FruitBundleOffer = {
  id: string;
  name: string;
  fruits: string[];
  sizeLabel: string;
  price: number;
  compareAtPrice: number;
  discountPercent: number;
  isAvailable: boolean;
  tag: string;
};

export type SmoothieRecipe = {
  name: string;
  fruits: string[];
  sizeLabel: string;
  blendNote: string;
};

export type ShopProduct = {
  batchArrivedAt?: string | null;
  liveImageUrl?: string | null;
  liveImageUploadedAt?: string | null;
  id: string;
  name: string;
  subtitle: string;
  category: ProductCategory;
  fruitType?: FruitKind;
  measureType: ProductMeasureType;
  stock: number;
  image: number | { uri: string };
  options: ProductOption[];
  canNegotiate: boolean;
  canBeBlended: boolean;
  bundleOffer?: FruitBundleOffer;
  smoothieRecipe?: SmoothieRecipe;
  badge?: string;
  accent: string;
  rating: number;
  tags: string[];
};
