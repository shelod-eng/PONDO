import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.resolve(__dirname, "..", "..", "db", "schema.sql");

export function createPostgresStorage({ db }) {
  const pool = new pg.Pool({
    host: db.host,
    port: db.port,
    user: db.user,
    password: db.password,
    database: db.database,
    ssl: db.ssl ? { rejectUnauthorized: false } : false,
  });

  async function init() {
    const sql = fs.readFileSync(schemaPath, "utf8");
    await pool.query(sql);
  }

  return {
    init,

    async createTransaction(input) {
      const sql = `
        INSERT INTO transactions
          (id, customer_id, amount_cents, currency, payment_method, gateway, gateway_status, credit_tier, qr_payload, status)
        VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING *;
      `;
      const { rows } = await pool.query(sql, [
        input.id,
        input.customer_id,
        input.amount_cents,
        input.currency,
        input.payment_method,
        input.gateway,
        input.gateway_status,
        input.credit_tier ?? null,
        input.qr_payload,
        input.status,
      ]);
      return rows[0];
    },

    async getTransaction(id) {
      const { rows } = await pool.query("SELECT * FROM transactions WHERE id=$1", [id]);
      return rows[0] || null;
    },

    async listTransactions({ status } = {}) {
      if (status) {
        const { rows } = await pool.query("SELECT * FROM transactions WHERE status=$1 ORDER BY created_at DESC", [status]);
        return rows;
      }
      const { rows } = await pool.query("SELECT * FROM transactions ORDER BY created_at DESC");
      return rows;
    },

    async updateTransaction(id, patch) {
      const fields = Object.keys(patch);
      if (fields.length === 0) return this.getTransaction(id);

      const cols = [];
      const vals = [id];
      for (let i = 0; i < fields.length; i += 1) {
        cols.push(`${fields[i]}=$${i + 2}`);
        vals.push(patch[fields[i]]);
      }

      const sql = `UPDATE transactions SET ${cols.join(", ")}, updated_at=now() WHERE id=$1 RETURNING *`;
      const { rows } = await pool.query(sql, vals);
      return rows[0] || null;
    },

    async addAuditEntry(transactionId, entry) {
      await pool.query(
        "INSERT INTO audit_entries (transaction_id, actor, action, data) VALUES ($1,$2,$3,$4)",
        [transactionId, entry.actor, entry.action, entry.data || {}],
      );
    },

    async listAuditEntries(transactionId) {
      const { rows } = await pool.query(
        "SELECT at, actor, action, data FROM audit_entries WHERE transaction_id=$1 ORDER BY at ASC, id ASC",
        [transactionId],
      );
      return rows;
    },
  };
}

