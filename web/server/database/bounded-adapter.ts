import { PrismaPg } from "@prisma/adapter-pg";

type PgAdapter = Awaited<ReturnType<PrismaPg["connect"]>>;
type PgTransaction = Awaited<ReturnType<PgAdapter["startTransaction"]>>;

// SET LOCAL works on both direct PostgreSQL and transaction-mode PgBouncer.
// Ordinary statements use a short transaction; existing Prisma transactions
// retain their original connection/isolation/commit and receive the same limit.
export class BoundedPrismaPg extends PrismaPg {
  constructor(pool: ConstructorParameters<typeof PrismaPg>[0], private readonly statementTimeoutMillis: number) {
    super(pool, { disposeExternalPool: true });
    if (!Number.isSafeInteger(statementTimeoutMillis) || statementTimeoutMillis < 1) {
      throw Error("Invalid SQL statement timeout");
    }
  }

  override async connect() {
    const adapter = await super.connect();
    const startTransaction = adapter.startTransaction.bind(adapter);
    const timeout = this.statementTimeoutMillis;

    adapter.startTransaction = async isolationLevel => {
      const tx = await startTransaction(isolationLevel);
      try {
        await tx.executeRaw({ sql: `SET LOCAL statement_timeout = '${timeout}ms'`, args: [], argTypes: [] });
        return tx;
      } catch (error) {
        await tx.executeRaw({ sql: "ROLLBACK", args: [], argTypes: [] }).catch(() => {});
        await tx.rollback().catch(() => {});
        throw error;
      }
    };

    async function run<T>(operation: (tx: PgTransaction) => Promise<T>): Promise<T> {
      const tx = await adapter.startTransaction();
      let released = false;
      try {
        const result = await operation(tx);
        // Prisma normally issues this SQL itself. Our short transactions must
        // do so explicitly: the adapter's commit()/rollback() only release.
        await tx.executeRaw({ sql: "COMMIT", args: [], argTypes: [] });
        released = true;
        await tx.commit();
        return result;
      } catch (error) {
        // Preserve the original error if a disconnected/failed backend cannot roll back.
        if (!released) {
          await tx.executeRaw({ sql: "ROLLBACK", args: [], argTypes: [] }).catch(() => {});
          await tx.rollback().catch(() => {});
        }
        throw error;
      }
    }
    adapter.queryRaw = query => run(tx => tx.queryRaw(query));
    adapter.executeRaw = query => run(tx => tx.executeRaw(query));
    return adapter;
  }
}
