export type ExpiryStore = {
  find: (before: Date, limit: number) => Promise<string[]>;
  remove: (ids: string[], before: Date) => Promise<number>;
};
// Rows still present are the durable work queue. Recheck expiry when deleting.
export async function cleanupCredentials(
  stores: Record<string, ExpiryStore>,
  budgetMs = 40000,
) {
  const deadline = Date.now() + budgetMs,
    before = new Date();
  const deleted: Record<string, number> = Object.fromEntries(
    Object.keys(stores).map((name) => [name, 0]),
  );
  let moreMayRemain = false;
  for (let round = 0; round < 10; round++) {
    let full = false;
    for (const [name, store] of Object.entries(stores)) {
      if (Date.now() >= deadline - 12000)
        return { deleted, moreMayRemain: true };
      const ids = await store.find(before, 200);
      if (ids.length) deleted[name] += await store.remove(ids, before);
      if (ids.length === 200) full = true;
    }
    moreMayRemain = full;
    if (!full) break;
  }
  return { deleted, moreMayRemain };
}
