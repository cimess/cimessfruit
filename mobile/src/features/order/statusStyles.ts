import type { OrderStatus, PaymentStatus } from "@/features/order/types";

type StatusStyle = {
  backgroundColor: string;
  borderColor: string;
  color: string;
  iconColor: string;
};

export function getOrderStatusStyle(status: OrderStatus): StatusStyle {
  switch (status) {
    case "paid":
    case "pending":
      return {
        backgroundColor: "#FEF3C7",
        borderColor: "#F59E0B",
        color: "#92400E",
        iconColor: "#D97706",
      };
    case "processing":
      return {
        backgroundColor: "#DBEAFE",
        borderColor: "#3B82F6",
        color: "#1E40AF",
        iconColor: "#2563EB",
      };
    case "dispatched":
      return {
        backgroundColor: "#EDE9FE",
        borderColor: "#8B5CF6",
        color: "#5B21B6",
        iconColor: "#7C3AED",
      };
    case "delivered":
      return {
        backgroundColor: "#D1FAE5",
        borderColor: "#10B981",
        color: "#065F46",
        iconColor: "#059669",
      };
    case "resolved":
    case "returned":
    case "cancelled":
      return {
        backgroundColor: "#FEE2E2",
        borderColor: "#EF4444",
        color: "#991B1B",
        iconColor: "#DC2626",
      };
  }
}

export function getPaymentStatusStyle(status: PaymentStatus): StatusStyle {
  switch (status) {
    case "pending":
    case "review_required":
      return {
        backgroundColor: "#FEF3C7",
        borderColor: "#F59E0B",
        color: "#92400E",
        iconColor: "#D97706",
      };
    case "payment_verified":
      return {
        backgroundColor: "#D1FAE5",
        borderColor: "#10B981",
        color: "#065F46",
        iconColor: "#059669",
      };
    case "rejected":
      return {
        backgroundColor: "#FEE2E2",
        borderColor: "#EF4444",
        color: "#991B1B",
        iconColor: "#DC2626",
      };
  }
}
