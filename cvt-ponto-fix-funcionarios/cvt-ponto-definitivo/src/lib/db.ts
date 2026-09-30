import { Pool } from "pg";

declare global {
  var __cvtPool: Pool | undefined;
}

function getPool() {
  if (global.__cvtPool) return global.__cvtPool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL não configurada.");
  }

  const pool = new Pool({
    connectionString,
    max: 3,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  global.__cvtPool = pool;
  return pool;
}

export const db: Pick<Pool, "query" | "connect"> = {
  query: ((...args: unknown[]) => {
    const query = getPool().query as (...queryArgs: unknown[]) => unknown;
    return query.apply(getPool(), args);
  }) as Pool["query"],
  connect: () => getPool().connect(),
};
