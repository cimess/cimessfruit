import type { DeliveryAddressDraft, DeliveryZone } from "@/features/delivery/types";
import type { OrderDraft, OrderLine } from "@/features/order/types";

type CartLine = {
  lineId: string;
  productId: string;
  optionId: OrderLine["optionId"];
  name: string;
  optionLabel: OrderLine["optionLabel"];
  optionDetail: string;
  price: number;
  image: number | { uri: string };
  quantity: number;
};

type BuildOrderDraftInput = {
  items: Record<string, CartLine>;
  deliveryAddress: DeliveryAddressDraft;
  deliveryZone: DeliveryZone;
  customSmoothieRequested: boolean;
  customSmoothiePrice: number;
};

export function buildOrderDraft({
  customSmoothiePrice,
  customSmoothieRequested,
  deliveryAddress,
  deliveryZone,
  items,
}: BuildOrderDraftInput): OrderDraft {
  const orderLines = Object.values(items).map((item) => ({
    lineId: item.lineId,
    productId: item.productId,
    optionId: item.optionId,
    name: item.name,
    optionLabel: item.optionLabel,
    optionDetail: item.optionDetail,
    quantity: item.quantity,
    unitPrice: item.price,
    subtotal: item.price * item.quantity,
    image: item.image,
  }));
  const itemSubtotal = orderLines.reduce((total, item) => total + item.subtotal, 0);
  const smoothieFee = customSmoothieRequested ? customSmoothiePrice : 0;
  const deliveryFee = deliveryZone.isAvailable ? deliveryZone.deliveryFee : 0;

  return {
    items: orderLines,
    deliveryAddress,
    deliveryFee,
    itemSubtotal,
    smoothieFee,
    total: itemSubtotal + smoothieFee + deliveryFee,
  };
}
