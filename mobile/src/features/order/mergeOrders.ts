import type { Order } from "./types";

export function mergeOrders(current: Record<string, Order>, incoming: Order[]): Record<string, Order> {
  const result = { ...current };
  for (const order of incoming) {
    const previous = current[order.id];
    const unchanged = previous && previous.status === order.status &&
      previous.paymentStatus === order.paymentStatus && previous.total === order.total &&
      (!previous.updatedAt || !order.updatedAt || previous.updatedAt === order.updatedAt);
    // List responses omit payment instructions/eligibility. Retain known detail
    // only while the order itself is unchanged; a changed order must revalidate.
    result[order.id] = unchanged && order.account === undefined && order.eligibility === undefined
      ? { ...order, account: previous.account, eligibility: previous.eligibility }
      : order;
  }
  return result;
}
