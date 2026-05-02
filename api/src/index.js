import express from "express";
import cors from "cors";
import { httpLogger } from "./logger.js";
import { appConfig } from "./config.js";
import { signToken, requireAuth, requireRole } from "./auth.js";
import { createSignedPayload, verifySignedPayload } from "./qr.js";
import { createStorage } from "./storage/index.js";
import { initiateSchema, creditVetSchema, paySchema } from "./validators.js";
import { demoProducts, getCategories } from "./pondoDemo/catalog.js";
import { demoSaIds, simulateCreditVet } from "./pondoDemo/credit.js";
import { createEventHub } from "./pondoDemo/events.js";
import { createOrderService } from "./pondoDemo/orders.js";
import { bootstrapPartnerSession, listPartnerNames, sendOtpCode, verifyOtpCode } from "./pondoDemo/partners.js";
import { paymentMethods, pickGatewayForPaymentMethod, paymentMethodRequiresCreditVet } from "./payment-config.js";
import { z } from "zod";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(httpLogger);

const storage = createStorage();
await storage.init();
const eventHub = createEventHub();
const orderService = createOrderService({ storage, eventHub, secret: appConfig.jwtSecret });
const authUsers = new Map(
  [
    { username: "customer@example.com", password: "demo", role: "customer" },
    { username: "thabo@email.com", password: "demo", role: "customer" },
    { username: "naledi@email.com", password: "demo", role: "customer" },
    { username: "sipho@email.com", password: "demo", role: "customer" },
    { username: "amara@email.com", password: "demo", role: "customer" },
    { username: "sponsor@example.com", password: "demo", role: "sponsor" },
  ].map((u) => [u.username, u]),
);

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function pickGateway({ paymentMethod, gateway }) {
  return pickGatewayForPaymentMethod(paymentMethod, gateway);
}

app.get("/healthz", (req, res) => res.json({ ok: true, name: "pondo-api", env: appConfig.nodeEnv }));

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

const fetchCartSchema = z.object({
  partner: z.enum(["amazon", "temu", "takealot", "woocommerce", "shopify"]),
  email: z.string().email(),
});

app.get("/api/pondo/partners", (req, res) => {
  return res.json({ items: listPartnerNames() });
});

const registerSchema = z.object({
  username: z.string().email(),
  password: z.string().min(4).max(128),
  fullName: z.string().min(2).max(120).optional(),
});

app.post("/api/pondo/register", (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
  const username = normalizeUsername(parsed.data.username);
  if (authUsers.has(username)) return res.status(409).json({ error: "user_exists" });

  authUsers.set(username, {
    username,
    password: parsed.data.password,
    role: "customer",
    fullName: parsed.data.fullName || "",
  });
  return res.status(201).json({ ok: true, username, role: "customer" });
});

app.post("/api/pondo/fetch-cart", (req, res) => {
  const parsed = fetchCartSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
  try {
    const session = bootstrapPartnerSession(parsed.data);
    return res.json({ session });
  } catch (e) {
    return res.status(400).json({ error: e instanceof Error ? e.message : "fetch_cart_failed" });
  }
});

const otpSendSchema = z.object({
  sessionId: z.string().min(4),
  channel: z.enum(["sms", "email"]),
  destination: z.string().min(4),
});

app.post("/api/pondo/send-otp", (req, res) => {
  const parsed = otpSendSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
  const sent = sendOtpCode(parsed.data);
  return res.json({
    requestId: sent.requestId,
    expiresAt: sent.expiresAt,
    demoOtp: sent.otpCode,
  });
});

const otpVerifySchema = z.object({
  requestId: z.string().min(6),
  code: z.string().min(4).max(6),
});

app.post("/api/pondo/verify-otp", (req, res) => {
  const parsed = otpVerifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
  const out = verifyOtpCode(parsed.data);
  if (!out.ok) return res.status(400).json({ error: out.reason });
  return res.json({ ok: true, sessionId: out.sessionId });
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
  paymentMethod: z.enum(paymentMethods),
});

const settlementBankSchema = z.enum(["absa", "fnb", "standard_bank"]);
const notifyChannelSchema = z.enum(["sms", "email"]);
const payOrderSchema = z.object({
  paymentMethod: z.enum(paymentMethods),
  settlementBank: settlementBankSchema.optional(),
  notifyEmail: z.string().email().optional(),
  notifyChannels: z.array(notifyChannelSchema).min(1).optional(),
});

const walletTopUpSchema = z.object({
  customerId: z.string().min(1),
  amountCents: z.number().int().positive(),
  paymentMethod: z.enum(paymentMethods),
  settlementBank: settlementBankSchema.optional(),
  notifyEmail: z.string().email().optional(),
});

app.post("/api/pondo/orders", requireAuth, requireRole(["customer", "sponsor"]), async (req, res) => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
  const gateway = pickGateway({ paymentMethod: parsed.data.paymentMethod });
  try {
    const order = await orderService.createOrder({
      actor: req.user.sub,
      customerId: parsed.data.customerId,
      items: parsed.data.items,
      delivery: parsed.data.delivery,
      paymentMethod: parsed.data.paymentMethod,
      gateway,
    });
    return res.json(order);
  } catch (e) {
    return res.status(400).json({ error: e instanceof Error ? e.message : "create_order_failed" });
  }
});


// New endpoint: Full backend flow for steps 3, 4, and 5
app.post("/api/pondo/orders/full-checkout", requireAuth, requireRole(["customer", "sponsor"]), async (req, res) => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });

  const gateway = pickGateway({ paymentMethod: parsed.data.paymentMethod });
  try {
    // Step 1: Create order
    const order = await orderService.createOrder({
      actor: req.user.sub,
      customerId: parsed.data.customerId,
      items: parsed.data.items,
      delivery: parsed.data.delivery,
      paymentMethod: parsed.data.paymentMethod,
      gateway,
    });

    // Step 3: Credit/KYC check (simulate)
    // For demo, always approve with mock data
    if (paymentMethodRequiresCreditVet(parsed.data.paymentMethod)) {
      const creditResult = { score: 750, tier: "A", approved: true };
      await orderService.attachCreditVet({
        actor: req.user.sub,
        id: order.transaction.id,
        bureau: "transunion",
        saId: "0000000000000",
        result: creditResult,
      });
    }

    // Step 4: Route confirmation (simulate)
    // For demo, nothing extra needed, but could log/trigger event here

    // Step 5: Authorize payment and trigger delivery
    const settled = await orderService.authorizePayment({
      actor: req.user.sub,
      id: order.transaction.id,
      paymentMethod: parsed.data.paymentMethod,
    });
    if (!settled) return res.status(404).json({ error: "not_found" });
    if (settled.transaction?.status === "failed") return res.status(402).json({ error: "payment_declined", transaction: settled.transaction });

    return res.json(settled);
  } catch (e) {
    return res.status(400).json({ error: e instanceof Error ? e.message : "full_checkout_failed" });
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

app.post("/api/pondo/orders/:id/pay", requireAuth, requireRole(["customer", "sponsor"]), async (req, res) => {
  const parsed = payOrderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
  const settled = await orderService.authorizePayment({
    actor: req.user.sub,
    id: req.params.id,
    paymentMethod: parsed.data.paymentMethod,
    settlementBank: parsed.data.settlementBank,
    notifyEmail: parsed.data.notifyEmail,
    notifyChannels: parsed.data.notifyChannels,
  });
  if (!settled) return res.status(404).json({ error: "not_found" });
  if (settled.transaction?.status === "failed") return res.status(402).json({ error: "payment_declined", transaction: settled.transaction });
  return res.json(settled);
});

app.post("/api/pondo/wallet/top-up", requireAuth, requireRole(["customer", "sponsor"]), async (req, res) => {
  const parsed = walletTopUpSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });

  try {
    const out = await orderService.topUpWallet({
      actor: req.user.sub,
      customerId: parsed.data.customerId,
      amountCents: parsed.data.amountCents,
      paymentMethod: parsed.data.paymentMethod,
      settlementBank: parsed.data.settlementBank,
      notifyEmail: parsed.data.notifyEmail,
    });
    return res.json(out);
  } catch (e) {
    return res.status(400).json({ error: e instanceof Error ? e.message : "wallet_topup_failed" });
  }
});

app.get("/api/pondo/wallet/:customerId", requireAuth, requireRole(["customer", "sponsor"]), async (req, res) => {
  return res.json({ customerId: req.params.customerId, balanceCents: orderService.getWalletBalance(req.params.customerId) });
});

app.get("/api/pondo/orders/:id", requireAuth, requireRole(["customer", "sponsor"]), async (req, res) => {
  const out = await orderService.getOrder(req.params.id);
  if (!out) return res.status(404).json({ error: "not_found" });
  return res.json(out);
});

app.get("/api/pondo/orders/:id/process", requireAuth, requireRole(["customer", "sponsor"]), async (req, res) => {
  const out = await orderService.getDeliveryProcess(req.params.id);
  if (!out) return res.status(404).json({ error: "process_not_started" });
  return res.json(out);
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
  const normalized = normalizeUsername(username);
  const account = authUsers.get(normalized);
  if (!account || account.password !== String(password)) return res.status(401).json({ error: "invalid_credentials" });

  const requestedRole = role === "sponsor" ? "sponsor" : "customer";
  if (requestedRole === "sponsor" && account.role !== "sponsor") {
    return res.status(403).json({ error: "forbidden_role" });
  }

  const tokenRole = requestedRole === "sponsor" ? "sponsor" : "customer";
  const token = signToken({ sub: normalized, role: tokenRole });
  return res.json({ token, role: tokenRole });
});

app.post("/api/checkout/initiate", requireAuth, requireRole(["customer", "sponsor"]), async (req, res) => {
  const parsed = initiateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });

  const { customerId, amountCents, currency, paymentMethod } = parsed.data;
  const gateway = pickGateway({ paymentMethod, gateway: req.body.gateway });
  const transactionId = storage.newId();
  const qrPayload = createSignedPayload({ transactionId, amountCents, currency, customerId }, appConfig.jwtSecret);

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
    verified = verifySignedPayload(payload, appConfig.jwtSecret);
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

app.listen(appConfig.port, () => {
  // eslint-disable-next-line no-console
  console.log(`pondo-api listening on http://localhost:${appConfig.port}`);
});
