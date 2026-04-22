import { findProduct } from "./catalog.js";
import { createSignedPayload } from "../qr.js";

const DELIVERY_PROCESS_STEPS = [
  { title: "Dispatch Initiation", detail: "Email, WhatsApp, and SMS dispatches confirm that the order is in route." },
  { title: "Active Tracking", detail: "System confirms live dispatch and starts real-time package tracking." },
  { title: "Driver Assignment", detail: "PONDO verifies and confirms the specific delivery person to the buyer." },
  { title: "On-Site Verification", detail: "Identity is verified at the door with physical identification checks." },
  { title: "Conclusion", detail: "Final payment confirmation automatically triggers invoice initiation." },
];

const BUSINESS_BANK_ACCOUNTS = {
  absa: { bankLabel: "ABSA Business Account", accountRef: "ABSA-***-1042" },
  fnb: { bankLabel: "FNB Business Account", accountRef: "FNB-***-7721" },
  standard_bank: { bankLabel: "Standard Bank Business Account", accountRef: "STD-***-5560" },
};

export function createOrderService({ storage, eventHub, secret }) {
  const orderDetails = new Map(); // transactionId -> { items, delivery, saId?, bureau?, live }
  const deliveryProcess = new Map(); // transactionId -> { startedAtMs, stepDurationMs, startedBy }

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

  async function authorizePayment({ actor, id, paymentMethod, settlementBank = "absa", notifyEmail = "shelod@gmail.com", notifyChannels = ["sms", "email"] }) {
    const tx = await storage.getTransaction(id);
    if (!tx) return null;

    const needsBnpl = paymentMethod === "bnpl";
    const eligible = !needsBnpl || tx.credit_tier === "A" || tx.credit_tier === "B";
    if (!eligible) {
      const declined = await storage.updateTransaction(id, { payment_method: paymentMethod, gateway_status: "declined", status: "failed" });
      await storage.addAuditEntry(id, { actor, action: "payment.declined", data: { paymentMethod } });
      eventHub.send("order.updated", { id, status: declined?.status, gateway_status: declined?.gateway_status, live: true });
      return { transaction: declined, settlement: null, notifications: [] };
    }

    const updated = await storage.updateTransaction(id, {
      payment_method: paymentMethod,
      gateway_status: "settled",
      status: "reconciled",
      external_ref: `live_${id.slice(0, 8)}`,
      reconciled_at: new Date().toISOString(),
      settled_at: new Date().toISOString(),
    });

    const safeBank = BUSINESS_BANK_ACCOUNTS[settlementBank] ? settlementBank : "absa";
    const settlement = {
      bank: safeBank,
      bankLabel: BUSINESS_BANK_ACCOUNTS[safeBank].bankLabel,
      accountRef: BUSINESS_BANK_ACCOUNTS[safeBank].accountRef,
      settledAt: updated?.settled_at || new Date().toISOString(),
      amountCents: updated?.amount_cents || 0,
      currency: updated?.currency || "ZAR",
    };
    const notifications = notifyChannels.map((channel) => ({
      channel,
      destination: channel === "email" ? notifyEmail : "+27XXXXXXXXX",
      status: "sent",
      sentAt: new Date().toISOString(),
      message: `Payment successful. Funds settled into ${settlement.bankLabel} (${settlement.accountRef}).`,
    }));

    const detail = orderDetails.get(id) || { items: [], delivery: {}, live: true };
    orderDetails.set(id, { ...detail, settlement, notifications });

    await storage.addAuditEntry(id, { actor, action: "payment.settled", data: { paymentMethod } });
    await storage.addAuditEntry(id, {
      actor: "system",
      action: "payment.settled_to_business_account",
      data: settlement,
    });
    await storage.addAuditEntry(id, {
      actor: "system",
      action: "notifications.dispatch",
      data: { notifyEmail, notifyChannels, notifications },
    });
    await storage.addAuditEntry(id, { actor: "system", action: "qr.issued", data: { qr: true } });
    await startDeliveryProcess({ actor, id });
    eventHub.send("order.updated", {
      id,
      status: updated?.status,
      gateway_status: updated?.gateway_status,
      live: true,
      settlement,
      notifications,
    });
    return { transaction: updated, settlement, notifications };
  }

  async function startDeliveryProcess({ actor, id }) {
    const tx = await storage.getTransaction(id);
    if (!tx) return null;
    const existing = deliveryProcess.get(id);
    if (existing) return buildDeliveryProcessSnapshot(id, existing, Date.now());

    const state = {
      startedAtMs: Date.now(),
      stepDurationMs: 6000,
      startedBy: actor,
    };
    deliveryProcess.set(id, state);
    await storage.addAuditEntry(id, {
      actor,
      action: "delivery.process_started",
      data: { steps: DELIVERY_PROCESS_STEPS.map((step) => step.title), stepDurationMs: state.stepDurationMs },
    });
    eventHub.send("order.updated", { id, delivery_process: "started", live: true });
    return buildDeliveryProcessSnapshot(id, state, Date.now());
  }

  function buildDeliveryProcessSnapshot(id, state, nowMs) {
    const totalSteps = DELIVERY_PROCESS_STEPS.length;
    const elapsedMs = Math.max(0, nowMs - state.startedAtMs);
    const maxDurationMs = totalSteps * state.stepDurationMs;
    const done = elapsedMs >= maxDurationMs;
    const activeIdx = done ? null : Math.min(totalSteps - 1, Math.floor(elapsedMs / state.stepDurationMs));
    const progressPct = Math.max(0, Math.min(100, Math.round((elapsedMs / maxDurationMs) * 100)));

    const steps = DELIVERY_PROCESS_STEPS.map((step, idx) => {
      const stepStart = state.startedAtMs + idx * state.stepDurationMs;
      const stepEnd = stepStart + state.stepDurationMs;
      const completed = nowMs >= stepEnd;
      const active = !completed && nowMs >= stepStart;
      return {
        index: idx + 1,
        title: step.title,
        detail: step.detail,
        status: completed ? "completed" : active ? "active" : "pending",
        completedAt: completed ? new Date(stepEnd).toISOString() : null,
      };
    });

    return {
      orderId: id,
      status: done ? "completed" : "running",
      startedAt: new Date(state.startedAtMs).toISOString(),
      updatedAt: new Date(nowMs).toISOString(),
      progressPct,
      activeStep: activeIdx === null ? null : activeIdx + 1,
      steps,
    };
  }

  async function getDeliveryProcess(id) {
    const tx = await storage.getTransaction(id);
    if (!tx) return null;
    const existing = deliveryProcess.get(id);
    if (!existing) return null;
    return buildDeliveryProcessSnapshot(id, existing, Date.now());
  }

  async function listLiveOrders() {
    const txs = await storage.listTransactions();
    return txs.map((t) => ({
      ...t,
      live: true,
      details: orderDetails.get(t.id) || null,
      deliveryProcess: deliveryProcess.has(t.id) ? buildDeliveryProcessSnapshot(t.id, deliveryProcess.get(t.id), Date.now()) : null,
    }));
  }

  async function getOrder(id) {
    const tx = await storage.getTransaction(id);
    if (!tx) return null;
    const audit = await storage.listAuditEntries(id);
    const process = deliveryProcess.has(id) ? buildDeliveryProcessSnapshot(id, deliveryProcess.get(id), Date.now()) : null;
    return { transaction: tx, details: orderDetails.get(id) || null, audit, process };
  }

  return { createOrder, attachCreditVet, authorizePayment, listLiveOrders, getOrder, getDeliveryProcess };
}
