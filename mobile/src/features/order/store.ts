import { getSessionSnapshot, commitAuthenticatedUser } from "@/lib/api";
import { create } from "zustand";
import { createOrder, fetchOrders, fetchOrder, reportPayment } from "./service";
import type { Order, OrderDraft } from "./types";
import { mergeOrders } from "./mergeOrders";
import { ORDER_LIST, OrderPoller, OrderReadCoordinator } from "./readCoordinator";

type OrderState = {
  orders: Record<string, Order>;
  orderIds: string[];
  lastOrderId: string | null;
  isPlacingOrder: boolean;
  error: string | null;
  refreshing: Record<string, boolean>;
  readErrors: Record<string, string | null>;
  placeOrder: (draft: OrderDraft) => Promise<Order>;
  refresh: (id?: string, force?: boolean) => Promise<void>;
  report: (id: string) => Promise<Order>;
  getOrder: (orderId: string) => Order | undefined;
  clearError: () => void;
  reset: () => void;
};

let ownerGeneration = 0;
export const orderReads = new OrderReadCoordinator<Order>({
  load: async (key, signal) => {
    const snapshot = await getSessionSnapshot();
    const owner = (snapshot.session?.user as { id?: string })?.id;
    if (!owner || signal.aborted) throw Error("Please sign in.");
    const orders = key === ORDER_LIST ? await fetchOrders(signal) : [await fetchOrder(key, signal)];
    return { owner, orders };
  },
  commit: commitAuthenticatedUser,
  apply: (orders, key, ids) => useOrderStore.setState(state => ({
    orders: mergeOrders(state.orders, orders),
    ...(key === ORDER_LIST ? { orderIds: ids } : {}),
  })),
  state: (key, loading, error) => useOrderStore.setState(state => ({
    refreshing: { ...state.refreshing, [key]: loading },
    readErrors: error === undefined ? state.readErrors : { ...state.readErrors, [key]: error },
  })),
});

export const orderPolling = new OrderPoller({
  refresh: (key, force) => orderReads.refresh(key, force),
  cancel: key => orderReads.cancel(key),
  pause: () => orderReads.pause(),
});

export const useOrderStore = create<OrderState>((set, get) => ({
  orders: {}, orderIds: [], lastOrderId: null, isPlacingOrder: false, error: null,
  refreshing: {}, readErrors: {},
  placeOrder: async draft => {
    if (get().isPlacingOrder) throw Error("Checkout is already in progress.");
    const generation = ownerGeneration;
    orderReads.invalidate();
    set({ isPlacingOrder: true, error: null });
    try {
      const snapshot = await getSessionSnapshot();
      const owner = (snapshot.session?.user as { id?: string })?.id;
      if (!owner) throw Error("Please sign in.");
      if (ownerGeneration !== generation) throw Error("Session changed. Please retry.");
      const order = await createOrder(draft);
      await commitAuthenticatedUser(owner, () => {
        if (ownerGeneration !== generation) throw Error("Session changed. Please retry.");
        orderReads.invalidate();
        orderReads.markFresh(order.id);
        set(state => ({
          orders: mergeOrders(state.orders, [order]), lastOrderId: order.id, isPlacingOrder: false,
          orderIds: [order.id, ...state.orderIds.filter(id => id !== order.id)],
          readErrors: { ...state.readErrors, [order.id]: null },
        }));
      });
      return order;
    } catch (error) {
      if (ownerGeneration === generation) set({
        error: error instanceof Error ? error.message : "Unable to place this order right now.",
        isPlacingOrder: false,
      });
      throw error;
    }
  },
  refresh: (id, force = false) => orderReads.refresh(id ?? ORDER_LIST, force),
  report: async id => {
    const generation = ownerGeneration;
    const owner = ((await getSessionSnapshot()).session?.user as { id?: string })?.id;
    if (!owner) throw Error("Please sign in.");
    if (ownerGeneration !== generation) throw Error("Session changed. Please retry.");
    orderReads.invalidate();
    const order = await reportPayment(id);
    await commitAuthenticatedUser(owner, () => {
      if (ownerGeneration !== generation) throw Error("Session changed. Please retry.");
      orderReads.invalidate();
      orderReads.markFresh(order.id);
      set(state => ({ orders: mergeOrders(state.orders, [order]) }));
    });
    return order;
  },
  getOrder: orderId => get().orders[orderId],
  clearError: () => set({ error: null }),
  reset: () => {
    ownerGeneration++;
    orderReads.reset();
    set({ orders: {}, orderIds: [], lastOrderId: null, error: null, refreshing: {}, readErrors: {}, isPlacingOrder: false });
  },
}));
