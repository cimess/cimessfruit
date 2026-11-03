export const ORDER_STALE_MS = 15_000;
export const ORDER_LIST = "list";

// Framework-independent so request races, cancellation and deduplication can be tested.
export class OrderReadCoordinator<T extends { id: string }> {
  private generation = 0;
  private sequence = 0;
  private applied = new Map<string, number>();
  private fresh = new Map<string, number>();
  private pending = new Map<string, { controller: AbortController; promise: Promise<void> }>();

  constructor(private readonly deps: {
    load: (key: string, signal: AbortSignal) => Promise<{ owner: string; orders: T[] }>;
    commit: (owner: string, apply: () => void) => Promise<void>;
    apply: (orders: T[], key: string, ids: string[]) => void;
    state: (key: string, loading: boolean, error?: string | null) => void;
    now?: () => number;
  }) {}

  refresh(key = ORDER_LIST, force = false): Promise<void> {
    const existing = this.pending.get(key);
    if (existing) return existing.promise;
    const now = this.deps.now ?? Date.now;
    const last = this.fresh.get(key);
    if (!force && last !== undefined && now() - last < ORDER_STALE_MS) return Promise.resolve();
    const generation = this.generation, sequence = ++this.sequence;
    const controller = new AbortController();
    const current = () => generation === this.generation && !controller.signal.aborted;
    this.deps.state(key, true, null);
    // Defer load one microtask so the pending entry exists even for synchronous failures.
    const promise = Promise.resolve().then(async () => {
      try {
        if (!current()) return;
        const result = await this.deps.load(key, controller.signal);
        if (!current()) return;
        await this.deps.commit(result.owner, () => {
          if (!current()) return;
          const orders = result.orders.filter(order => (this.applied.get(order.id) ?? 0) <= sequence);
          for (const order of orders) this.applied.set(order.id, sequence);
          this.deps.apply(orders, key, result.orders.map(order => order.id));
          this.fresh.set(key, now());
          this.deps.state(key, false, null);
        });
      } catch (error) {
        if (current()) {
          this.fresh.delete(key);
          this.deps.state(key, false, error instanceof Error ? error.message : "Unable to load orders.");
        }
      } finally {
        if (this.pending.get(key)?.controller === controller) this.pending.delete(key);
      }
    });
    this.pending.set(key, { controller, promise });
    return promise;
  }

  cancel(key: string) {
    const request = this.pending.get(key);
    if (!request) return;
    request.controller.abort();
    this.pending.delete(key);
    this.deps.state(key, false);
  }

  pause() {
    this.generation++;
    for (const key of [...this.pending.keys()]) this.cancel(key);
  }

  invalidate() { this.pause(); this.fresh.clear(); }
  markFresh(key: string) { this.fresh.set(key, (this.deps.now ?? Date.now)()); }
  reset() { this.invalidate(); this.applied.clear(); }
}

// No background polling: reads are triggered by subscribers, foregrounding,
// explicit refreshes, and SSE invalidations.
export class OrderSubscriptions {
  private active = false;
  private subscriptions = new Map<string, number>();

  constructor(private readonly deps: {
    refresh: (key: string, force: boolean) => Promise<void>;
    cancel: (key: string) => void;
    pause: () => void;
  }) {}

  refreshSubscribed() {
    if (this.active) for (const key of this.subscriptions.keys()) void this.deps.refresh(key, true);
  }

  setActive(active: boolean) {
    if (this.active === active) return;
    this.active = active;
    if (active) {
      for (const key of this.subscriptions.keys()) void this.deps.refresh(key, false);
    } else {
      this.deps.pause();
    }
  }

  subscribe(key: string) {
    const count = this.subscriptions.get(key) ?? 0;
    this.subscriptions.set(key, count + 1);
    if (this.active && !count) void this.deps.refresh(key, false);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      const remaining = (this.subscriptions.get(key) ?? 1) - 1;
      if (remaining) this.subscriptions.set(key, remaining);
      else { this.subscriptions.delete(key); this.deps.cancel(key); }
    };
  }
}
