import type { DeliveryAddressDraft } from "@/features/delivery/types";
import type { ProductOption } from "@/features/shop/types";

export type OrderStatus =
  | "paid"
  | "pending"
  | "processing"
  | "dispatched"
  | "delivered"
  | "cancelled"
  | "returned"
  | "resolved";

export type PaymentStatus = "pending" | "review_required" | "payment_verified" | "rejected";

export type OrderLine = {
  lineId: string;
  productId: string;
  optionId: ProductOption["id"];
  name: string;
  optionLabel: ProductOption["label"];
  optionDetail: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  image: number | { uri: string };
};

export type OrderDraft = {
  useReturnCredit?: boolean;
  replacementDisputeId?: string;
  items: OrderLine[];
  deliveryAddress: DeliveryAddressDraft;
  deliveryFee: number;
  itemSubtotal: number;
  smoothieFee: number;
  total: number;
};

export type Order = OrderDraft & {
  creditApplied?: number;
  amountDue?: number;
  account?: { bank: string; accountNumber: string; accountName: string } | null;
  eligibility?: { eligible: boolean; issues: string[] };
  id: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  createdAt: string;
  updatedAt?: string;
  estimatedDeliveryTime: string;
};
