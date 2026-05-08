import { getPool } from "@/server/pondo/db";

const STRICT_ENV_VARS = ["JWT_SECRET"] as const;

const REQUIRED_TABLES = [
  "risk_profiles",
  "partners",
  "customer_profiles",
  "customer_contact_methods",
  "customer_addresses",
  "products",
  "product_categories",
  "product_prices",
  "payment_methods",
  "checkout_sessions",
  "checkout_session_events",
  "customer_consents",
  "otp_challenges",
  "verification_cases",
  "verification_steps",
  "risk_assessments",
  "risk_signals",
  "kyc_checks",
  "credit_checks",
  "fraud_checks",
  "affordability_checks",
  "manual_review_cases",
  "orders",
  "order_items",
  "order_status_history",
  "payment_transactions",
  "payment_events",
  "payment_settlements",
  "notifications",
  "notification_attempts",
  "delivery_processes",
  "delivery_process_steps",
  "audit_events",
] as const;

type RequiredEnvVar = "DATABASE_URL" | "DB_HOST" | "DB_USER" | "DB_PASSWORD" | (typeof STRICT_ENV_VARS)[number];
type RequiredTable = (typeof REQUIRED_TABLES)[number];

export async function runPondoPreflight() {
  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());
  const hasDbParts = Boolean(process.env.DB_HOST?.trim() && process.env.DB_USER?.trim() && process.env.DB_PASSWORD?.trim());
  const missingEnv: RequiredEnvVar[] = [];

  for (const name of STRICT_ENV_VARS) {
    if (!process.env[name]?.trim()) missingEnv.push(name);
  }

  if (!hasDatabaseUrl && !hasDbParts) {
    missingEnv.push("DATABASE_URL", "DB_HOST", "DB_USER", "DB_PASSWORD");
  }

  const result = {
    ok: false,
    schema: "pondo_core",
    missingEnv,
    missingTables: [] as RequiredTable[],
  };

  if (missingEnv.length > 0) {
    return result;
  }

  const pool = getPool();
  const tables = (await pool.query<{ table_name: string }>(
    `select table_name
     from information_schema.tables
     where table_schema = 'pondo_core'`,
  )).rows;

  const available = new Set(tables.map((row) => row.table_name));
  const missingTables = REQUIRED_TABLES.filter((tableName) => !available.has(tableName));

  return {
    ok: missingTables.length === 0,
    schema: "pondo_core",
    missingEnv,
    missingTables: missingTables as RequiredTable[],
  };
}
