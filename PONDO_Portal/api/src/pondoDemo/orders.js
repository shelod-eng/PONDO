import { findProduct } from "./catalog.js";
import { createSignedPayload } from "../qr.js";

export function createOrderService({ storage, eventHub, secret }) {
  const orderDetails = new Map(); // transactionId -> { items, delivery, saId?, bureau?, live }

  function computeAmount(items) {
    let total = 0;
    for (const item of items) {
      const p = findProduct(item.productId);
      if (!p) throw new Error(`unknown_product:${item.productId}`);
      const price = Math.round(p.priceCents * (1 - (p.discountPct || 0) / 100));
      total += price * item.qty;
    }
    return total;
  }

  async function createOrder({ actor, customerId, items, delivery, paymentMethod, gateway }) {
    const amountCents = computeAmount(items);
    const id = storage.newId();
    const qrPayload = createSignedPayload({ transactionId: id, amountCents, currency: "ZAR", customerId }, secret);

    const tx = await storage.createTransaction({
      id,
      customer_id: customerId,
      amount_cents: amountCents,
      currency: "ZAR",
      payment_method: paymentMethod,
      gateway,
      gateway_status: "initiated",
      credit_tier: null,
      qr_payload: qrPayload,
      status: "initiated",
    });

    orderDetails.set(id, { items, delivery, live: true });

    await storage.addAuditEntry(id, {
      actor,
      action: "order.created",
      data: { items, delivery, paymentMethod, gateway, live: true },
    });

    eventHub.send("order.updated", { id, status: tx.status, gateway_status: tx.gateway_status, live: true });
    return { transaction: tx, qrPayload };
  }

  async function attachCreditVet({ actor, id, bureau, saId, result }) {
    const tx = await storage.getTransaction(id);
    if (!tx) return null;
    const updated = await storage.updateTransaction(id, { credit_tier: result.tier, gateway_status: "credit_checked" });

    const detail = orderDetails.get(id) || { items: [], delivery: {}, live: true };
    orderDetails.set(id, { ...detail, saId, bureau });

    await storage.addAuditEntry(id, {
      actor,
      action: "bnpl.credit_vet",
      data: { bureau, saId, score: result.score, tier: result.tier, approved: result.approved },
    });

    eventHub.send("order.updated", { id, status: updated?.status, gateway_status: updated?.gateway_status, credit_tier: updated?.credit_tier, live: true });
    return updated;
  }

  async function authorizePayment({ actor, id, paymentMethod }) {
    const tx = await storage.getTransaction(id);
    if (!tx) return null;

    const needsBnpl = paymentMethod === "bnpl";
    const eligible = !needsBnpl || tx.credit_tier === "A" || tx.credit_tier === "B";
    if (!eligible) {
      const declined = await storage.updateTransaction(id, { payment_method: paymentMethod, gateway_status: "declined", status: "failed" });
      await storage.addAuditEntry(id, { actor, action: "payment.declined", data: { paymentMethod } });
      eventHub.send("order.updated", { id, status: declined?.status, gateway_status: declined?.gateway_status, live: true });
      return declined;
    }

    const updated = await storage.updateTransaction(id, {
      payment_method: paymentMethod,
      gateway_status: "settled",
      status: "reconciled",
      external_ref: `live_${id.slice(0, 8)}`,
      reconciled_at: new Date().toISOString(),
      settled_at: new Date().toISOString(),
    });
    await storage.addAuditEntry(id, { actor, action: "payment.settled", data: { paymentMethod } });
    await storage.addAuditEntry(id, { actor: "system", action: "qr.issued", data: { qr: true } });
    eventHub.send("order.updated", { id, status: updated?.status, gateway_status: updated?.gateway_status, live: true });
    return updated;
  }

  async function listLiveOrders() {
    const txs = await storage.listTransactions();
    return txs.map((t) => ({ ...t, live: true, details: orderDetails.get(t.id) || null }));
  }

  async function getOrder(id) {
    const tx = await storage.getTransaction(id);
    if (!tx) return null;
    const audit = await storage.listAuditEntries(id);
    return { transaction: tx, details: orderDetails.get(id) || null, audit };
  }

  return { createOrder, attachCreditVet, authorizePayment, listLiveOrders, getOrder };
}

