export const ORDER_REFRESH_MS = 15_000;
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
    if (!force && last !== undefined && now() - last < ORDER_REFRESH_MS) return Promise.resolve();
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

export class OrderPoller {
  private interval = ORDER_REFRESH_MS;
  setStreaming(healthy: boolean) {
    const interval = healthy ? 60000 : ORDER_REFRESH_MS;
    if (this.interval === interval) return;
    this.interval = interval;
    if (this.timer !== undefined) (this.deps.unschedule ?? clearTimeout)(this.timer);
    this.timer = undefined; this.schedule();
  }
  refreshSubscribed() { if (this.active) for (const key of this.subscriptions.keys()) void this.deps.refresh(key, true); }
  private active = false;
  private subscriptions = new Map<string, number>();
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly deps: {
    refresh: (key: string, force: boolean) => Promise<void>;
    cancel: (key: string) => void;
    pause: () => void;
    schedule?: typeof setTimeout;
    unschedule?: typeof clearTimeout;
  }) {}

  private schedule() {
    if (this.timer !== undefined || !this.active || !this.subscriptions.size) return;
    this.timer = (this.deps.schedule ?? setTimeout)(() => {
      this.timer = undefined;
      if (!this.active) return;
      for (const key of this.subscriptions.keys()) void this.deps.refresh(key, true);
      this.schedule();
    }, this.interval);
  }

  setActive(active: boolean) {
    if (this.active === active) return;
    this.active = active;
    if (active) {
      for (const key of this.subscriptions.keys()) void this.deps.refresh(key, false);
      this.schedule();
    } else {
      if (this.timer !== undefined) (this.deps.unschedule ?? clearTimeout)(this.timer);
      this.timer = undefined;
      this.deps.pause();
    }
  }

  subscribe(key: string) {
    const count = this.subscriptions.get(key) ?? 0;
    this.subscriptions.set(key, count + 1);
    if (this.active && !count) void this.deps.refresh(key, false);
    this.schedule();
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      const remaining = (this.subscriptions.get(key) ?? 1) - 1;
      if (remaining) this.subscriptions.set(key, remaining);
      else { this.subscriptions.delete(key); this.deps.cancel(key); }
      if (!this.subscriptions.size && this.timer !== undefined) {
        (this.deps.unschedule ?? clearTimeout)(this.timer);
        this.timer = undefined;
      }
    };
  }
}
