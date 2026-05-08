import pg from "pg";

const { Pool } = pg;
type PondoPool = InstanceType<typeof Pool>;
type QueryablePool = PondoPool & {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

declare global {
  var __pondoPgPool: QueryablePool | undefined;
}

function createPool(): QueryablePool {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (connectionString) {
    return new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 1,
    }) as QueryablePool;
  }

  const host = process.env.DB_HOST?.trim();
  const user = process.env.DB_USER?.trim();
  const password = process.env.DB_PASSWORD?.trim();
  const database = process.env.DB_NAME?.trim() || "postgres";
  const port = Number(process.env.DB_PORT || 5432);
  const ssl = String(process.env.DB_SSL || "true").toLowerCase() === "true";

  if (!host || !user || !password) {
    throw new Error("database_env_missing");
  }

  return new Pool({
    host,
    user,
    password,
    database,
    port,
    ssl: ssl ? { rejectUnauthorized: false } : false,
    max: 1,
  }) as QueryablePool;
}

export function getPool(): QueryablePool {
  if (!globalThis.__pondoPgPool) {
    globalThis.__pondoPgPool = createPool();
  }
  return globalThis.__pondoPgPool;
}
