import { create } from "zustand";

import type { ProductOption, ShopProduct } from "@/features/shop/types";

type CartLine = {
  lineId: string;
  productId: string;
  optionId: ProductOption["id"];
  name: string;
  optionLabel: ProductOption["label"];
  optionDetail: string;
  category: ShopProduct["category"];
  canBeBlended: boolean;
  price: number;
  image: number | { uri: string };
  quantity: number;
  stock: number;
};

type CartState = {
  items: Record<string, CartLine>;
  customSmoothieRequested: boolean;
  customSmoothiePrice: number;
  addSelection: (
    product: ShopProduct,
    option: ProductOption,
    quantity: number
  ) => void;
  increment: (lineId: string) => void;
  decrement: (lineId: string) => void;
  removeItem: (lineId: string) => void;
  setCustomSmoothieRequested: (requested: boolean, price?: number) => void;
  clear: () => void;
  getProductQuantity: (productId: string) => number;
  getTotalItems: () => number;
  getTotalAmount: () => number;
};

function getLineId(productId: string, optionId: ProductOption["id"]) {
  return `${productId}:${optionId}`;
}

function canRequestCustomSmoothie(items: Record<string, CartLine>) {
  const lines = Object.values(items);

  return (
    lines.length > 0 &&
    lines.every((item) => item.category === "fruit" && item.canBeBlended)
  );
}

export const useCartStore = create<CartState>((set, get) => ({
  items: {},
  customSmoothieRequested: false,
  customSmoothiePrice: 0,
  addSelection: (product, option, quantity) => {
    set((state) => {
      const lineId = getLineId(product.id, option.id);
      const existing = state.items[lineId];
      const nextQuantity = Math.min(
        (existing?.quantity ?? 0) + quantity,
        (option.stock ?? product.stock)
      );
      const nextItems = {
        ...state.items,
        [lineId]: {
          lineId,
          productId: product.id,
          optionId: option.id,
          name: product.name,
          optionLabel: option.label,
          optionDetail: option.detail,
          category: product.category,
          canBeBlended: product.canBeBlended,
          price: option.price,
          image: option.image,
          stock: option.stock ?? product.stock,
          quantity: nextQuantity,
        },
      };
      const canKeepCustomSmoothie = canRequestCustomSmoothie(nextItems);

      return {
        items: nextItems,
        customSmoothieRequested: canKeepCustomSmoothie
          ? state.customSmoothieRequested
          : false,
        customSmoothiePrice: canKeepCustomSmoothie
          ? state.customSmoothiePrice
          : 0,
      };
    });
  },
  increment: (lineId) => {
    set((state) => {
      const existing = state.items[lineId];

      if (!existing) {
        return state;
      }

      return {
        items: {
          ...state.items,
          [lineId]: {
            ...existing,
            quantity: Math.min(existing.quantity + 1, existing.stock),
          },
        },
      };
    });
  },
  decrement: (lineId) => {
    set((state) => {
      const existing = state.items[lineId];

      if (!existing) {
        return state;
      }

      if (existing.quantity <= 1) {
        const { [lineId]: _removed, ...remaining } = state.items;
        const canKeepCustomSmoothie = canRequestCustomSmoothie(remaining);

        return {
          items: remaining,
          customSmoothieRequested: canKeepCustomSmoothie
            ? state.customSmoothieRequested
            : false,
          customSmoothiePrice: canKeepCustomSmoothie
            ? state.customSmoothiePrice
            : 0,
        };
      }

      return {
        items: {
          ...state.items,
          [lineId]: {
            ...existing,
            quantity: existing.quantity - 1,
          },
        },
      };
    });
  },
  removeItem: (lineId) => {
    set((state) => {
      const { [lineId]: _removed, ...remaining } = state.items;
      const canKeepCustomSmoothie = canRequestCustomSmoothie(remaining);

      return {
        items: remaining,
        customSmoothieRequested: canKeepCustomSmoothie
          ? state.customSmoothieRequested
          : false,
        customSmoothiePrice: canKeepCustomSmoothie
          ? state.customSmoothiePrice
          : 0,
      };
    });
  },
  setCustomSmoothieRequested: (requested, price = 0) =>
    set((state) => {
      const canRequest = canRequestCustomSmoothie(state.items);

      return {
        customSmoothieRequested: requested && canRequest,
        customSmoothiePrice: requested && canRequest ? price : 0,
      };
    }),
  clear: () =>
    set({
      items: {},
      customSmoothieRequested: false,
      customSmoothiePrice: 0,
    }),
  getProductQuantity: (productId) =>
    Object.values(get().items)
      .filter((item) => item.productId === productId)
      .reduce((total, item) => total + item.quantity, 0),
  getTotalItems: () =>
    Object.values(get().items).reduce((total, item) => total + item.quantity, 0),
  getTotalAmount: () => {
    const state = get();
    const itemTotal = Object.values(state.items).reduce(
      (total, item) => total + item.price * item.quantity,
      0
    );

    return (
      itemTotal +
      (state.customSmoothieRequested ? state.customSmoothiePrice : 0)
    );
  },
}));
