import express from "express";
import cors from "cors";
import { httpLogger } from "./logger.js";
import { config } from "./config.js";
import { signToken, requireAuth, requireRole } from "./auth.js";
import { createSignedPayload, verifySignedPayload } from "./qr.js";
import { createStorage } from "./storage/index.js";
import { initiateSchema, creditVetSchema, paySchema } from "./validators.js";
import { demoProducts, getCategories } from "./pondoDemo/catalog.js";
import { demoSaIds, simulateCreditVet } from "./pondoDemo/credit.js";
import { createEventHub } from "./pondoDemo/events.js";
import { createOrderService } from "./pondoDemo/orders.js";
import { z } from "zod";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(httpLogger);

const storage = createStorage();
await storage.init();
const eventHub = createEventHub();
const orderService = createOrderService({ storage, eventHub, secret: config.jwtSecret });

function pickGateway({ paymentMethod, gateway }) {
  if (gateway) return gateway;
  if (paymentMethod === "bnpl") return "payflex";
  if (paymentMethod === "speedpoint" || paymentMethod === "pos") return "speedpoint";
  return "peach";
}

app.get("/healthz", (req, res) => res.json({ ok: true, name: "pondo-api", env: config.nodeEnv }));

// --- PONDO Demo eCommerce API (used by /PondoDemo in the web app) ---
app.get("/api/pondo/catalog/products", (req, res) => {
  const q = (req.query.q ? String(req.query.q) : "").toLowerCase();
  const category = req.query.category ? String(req.query.category) : "";
  let items = demoProducts;
  if (category) items = items.filter((p) => p.category === category);
  if (q) items = items.filter((p) => `${p.brand} ${p.name}`.toLowerCase().includes(q));
  return res.json({ items, categories: getCategories() });
});

app.get("/api/pondo/credit/demo-ids", (req, res) => {
  return res.json({ items: demoSaIds });
});

const bnplVetSchema = z.object({
  saId: z.string().min(13).max(13),
  bureau: z.enum(["transunion", "experian"]),
});

app.post("/api/pondo/credit/simulate", (req, res) => {
  const parsed = bnplVetSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
  const result = simulateCreditVet({ saId: parsed.data.saId, bureau: parsed.data.bureau });
  return res.json({ result });
});

const createOrderSchema = z.object({
  customerId: z.string().min(1),
  items: z.array(z.object({ productId: z.string().min(1), qty: z.number().int().positive() })).min(1),
  delivery: z.object({
    fullName: z.string().min(1),
    phone: z.string().min(5),
    address1: z.string().min(1),
    city: z.string().min(1),
    province: z.string().min(1),
    postalCode: z.string().min(3),
  }),
  paymentMethod: z.enum(["card", "eft", "bnpl"]),
});

app.post("/api/pondo/orders", requireAuth, requireRole(["customer", "sponsor"]), async (req, res) => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });

  const gateway = parsed.data.paymentMethod === "bnpl" ? "payflex" : parsed.data.paymentMethod === "eft" ? "ozow" : "peach";
  try {
    const out = await orderService.createOrder({
      actor: req.user.sub,
      customerId: parsed.data.customerId,
      items: parsed.data.items,
      delivery: parsed.data.delivery,
      paymentMethod: parsed.data.paymentMethod,
      gateway,
    });
    return res.json(out);
  } catch (e) {
    return res.status(400).json({ error: e instanceof Error ? e.message : "create_failed" });
  }
});

app.post("/api/pondo/orders/:id/bnpl-vet", requireAuth, requireRole(["customer", "sponsor"]), async (req, res) => {
  const parsed = bnplVetSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });

  const result = simulateCreditVet({ saId: parsed.data.saId, bureau: parsed.data.bureau });
  const updated = await orderService.attachCreditVet({
    actor: req.user.sub,
    id: req.params.id,
    bureau: parsed.data.bureau,
    saId: parsed.data.saId,
    result,
  });
  if (!updated) return res.status(404).json({ error: "not_found" });
  return res.json({ result, transaction: updated });
});

const payOrderSchema = z.object({ paymentMethod: z.enum(["card", "eft", "bnpl"]) });
app.post("/api/pondo/orders/:id/pay", requireAuth, requireRole(["customer", "sponsor"]), async (req, res) => {
  const parsed = payOrderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
  const updated = await orderService.authorizePayment({ actor: req.user.sub, id: req.params.id, paymentMethod: parsed.data.paymentMethod });
  if (!updated) return res.status(404).json({ error: "not_found" });
  if (updated.status === "failed") return res.status(402).json({ error: "payment_declined", transaction: updated });
  return res.json({ transaction: updated });
});

app.get("/api/pondo/orders/:id", requireAuth, requireRole(["customer", "sponsor"]), async (req, res) => {
  const out = await orderService.getOrder(req.params.id);
  if (!out) return res.status(404).json({ error: "not_found" });
  return res.json(out);
});

const reportSchema = z.object({
  sendTo: z.string().min(3).optional(),
});

app.post("/api/pondo/orders/:id/report", requireAuth, requireRole(["customer", "sponsor"]), async (req, res) => {
  const parsed = reportSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });

  const out = await orderService.getOrder(req.params.id);
  if (!out) return res.status(404).json({ error: "not_found" });

  const tx = out.transaction;
  const reportId = `RPT-${tx.id.slice(0, 8).toUpperCase()}`;
  const sendTo = parsed.data.sendTo || tx.customer_id;
  const report = {
    reportId,
    orderId: tx.id,
    generatedAt: new Date().toISOString(),
    sentTo,
    customerId: tx.customer_id,
    amountCents: tx.amount_cents,
    status: tx.status,
    gateway: tx.gateway,
    gatewayStatus: tx.gateway_status,
    creditTier: tx.credit_tier,
    details: out.details || null,
    auditCount: out.audit.length,
    journey: {
      initiated: out.audit.some((a) => a.action === "order.created"),
      creditChecked: out.audit.some((a) => a.action === "bnpl.credit_vet"),
      settled: out.audit.some((a) => a.action === "payment.settled"),
      completed: tx.status === "reconciled",
    },
  };

  await storage.addAuditEntry(tx.id, {
    actor: req.user.sub,
    action: "report.sent",
    data: { reportId, sentTo },
  });

  return res.json({ sent: true, report });
});

app.get("/api/pondo/sponsor/orders", requireAuth, requireRole("sponsor"), async (req, res) => {
  const items = await orderService.listLiveOrders();
  return res.json({ items });
});

app.get("/api/pondo/sponsor/summary", requireAuth, requireRole("sponsor"), async (req, res) => {
  const items = await orderService.listLiveOrders();
  const live = items.length;
  const completed = items.filter((t) => t.status === "reconciled").length;
  const failed = items.filter((t) => t.status === "failed").length;
  const processing = items.filter((t) => t.status === "processing" || t.status === "initiated").length;
  const grossCents = items.filter((t) => t.status === "reconciled").reduce((sum, t) => sum + (t.amount_cents || 0), 0);
  return res.json({ live, completed, failed, processing, grossCents });
});

app.get("/api/pondo/sponsor/stream", requireAuth, requireRole("sponsor"), (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write("event: ready\ndata: {}\n\n");
  eventHub.addClient(res);
});

app.post("/auth/login", (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "missing_credentials" });
  const safeRole = role === "sponsor" ? "sponsor" : "customer";
  const token = signToken({ sub: String(username), role: safeRole });
  return res.json({ token, role: safeRole });
});

app.post("/api/checkout/initiate", requireAuth, requireRole(["customer", "sponsor"]), async (req, res) => {
  const parsed = initiateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });

  const { customerId, amountCents, currency, paymentMethod } = parsed.data;
  const gateway = pickGateway({ paymentMethod, gateway: req.body.gateway });
  const transactionId = storage.newId();
  const qrPayload = createSignedPayload({ transactionId, amountCents, currency, customerId }, config.jwtSecret);

  const tx = await storage.createTransaction({
    id: transactionId,
    customer_id: customerId,
    amount_cents: amountCents,
    currency,
    payment_method: paymentMethod,
    gateway,
    gateway_status: "initiated",
    credit_tier: null,
    qr_payload: qrPayload,
    status: "initiated",
  });

  await storage.addAuditEntry(transactionId, {
    actor: req.user.sub,
    action: "checkout.initiated",
    data: { paymentMethod, gateway, amountCents, currency },
  });

  return res.json({
    transaction: tx,
    qrPayload,
    barcodePayload: transactionId,
  });
});

app.post("/api/checkout/:id/scan", requireAuth, requireRole(["customer", "sponsor"]), async (req, res) => {
  const tx = await storage.getTransaction(req.params.id);
  if (!tx) return res.status(404).json({ error: "not_found" });

  const { payload } = req.body || {};
  if (!payload) return res.status(400).json({ error: "missing_payload" });

  let verified;
  try {
    verified = verifySignedPayload(payload, config.jwtSecret);
  } catch {
    return res.status(400).json({ error: "invalid_payload" });
  }
  if (!verified.ok) return res.status(400).json({ error: "invalid_signature" });

  const updated = await storage.updateTransaction(tx.id, { qr_scanned_at: new Date().toISOString() });
  await storage.addAuditEntry(tx.id, { actor: req.user.sub, action: "qr.scanned", data: { ok: true } });

  return res.json({ transaction: updated });
});

app.post("/api/checkout/:id/credit-vet", requireAuth, requireRole(["customer", "sponsor"]), async (req, res) => {
  const tx = await storage.getTransaction(req.params.id);
  if (!tx) return res.status(404).json({ error: "not_found" });

  const parsed = creditVetSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });

  const { consent, bureau } = parsed.data;
  if (!consent) {
    await storage.addAuditEntry(tx.id, {
      actor: req.user.sub,
      action: "credit.declined_consent",
      data: { bureau },
    });
    return res.status(400).json({ error: "consent_required" });
  }

  // Demo scoring: deterministic-ish by transaction id.
  const scoreSeed = tx.id.replaceAll("-", "").slice(0, 6);
  const score = parseInt(scoreSeed, 16) % 1000;
  const tier = score >= 650 ? "A" : score >= 550 ? "B" : "C";
  const eligible = tier !== "C";

  const updated = await storage.updateTransaction(tx.id, {
    credit_tier: tier,
    gateway_status: "credit_checked",
  });

  await storage.addAuditEntry(tx.id, {
    actor: req.user.sub,
    action: "credit.checked",
    data: { bureau, score, tier, eligible },
  });

  return res.json({ eligible, tier, score, transaction: updated });
});

app.post("/api/checkout/:id/pay", requireAuth, requireRole(["customer", "sponsor"]), async (req, res) => {
  const tx = await storage.getTransaction(req.params.id);
  if (!tx) return res.status(404).json({ error: "not_found" });

  const parsed = paySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });

  const method = parsed.data.method;
  const gateway = pickGateway({ paymentMethod: method, gateway: tx.gateway });
  const needsEligibility = method === "bnpl";
  const eligible = !needsEligibility || tx.credit_tier === "A" || tx.credit_tier === "B";

  if (!eligible) {
    const updatedDeclined = await storage.updateTransaction(tx.id, {
      payment_method: method,
      gateway,
      gateway_status: "declined",
      status: "failed",
    });
    await storage.addAuditEntry(tx.id, { actor: req.user.sub, action: "payment.declined", data: { method, gateway } });
    return res.status(402).json({ error: "payment_declined", transaction: updatedDeclined });
  }

  const updated = await storage.updateTransaction(tx.id, {
    payment_method: method,
    gateway,
    gateway_status: "authorized",
    status: "processing",
    external_ref: `gw_${tx.id.slice(0, 8)}`,
  });

  await storage.addAuditEntry(tx.id, { actor: req.user.sub, action: "payment.authorized", data: { method, gateway } });
  return res.json({ transaction: updated });
});

app.post("/api/reconcile/run", requireAuth, requireRole("sponsor"), async (req, res) => {
  const list = await storage.listTransactions();
  let reconciled = 0;
  const now = new Date().toISOString();

  for (const tx of list) {
    if (tx.status !== "processing") continue;
    const updated = await storage.updateTransaction(tx.id, {
      reconciled_at: now,
      settled_at: now,
      status: "reconciled",
      gateway_status: "settled",
    });
    if (updated) {
      reconciled += 1;
      await storage.addAuditEntry(tx.id, { actor: req.user.sub, action: "reconcile.settled", data: {} });
    }
  }

  return res.json({ reconciled });
});

app.get("/api/sponsor/transactions", requireAuth, requireRole("sponsor"), async (req, res) => {
  const status = req.query.status ? String(req.query.status) : undefined;
  const items = await storage.listTransactions({ status });
  return res.json({ items });
});

app.get("/api/sponsor/transactions/:id", requireAuth, requireRole("sponsor"), async (req, res) => {
  const tx = await storage.getTransaction(req.params.id);
  if (!tx) return res.status(404).json({ error: "not_found" });
  const audit = await storage.listAuditEntries(tx.id);
  return res.json({ transaction: tx, audit });
});

app.use((err, req, res, next) => {
  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).json({ error: "internal_error" });
});

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`pondo-api listening on http://localhost:${config.port}`);
});
