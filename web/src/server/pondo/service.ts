import jwt from "jsonwebtoken";
import { getPool } from "./db";
import { assessGeoRisk, deriveManualDeliveryLocation, lookupIpGeo, type ClientGeo, type RiskAssessment, type ValidatedAddress } from "./risk";

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

const partnerLabels: Record<PartnerName, string> = {
  amazon: "Amazon SA",
  temu: "Temu",
  takealot: "Takealot",
  woocommerce: "WooCommerce",
  shopify: "Shopify",
};

const partnerSeeds = {
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
  },
} as const;

const paymentMethodMeta: Record<PaymentMethod, { gateway: string; requiresCreditVet: boolean }> = {
  card: { gateway: "peach", requiresCreditVet: false },
  card_3ds: { gateway: "peach", requiresCreditVet: false },
  debit_card: { gateway: "peach", requiresCreditVet: false },
  eft: { gateway: "ozow", requiresCreditVet: false },
  payfast: { gateway: "payfast", requiresCreditVet: false },
  bnpl: { gateway: "payflex", requiresCreditVet: true },
  speedpoint: { gateway: "speedpoint", requiresCreditVet: false },
  ussd: { gateway: "ussd", requiresCreditVet: false },
  evoucher_wallet: { gateway: "wallet", requiresCreditVet: false },
};

const bankAccounts: Record<SettlementBank, { bankLabel: string; accountRef: string }> = {
  absa: { bankLabel: "ABSA Business Account", accountRef: "ABSA-***-1042" },
  fnb: { bankLabel: "FNB Business Account", accountRef: "FNB-***-7721" },
  standard_bank: { bankLabel: "Standard Bank Business Account", accountRef: "STD-***-5560" },
};

const deliverySteps = [
  { title: "Dispatch Initiation", detail: "Email, WhatsApp, and SMS dispatches confirm that the order is in route." },
  { title: "Active Tracking", detail: "System confirms live dispatch and starts real-time package tracking." },
  { title: "Driver Assignment", detail: "PONDO verifies and confirms the specific delivery person to the buyer." },
  { title: "On-Site Verification", detail: "Identity is verified at the door with physical identification checks." },
  { title: "Conclusion", detail: "Final payment confirmation automatically triggers invoice initiation." },
];

let riskSchemaReady: Promise<void> | null = null;

function nowIso() {
  return new Date().toISOString();
}

function randomCode(prefix: string, size = 5) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 2 + size)}`;
}

function secret() {
  return process.env.JWT_SECRET || "dev-secret-change-me";
}

function signedQrPayload(data: Record<string, unknown>) {
  return jwt.sign(data, secret(), { expiresIn: "7d" });
}

async function ensureCustomerByEmail(email: string, override?: Record<string, unknown>) {
  const pool = getPool();
  const safeEmail = String(email || "").trim().toLowerCase();
  const seed = partnerSeeds[safeEmail as keyof typeof partnerSeeds] || {
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
  };
  const profile = { ...seed, ...override };

  const existing = await pool.query("select * from customers where email = $1 limit 1", [safeEmail]);
  if (existing.rows[0]) {
    const row = existing.rows[0];
    await pool.query(
      `update customers
       set full_name = $2, id_number = $3, phone = $4, address_line = $5, city = $6, province = $7,
           postal_code = $8, monthly_income = $9, affordability_band = $10, updated_at = now()
       where id = $1`,
      [row.id, profile.fullName, profile.idNumber, profile.phone, profile.address, profile.city, profile.province, profile.postalCode, profile.monthlyIncome, profile.affordabilityBand],
    );
    return {
      id: row.id as string,
      email: safeEmail,
      ...profile,
    };
  }

  const inserted = await pool.query(
    `insert into customers
      (email, full_name, id_number, phone, address_line, city, province, postal_code, monthly_income, affordability_band, source_payload)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     returning id`,
    [
      safeEmail,
      profile.fullName,
      profile.idNumber,
      profile.phone,
      profile.address,
      profile.city,
      profile.province,
      profile.postalCode,
      profile.monthlyIncome,
      profile.affordabilityBand,
      JSON.stringify(profile),
    ],
  );

  return {
    id: inserted.rows[0].id as string,
    email: safeEmail,
    ...profile,
  };
}

async function getProductById(id: string) {
  const pool = getPool();
  const result = await pool.query("select * from products where id = $1 limit 1", [id]);
  return result.rows[0] || null;
}

export async function listProducts(q?: string, category?: string) {
  const pool = getPool();
  const values: unknown[] = [];
  const filters: string[] = [];
  if (category) {
    values.push(category);
    filters.push(`category = $${values.length}`);
  }
  if (q) {
    values.push(`%${q.toLowerCase()}%`);
    filters.push(`lower(brand || ' ' || name) like $${values.length}`);
  }

  const where = filters.length ? `where ${filters.join(" and ")}` : "";
  const items = await pool.query(`select * from products ${where} order by created_at asc, name asc`, values);
  const categories = await pool.query("select distinct category from products where category is not null order by category asc");
  const itemRows = items.rows as any[];
  const categoryRows = categories.rows as any[];
  return {
    items: itemRows.map((row: any) => ({
      id: row.id,
      brand: row.brand,
      name: row.name,
      category: row.category,
      priceCents: row.price_cents,
      discountPct: Number(row.discount_pct || 0),
      rating: Number(row.rating || 0),
      stock: row.stock_quantity,
    })),
    categories: categoryRows.map((row: any) => row.category),
  };
}

export async function bootstrapPartnerSession(partner: PartnerName, email: string) {
  const pool = getPool();
  const partnerResult = await pool.query("select * from partners where code = $1 limit 1", [partner]);
  if (!partnerResult.rows[0]) throw new Error("unsupported_partner");
  const customer = await ensureCustomerByEmail(email);
  const product = (await getProductById("samsung-65-qled")) || (await pool.query("select * from products order by created_at asc limit 1")).rows[0];
  if (!product) throw new Error("missing_demo_product");

  const sessionCode = randomCode("sess");
  const cartSnapshot = [product].map((item) => ({
    productId: item.id,
    name: item.name,
    priceCents: item.price_cents,
    qty: 1,
  }));
  await pool.query(
    `insert into checkout_sessions
      (session_code, customer_id, partner_id, partner_code, partner_email, customer_snapshot, locked_cart_snapshot, partner_product_snapshot)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      sessionCode,
      customer.id,
      partnerResult.rows[0].id,
      partner,
      customer.email,
      JSON.stringify(customer),
      JSON.stringify(cartSnapshot),
      JSON.stringify({
        id: product.id,
        brand: product.brand,
        name: product.name,
        category: product.category,
        priceCents: product.price_cents,
        discountPct: Number(product.discount_pct || 0),
        rating: Number(product.rating || 0),
        stock: product.stock_quantity,
        merchantName: product.merchant_name || "TechHub SA",
      }),
    ],
  );

  return {
    sessionId: sessionCode,
    partner,
    partnerLabel: partnerLabels[partner],
    customer: {
      email: customer.email,
      fullName: customer.fullName,
      idNumber: customer.idNumber,
      phone: customer.phone,
      address: customer.address,
      geoLocation: customer.geoLocation,
      monthlyIncome: customer.monthlyIncome,
      affordabilityBand: customer.affordabilityBand,
    },
    product: {
      id: product.id,
      brand: product.brand,
      name: product.name,
      category: product.category,
      priceCents: product.price_cents,
      discountPct: Number(product.discount_pct || 0),
      rating: Number(product.rating || 0),
      stock: product.stock_quantity,
      merchantName: product.merchant_name || "TechHub SA",
    },
  };
}

export async function createOtpRequest(sessionId: string, channel: "sms" | "email", destination: string) {
  const pool = getPool();
  const session = await pool.query("select id from checkout_sessions where session_code = $1 limit 1", [sessionId]);
  if (!session.rows[0]) throw new Error("session_not_found");
  const requestId = randomCode("otp");
  const otpCode = "7842";
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  await pool.query(
    `insert into otp_requests
      (checkout_session_id, request_code, channel, destination, otp_code, status, expires_at)
     values ($1,$2,$3,$4,$5,'sent',$6)`,
    [session.rows[0].id, requestId, channel, destination, otpCode, expiresAt.toISOString()],
  );
  return { requestId, expiresAt: expiresAt.getTime(), demoOtp: otpCode };
}

export async function verifyOtpRequest(requestId: string, code: string) {
  const pool = getPool();
  const result = await pool.query(
    `select o.id, o.checkout_session_id, o.otp_code, o.expires_at, c.session_code
     from otp_requests o
     left join checkout_sessions c on c.id = o.checkout_session_id
     where o.request_code = $1
     limit 1`,
    [requestId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("otp_not_found");
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) throw new Error("otp_expired");
  if (String(code || "").trim() !== String(row.otp_code || "")) throw new Error("otp_invalid");

  await pool.query("update otp_requests set status = 'verified', verified_at = now() where id = $1", [row.id]);
  await pool.query("update checkout_sessions set status = 'otp_verified', otp_verified_at = now(), updated_at = now() where id = $1", [row.checkout_session_id]);
  return { ok: true as const, sessionId: row.session_code as string };
}

export function simulateCredit(saId: string, bureau: "transunion" | "experian") {
  if (/^\d{13}$/.test(saId)) return { score: 700, tier: "A", approved: true, bureau };
  return { score: 540, tier: "C", approved: false, bureau };
}

function discountedPrice(row: Record<string, unknown>) {
  return Math.round(Number(row.price_cents || 0) * (1 - Number(row.discount_pct || 0) / 100));
}

async function ensureRiskSchema(pool: any) {
  if (!riskSchemaReady) {
    riskSchemaReady = (async () => {
      await pool.query(`
        alter table transactions add column if not exists risk_score integer;
        alter table transactions add column if not exists risk_level text;
        alter table transactions add column if not exists risk_decision text;
        alter table transactions add column if not exists risk_factors jsonb default '[]'::jsonb;
        alter table transactions add column if not exists ip_address text;
        alter table transactions add column if not exists ip_city text;
        alter table transactions add column if not exists ip_province text;
        alter table transactions add column if not exists ip_country text;
        alter table transactions add column if not exists ip_postal_code text;
        alter table transactions add column if not exists ip_latitude double precision;
        alter table transactions add column if not exists ip_longitude double precision;
        alter table transactions add column if not exists device_fingerprint text;
        alter table transactions add column if not exists validated_city text;
        alter table transactions add column if not exists validated_province text;
        alter table transactions add column if not exists validated_postal_code text;
        alter table transactions add column if not exists validated_latitude double precision;
        alter table transactions add column if not exists validated_longitude double precision;
        alter table transactions add column if not exists verified_status text;
      `);
    })();
  }
  await riskSchemaReady;
}

export async function createOrder(input: {
  actor: string;
  customerEmail: string;
  items: Array<{ productId: string; qty: number }>;
  delivery: { fullName: string; phone: string; address1: string; city: string; province: string; postalCode: string; deliveryDate?: string; deliveryWindow?: string };
  paymentMethod: PaymentMethod;
  riskContext?: {
    deviceFingerprint?: string;
    clientGeo?: ClientGeo;
    validatedAddress?: ValidatedAddress;
    otpVerified?: boolean;
    saidVerified?: boolean;
  };
  requestIp?: string;
}) {
  const pool = getPool();
  await ensureRiskSchema(pool);
  const resolvedDelivery = deriveManualDeliveryLocation(
    input.delivery.address1,
    input.delivery.city,
    input.delivery.province,
    input.delivery.postalCode,
  );
  const validatedAddress = {
    city: input.riskContext?.validatedAddress?.city || resolvedDelivery.city,
    province: input.riskContext?.validatedAddress?.province || resolvedDelivery.province,
    postalCode: input.riskContext?.validatedAddress?.postalCode || resolvedDelivery.postalCode,
    latitude: input.riskContext?.validatedAddress?.latitude ?? null,
    longitude: input.riskContext?.validatedAddress?.longitude ?? null,
  };
  const customer = await ensureCustomerByEmail(input.customerEmail, {
    fullName: input.delivery.fullName,
    phone: input.delivery.phone,
    address: input.delivery.address1,
    city: resolvedDelivery.city,
    province: resolvedDelivery.province,
    postalCode: resolvedDelivery.postalCode,
  });

  const products = await Promise.all(input.items.map((item) => getProductById(item.productId)));
  if (products.some((item) => !item)) throw new Error("unknown_product");

  const subtotal = input.items.reduce((sum, item, index) => {
    return sum + discountedPrice(products[index] as Record<string, unknown>) * item.qty;
  }, 0);

  const orderId = crypto.randomUUID();
  const transactionId = crypto.randomUUID();
  const orderNumber = `ORD-${Date.now().toString().slice(-8)}`;
  const qrPayload = signedQrPayload({
    transactionId,
    amountCents: subtotal,
    currency: "ZAR",
    customerId: customer.email,
  });
  const ipGeo = await lookupIpGeo(input.requestIp || "", input.riskContext?.clientGeo);
  const riskAssessment = assessGeoRisk({
    ipAddress: input.requestIp || input.riskContext?.clientGeo?.ip || "",
    ipGeo,
    deliveryGeo: validatedAddress,
    amountCents: subtotal,
    deviceFingerprint: input.riskContext?.deviceFingerprint,
    otpVerified: input.riskContext?.otpVerified,
    saidVerified: input.riskContext?.saidVerified,
  });

  await pool.query(
    `insert into orders
      (id, order_number, customer_id, partner_code, delivery_snapshot, subtotal_cents, delivery_cents, total_cents, currency, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,'ZAR','awaiting_payment')`,
    [
      orderId,
      orderNumber,
      customer.id,
      "amazon",
      JSON.stringify({
        ...input.delivery,
        city: resolvedDelivery.city,
        province: resolvedDelivery.province,
        postalCode: resolvedDelivery.postalCode,
        validatedAddress,
        riskAssessment,
      }),
      subtotal,
      0,
      subtotal,
    ],
  );

  for (let index = 0; index < input.items.length; index += 1) {
    const row = products[index] as Record<string, unknown>;
    const item = input.items[index];
    const unit = discountedPrice(row);
    await pool.query(
      `insert into order_items
        (order_id, product_id, product_name, brand, product_snapshot, quantity, unit_price_cents, discount_pct, line_total_cents)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [orderId, row.id, row.name, row.brand, JSON.stringify(row), item.qty, unit, Number(row.discount_pct || 0), unit * item.qty],
    );
  }

  await pool.query(
    `insert into transactions
      (id, order_id, external_ref, customer_id, amount_cents, currency, payment_method, gateway, gateway_status, credit_tier, qr_payload, status,
       risk_score, risk_level, risk_decision, risk_factors, ip_address, ip_city, ip_province, ip_country, ip_postal_code, ip_latitude, ip_longitude,
       device_fingerprint, validated_city, validated_province, validated_postal_code, validated_latitude, validated_longitude, verified_status)
     values ($1,$2,$3,$4,$5,'ZAR',$6,$7,'Awaiting_Payment',null,$8,'Awaiting_Payment',
       $9,$10,$11,$12::jsonb,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)`,
    [
      transactionId,
      orderId,
      null,
      customer.email,
      subtotal,
      input.paymentMethod,
      paymentMethodMeta[input.paymentMethod].gateway,
      qrPayload,
      riskAssessment.score,
      riskAssessment.score >= 70 ? "high" : riskAssessment.score >= 40 ? "medium" : "low",
      riskAssessment.decision,
      JSON.stringify(riskAssessment.factors),
      riskAssessment.ipAddress,
      riskAssessment.ipGeo.city,
      riskAssessment.ipGeo.province,
      riskAssessment.ipGeo.country,
      riskAssessment.ipGeo.postalCode,
      riskAssessment.ipGeo.latitude,
      riskAssessment.ipGeo.longitude,
      input.riskContext?.deviceFingerprint || "",
      validatedAddress.city,
      validatedAddress.province,
      validatedAddress.postalCode,
      validatedAddress.latitude,
      validatedAddress.longitude,
      riskAssessment.verifiedStatus,
    ],
  );

  await pool.query(
    `insert into audit_entries (transaction_id, order_id, actor, action, data)
     values ($1,$2,$3,'order.created',$4)`,
    [
      transactionId,
      orderId,
      input.actor,
      JSON.stringify({
        items: input.items,
        delivery: {
          ...input.delivery,
          city: resolvedDelivery.city,
          province: resolvedDelivery.province,
          postalCode: resolvedDelivery.postalCode,
        },
        paymentMethod: input.paymentMethod,
      }),
    ],
  );

  await pool.query(
    `insert into audit_entries (transaction_id, order_id, actor, action, data)
     values ($1,$2,$3,'payment.awaiting',$4)`,
    [
      transactionId,
      orderId,
      input.actor,
      JSON.stringify({
        gateway: paymentMethodMeta[input.paymentMethod].gateway,
        gatewayStatus: "Awaiting_Payment",
        status: "Awaiting_Payment",
        note: "Settlement will occur after PED payment is completed at delivery.",
      }),
    ],
  );

  await pool.query(
    `insert into audit_entries (transaction_id, order_id, actor, action, data)
     values ($1,$2,$3,'risk.assessed',$4)`,
    [transactionId, orderId, input.actor, JSON.stringify(riskAssessment)],
  );

  const tx = await pool.query("select * from transactions where id = $1", [transactionId]);
  return { transaction: tx.rows[0], qrPayload, riskAssessment };
}

export async function settleOrder(input: {
  actor: string;
  id: string;
  paymentMethod: PaymentMethod;
  settlementBank?: SettlementBank;
  notifyEmail?: string;
  notifyChannels?: Array<"sms" | "email">;
}) {
  const pool = getPool();
  const txResult = await pool.query("select * from transactions where id = $1 limit 1", [input.id]);
  const tx = txResult.rows[0];
  if (!tx) throw new Error("not_found");

  const gateway = paymentMethodMeta[input.paymentMethod].gateway;
  const creditEligible = !paymentMethodMeta[input.paymentMethod].requiresCreditVet || ["A", "B"].includes(String(tx.credit_tier || "A"));
  if (!creditEligible) {
    await pool.query("update transactions set payment_method = $2, gateway = $3, gateway_status = 'declined', status = 'failed', updated_at = now() where id = $1", [input.id, input.paymentMethod, gateway]);
    throw new Error("payment_declined");
  }

  await pool.query(
    `update transactions
     set payment_method = $2, gateway = $3, gateway_status = 'settled', status = 'reconciled',
         external_ref = $4, reconciled_at = now(), settled_at = now(), updated_at = now()
     where id = $1`,
    [input.id, input.paymentMethod, gateway, `live_${String(input.id).slice(0, 8)}`],
  );

  await pool.query("update orders set status = 'reconciled', updated_at = now() where id = $1", [tx.order_id]);

  const safeBank = bankAccounts[input.settlementBank || "absa"] ? (input.settlementBank || "absa") : "absa";
  const bank = bankAccounts[safeBank];
  await pool.query(
    `insert into payment_settlements
      (transaction_id, settlement_bank, bank_label, account_ref, amount_cents, currency, settled_at)
     values ($1,$2,$3,$4,$5,'ZAR',now())`,
    [input.id, safeBank, bank.bankLabel, bank.accountRef, tx.amount_cents],
  );

  for (const channel of input.notifyChannels || ["sms", "email"]) {
    await pool.query(
      `insert into payment_notifications (transaction_id, channel, destination, status, message)
       values ($1,$2,$3,'sent',$4)`,
      [
        input.id,
        channel,
        channel === "email" ? input.notifyEmail || "customer@example.com" : "+27XXXXXXXXX",
        `Funds settled into ${bank.bankLabel} (${bank.accountRef}).`,
      ],
    );
  }

  const existingProcess = await pool.query("select * from delivery_processes where transaction_id = $1 limit 1", [input.id]);
  if (!existingProcess.rows[0]) {
    await pool.query(
      `insert into delivery_processes (order_id, transaction_id, status, progress_pct, active_step, started_at, updated_at)
       values ($1,$2,'active',0,1,now(),now())`,
      [tx.order_id, input.id],
    );
    const process = await pool.query("select id from delivery_processes where transaction_id = $1 limit 1", [input.id]);
    for (let index = 0; index < deliverySteps.length; index += 1) {
      const step = deliverySteps[index];
      await pool.query(
        `insert into delivery_process_steps (delivery_process_id, step_index, title, detail, status)
         values ($1,$2,$3,$4,$5)`,
        [process.rows[0].id, index + 1, step.title, step.detail, index === 0 ? "active" : "pending"],
      );
    }
  }

  await pool.query(
    `insert into audit_entries (transaction_id, order_id, actor, action, data)
     values ($1,$2,$3,'payment.settled',$4)`,
    [input.id, tx.order_id, input.actor, JSON.stringify({ paymentMethod: input.paymentMethod, gateway, settlementBank: safeBank })],
  );

  const updatedTx = await pool.query("select * from transactions where id = $1", [input.id]);
  const settlement = await pool.query("select * from payment_settlements where transaction_id = $1 order by created_at desc limit 1", [input.id]);
  const notifications = await pool.query("select * from payment_notifications where transaction_id = $1 order by sent_at asc", [input.id]);
  const notificationRows = notifications.rows as any[];
  return {
    transaction: updatedTx.rows[0],
    settlement: {
      bank: safeBank,
      bankLabel: settlement.rows[0].bank_label,
      accountRef: settlement.rows[0].account_ref,
      settledAt: settlement.rows[0].settled_at,
      amountCents: settlement.rows[0].amount_cents,
      currency: settlement.rows[0].currency,
    },
    notifications: notificationRows.map((row: any) => ({
      channel: row.channel,
      destination: row.destination,
      status: row.status,
      sentAt: row.sent_at,
      message: row.message,
    })),
  };
}

export async function getOrder(id: string) {
  const pool = getPool();
  const txResult = await pool.query("select * from transactions where id = $1 limit 1", [id]);
  const tx = txResult.rows[0];
  if (!tx) return null;
  const order = tx.order_id ? await pool.query("select * from orders where id = $1 limit 1", [tx.order_id]) : { rows: [] };
  const items = tx.order_id ? await pool.query("select * from order_items where order_id = $1 order by created_at asc", [tx.order_id]) : { rows: [] };
  const audit = await pool.query("select at, actor, action, data from audit_entries where transaction_id = $1 order by at asc, id asc", [id]);
  return {
    transaction: tx,
    details: {
      order: order.rows[0] || null,
      items: items.rows,
    },
    audit: audit.rows,
  };
}

export async function getDeliveryProcess(id: string) {
  const pool = getPool();
  const processResult = await pool.query("select * from delivery_processes where transaction_id = $1 limit 1", [id]);
  const process = processResult.rows[0];
  if (!process) return null;
  const stepsResult = await pool.query("select * from delivery_process_steps where delivery_process_id = $1 order by step_index asc", [process.id]);
  const startedAtMs = process.started_at ? new Date(process.started_at).getTime() : Date.now();
  const stepDurationMs = 6000;
  const totalSteps = stepsResult.rows.length || deliverySteps.length;
  const elapsedMs = Math.max(0, Date.now() - startedAtMs);
  const maxDurationMs = totalSteps * stepDurationMs;
  const completed = elapsedMs >= maxDurationMs;
  const activeStep = completed ? null : Math.min(totalSteps, Math.floor(elapsedMs / stepDurationMs) + 1);
  const progressPct = Math.max(0, Math.min(100, Math.round((elapsedMs / maxDurationMs) * 100)));

  const stepRows = stepsResult.rows as any[];
  const steps = stepRows.map((row: any, index: number) => {
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
  const pool = getPool();
  const result = await pool.query("select status, amount_cents from transactions");
  const items = result.rows as any[];
  return {
    live: items.length,
    completed: items.filter((row: any) => row.status === "reconciled").length,
    failed: items.filter((row: any) => row.status === "failed").length,
    processing: items.filter((row: any) => ["processing", "initiated", "Awaiting_Payment"].includes(String(row.status))).length,
    grossCents: items.filter((row: any) => row.status === "reconciled").reduce((sum: number, row: any) => sum + Number(row.amount_cents || 0), 0),
  };
}

export async function sponsorOrders() {
  const pool = getPool();
  const result = await pool.query("select * from transactions order by created_at desc");
  return {
    items: result.rows,
  };
}
