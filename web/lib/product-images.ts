export const productTypes = {
  banana: ["Banana", "banana"], redApple: ["Red apple", "redApple"],
  greenApple: ["Green apple", "greenApple"], pinkApple: ["Pink Lady apple", "pinkApple"],
  pears: ["Apple pear", "pears"], grapes: ["Grapes", "grapes"],
  pawpaw: ["Pawpaw", "pawpaw"], watermelon: ["Watermelon", "watermelon"],
  coconut: ["Coconut", "coconut"], tangerine: ["Tangerine", "tangrin"],
  lemon: ["Lemon", "lemon"], pineapple: ["Pineapple", "pineapple"],
  plantain: ["Plantain", "plantain"], smoothie: ["Smoothie", "smoothie2"],
} as const;
export type ProductType = keyof typeof productTypes;
export function fixedProductImage(product: { productType?: string | null; name: string; category?: string }): string | null {
  let type = product.productType;
  if (!type) {
    const name = product.name.toLowerCase();
    type = name.includes("pear") ? "pears" : name.includes("green") && name.includes("apple") ? "greenApple"
      : name.includes("pink") ? "pinkApple" : name.includes("apple") && !name.includes("pineapple") ? "redApple"
      : name.includes("papaya") ? "pawpaw" : name.includes("grape") ? "grapes" : Object.keys(productTypes).find((key) => name.includes(key.toLowerCase()));
    if (!type && product.category === "PLANTAIN") type = "plantain";
    if (!type && product.category === "SMOOTHIE") type = "smoothie";
  }
  return type && Object.hasOwn(productTypes, type) ? `/store/${productTypes[type as ProductType][1]}.webp` : null;
}
