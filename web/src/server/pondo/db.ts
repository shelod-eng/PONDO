import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __pondoPgPool: any;
}

function createPool() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (connectionString) {
    return new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 1,
    });
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
  });
}

export function getPool(): any {
  if (!globalThis.__pondoPgPool) {
    globalThis.__pondoPgPool = createPool();
  }
  return globalThis.__pondoPgPool;
}
