import { randomUUID } from "crypto";

export function createMemoryStorage() {
  const transactions = new Map();
  const audit = new Map(); // transactionId -> AuditEntry[]

  function nowIso() {
    return new Date().toISOString();
  }

  return {
    async init() {},

    async createTransaction(input) {
      const id = randomUUID();
      const createdAt = nowIso();
      const tx = {
        id,
        external_ref: null,
        customer_id: input.customer_id,
        amount_cents: input.amount_cents,
        currency: input.currency,
        payment_method: input.payment_method,
        gateway: input.gateway,
        gateway_status: input.gateway_status,
        credit_tier: input.credit_tier ?? null,
        qr_payload: input.qr_payload,
        status: input.status,
        qr_scanned_at: null,
        reconciled_at: null,
        settled_at: null,
        created_at: createdAt,
        updated_at: createdAt,
      };
      transactions.set(id, tx);
      audit.set(id, []);
      return tx;
    },

    async getTransaction(id) {
      return transactions.get(id) || null;
    },

    async listTransactions({ status } = {}) {
      const all = [...transactions.values()].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      if (!status) return all;
      return all.filter((t) => t.status === status);
    },

    async updateTransaction(id, patch) {
      const tx = transactions.get(id);
      if (!tx) return null;
      const updated = { ...tx, ...patch, updated_at: nowIso() };
      transactions.set(id, updated);
      return updated;
    },

    async addAuditEntry(transactionId, entry) {
      if (!audit.has(transactionId)) audit.set(transactionId, []);
      audit.get(transactionId).push({ at: nowIso(), ...entry });
    },

    async listAuditEntries(transactionId) {
      return audit.get(transactionId) || [];
    },
  };
}

