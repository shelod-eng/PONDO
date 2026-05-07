import crypto from "crypto";
import jwt from "jsonwebtoken";
import { getPool } from "./db";
import { assessGeoRisk, deriveDeliveryLocation, lookupIpGeo, type ClientGeo, type ValidatedAddress } from "./risk";

type PartnerName = "amazon" | "temu" | "takealot" | "woocommerce" | "shopify";
type PaymentMethod =
  | "card"
  | "card_3ds"
  | "debit_card"
  | "eft"
  | "payfast"
  | "bnpl"
  | "speedpoint"
  | "ussd"
  | "evoucher_wallet";
type SettlementBank = "absa" | "fnb" | "standard_bank";

type PartnerSeed = {
  fullName: string;
  idNumber: string;
  phone: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  geoLocation: string;
  monthlyIncome: number;
  affordabilityBand: string;
  riskProfileCode: "high_risk_male" | "low_risk_female" | "elderly" | "standard";
  verificationRoute: "full_kyc" | "otp_only" | "otp_plus_risk";
};

type CustomerRecord = {
  id: string;
  email: string;
  fullName: string;
  idNumber: string;
  phone: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  geoLocation: string;
  monthlyIncome: number;
  affordabilityBand: string;
  riskProfileCode: string;
};

type ProductRecord = {
  id: string;
  sku: string;
  brand: string;
  name: string;
  category: string | null;
  priceCents: number;
  discountPct: number;
  stock: number;
  merchantName: string;
};

type CheckoutSessionRecord = {
  id: string;
  session_code: string;
  customer_id: string;
  partner_id: string | null;
  current_step: string;
  status: string;
  verification_route: string;
  customer_snapshot: Record<string, unknown>;
};

type ConfirmCheckoutDetailsInput = {
  sessionId: string;
  email: string;
  fullName: string;
  idNumber: string;
  phone: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  geoLocation?: string;
  latitude?: number | null;
  longitude?: number | null;
  termsAccepted: boolean;
};

type RecordRiskAssessmentInput = {
  actor: string;
  sessionId: string;
  saId: string;
  bureau: "transunion" | "experian";
  screeningMode: "full" | "skip";
  transunionScore: number | null;
  transunionApproved: boolean;
  kycIdentityVerified: boolean;
  experianIncome: number;
  fraudScore: number;
  approved: boolean;
  projectedScore?: number;
  projectedDecision?: "auto_approve" | "elevated_verification" | "manual_review_hold";
  projectedFactors?: string[];
  city?: string;
  province?: string;
  postalCode?: string;
};

const CORE_SCHEMA = "pondo_core";

const partnerLabels: Record<PartnerName, string> = {
  amazon: "Amazon SA",
  temu: "Temu",
  takealot: "Takealot",
  woocommerce: "WooCommerce",
  shopify: "Shopify",
};

const partnerSeeds: Record<string, PartnerSeed> = {
  "thabo@email.com": {
    fullName: "Thabo Nkosi",
    idNumber: "8501015800088",
    phone: "+27 72 345 6789",
    address: "14 Main Rd, Soweto, Gauteng",
    city: "Johannesburg",
    province: "Gauteng",
    postalCode: "1804",
    geoLocation: "-26.2041, 28.0473",
    monthlyIncome: 28000,
    affordabilityBand: "A",
    riskProfileCode: "high_risk_male",
    verificationRoute: "full_kyc",
  },
  "naledi@email.com": {
    fullName: "Naledi Dlamini",
    idNumber: "9203124200180",
    phone: "+27 73 555 0090",
    address: "22 Vilakazi St, Orlando West, Gauteng",
    city: "Johannesburg",
    province: "Gauteng",
    postalCode: "1804",
    geoLocation: "-26.2347, 27.9084",
    monthlyIncome: 25000,
    affordabilityBand: "B",
    riskProfileCode: "low_risk_female",
    verificationRoute: "otp_only",
  },
  "sipho@email.com": {
    fullName: "Sipho Molefe",
    idNumber: "8812036100097",
    phone: "+27 82 111 2040",
    address: "3 Market St, Durban Central, KZN",
    city: "Durban",
    province: "KwaZulu-Natal",
    postalCode: "4001",
    geoLocation: "-29.8587, 31.0218",
    monthlyIncome: 19000,
    affordabilityBand: "B",
    riskProfileCode: "high_risk_male",
    verificationRoute: "full_kyc",
  },
  "mandla@email.com": {
    fullName: "Mandla Khumalo",
    idNumber: "9002145809084",
    phone: "+27 83 456 7721",
    address: "44 Luthuli Ave, Umlazi, KZN",
    city: "Durban",
    province: "KwaZulu-Natal",
    postalCode: "4031",
    geoLocation: "-29.9708, 30.9245",
    monthlyIncome: 22000,
    affordabilityBand: "B",
    riskProfileCode: "high_risk_male",
    verificationRoute: "full_kyc",
  },
  "amara@email.com": {
    fullName: "Amara Naidoo",
    idNumber: "8001015009087",
    phone: "+27 79 888 4400",
    address: "81 Sandton Dr, Sandton, Gauteng",
    city: "Johannesburg",
    province: "Gauteng",
    postalCode: "2090",
    geoLocation: "-26.1076, 28.0567",
    monthlyIncome: 36000,
    affordabilityBand: "A+",
    riskProfileCode: "low_risk_female",
    verificationRoute: "otp_only",
  },
  "gogo@email.com": {
    fullName: "Gogo Mokoena",
    idNumber: "5506240800087",
    phone: "+27 78 222 3344",
    address: "17 Church St, Polokwane, Limpopo",
    city: "Polokwane",
    province: "Limpopo",
    postalCode: "0700",
    geoLocation: "-23.9045, 29.4689",
    monthlyIncome: 12000,
    affordabilityBand: "A",
    riskProfileCode: "elderly",
    verificationRoute: "otp_only",
  },
};

const bankAccounts: Record<SettlementBank, { bankLabel: string; accountRef: string }> = {
  absa: { bankLabel: "ABSA Business Account", accountRef: "ABSA-***-1042" },
  fnb: { bankLabel: "FNB Business Account", accountRef: "FNB-***-7721" },
  standard_bank: { bankLabel: "Standard Bank Business Account", accountRef: "STD-***-5560" },
};

const paymentMethodMeta: Record<PaymentMethod, { gateway: string; requiresCreditVet: boolean; label: string }> = {
  card: { gateway: "peach", requiresCreditVet: false, label: "Bank Card" },
  card_3ds: { gateway: "peach", requiresCreditVet: false, label: "3DS Card" },
  debit_card: { gateway: "peach", requiresCreditVet: false, label: "Debit Card" },
  eft: { gateway: "ozow", requiresCreditVet: false, label: "EFT" },
  payfast: { gateway: "payfast", requiresCreditVet: false, label: "PayFast" },
  bnpl: { gateway: "payflex", requiresCreditVet: true, label: "Buy Now Pay Later" },
  speedpoint: { gateway: "speedpoint", requiresCreditVet: false, label: "Speedpoint" },
  ussd: { gateway: "ussd", requiresCreditVet: false, label: "USSD" },
  evoucher_wallet: { gateway: "wallet", requiresCreditVet: false, label: "eVoucher Wallet" },
};

const deliverySteps = [
  { code: "dispatch_initiation", title: "Dispatch Initiation", detail: "Email, WhatsApp, and SMS dispatches confirm that the order is in route." },
  { code: "active_tracking", title: "Active Tracking", detail: "System confirms live dispatch and starts real-time package tracking." },
  { code: "driver_assignment", title: "Driver Assignment", detail: "PONDO verifies and confirms the specific delivery person to the buyer." },
  { code: "onsite_verification", title: "On-Site Verification", detail: "Identity is verified at the door with physical identification checks." },
  { code: "conclusion", title: "Conclusion", detail: "Final payment confirmation automatically triggers invoice initiation." },
] as const;

function table(name: string) {
  return `${CORE_SCHEMA}.${name}`;
}

function safeEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

function hashText(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function secret() {
  return process.env.JWT_SECRET || "dev-secret-change-me";
}

function signedQrPayload(data: Record<string, unknown>) {
  return jwt.sign(data, secret(), { expiresIn: "7d" });
}

function defaultSeed(email: string): PartnerSeed {
  const key = safeEmail(email);
  return (
    partnerSeeds[key] || {
      fullName: "Demo Customer",
      idNumber: "8001015009087",
      phone: "+27 71 000 0000",
      address: "12 Main Rd, Johannesburg, Gauteng",
      city: "Johannesburg",
      province: "Gauteng",
      postalCode: "2000",
      geoLocation: "-26.2041, 28.0473",
      monthlyIncome: 18000,
      affordabilityBand: "B",
      riskProfileCode: "standard",
      verificationRoute: "otp_plus_risk",
    }
  );
}

function nowIso() {
  return new Date().toISOString();
}

function randomCode(prefix: string, size = 5) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 2 + size)}`;
}

function demoStockForCategory(category: string | null) {
  return category === "Fashion" ? 25 : 12;
}

function maskDestination(channel: "sms" | "email", destination: string) {
  if (channel === "email") {
    const [user, domain] = destination.split("@");
    if (!user || !domain) return "hidden@email";
    return `${user.slice(0, 2)}***@${domain}`;
  }
  return `${destination.slice(0, 3)}******${destination.slice(-2)}`;
}

async function queryOne<T = Record<string, unknown>>(sql: string, values: unknown[] = []) {
  const pool = getPool();
  const result = (await pool.query(sql, values)) as { rows: T[] };
  return result.rows[0] || null;
}

async function ensureRiskProfileId(code: string) {
  const row = await queryOne<{ id: string }>(`select id from ${table("risk_profiles")} where code = $1 limit 1`, [code]);
  return row?.id || null;
}

async function getPrimaryEmail(customerId: string) {
  const row = await queryOne<{ contact_value: string }>(
    `select contact_value
     from ${table("customer_contact_methods")}
     where customer_id = $1 and contact_type = 'email'
     order by is_primary desc, created_at asc
     limit 1`,
    [customerId],
  );
  return row?.contact_value || "customer@example.com";
}

async function getPrimaryPhone(customerId: string) {
  const row = await queryOne<{ contact_value: string }>(
    `select contact_value
     from ${table("customer_contact_methods")}
     where customer_id = $1 and contact_type = 'phone'
     order by is_primary desc, created_at asc
     limit 1`,
    [customerId],
  );
  return row?.contact_value || "+27XXXXXXXXX";
}

async function upsertCustomerContact(customerId: string, type: "email" | "phone", value: string, verified = false) {
  const normalizedValue = type === "email" ? safeEmail(value) : String(value || "").trim();
  if (!normalizedValue) return;
  const hash = hashText(normalizedValue);
  const existing = await queryOne<{ id: string; is_primary: boolean }>(
    `select id, is_primary
     from ${table("customer_contact_methods")}
     where customer_id = $1 and contact_type = $2 and contact_value_hash = $3
     limit 1`,
    [customerId, type, hash],
  );

  if (existing) {
    await getPool().query(
      `update ${table("customer_contact_methods")}
       set contact_value = $2,
           is_primary = true,
           is_verified = $3,
           verified_at = case when $3 then coalesce(verified_at, now()) else verified_at end,
           updated_at = now()
       where id = $1`,
      [existing.id, normalizedValue, verified],
    );
    await getPool().query(
      `update ${table("customer_contact_methods")}
       set is_primary = false, updated_at = now()
       where customer_id = $1 and contact_type = $2 and id <> $3 and is_primary = true`,
      [customerId, type, existing.id],
    );
    return;
  }

  await getPool().query(
    `update ${table("customer_contact_methods")}
     set is_primary = false, updated_at = now()
     where customer_id = $1 and contact_type = $2 and is_primary = true`,
    [customerId, type],
  );

  await getPool().query(
    `insert into ${table("customer_contact_methods")}
      (customer_id, contact_type, contact_value, contact_value_hash, is_primary, is_verified, verified_at)
     values ($1,$2,$3,$4,true,$5,case when $5 then now() else null end)`,
    [customerId, type, normalizedValue, hash, verified],
  );
}

async function upsertDefaultAddress(
  customerId: string,
  input: { address1: string; city: string; province: string; postalCode: string; latitude?: number | null; longitude?: number | null },
) {
  const existing = await queryOne<{ id: string }>(
    `select id from ${table("customer_addresses")} where customer_id = $1 and is_default = true limit 1`,
    [customerId],
  );

  if (existing) {
    await getPool().query(
      `update ${table("customer_addresses")}
       set address_line_1 = $2,
           city = $3,
           province = $4,
           postal_code = $5,
           latitude = $6,
           longitude = $7,
           validation_status = 'validated',
           updated_at = now()
       where id = $1`,
      [existing.id, input.address1, input.city, input.province, input.postalCode, input.latitude ?? null, input.longitude ?? null],
    );
    return existing.id;
  }

  const inserted = await queryOne<{ id: string }>(
    `insert into ${table("customer_addresses")}
      (customer_id, label, address_line_1, city, province, postal_code, latitude, longitude, validation_status, is_default)
     values ($1,'Primary',$2,$3,$4,$5,$6,$7,'validated',true)
     returning id`,
    [customerId, input.address1, input.city, input.province, input.postalCode, input.latitude ?? null, input.longitude ?? null],
  );
  return inserted?.id || null;
}

async function getCustomerByEmail(email: string): Promise<CustomerRecord | null> {
  const row = await queryOne<{
    customer_id: string;
    full_name: string | null;
    id_number_hash: string | null;
    risk_profile_code: string | null;
    address_line_1: string | null;
    city: string | null;
    province: string | null;
    postal_code: string | null;
  }>(
    `select cp.id as customer_id,
            cp.full_name,
            cp.id_number_hash,
            rp.code as risk_profile_code,
            ca.address_line_1,
            ca.city,
            ca.province,
            ca.postal_code
     from ${table("customer_profiles")} cp
     join ${table("customer_contact_methods")} cm
       on cm.customer_id = cp.id
      and cm.contact_type = 'email'
      and cm.contact_value_hash = $1
     left join ${table("risk_profiles")} rp on rp.id = cp.risk_profile_id
     left join ${table("customer_addresses")} ca on ca.customer_id = cp.id and ca.is_default = true
     order by cm.is_primary desc, cm.created_at asc
     limit 1`,
    [hashText(safeEmail(email))],
  );

  if (!row) return null;
  const seeded = defaultSeed(email);
  return {
    id: row.customer_id,
    email: safeEmail(email),
    fullName: row.full_name || seeded.fullName,
    idNumber: seeded.idNumber,
    phone: (await getPrimaryPhone(row.customer_id)) || seeded.phone,
    address: row.address_line_1 || seeded.address,
    city: row.city || seeded.city,
    province: row.province || seeded.province,
    postalCode: row.postal_code || seeded.postalCode,
    geoLocation: seeded.geoLocation,
    monthlyIncome: seeded.monthlyIncome,
    affordabilityBand: seeded.affordabilityBand,
    riskProfileCode: row.risk_profile_code || seeded.riskProfileCode,
  };
}

async function ensureCustomerByEmail(email: string, override?: Partial<CustomerRecord>) {
  const normalizedEmail = safeEmail(email);
  const seeded = defaultSeed(normalizedEmail);
  const profile = {
    email: normalizedEmail,
    fullName: override?.fullName || seeded.fullName,
    idNumber: override?.idNumber || seeded.idNumber,
    phone: override?.phone || seeded.phone,
    address: override?.address || seeded.address,
    city: override?.city || seeded.city,
    province: override?.province || seeded.province,
    postalCode: override?.postalCode || seeded.postalCode,
    geoLocation: override?.geoLocation || seeded.geoLocation,
    monthlyIncome: override?.monthlyIncome || seeded.monthlyIncome,
    affordabilityBand: override?.affordabilityBand || seeded.affordabilityBand,
    riskProfileCode: override?.riskProfileCode || seeded.riskProfileCode,
  };

  const existing = await getCustomerByEmail(normalizedEmail);
  const riskProfileId = await ensureRiskProfileId(profile.riskProfileCode);

  if (existing) {
    await getPool().query(
      `update ${table("customer_profiles")}
       set full_name = $2,
           id_number_hash = $3,
           risk_profile_id = $4,
           updated_at = now()
       where id = $1`,
      [existing.id, profile.fullName, hashText(profile.idNumber), riskProfileId],
    );
    await upsertCustomerContact(existing.id, "email", normalizedEmail, true);
    await upsertCustomerContact(existing.id, "phone", profile.phone, false);
    await upsertDefaultAddress(existing.id, {
      address1: profile.address,
      city: profile.city,
      province: profile.province,
      postalCode: profile.postalCode,
    });
    return { ...existing, ...profile };
  }

  const inserted = await queryOne<{ id: string }>(
    `insert into ${table("customer_profiles")}
      (full_name, id_number_hash, risk_profile_id, current_status)
     values ($1,$2,$3,'active')
     returning id`,
    [profile.fullName, hashText(profile.idNumber), riskProfileId],
  );
  if (!inserted) throw new Error("customer_create_failed");
  await upsertCustomerContact(inserted.id, "email", normalizedEmail, true);
  await upsertCustomerContact(inserted.id, "phone", profile.phone, false);
  await upsertDefaultAddress(inserted.id, {
    address1: profile.address,
    city: profile.city,
    province: profile.province,
    postalCode: profile.postalCode,
  });
  return { id: inserted.id, ...profile };
}

async function getProductBySku(sku: string): Promise<ProductRecord | null> {
  const row = await queryOne<{
    id: string;
    sku: string;
    brand: string;
    name: string;
    category: string | null;
    price_cents: number;
    discount_pct: string | number | null;
    merchant_name: string | null;
  }>(
    `select p.id,
            p.sku,
            p.brand,
            p.name,
            pc.name as category,
            pp.amount_cents as price_cents,
            pp.discount_pct,
            p.merchant_name
     from ${table("products")} p
     left join ${table("product_categories")} pc on pc.id = p.category_id
     join lateral (
       select amount_cents, discount_pct
       from ${table("product_prices")}
       where product_id = p.id and effective_to is null
       order by effective_from desc
       limit 1
     ) pp on true
     where p.sku = $1 and p.is_active = true
     limit 1`,
    [sku],
  );
  if (!row) return null;
  return {
    id: row.id,
    sku: row.sku,
    brand: row.brand,
    name: row.name,
    category: row.category,
    priceCents: Number(row.price_cents),
    discountPct: Number(row.discount_pct || 0),
    stock: demoStockForCategory(row.category),
    merchantName: row.merchant_name || "TechHub SA",
  };
}

function discountedPrice(product: ProductRecord) {
  return Math.round(product.priceCents * (1 - product.discountPct / 100));
}

async function createAuditEvent(input: {
  category: string;
  actorType: "customer" | "system" | "admin" | "sponsor" | "fraud_analyst" | "partner" | "gateway";
  actorId?: string | null;
  customerId?: string | null;
  checkoutSessionId?: string | null;
  orderId?: string | null;
  paymentTransactionId?: string | null;
  resourceType: string;
  resourceId: string;
  action: string;
  metadata?: Record<string, unknown>;
}) {
  await getPool().query(
    `insert into ${table("audit_events")}
      (event_category, actor_type, actor_id, customer_id, checkout_session_id, order_id, payment_transaction_id, resource_type, resource_id, action, metadata)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      input.category,
      input.actorType,
      input.actorId || null,
      input.customerId || null,
      input.checkoutSessionId || null,
      input.orderId || null,
      input.paymentTransactionId || null,
      input.resourceType,
      input.resourceId,
      input.action,
      JSON.stringify(input.metadata || {}),
    ],
  );
}

async function createCheckoutSessionEvent(checkoutSessionId: string, eventType: string, actorId: string | null, payload: Record<string, unknown>) {
  await getPool().query(
    `insert into ${table("checkout_session_events")}
      (checkout_session_id, event_type, actor_type, actor_id, payload)
     values ($1,$2,'system',$3,$4)`,
    [checkoutSessionId, eventType, actorId, JSON.stringify(payload)],
  );
}

async function getCheckoutSessionByCode(sessionCode: string): Promise<CheckoutSessionRecord | null> {
  return await queryOne<CheckoutSessionRecord>(
    `select id, session_code, customer_id, partner_id, current_step, status, verification_route, customer_snapshot
     from ${table("checkout_sessions")}
     where session_code = $1
     limit 1`,
    [sessionCode],
  );
}

async function getPaymentMethodRow(code: PaymentMethod) {
  const row = await queryOne<{ id: string; gateway_code: string; requires_credit_vet: boolean }>(
    `select id, gateway_code, requires_credit_vet
     from ${table("payment_methods")}
     where code = $1
     limit 1`,
    [code],
  );
  if (!row) throw new Error("payment_method_not_configured");
  return row;
}

async function getLatestRiskAssessment(sessionId: string) {
  return await queryOne<{ id: string; decision: string; verification_status: string; score: number }>(
    `select id, decision, verification_status, score
     from ${table("risk_assessments")}
     where checkout_session_id = $1
     order by assessed_at desc
     limit 1`,
    [sessionId],
  );
}

async function getPaymentTransactionById(id: string) {
  return await queryOne<{
    id: string;
    order_id: string;
    checkout_session_id: string | null;
    customer_id: string;
    external_ref: string | null;
    amount_cents: number;
    currency: string;
    status: string;
    gateway_code: string;
    gateway_status: string;
    reconciled_at: string | null;
    settled_at: string | null;
    created_at: string;
    updated_at: string;
    payment_method_code: PaymentMethod;
  }>(
    `select pt.id,
            pt.order_id,
            pt.checkout_session_id,
            pt.customer_id,
            pt.external_ref,
            pt.amount_cents,
            pt.currency,
            pt.status,
            pt.gateway_code,
            pt.gateway_status,
            pt.reconciled_at,
            pt.settled_at,
            pt.created_at,
            pt.updated_at,
            pm.code as payment_method_code
     from ${table("payment_transactions")} pt
     join ${table("payment_methods")} pm on pm.id = pt.payment_method_id
     where pt.id = $1
     limit 1`,
    [id],
  );
}

async function mapTransaction(row: {
  id: string;
  checkout_session_id?: string | null;
  customer_id: string;
  amount_cents: number;
  currency: string;
  payment_method_code: PaymentMethod;
  gateway_code: string;
  gateway_status: string;
  status: string;
  created_at: string;
  updated_at: string;
  reconciled_at: string | null;
  settled_at: string | null;
  external_ref: string | null;
}) {
  const email = await getPrimaryEmail(row.customer_id);
  const risk = row.checkout_session_id ? await getLatestRiskAssessment(row.checkout_session_id) : null;
  return {
    id: row.id,
    customer_id: email,
    amount_cents: Number(row.amount_cents),
    currency: row.currency,
    payment_method: row.payment_method_code,
    gateway: row.gateway_code,
    gateway_status: row.gateway_status,
    credit_tier: null,
    risk_score: risk?.score ?? null,
    risk_decision: risk?.decision ?? null,
    risk_level: risk?.decision ?? null,
    qr_payload: signedQrPayload({
      transactionId: row.id,
      amountCents: Number(row.amount_cents),
      currency: row.currency,
      customerId: email,
    }),
    status: row.status,
    qr_scanned_at: null,
    reconciled_at: row.reconciled_at,
    settled_at: row.settled_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    external_ref: row.external_ref,
  };
}

export async function listProducts(q?: string, category?: string) {
  const values: unknown[] = [];
  const filters = ["p.is_active = true"];
  if (category) {
    values.push(category);
    filters.push(`pc.name = $${values.length}`);
  }
  if (q) {
    values.push(`%${q.toLowerCase()}%`);
    filters.push(`lower(p.brand || ' ' || p.name) like $${values.length}`);
  }

  const rows = await getPool().query(
    `select p.sku,
            p.brand,
            p.name,
            pc.name as category,
            pp.amount_cents as price_cents,
            pp.discount_pct,
            p.merchant_name
     from ${table("products")} p
     left join ${table("product_categories")} pc on pc.id = p.category_id
     join lateral (
       select amount_cents, discount_pct
       from ${table("product_prices")}
       where product_id = p.id and effective_to is null
       order by effective_from desc
       limit 1
     ) pp on true
     where ${filters.join(" and ")}
     order by p.created_at asc, p.name asc`,
    values,
  ) as {
    rows: Array<{
      sku: string;
      brand: string;
      name: string;
      category: string | null;
      price_cents: number;
      discount_pct: string | number | null;
      merchant_name: string | null;
    }>;
  };

  const categories = (await getPool().query(
    `select distinct pc.name as category
     from ${table("products")} p
     left join ${table("product_categories")} pc on pc.id = p.category_id
     where p.is_active = true and pc.name is not null
     order by pc.name asc`,
  )) as { rows: Array<{ category: string }> };

  return {
    items: rows.rows.map((row) => ({
      id: row.sku,
      brand: row.brand,
      name: row.name,
      category: row.category,
      priceCents: Number(row.price_cents),
      discountPct: Number(row.discount_pct || 0),
      rating: 4.7,
      stock: demoStockForCategory(row.category),
      merchantName: row.merchant_name || "TechHub SA",
    })),
    categories: categories.rows.map((row) => row.category),
  };
}

export async function bootstrapPartnerSession(partner: PartnerName, email: string) {
  const partnerRow = await queryOne<{ id: string }>(`select id from ${table("partners")} where code = $1 limit 1`, [partner]);
  if (!partnerRow) throw new Error("unsupported_partner");

  const customer = await ensureCustomerByEmail(email);
  const product = (await getProductBySku("samsung-65-qled")) || (await getProductBySku("samsung-s24"));
  if (!product) throw new Error("missing_demo_product");

  const sessionCode = randomCode("sess");
  const riskProfileId = await ensureRiskProfileId(customer.riskProfileCode);
  const seed = defaultSeed(email);
  const cartSnapshot = [
    {
      productId: product.sku,
      name: product.name,
      priceCents: product.priceCents,
      qty: 1,
    },
  ];
  const customerSnapshot = {
    email: customer.email,
    fullName: customer.fullName,
    idNumber: customer.idNumber,
    phone: customer.phone,
    address: customer.address,
    city: customer.city,
    province: customer.province,
    postalCode: customer.postalCode,
    geoLocation: customer.geoLocation,
    monthlyIncome: customer.monthlyIncome,
    affordabilityBand: customer.affordabilityBand,
  };

  const inserted = await queryOne<{ id: string }>(
    `insert into ${table("checkout_sessions")}
      (session_code, customer_id, partner_id, risk_profile_id, current_step, status, verification_route, source_channel, locked_cart_snapshot, customer_snapshot, partner_snapshot)
     values ($1,$2,$3,$4,'press_buy','active',$5,'web',$6,$7,$8)
     returning id`,
    [
      sessionCode,
      customer.id,
      partnerRow.id,
      riskProfileId,
      seed.verificationRoute,
      JSON.stringify(cartSnapshot),
      JSON.stringify(customerSnapshot),
      JSON.stringify({
        partner,
        partnerLabel: partnerLabels[partner],
        product: {
          id: product.sku,
          brand: product.brand,
          name: product.name,
          category: product.category,
          priceCents: product.priceCents,
          discountPct: product.discountPct,
          rating: 4.7,
          stock: product.stock,
          merchantName: product.merchantName,
        },
      }),
    ],
  );
  if (!inserted) throw new Error("session_create_failed");
  await createCheckoutSessionEvent(inserted.id, "partner.fetch_cart", customer.email, { partner, productId: product.sku });

  return {
    sessionId: sessionCode,
    partner,
    partnerLabel: partnerLabels[partner],
    customer: customerSnapshot,
    product: {
      id: product.sku,
      brand: product.brand,
      name: product.name,
      category: product.category,
      priceCents: product.priceCents,
      discountPct: product.discountPct,
      rating: 4.7,
      stock: product.stock,
      merchantName: product.merchantName,
    },
  };
}

export async function createOtpRequest(sessionId: string, channel: "sms" | "email", destination: string) {
  const session = await getCheckoutSessionByCode(sessionId);
  if (!session) throw new Error("session_not_found");

  const requestId = randomCode("otp");
  const otpCode = "7842";
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await getPool().query(
    `insert into ${table("otp_challenges")}
      (checkout_session_id, channel, destination_hash, otp_hash, provider, provider_request_ref, status, expires_at)
     values ($1,$2,$3,$4,'twilio',$5,'sent',$6)`,
    [session.id, channel, hashText(destination.trim().toLowerCase()), hashText(otpCode), requestId, expiresAt.toISOString()],
  );
  await getPool().query(
    `update ${table("checkout_sessions")}
     set current_step = 'otp_verification', status = 'otp_pending', updated_at = now()
     where id = $1`,
    [session.id],
  );
  await createCheckoutSessionEvent(session.id, "otp.sent", destination, { channel, requestId });

  return { requestId, expiresAt: expiresAt.getTime(), demoOtp: otpCode };
}

export async function verifyOtpRequest(requestId: string, code: string) {
  const row = await queryOne<{
    id: string;
    checkout_session_id: string;
    otp_hash: string;
    expires_at: string | Date;
    session_code: string;
    attempt_count: number;
    max_attempts: number;
  }>(
    `select oc.id,
            oc.checkout_session_id,
            oc.otp_hash,
            oc.expires_at,
            cs.session_code,
            oc.attempt_count,
            oc.max_attempts
     from ${table("otp_challenges")} oc
     join ${table("checkout_sessions")} cs on cs.id = oc.checkout_session_id
     where oc.provider_request_ref = $1
     order by oc.created_at desc
     limit 1`,
    [requestId],
  );
  if (!row) throw new Error("otp_not_found");
  if (new Date(row.expires_at).getTime() < Date.now()) throw new Error("otp_expired");

  if (hashText(String(code || "").trim()) !== row.otp_hash) {
    const nextAttempts = Number(row.attempt_count || 0) + 1;
    await getPool().query(
      `update ${table("otp_challenges")}
       set attempt_count = $2,
           status = case when $2 >= max_attempts then 'locked' else status end
       where id = $1`,
      [row.id, nextAttempts],
    );
    throw new Error("otp_invalid");
  }

  await getPool().query(
    `update ${table("otp_challenges")}
     set status = 'verified', verified_at = now(), attempt_count = attempt_count + 1
     where id = $1`,
    [row.id],
  );
  await getPool().query(
    `update ${table("checkout_sessions")}
     set current_step = 'risk_checks', status = 'otp_verified', otp_verified_at = now(), updated_at = now()
     where id = $1`,
    [row.checkout_session_id],
  );
  await createCheckoutSessionEvent(row.checkout_session_id, "otp.verified", null, { requestId });
  return { ok: true as const, sessionId: row.session_code };
}

export async function confirmCheckoutDetails(input: ConfirmCheckoutDetailsInput) {
  const session = await getCheckoutSessionByCode(input.sessionId);
  if (!session) throw new Error("session_not_found");
  if (!input.termsAccepted) throw new Error("terms_required");

  const customer = await ensureCustomerByEmail(input.email, {
    fullName: input.fullName,
    idNumber: input.idNumber,
    phone: input.phone,
    address: input.address,
    city: input.city,
    province: input.province,
    postalCode: input.postalCode,
    geoLocation: input.geoLocation || "",
  });
  const addressId = await upsertDefaultAddress(customer.id, {
    address1: input.address,
    city: input.city,
    province: input.province,
    postalCode: input.postalCode,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
  });

  const consent = await queryOne<{ id: string }>(
    `insert into ${table("customer_consents")}
      (customer_id, consent_type, consent_version, accepted, accepted_at, evidence)
     values ($1,'terms_and_conditions','v1',true,now(),$2)
     returning id`,
    [customer.id, JSON.stringify({ geoLocation: input.geoLocation || "", latitude: input.latitude ?? null, longitude: input.longitude ?? null })],
  );

  const customerSnapshot = {
    email: customer.email,
    fullName: input.fullName,
    idNumber: input.idNumber,
    phone: input.phone,
    address: input.address,
    city: input.city,
    province: input.province,
    postalCode: input.postalCode,
    geoLocation: input.geoLocation || "",
    monthlyIncome: customer.monthlyIncome,
    affordabilityBand: customer.affordabilityBand,
  };

  await getPool().query(
    `update ${table("checkout_sessions")}
     set customer_id = $2,
         delivery_address_id = $3,
         current_step = 'confirm_details',
         status = 'otp_pending',
         customer_snapshot = $4,
         terms_consent_id = $5,
         updated_at = now()
     where session_code = $1`,
    [input.sessionId, customer.id, addressId, JSON.stringify(customerSnapshot), consent?.id || null],
  );
  await createAuditEvent({
    category: "checkout",
    actorType: "customer",
    actorId: customer.email,
    customerId: customer.id,
    checkoutSessionId: session.id,
    resourceType: "checkout_session",
    resourceId: session.id,
    action: "checkout.details_confirmed",
    metadata: customerSnapshot,
  });
  await createCheckoutSessionEvent(session.id, "checkout.details_confirmed", customer.email, customerSnapshot);

  return { ok: true as const, sessionId: input.sessionId, customer: customerSnapshot };
}

export async function recordRiskAssessment(input: RecordRiskAssessmentInput) {
  const session = await getCheckoutSessionByCode(input.sessionId);
  if (!session) throw new Error("session_not_found");
  const projectedDecision = input.projectedDecision || (input.approved ? "auto_approve" : "manual_review_hold");
  const requiresManualReview = projectedDecision !== "auto_approve";
  const score = typeof input.projectedScore === "number"
    ? input.projectedScore
    : input.screeningMode === "skip"
      ? 18
      : Math.max(
          0,
          Math.min(
            200,
            Math.round((input.transunionApproved ? 10 : 45) + input.fraudScore * 100 + (input.experianIncome < 15000 ? 30 : 10)),
          ),
        );
  const persistedDecision = requiresManualReview ? "manual_review" : "auto_approve";
  const persistedVerificationStatus = requiresManualReview
    ? "kyc_and_id_verified"
    : input.screeningMode === "skip"
      ? "otp_verified"
      : "kyc_and_id_verified";

  const caseRow = await queryOne<{ id: string }>(
    `insert into ${table("verification_cases")}
      (checkout_session_id, customer_id, route, status)
     values ($1,$2,$3,$4)
     returning id`,
    [
      session.id,
      session.customer_id,
      input.screeningMode === "skip" ? "otp_only" : "full_kyc",
      requiresManualReview ? "manual_review" : "approved",
    ],
  );
  if (!caseRow) throw new Error("verification_case_failed");
  const band = score < 40 ? "low" : score < 70 ? "medium" : score < 100 ? "high" : "critical";

  const assessment = await queryOne<{ id: string }>(
    `insert into ${table("risk_assessments")}
      (checkout_session_id, customer_id, assessment_version, score, decision, band, verification_status, requires_manual_review, ruleset_version, model_version, decision_reason, payload)
     values ($1,$2,'v1',$3,$4,$5,$6,$7,'risk-rules-v1','pondo-demo-v1',$8,$9)
     returning id`,
    [
      session.id,
      session.customer_id,
      score,
      persistedDecision,
      band,
      persistedVerificationStatus,
      requiresManualReview,
      requiresManualReview ? "Screening requires manual analyst review." : "Automated screening approved checkout.",
      JSON.stringify({
        saIdHash: hashText(input.saId),
        bureau: input.bureau,
        screeningMode: input.screeningMode,
        transunionScore: input.transunionScore,
        transunionApproved: input.transunionApproved,
        experianIncome: input.experianIncome,
        fraudScore: input.fraudScore,
        projectedScore: score,
        projectedDecision,
        projectedFactors: input.projectedFactors || [],
      }),
    ],
  );
  if (!assessment) throw new Error("risk_assessment_failed");

  const signals = [
    { signalCode: "CREDIT_SCORE", source: input.bureau, points: input.transunionApproved ? 10 : 45, value: String(input.transunionScore ?? 0), detail: `Credit bureau ${input.bureau} score evaluated.` },
    { signalCode: "KYC_IDENTITY", source: "pondo", points: input.kycIdentityVerified ? 5 : 40, value: input.kycIdentityVerified ? "verified" : "failed", detail: "Identity and KYC status captured." },
    { signalCode: "AFFORDABILITY", source: "experian", points: input.experianIncome >= 15000 ? 10 : 30, value: String(input.experianIncome), detail: "Affordability income evaluation completed." },
    { signalCode: "FRAUD_SCORE", source: "pondo-python", points: Math.round(input.fraudScore * 100), value: input.fraudScore.toFixed(2), detail: "Fraud scoring and geo-risk signal recorded." },
  ];
  for (const signal of signals) {
    await getPool().query(
      `insert into ${table("risk_signals")}
        (risk_assessment_id, signal_code, source_system, points_assigned, signal_value, detail, evidence)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [assessment.id, signal.signalCode, signal.source, signal.points, signal.value, signal.detail, JSON.stringify({ city: input.city || "", province: input.province || "", postalCode: input.postalCode || "" })],
    );
  }

  await getPool().query(
    `insert into ${table("verification_steps")}
      (verification_case_id, step_code, status, provider, provider_ref, completed_at)
     values
      ($1,'kyc',$2,'pondo','kyc-demo',now()),
      ($1,'credit',$3,$4,'credit-demo',now()),
      ($1,'affordability',$5,'experian','affordability-demo',now()),
      ($1,'fraud',$6,'pondo-python','fraud-demo',now())`,
    [
      caseRow.id,
      input.kycIdentityVerified ? "approved" : "declined",
      input.transunionApproved ? "approved" : "declined",
      input.bureau,
      input.experianIncome >= 15000 ? "approved" : "declined",
      requiresManualReview ? "declined" : "approved",
    ],
  );

  await getPool().query(
    `insert into ${table("credit_checks")}
      (verification_case_id, checkout_session_id, provider, bureau, score, tier, approved, response_payload)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [caseRow.id, session.id, input.bureau, input.bureau, input.transunionScore, input.transunionApproved ? "A" : "C", input.transunionApproved, JSON.stringify({ approved: input.transunionApproved, score: input.transunionScore })],
  );
  await getPool().query(
    `insert into ${table("kyc_checks")}
      (verification_case_id, checkout_session_id, provider, provider_ref, id_document_type, result_status, response_payload)
     values ($1,$2,'pondo','kyc-demo','sa_id',$3,$4)`,
    [caseRow.id, session.id, input.kycIdentityVerified ? "approved" : "declined", JSON.stringify({ identityVerified: input.kycIdentityVerified })],
  );
  await getPool().query(
    `insert into ${table("affordability_checks")}
      (verification_case_id, checkout_session_id, provider, declared_income_cents, verified_income_cents, approved, response_payload)
     values ($1,$2,'experian',$3,$4,$5,$6)`,
    [caseRow.id, session.id, Math.round(input.experianIncome * 100), Math.round(input.experianIncome * 100), input.experianIncome >= 15000, JSON.stringify({ monthlyIncome: input.experianIncome })],
  );
  await getPool().query(
    `insert into ${table("fraud_checks")}
      (verification_case_id, checkout_session_id, provider, fraud_score, result_status, response_payload)
     values ($1,$2,'pondo-python',$3,$4,$5)`,
    [caseRow.id, session.id, input.fraudScore, requiresManualReview ? "declined" : "approved", JSON.stringify({ fraudScore: input.fraudScore, city: input.city || "", province: input.province || "", projectedDecision, projectedFactors: input.projectedFactors || [] })],
  );
  if (requiresManualReview) {
    await getPool().query(
      `insert into ${table("manual_review_cases")}
        (verification_case_id, queue_name, status, reason)
       values ($1,'fraud-ops','open',$2)`,
      [caseRow.id, "Automated risk checks require manual review."],
    );
  }

  await getPool().query(
    `update ${table("checkout_sessions")}
     set current_step = 'risk_checks',
         status = $2,
         risk_completed_at = now(),
         updated_at = now()
     where id = $1`,
    [session.id, requiresManualReview ? "manual_review" : "risk_approved"],
  );

  await createAuditEvent({
    category: "risk",
    actorType: "system",
    actorId: input.actor,
    customerId: session.customer_id,
    checkoutSessionId: session.id,
    resourceType: "risk_assessment",
    resourceId: assessment.id,
    action: "risk.assessed",
    metadata: { decision: projectedDecision, persistedDecision, score, screeningMode: input.screeningMode },
  });
  await createCheckoutSessionEvent(session.id, "risk.assessed", input.actor, { decision: projectedDecision, score });

  return { ok: true as const, approved: !requiresManualReview };
}

export function simulateCredit(saId: string, bureau: "transunion" | "experian") {
  if (/^\d{13}$/.test(saId)) return { score: 700, tier: "A", approved: true, bureau };
  return { score: 540, tier: "C", approved: false, bureau };
}

export async function createOrder(input: {
  actor: string;
  customerEmail: string;
  sessionId?: string;
  items: Array<{ productId: string; qty: number }>;
  delivery: { fullName: string; phone: string; address1: string; city: string; province: string; postalCode: string; deliveryDate?: string; deliveryWindow?: string };
  paymentMethod: PaymentMethod;
  riskContext?: {
    idNumber?: string;
    deviceFingerprint?: string;
    clientGeo?: ClientGeo;
    validatedAddress?: ValidatedAddress;
    otpVerified?: boolean;
    saidVerified?: boolean;
  };
  requestIp?: string;
}) {
  const session = input.sessionId ? await getCheckoutSessionByCode(input.sessionId) : null;
  if (input.sessionId && !session) throw new Error("session_not_found");

  const customer = await ensureCustomerByEmail(input.customerEmail, {
    fullName: input.delivery.fullName,
    phone: input.delivery.phone,
    address: input.delivery.address1,
    city: input.delivery.city,
    province: input.delivery.province,
    postalCode: input.delivery.postalCode,
  });

  const resolvedDelivery = deriveDeliveryLocation(input.delivery.address1, input.delivery.city, input.delivery.province, input.delivery.postalCode);
  const validatedDelivery = {
    city: input.riskContext?.validatedAddress?.city || resolvedDelivery.city,
    province: input.riskContext?.validatedAddress?.province || resolvedDelivery.province,
    postalCode: input.riskContext?.validatedAddress?.postalCode || resolvedDelivery.postalCode,
    latitude: input.riskContext?.validatedAddress?.latitude ?? null,
    longitude: input.riskContext?.validatedAddress?.longitude ?? null,
  };
  const addressId = await upsertDefaultAddress(customer.id, {
    address1: input.delivery.address1,
    city: validatedDelivery.city,
    province: validatedDelivery.province,
    postalCode: validatedDelivery.postalCode,
  });

  const products = await Promise.all(input.items.map((item) => getProductBySku(item.productId)));
  if (products.some((product) => !product)) throw new Error("unknown_product");
  const resolvedProducts = products as ProductRecord[];
  const subtotal = input.items.reduce((sum, item, index) => sum + discountedPrice(resolvedProducts[index]) * item.qty, 0);

  const orderNumber = `ORD-${Date.now().toString().slice(-8)}`;
  const orderRow = await queryOne<{ id: string }>(
    `insert into ${table("orders")}
      (checkout_session_id, customer_id, partner_id, delivery_address_id, order_number, subtotal_cents, delivery_cents, total_cents, currency, status)
     values ($1,$2,$3,$4,$5,$6,0,$6,'ZAR','created')
     returning id`,
    [session?.id || null, customer.id, session?.partner_id || null, addressId, orderNumber, subtotal],
  );
  if (!orderRow) throw new Error("order_create_failed");

  for (let index = 0; index < input.items.length; index += 1) {
    const product = resolvedProducts[index];
    const item = input.items[index];
    const unit = discountedPrice(product);
    await getPool().query(
      `insert into ${table("order_items")}
        (order_id, product_id, sku, product_name, brand, product_snapshot, quantity, unit_price_cents, discount_pct, line_total_cents)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [orderRow.id, product.id, product.sku, product.name, product.brand, JSON.stringify(product), item.qty, unit, product.discountPct, unit * item.qty],
    );
  }

  await getPool().query(
    `insert into ${table("order_status_history")}
      (order_id, from_status, to_status, reason, changed_by)
     values ($1,null,'created','Order created from checkout session',$2)`,
    [orderRow.id, input.actor],
  );

  const paymentMethodRow = await getPaymentMethodRow(input.paymentMethod);
  const paymentTransactionId = crypto.randomUUID();
  await getPool().query(
    `insert into ${table("payment_transactions")}
      (id, order_id, checkout_session_id, customer_id, payment_method_id, gateway_code, amount_cents, currency, status, gateway_status)
     values ($1,$2,$3,$4,$5,$6,$7,'ZAR','initiated','initiated')`,
    [paymentTransactionId, orderRow.id, session?.id || null, customer.id, paymentMethodRow.id, paymentMethodRow.gateway_code, subtotal],
  );
  await getPool().query(
    `insert into ${table("payment_events")}
      (payment_transaction_id, event_type, raw_payload)
     values ($1,'payment.initiated',$2)`,
    [paymentTransactionId, JSON.stringify({ paymentMethod: input.paymentMethod, gateway: paymentMethodRow.gateway_code, amountCents: subtotal })],
  );

  if (session?.id) {
    await getPool().query(
      `update ${table("checkout_sessions")}
       set current_step = 'payment', status = 'payment_pending', updated_at = now()
       where id = $1`,
      [session.id],
    );
    await createCheckoutSessionEvent(session.id, "order.created", input.actor, { orderId: orderRow.id, paymentTransactionId });
  }

  await createAuditEvent({
    category: "payment",
    actorType: "customer",
    actorId: input.actor,
    customerId: customer.id,
    checkoutSessionId: session?.id || null,
    orderId: orderRow.id,
    paymentTransactionId,
    resourceType: "payment_transaction",
    resourceId: paymentTransactionId,
    action: "order.created",
    metadata: {
      paymentMethod: input.paymentMethod,
      subtotal,
      deliveryDate: input.delivery.deliveryDate || null,
      deliveryWindow: input.delivery.deliveryWindow || null,
      requestIp: input.requestIp || null,
      deviceFingerprintPresent: Boolean(input.riskContext?.deviceFingerprint),
    },
  });

  let inlineRisk = null;
  if (input.riskContext) {
    const ipGeo = await lookupIpGeo(input.requestIp || "", input.riskContext.clientGeo);
    inlineRisk = assessGeoRisk({
      ipAddress: input.requestIp || input.riskContext.clientGeo?.ip || "",
      ipGeo,
      deliveryGeo: validatedDelivery,
      amountCents: subtotal,
      deviceFingerprint: input.riskContext.deviceFingerprint,
      idNumber: input.riskContext.idNumber,
      otpVerified: input.riskContext.otpVerified,
      saidVerified: input.riskContext.saidVerified,
    });
  }

  const mapped = await mapTransaction({
    id: paymentTransactionId,
    checkout_session_id: session?.id || null,
    customer_id: customer.id,
    amount_cents: subtotal,
    currency: "ZAR",
    payment_method_code: input.paymentMethod,
    gateway_code: paymentMethodRow.gateway_code,
    gateway_status: "initiated",
    status: "initiated",
    created_at: nowIso(),
    updated_at: nowIso(),
    reconciled_at: null,
    settled_at: null,
    external_ref: null,
  });

  return { transaction: mapped, qrPayload: mapped.qr_payload, riskAssessment: inlineRisk };
}

export async function settleOrder(input: {
  actor: string;
  id: string;
  paymentMethod: PaymentMethod;
  settlementBank?: SettlementBank;
  notifyEmail?: string;
  notifyChannels?: Array<"sms" | "email">;
}) {
  const transaction = await getPaymentTransactionById(input.id);
  if (!transaction) throw new Error("not_found");

  const paymentMethodRow = await getPaymentMethodRow(input.paymentMethod);
  const risk = transaction.checkout_session_id ? await getLatestRiskAssessment(transaction.checkout_session_id) : null;
  const creditEligible = !paymentMethodMeta[input.paymentMethod].requiresCreditVet || risk?.decision === "auto_approve";
  if (!creditEligible) throw new Error("payment_declined");

  const externalRef = `live_${transaction.id.slice(0, 8)}`;
  await getPool().query(
    `update ${table("payment_transactions")}
     set status = 'reconciled',
         gateway_status = 'settled',
         payment_method_id = $2,
         gateway_code = $3,
         external_ref = $4,
         reconciled_at = now(),
         settled_at = now(),
         updated_at = now()
     where id = $1`,
    [transaction.id, paymentMethodRow.id, paymentMethodRow.gateway_code, externalRef],
  );
  await getPool().query(
    `insert into ${table("payment_events")}
      (payment_transaction_id, event_type, gateway_ref, raw_payload)
     values ($1,'payment.settled',$2,$3)`,
    [transaction.id, externalRef, JSON.stringify({ settlementBank: input.settlementBank || "absa" })],
  );

  const bankKey = bankAccounts[input.settlementBank || "absa"] ? (input.settlementBank || "absa") : "absa";
  const bank = bankAccounts[bankKey];
  await getPool().query(
    `insert into ${table("payment_settlements")}
      (payment_transaction_id, settlement_bank, bank_account_ref, gross_amount_cents, fee_amount_cents, net_amount_cents, currency, settled_at)
     values ($1,$2,$3,$4,0,$4,'ZAR',now())
     on conflict (payment_transaction_id) do update
       set settlement_bank = excluded.settlement_bank,
           bank_account_ref = excluded.bank_account_ref,
           gross_amount_cents = excluded.gross_amount_cents,
           net_amount_cents = excluded.net_amount_cents,
           currency = excluded.currency,
           settled_at = excluded.settled_at`,
    [transaction.id, bankKey, bank.accountRef, Number(transaction.amount_cents)],
  );

  const email = await getPrimaryEmail(transaction.customer_id);
  const phone = await getPrimaryPhone(transaction.customer_id);
  const notificationsOut: Array<{ channel: "sms" | "email"; destination: string; status: string; sentAt: string; message: string }> = [];
  for (const channel of input.notifyChannels || ["sms", "email"]) {
    const destination = channel === "email" ? input.notifyEmail || email : phone;
    const notification = await queryOne<{ id: string; created_at: string }>(
      `insert into ${table("notifications")}
        (customer_id, order_id, payment_transaction_id, channel, template_code, destination_hash, status, message_subject, message_body_redacted)
       values ($1,$2,$3,$4,'payment_settled',$5,'sent',$6,$7)
       returning id, created_at`,
      [
        transaction.customer_id,
        transaction.order_id,
        transaction.id,
        channel,
        hashText(destination.toLowerCase()),
        "Settlement confirmed",
        `Funds settled into ${bank.bankLabel} (${bank.accountRef}).`,
      ],
    );
    if (notification) {
      await getPool().query(
        `insert into ${table("notification_attempts")}
          (notification_id, provider, provider_ref, attempt_no, status, response_payload)
         values ($1,$2,$3,1,'sent',$4)`,
        [notification.id, channel === "email" ? "ses-demo" : "twilio-demo", randomCode("notify"), JSON.stringify({ destination: maskDestination(channel, destination) })],
      );
      notificationsOut.push({
        channel,
        destination: maskDestination(channel, destination),
        status: "sent",
        sentAt: notification.created_at,
        message: `Funds settled into ${bank.bankLabel} (${bank.accountRef}).`,
      });
    }
  }

  await getPool().query(
    `update ${table("orders")}
     set status = 'paid', updated_at = now()
     where id = $1`,
    [transaction.order_id],
  );
  await getPool().query(
    `insert into ${table("order_status_history")}
      (order_id, from_status, to_status, reason, changed_by)
     values ($1,'created','paid','Payment settlement completed',$2)`,
    [transaction.order_id, input.actor],
  );

  const existingProcess = await queryOne<{ id: string }>(
    `select id from ${table("delivery_processes")} where payment_transaction_id = $1 limit 1`,
    [transaction.id],
  );
  let processId = existingProcess?.id || null;
  if (!processId) {
    const created = await queryOne<{ id: string }>(
      `insert into ${table("delivery_processes")}
        (order_id, payment_transaction_id, status, progress_pct, active_step, started_at, updated_at)
       values ($1,$2,'active',0,1,now(),now())
       returning id`,
      [transaction.order_id, transaction.id],
    );
    processId = created?.id || null;
    if (processId) {
      for (let index = 0; index < deliverySteps.length; index += 1) {
        const step = deliverySteps[index];
        await getPool().query(
          `insert into ${table("delivery_process_steps")}
            (delivery_process_id, step_index, step_code, title, detail, status)
           values ($1,$2,$3,$4,$5,$6)`,
          [processId, index + 1, step.code, step.title, step.detail, index === 0 ? "active" : "pending"],
        );
      }
    }
  }

  if (transaction.checkout_session_id) {
    await getPool().query(
      `update ${table("checkout_sessions")}
       set current_step = 'delivery_tracking',
           status = 'paid',
           payment_completed_at = now(),
           updated_at = now()
       where id = $1`,
      [transaction.checkout_session_id],
    );
    await createCheckoutSessionEvent(transaction.checkout_session_id, "payment.settled", input.actor, { paymentTransactionId: transaction.id });
  }

  await createAuditEvent({
    category: "payment",
    actorType: "customer",
    actorId: input.actor,
    customerId: transaction.customer_id,
    checkoutSessionId: transaction.checkout_session_id,
    orderId: transaction.order_id,
    paymentTransactionId: transaction.id,
    resourceType: "payment_transaction",
    resourceId: transaction.id,
    action: "payment.settled",
    metadata: { settlementBank: bankKey, gateway: paymentMethodRow.gateway_code },
  });

  const updated = await getPaymentTransactionById(transaction.id);
  if (!updated) throw new Error("payment_fetch_failed");
  const mapped = await mapTransaction(updated);
  return {
    transaction: mapped,
    settlement: {
      bank: bankKey,
      bankLabel: bank.bankLabel,
      accountRef: bank.accountRef,
      settledAt: updated.settled_at,
      amountCents: Number(updated.amount_cents),
      currency: updated.currency,
    },
    notifications: notificationsOut,
  };
}

export async function getOrder(id: string) {
  const transaction = await getPaymentTransactionById(id);
  if (!transaction) return null;

  const [order, items, audit] = await Promise.all([
    queryOne<Record<string, unknown>>(`select * from ${table("orders")} where id = $1 limit 1`, [transaction.order_id]),
    getPool().query(`select * from ${table("order_items")} where order_id = $1 order by id asc`, [transaction.order_id]),
    getPool().query(
      `select occurred_at as at, actor_id as actor, action, metadata as data
       from ${table("audit_events")}
       where payment_transaction_id = $1
       order by occurred_at asc, id asc`,
      [transaction.id],
    ) as Promise<{ rows: Array<{ at: string; actor: string | null; action: string; data: unknown }> }>,
  ]);

  return {
    transaction: await mapTransaction(transaction),
    details: {
      order,
      items: items.rows,
    },
    audit: audit.rows,
  };
}

export async function getDeliveryProcess(id: string) {
  const process = await queryOne<{ id: string; started_at: string | Date | null }>(
    `select id, started_at
     from ${table("delivery_processes")}
     where payment_transaction_id = $1
     limit 1`,
    [id],
  );
  if (!process) return null;

  const stepsResult = (await getPool().query(
    `select step_index, title, detail
     from ${table("delivery_process_steps")}
     where delivery_process_id = $1
     order by step_index asc`,
    [process.id],
  )) as { rows: Array<{ step_index: number; title: string; detail: string }> };

  const startedAtMs = process.started_at ? new Date(process.started_at).getTime() : Date.now();
  const stepDurationMs = 6000;
  const totalSteps = stepsResult.rows.length || deliverySteps.length;
  const elapsedMs = Math.max(0, Date.now() - startedAtMs);
  const maxDurationMs = totalSteps * stepDurationMs;
  const completed = elapsedMs >= maxDurationMs;
  const activeStep = completed ? null : Math.min(totalSteps, Math.floor(elapsedMs / stepDurationMs) + 1);
  const progressPct = Math.max(0, Math.min(100, Math.round((elapsedMs / maxDurationMs) * 100)));

  const steps = stepsResult.rows.map((row, index) => {
    const stepStart = startedAtMs + index * stepDurationMs;
    const stepEnd = stepStart + stepDurationMs;
    const done = Date.now() >= stepEnd;
    const active = !done && Date.now() >= stepStart;
    return {
      index: row.step_index,
      title: row.title,
      detail: row.detail,
      status: done ? "completed" : active ? "active" : "pending",
      completedAt: done ? new Date(stepEnd).toISOString() : null,
    };
  });

  return {
    orderId: id,
    status: completed ? "completed" : "running",
    startedAt: new Date(startedAtMs).toISOString(),
    updatedAt: nowIso(),
    progressPct,
    activeStep,
    steps,
  };
}

export async function sponsorSummary() {
  const result = (await getPool().query(
    `select status, amount_cents from ${table("payment_transactions")}`,
  )) as { rows: Array<{ status: string; amount_cents: number }> };
  const items = result.rows;
  return {
    live: items.length,
    completed: items.filter((row) => row.status === "reconciled").length,
    failed: items.filter((row) => row.status === "failed").length,
    processing: items.filter((row) => row.status === "processing" || row.status === "initiated" || row.status === "authorized").length,
    grossCents: items.filter((row) => row.status === "reconciled").reduce((sum, row) => sum + Number(row.amount_cents || 0), 0),
  };
}

export async function sponsorOrders() {
  const rows = (await getPool().query(
    `select pt.id,
            pt.checkout_session_id,
            pt.customer_id,
            pt.amount_cents,
            pt.currency,
            pt.status,
            pt.gateway_code,
            pt.gateway_status,
            pt.reconciled_at,
            pt.settled_at,
            pt.created_at,
            pt.updated_at,
            pt.external_ref,
            pm.code as payment_method_code
     from ${table("payment_transactions")} pt
     join ${table("payment_methods")} pm on pm.id = pt.payment_method_id
     order by pt.created_at desc`,
  )) as {
    rows: Array<{
      id: string;
      checkout_session_id: string | null;
      customer_id: string;
      amount_cents: number;
      currency: string;
      status: string;
      gateway_code: string;
      gateway_status: string;
      reconciled_at: string | null;
      settled_at: string | null;
      created_at: string;
      updated_at: string;
      external_ref: string | null;
      payment_method_code: PaymentMethod;
    }>;
  };

  const items = await Promise.all(rows.rows.map((row) => mapTransaction(row)));
  return { items };
}
