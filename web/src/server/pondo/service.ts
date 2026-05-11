import crypto from "crypto";
import jwt from "jsonwebtoken";
import { DEMO_CATALOG } from "@/lib/demoCatalog";
import type {
  AdminDashboardData,
  AdminDashboardPeriod,
  CheckoutRecord,
  CheckoutStatus,
  KpiMetric,
  KycPieSlice,
  KycAuditRecord,
  KycTrendPoint,
  PartnerPerformancePoint,
  RevenueTrendPoint,
  TxVolumePoint,
  VerificationState,
} from "@/types/admin";
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

const demoCatalogBySku = new Map(DEMO_CATALOG.map((product) => [product.id, product]));
let demoCatalogSeedPromise: Promise<void> | null = null;

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
  experianIncome?: number | null;
  fraudScore: number;
  approved: boolean;
  documentContext?: {
    identityDocumentType?: "sa_id" | "drivers_licence";
    identityDocumentUploaded?: boolean;
    identityDocumentFileName?: string;
    proofOfAddressRequired?: boolean;
    proofOfAddressUploaded?: boolean;
    proofOfAddressFileName?: string;
    documentAnalysis?: Record<string, unknown> | null;
  };
  projectedScore?: number;
  projectedDecision?: "auto_approve" | "elevated_verification" | "manual_review_hold";
  projectedFactors?: string[];
  city?: string;
  province?: string;
  postalCode?: string;
};

type RiskDocumentContext = {
  identityDocumentType?: "sa_id" | "drivers_licence";
  identityDocumentUploaded?: boolean;
  identityDocumentFileName?: string;
  proofOfAddressRequired?: boolean;
  proofOfAddressUploaded?: boolean;
  proofOfAddressFileName?: string;
  documentAnalysis?: Record<string, unknown> | null;
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

async function ensureDemoCatalogSeeded() {
  if (!demoCatalogSeedPromise) {
    demoCatalogSeedPromise = (async () => {
      const pool = getPool();
      for (const category of Array.from(new Set(DEMO_CATALOG.map((product) => product.category)))) {
        await pool.query(
          `insert into ${table("product_categories")} (name)
           values ($1)
           on conflict (name) do nothing`,
          [category],
        );
      }

      for (const product of DEMO_CATALOG) {
        const categoryRow = await queryOne<{ id: string }>(
          `select id from ${table("product_categories")} where name = $1 limit 1`,
          [product.category],
        );
        if (!categoryRow) continue;

        const productRow = await queryOne<{ id: string }>(
          `insert into ${table("products")} (sku, category_id, brand, name, description, merchant_name, is_active)
           values ($1,$2,$3,$4,$5,$6,true)
           on conflict (sku) do update
           set category_id = excluded.category_id,
               brand = excluded.brand,
               name = excluded.name,
               description = excluded.description,
               merchant_name = excluded.merchant_name,
               is_active = excluded.is_active,
               updated_at = now()
           returning id`,
          [
            product.id,
            categoryRow.id,
            product.brand,
            product.name,
            product.description,
            product.merchantName,
          ],
        );
        if (!productRow) continue;

        const activePrice = await queryOne<{ amount_cents: string | number; discount_pct: string | number | null }>(
          `select amount_cents, discount_pct
           from ${table("product_prices")}
           where product_id = $1 and currency = 'ZAR' and effective_to is null
           order by effective_from desc
           limit 1`,
          [productRow.id],
        );

        const activeAmount = activePrice ? Number(activePrice.amount_cents) : null;
        const activeDiscount = activePrice ? Number(activePrice.discount_pct || 0) : null;
        if (activeAmount === product.priceCents && activeDiscount === product.discountPct) {
          continue;
        }

        if (activePrice) {
          await pool.query(
            `update ${table("product_prices")}
             set effective_to = now()
             where product_id = $1 and currency = 'ZAR' and effective_to is null`,
            [productRow.id],
          );
        }

        await pool.query(
          `insert into ${table("product_prices")} (product_id, currency, amount_cents, discount_pct, effective_from)
           values ($1,'ZAR',$2,$3,now())`,
          [productRow.id, product.priceCents, product.discountPct],
        );
      }
    })().catch((error) => {
      demoCatalogSeedPromise = null;
      throw error;
    });
  }

  await demoCatalogSeedPromise;
}

function formatTime(iso: string | Date | null, withSeconds = false) {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("en-ZA", {
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" } : {}),
    hour12: false,
  }).format(new Date(iso));
}

function formatMonthDayLabel(date: Date) {
  return new Intl.DateTimeFormat("en-ZA", { day: "2-digit", month: "short" }).format(date);
}

function formatHourLabel(date: Date) {
  return new Intl.DateTimeFormat("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

function startOfDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfWeek(date = new Date()) {
  const day = date.getDay();
  const diff = (day + 6) % 7;
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() - diff);
  return result;
}

function formatWeekLabel(date: Date) {
  const month = new Intl.DateTimeFormat("en-ZA", { month: "short" }).format(date);
  const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  const weekIndex = Math.floor((date.getDate() + firstDayOfMonth.getDay() - 1) / 7) + 1;
  return `W${weekIndex} ${month}`;
}

function getAdminDashboardWindow(period: AdminDashboardPeriod = "this_month") {
  const now = new Date();
  if (period === "today") {
    const from = startOfDay(now);
    return {
      period,
      label: "Today",
      compareLabel: "Yesterday",
      dateFrom: from.toISOString(),
      dateTo: now.toISOString(),
    };
  }

  if (period === "this_week") {
    const from = startOfWeek(now);
    return {
      period,
      label: "This Week",
      compareLabel: "Last Week",
      dateFrom: from.toISOString(),
      dateTo: now.toISOString(),
    };
  }

  if (period === "last_month") {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      period,
      label: "Last Month",
      compareLabel: "Previous Month",
      dateFrom: from.toISOString(),
      dateTo: to.toISOString(),
    };
  }

  const from = startOfMonth(now);
  const to = now;
  return {
    period,
    label: "This Month",
    compareLabel: "Last Month",
    dateFrom: from.toISOString(),
    dateTo: to.toISOString(),
  };
}

function getAdminDashboardComparisonWindow(window: ReturnType<typeof getAdminDashboardWindow>) {
  const from = new Date(window.dateFrom);
  const to = new Date(window.dateTo);

  if (window.period === "today") {
    const compareFrom = new Date(from);
    compareFrom.setDate(compareFrom.getDate() - 1);
    const compareTo = new Date(compareFrom.getTime() + (to.getTime() - from.getTime()));
    return { dateFrom: compareFrom.toISOString(), dateTo: compareTo.toISOString() };
  }

  if (window.period === "this_week") {
    const compareFrom = new Date(from);
    compareFrom.setDate(compareFrom.getDate() - 7);
    const compareTo = new Date(compareFrom.getTime() + (to.getTime() - from.getTime()));
    return { dateFrom: compareFrom.toISOString(), dateTo: compareTo.toISOString() };
  }

  if (window.period === "last_month") {
    const compareFrom = new Date(from.getFullYear(), from.getMonth() - 1, 1);
    return { dateFrom: compareFrom.toISOString(), dateTo: from.toISOString() };
  }

  const compareFrom = new Date(from.getFullYear(), from.getMonth() - 1, 1);
  const monthBoundary = from;
  const compareTo = new Date(compareFrom.getTime() + (to.getTime() - from.getTime()));
  return {
    dateFrom: compareFrom.toISOString(),
    dateTo: (compareTo > monthBoundary ? monthBoundary : compareTo).toISOString(),
  };
}

function formatRevenueDelta(currentCents: number, compareCents: number, compareLabel: string) {
  if (compareCents === 0) {
    return currentCents === 0 ? `No processed revenue in ${compareLabel.toLowerCase()}` : `No processed revenue recorded in ${compareLabel.toLowerCase()}`;
  }

  const deltaPct = ((currentCents - compareCents) / compareCents) * 100;
  const direction = deltaPct >= 0 ? "+" : "";
  return `${direction}${deltaPct.toFixed(1)}% vs ${compareLabel}`;
}

function formatMoneyFromCents(amountCents: number) {
  return `R ${Math.round(amountCents / 100).toLocaleString("en-ZA").replaceAll(",", " ")}`;
}

function toRandUnits(amountCents: number) {
  return Math.round(amountCents / 100);
}

function verificationFromCheck(status?: string | null, approved?: boolean | null): VerificationState {
  if (typeof approved === "boolean") return approved ? "PASS" : "FAIL";
  switch (status) {
    case "approved":
      return "PASS";
    case "declined":
      return "FAIL";
    case "manual_review":
      return "REVIEW";
    case "pending":
      return "PENDING";
    default:
      return "N_A";
  }
}

function checkoutStatusFromRow(input: {
  paymentStatus: string;
  deliveryStatus?: string | null;
  riskDecision?: string | null;
  reviewStatus?: string | null;
}): CheckoutStatus {
  if (input.reviewStatus === "open" || input.reviewStatus === "assigned" || input.riskDecision === "manual_review") {
    return "BLOCKED";
  }
  if (input.deliveryStatus === "active") return "IN_TRANSIT";
  if (input.paymentStatus === "reconciled") return "COMPLETED";
  return "PENDING";
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
  await ensureDemoCatalogSeeded();
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
  const catalogProduct = demoCatalogBySku.get(row.sku);
  return {
    id: row.id,
    sku: row.sku,
    brand: row.brand,
    name: row.name,
    category: row.category,
    priceCents: Number(row.price_cents),
    discountPct: Number(row.discount_pct || 0),
    stock: catalogProduct?.stock ?? demoStockForCategory(row.category),
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
  return await queryOne<{ id: string; decision: string; verification_status: string; score: number; payload: Record<string, unknown> }>(
    `select id, decision, verification_status, score, payload
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
  const review = row.checkout_session_id
    ? await queryOne<{ status: string | null }>(
        `select mrc.status
         from ${table("manual_review_cases")} mrc
         join ${table("verification_cases")} vc on vc.id = mrc.verification_case_id
         where vc.checkout_session_id = $1
         order by mrc.opened_at desc
         limit 1`,
        [row.checkout_session_id],
      )
    : null;
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
    review_status: review?.status ?? null,
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
  await ensureDemoCatalogSeeded();
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
    items: rows.rows.map((row) => {
      const catalogProduct = demoCatalogBySku.get(row.sku);
      return {
        id: row.sku,
        brand: row.brand,
        name: row.name,
        category: row.category,
        priceCents: Number(row.price_cents),
        discountPct: Number(row.discount_pct || 0),
        rating: catalogProduct?.rating ?? 4.7,
        stock: catalogProduct?.stock ?? demoStockForCategory(row.category),
        merchantName: row.merchant_name || "TechHub SA",
      };
    }),
    categories: categories.rows.map((row) => row.category),
  };
}

async function syncDocumentContextToLatestRisk(sessionId: string, documentContext: RiskDocumentContext) {
  const latestRisk = await getLatestRiskAssessment(sessionId);
  if (!latestRisk) return;

  const currentPayload =
    latestRisk.payload && typeof latestRisk.payload === "object" && !Array.isArray(latestRisk.payload)
      ? latestRisk.payload
      : {};
  const mergedPayload = {
    ...currentPayload,
    documentContext: {
      ...(((currentPayload as { documentContext?: Record<string, unknown> }).documentContext) || {}),
      ...documentContext,
    },
  };

  await getPool().query(
    `update ${table("risk_assessments")}
     set payload = $2
     where id = $1`,
    [latestRisk.id, JSON.stringify(mergedPayload)],
  );

  await getPool().query(
    `update ${table("kyc_checks")}
     set response_payload = jsonb_set(
       coalesce(response_payload, '{}'::jsonb),
       '{documentContext}',
       $2::jsonb,
       true
     )
     where checkout_session_id = $1`,
    [sessionId, JSON.stringify(documentContext)],
  );
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
  const affordabilityIncome = input.experianIncome ?? null;
  const documentContext = input.documentContext || {};
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
            Math.round((input.transunionApproved ? 10 : 45) + input.fraudScore * 100),
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
        experianIncome: affordabilityIncome,
        fraudScore: input.fraudScore,
        documentContext,
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
      ($1,'fraud',$5,'pondo-python','fraud-demo',now()),
      ($1,'manual_review',$6,'pondo','manual-review-demo',now())`,
    [
      caseRow.id,
      input.kycIdentityVerified ? "approved" : "declined",
      input.transunionApproved ? "approved" : "declined",
      input.bureau,
      requiresManualReview ? "declined" : "approved",
      requiresManualReview ? "pending" : "skipped",
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
     values ($1,$2,'pondo','kyc-demo',$3,$4,$5)`,
    [
      caseRow.id,
      session.id,
      documentContext.identityDocumentType || "sa_id",
      input.kycIdentityVerified ? "approved" : "declined",
      JSON.stringify({
        identityVerified: input.kycIdentityVerified,
        documentContext,
      }),
    ],
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
      [
        caseRow.id,
        documentContext.proofOfAddressRequired
          ? "Automated risk checks require manual review and proof-of-address review."
          : "Automated risk checks require manual review.",
      ],
    );
  }

  await getPool().query(
    `update ${table("checkout_sessions")}
     set current_step = 'risk_checks',
         status = $2,
         risk_completed_at = now(),
         updated_at = now()
     where id = $1`,
    [session.id, requiresManualReview ? "risk_failed" : "risk_approved"],
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
    documentContext?: RiskDocumentContext;
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
    if (input.riskContext?.documentContext) {
      await syncDocumentContextToLatestRisk(session.id, input.riskContext.documentContext);
    }
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

  await ensureDeliveryProcessStarted(transaction.order_id, transaction.id);

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

  const latestRisk = transaction.checkout_session_id ? await getLatestRiskAssessment(transaction.checkout_session_id) : null;
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
      riskAssessment: latestRisk
        ? {
            id: latestRisk.id,
            decision: latestRisk.decision,
            verificationStatus: latestRisk.verification_status,
            score: latestRisk.score,
            payload: latestRisk.payload,
          }
        : null,
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

export async function resolveManualReview(input: {
  actor: string;
  transactionId: string;
  decision: "approved" | "declined";
}) {
  const transaction = await getPaymentTransactionById(input.transactionId);
  if (!transaction) throw new Error("not_found");
  if (!transaction.checkout_session_id) throw new Error("manual_review_not_found");

  const reviewCase = await queryOne<{
    id: string;
    verification_case_id: string;
    status: string;
  }>(
    `select mrc.id, mrc.verification_case_id, mrc.status
     from ${table("manual_review_cases")} mrc
     join ${table("verification_cases")} vc on vc.id = mrc.verification_case_id
     where vc.checkout_session_id = $1
     order by mrc.opened_at desc
     limit 1`,
    [transaction.checkout_session_id],
  );
  if (!reviewCase) throw new Error("manual_review_not_found");

  await getPool().query(
    `update ${table("manual_review_cases")}
     set status = $2,
         resolved_at = now()
     where id = $1`,
    [reviewCase.id, input.decision],
  );

  await getPool().query(
    `update ${table("verification_cases")}
     set status = $2,
         closed_at = now()
     where id = $1`,
    [reviewCase.verification_case_id, input.decision === "approved" ? "approved" : "declined"],
  );

  if (input.decision === "approved") {
    await getPool().query(
      `update ${table("payment_transactions")}
       set status = 'processing',
           updated_at = now()
       where id = $1`,
      [transaction.id],
    );
    await getPool().query(
      `update ${table("checkout_sessions")}
       set current_step = 'delivery_tracking',
           status = 'payment_pending',
           updated_at = now()
       where id = $1`,
      [transaction.checkout_session_id],
    );
    await getPool().query(
      `update ${table("orders")}
       set status = 'processing',
           updated_at = now()
       where id = $1`,
      [transaction.order_id],
    );
    await getPool().query(
      `insert into ${table("order_status_history")}
        (order_id, from_status, to_status, reason, changed_by)
       values ($1,'created','processing','Manual review approved - released to fulfilment',$2)`,
      [transaction.order_id, input.actor],
    );
    await ensureDeliveryProcessStarted(transaction.order_id, transaction.id);
    await createCheckoutSessionEvent(transaction.checkout_session_id, "manual_review.approved", input.actor, {
      paymentTransactionId: transaction.id,
      reviewCaseId: reviewCase.id,
    });
  } else {
    await getPool().query(
      `update ${table("checkout_sessions")}
       set current_step = 'completed',
           status = 'risk_failed',
           updated_at = now()
       where id = $1`,
      [transaction.checkout_session_id],
    );
    await getPool().query(
      `update ${table("orders")}
       set status = 'cancelled',
           updated_at = now()
       where id = $1`,
      [transaction.order_id],
    );
    await getPool().query(
      `update ${table("payment_transactions")}
       set status = 'cancelled',
           gateway_status = 'failed',
           updated_at = now()
       where id = $1`,
      [transaction.id],
    );
    await getPool().query(
      `insert into ${table("order_status_history")}
        (order_id, from_status, to_status, reason, changed_by)
       values ($1,'created','cancelled','Manual review declined',$2)`,
      [transaction.order_id, input.actor],
    );
    await createCheckoutSessionEvent(transaction.checkout_session_id, "manual_review.declined", input.actor, {
      paymentTransactionId: transaction.id,
      reviewCaseId: reviewCase.id,
    });
  }

  await createAuditEvent({
    category: "verification",
    actorType: "admin",
    actorId: input.actor,
    customerId: transaction.customer_id,
    checkoutSessionId: transaction.checkout_session_id,
    orderId: transaction.order_id,
    paymentTransactionId: transaction.id,
    resourceType: "manual_review_case",
    resourceId: reviewCase.id,
    action: input.decision === "approved" ? "manual_review.approved" : "manual_review.declined",
    metadata: { transactionId: transaction.id },
  });

  const updated = await getPaymentTransactionById(transaction.id);
  if (!updated) throw new Error("payment_fetch_failed");
  return { transaction: await mapTransaction(updated) };
}

async function ensureDeliveryProcessStarted(orderId: string, paymentTransactionId: string) {
  const existingProcess = await queryOne<{ id: string }>(
    `select id from ${table("delivery_processes")} where payment_transaction_id = $1 limit 1`,
    [paymentTransactionId],
  );
  let processId = existingProcess?.id || null;
  if (!processId) {
    const created = await queryOne<{ id: string }>(
      `insert into ${table("delivery_processes")}
        (order_id, payment_transaction_id, status, progress_pct, active_step, started_at, updated_at)
       values ($1,$2,'active',0,1,now(),now())
       returning id`,
      [orderId, paymentTransactionId],
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
}

export async function getAdminDashboard(options?: { period?: AdminDashboardPeriod }): Promise<AdminDashboardData> {
  const window = getAdminDashboardWindow(options?.period || "this_month");
  const comparisonWindow = getAdminDashboardComparisonWindow(window);
  const periodValues = [window.dateFrom, window.dateTo];
  const comparePeriodValues = [comparisonWindow.dateFrom, comparisonWindow.dateTo];

  const [recentRows, kycRows, settlementRow, reviewRow, reviewQueueRows, orderStatusRows, txVolumeRows, kycTrendRows, partnerRows, revenueCurrentRows, revenueCompareRows] = await Promise.all([
    getPool().query<{
      transaction_id: string;
      created_at: string;
      amount_cents: number;
      payment_status: string;
      customer_name: string | null;
      product_name: string | null;
      partner_name: string | null;
      credit_approved: boolean | null;
      kyc_status: string | null;
      fraud_status: string | null;
      risk_decision: string | null;
      review_status: string | null;
      delivery_status: string | null;
    }>(
      `select pt.id as transaction_id,
              pt.created_at,
              pt.amount_cents,
              pt.status as payment_status,
              cp.full_name as customer_name,
              oi.product_name,
              p.display_name as partner_name,
              cc.approved as credit_approved,
              kc.result_status as kyc_status,
              fc.result_status as fraud_status,
              ra.decision as risk_decision,
              mrc.status as review_status,
              dp.status as delivery_status
       from ${table("payment_transactions")} pt
       join ${table("orders")} o on o.id = pt.order_id
       join ${table("customer_profiles")} cp on cp.id = pt.customer_id
       left join ${table("partners")} p on p.id = o.partner_id
       left join lateral (
         select product_name
         from ${table("order_items")}
         where order_id = o.id
         order by id asc
         limit 1
       ) oi on true
       left join lateral (
         select decision
         from ${table("risk_assessments")}
         where checkout_session_id = pt.checkout_session_id
         order by assessed_at desc
         limit 1
       ) ra on true
       left join lateral (
         select approved
         from ${table("credit_checks")}
         where checkout_session_id = pt.checkout_session_id
         order by checked_at desc
         limit 1
       ) cc on true
       left join lateral (
         select result_status
         from ${table("kyc_checks")}
         where checkout_session_id = pt.checkout_session_id
         order by checked_at desc
         limit 1
       ) kc on true
       left join lateral (
         select result_status
         from ${table("fraud_checks")}
         where checkout_session_id = pt.checkout_session_id
         order by checked_at desc
         limit 1
       ) fc on true
       left join lateral (
         select status
         from ${table("manual_review_cases")} mrc
         join ${table("verification_cases")} vc on vc.id = mrc.verification_case_id
         where vc.checkout_session_id = pt.checkout_session_id
         order by mrc.opened_at desc
         limit 1
       ) mrc on true
       left join lateral (
         select status
         from ${table("delivery_processes")}
         where payment_transaction_id = pt.id
         order by updated_at desc nulls last, started_at desc nulls last
         limit 1
       ) dp on true
       where pt.created_at >= $1
         and pt.created_at < $2
       order by pt.created_at desc
       limit 20`,
      periodValues,
    ),
    getPool().query<{
      assessment_id: string;
      assessed_at: string;
      customer_name: string | null;
      amount_cents: number | null;
      product_name: string | null;
      verification_status: string;
      decision: string;
      credit_approved: boolean | null;
      kyc_status: string | null;
      fraud_status: string | null;
      review_status: string | null;
    }>(
      `select ra.id as assessment_id,
              ra.assessed_at,
              cp.full_name as customer_name,
              o.total_cents as amount_cents,
              oi.product_name,
              ra.verification_status,
              ra.decision,
              cc.approved as credit_approved,
              kc.result_status as kyc_status,
              fc.result_status as fraud_status,
              mrc.status as review_status
       from ${table("risk_assessments")} ra
       join ${table("customer_profiles")} cp on cp.id = ra.customer_id
       left join ${table("orders")} o on o.id = ra.order_id
       left join lateral (
         select product_name
         from ${table("order_items")}
         where order_id = o.id
         order by id asc
         limit 1
       ) oi on true
       left join lateral (
         select approved
         from ${table("credit_checks")}
         where checkout_session_id = ra.checkout_session_id
         order by checked_at desc
         limit 1
       ) cc on true
       left join lateral (
         select result_status
         from ${table("kyc_checks")}
         where checkout_session_id = ra.checkout_session_id
         order by checked_at desc
         limit 1
       ) kc on true
       left join lateral (
         select result_status
         from ${table("fraud_checks")}
         where checkout_session_id = ra.checkout_session_id
         order by checked_at desc
         limit 1
       ) fc on true
       left join lateral (
         select mrc.status
         from ${table("manual_review_cases")} mrc
         join ${table("verification_cases")} vc on vc.id = mrc.verification_case_id
         where vc.checkout_session_id = ra.checkout_session_id
         order by mrc.opened_at desc
         limit 1
       ) mrc on true
       where ra.assessed_at >= $1
         and ra.assessed_at < $2
       order by ra.assessed_at desc
       limit 20`,
      periodValues,
    ),
    queryOne<{
      reconciled_count: string | number;
      pending_count: string | number;
      reconciled_gross_cents: string | number;
      settled_net_cents: string | number;
      pending_gross_cents: string | number;
      latest_settled_at: string | null;
    }>(
      `select
          count(*) filter (where pt.status = 'reconciled') as reconciled_count,
          count(*) filter (where pt.status in ('initiated', 'authorized', 'processing')) as pending_count,
          coalesce(sum(case when pt.status = 'reconciled' then pt.amount_cents else 0 end), 0) as reconciled_gross_cents,
          coalesce(sum(ps.net_amount_cents), 0) as settled_net_cents,
          coalesce(sum(case when pt.status in ('initiated', 'authorized', 'processing') then pt.amount_cents else 0 end), 0) as pending_gross_cents,
          max(ps.settled_at) as latest_settled_at
       from ${table("payment_transactions")} pt
       left join ${table("payment_settlements")} ps on ps.payment_transaction_id = pt.id
       where coalesce(ps.settled_at, pt.reconciled_at, pt.created_at) >= $1
         and coalesce(ps.settled_at, pt.reconciled_at, pt.created_at) < $2`,
      periodValues,
    ),
    queryOne<{
      open_count: string | number;
      assigned_count: string | number;
      resolved_count: string | number;
      latest_opened_at: string | null;
    }>(
      `select
          count(*) filter (where status = 'open') as open_count,
          count(*) filter (where status = 'assigned') as assigned_count,
          count(*) filter (where status in ('approved', 'declined', 'cancelled')) as resolved_count,
          max(opened_at) filter (where status in ('open', 'assigned')) as latest_opened_at
       from ${table("manual_review_cases")}
       where opened_at >= $1
         and opened_at < $2`,
      periodValues,
    ),
    getPool().query<{
      case_id: string;
      customer_name: string | null;
      reason: string;
      risk_decision: string | null;
      amount_cents: number | null;
      product_name: string | null;
      queue_name: string;
      status: string;
      opened_at: string;
    }>(
      `select mrc.id as case_id,
              cp.full_name as customer_name,
              mrc.reason,
              ra.decision as risk_decision,
              o.total_cents as amount_cents,
              oi.product_name,
              mrc.queue_name,
              mrc.status,
              mrc.opened_at
       from ${table("manual_review_cases")} mrc
       join ${table("verification_cases")} vc on vc.id = mrc.verification_case_id
       join ${table("customer_profiles")} cp on cp.id = vc.customer_id
       left join lateral (
         select decision, order_id
         from ${table("risk_assessments")}
         where checkout_session_id = vc.checkout_session_id
         order by assessed_at desc
         limit 1
       ) ra on true
       left join ${table("orders")} o on o.id = ra.order_id
       left join lateral (
         select product_name
         from ${table("order_items")}
         where order_id = o.id
         order by id asc
         limit 1
       ) oi on true
       where mrc.opened_at >= $1
         and mrc.opened_at < $2
       order by mrc.opened_at desc
       limit 12`,
      periodValues,
    ),
    getPool().query<{
      status: string;
      order_count: string | number;
      total_amount_cents: string | number;
    }>(
      `select o.status,
              count(*) as order_count,
              coalesce(sum(o.total_cents), 0) as total_amount_cents
       from ${table("orders")} o
       where o.created_at >= $1
         and o.created_at < $2
       group by o.status
       order by order_count desc, o.status asc`,
      periodValues,
    ),
    getPool().query<{
      bucket: string;
      completed: string | number;
      failed: string | number;
      pending: string | number;
    }>(
      `select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as bucket,
              count(*) filter (where status = 'reconciled') as completed,
              count(*) filter (where status in ('failed', 'cancelled', 'refunded')) as failed,
              count(*) filter (where status in ('initiated', 'authorized', 'processing')) as pending
       from ${table("payment_transactions")}
       where created_at >= $1
         and created_at < $2
       group by 1
       order by min(date_trunc('day', created_at)) asc`,
      periodValues,
    ),
    getPool().query<{
      day_bucket: string;
      cleared: string | number;
      review: string | number;
      blocked: string | number;
    }>(
      `select to_char(date_trunc('day', assessed_at), 'YYYY-MM-DD') as day_bucket,
              count(*) filter (where decision = 'auto_approve') as cleared,
              count(*) filter (where decision = 'manual_review') as review,
              count(*) filter (where decision not in ('auto_approve', 'manual_review')) as blocked
       from ${table("risk_assessments")}
       where assessed_at >= $1
         and assessed_at < $2
       group by 1
       order by min(date_trunc('day', assessed_at)) asc`,
      periodValues,
    ),
    getPool().query<{
      partner_name: string;
      orders_count: string | number;
      delivered_count: string | number;
    }>(
      `select coalesce(p.display_name, 'Direct') as partner_name,
              count(distinct o.id) as orders_count,
              count(distinct case when pt.status = 'reconciled' then o.id end) as delivered_count
       from ${table("orders")} o
       left join ${table("partners")} p on p.id = o.partner_id
       left join ${table("payment_transactions")} pt on pt.order_id = o.id
       where o.created_at >= $1
         and o.created_at < $2
       group by 1
       order by orders_count desc, partner_name asc
       limit 5`,
      periodValues,
    ),
    getPool().query<{
      revenue_at: string;
      revenue_cents: string | number;
    }>(
      `select coalesce(ps.settled_at, pt.reconciled_at, pt.created_at) as revenue_at,
              coalesce(ps.net_amount_cents, pt.amount_cents) as revenue_cents
       from ${table("payment_transactions")} pt
       left join ${table("payment_settlements")} ps on ps.payment_transaction_id = pt.id
       where coalesce(ps.settled_at, pt.reconciled_at, pt.created_at) >= $1
         and coalesce(ps.settled_at, pt.reconciled_at, pt.created_at) < $2
         and pt.status = 'reconciled'
       order by coalesce(ps.settled_at, pt.reconciled_at, pt.created_at) asc`,
      periodValues,
    ),
    getPool().query<{
      revenue_at: string;
      revenue_cents: string | number;
    }>(
      `select coalesce(ps.settled_at, pt.reconciled_at, pt.created_at) as revenue_at,
              coalesce(ps.net_amount_cents, pt.amount_cents) as revenue_cents
       from ${table("payment_transactions")} pt
       left join ${table("payment_settlements")} ps on ps.payment_transaction_id = pt.id
       where coalesce(ps.settled_at, pt.reconciled_at, pt.created_at) >= $1
         and coalesce(ps.settled_at, pt.reconciled_at, pt.created_at) < $2
         and pt.status = 'reconciled'
       order by coalesce(ps.settled_at, pt.reconciled_at, pt.created_at) asc`,
      comparePeriodValues,
    ),
  ]);

  const recentTransactions: CheckoutRecord[] = recentRows.rows.map((row) => ({
    id: row.transaction_id.slice(0, 8),
    consumer: row.customer_name || "Unknown customer",
    product: row.product_name || "Basket checkout",
    partner: row.partner_name || "Direct",
    amount: toRandUnits(Number(row.amount_cents || 0)),
    itc: verificationFromCheck(null, row.credit_approved),
    kyc: verificationFromCheck(row.kyc_status),
    vetting: verificationFromCheck(row.fraud_status),
    status: checkoutStatusFromRow({
      paymentStatus: row.payment_status,
      deliveryStatus: row.delivery_status,
      riskDecision: row.risk_decision,
      reviewStatus: row.review_status,
    }),
    driver: row.delivery_status === "active" ? "Dispatch active" : null,
    time: formatTime(row.created_at),
  }));

  const kycAuditRecords: KycAuditRecord[] = kycRows.rows.map((row) => {
    const status: KycAuditRecord["status"] =
      row.review_status === "open" || row.review_status === "assigned" || row.decision === "manual_review"
        ? "REVIEW"
        : row.decision === "auto_approve"
          ? "CLEARED"
          : "BLOCKED";

    return {
      ref: row.assessment_id.slice(0, 8),
      consumer: row.customer_name || "Unknown customer",
      saIdMasked: "Protected",
      itc: verificationFromCheck(null, row.credit_approved),
      kyc: verificationFromCheck(row.kyc_status),
      vetting: verificationFromCheck(row.fraud_status),
      status,
      time: formatTime(row.assessed_at, true),
      product: row.product_name || "Basket checkout",
      amount: toRandUnits(Number(row.amount_cents || 0)),
    };
  });

  const manualReview = {
    open: Number(reviewRow?.open_count || 0),
    assigned: Number(reviewRow?.assigned_count || 0),
    resolved: Number(reviewRow?.resolved_count || 0),
    latestOpenedAt: reviewRow?.latest_opened_at || null,
  };

  const manualReviewQueue = reviewQueueRows.rows.map((row) => ({
    id: row.case_id.slice(0, 8),
    customer: row.customer_name || "Unknown customer",
    reason: row.reason,
    riskDecision: row.risk_decision || "manual_review",
    amount: toRandUnits(Number(row.amount_cents || 0)),
    product: row.product_name || "Basket checkout",
    queue: row.queue_name,
    status: row.status,
    openedAt: row.opened_at,
  }));

  const orderStatuses = orderStatusRows.rows.map((row) => ({
    status: row.status,
    count: Number(row.order_count || 0),
    amount: toRandUnits(Number(row.total_amount_cents || 0)),
  }));

  const settlement = {
    reconciledCount: Number(settlementRow?.reconciled_count || 0),
    pendingCount: Number(settlementRow?.pending_count || 0),
    reconciledGross: toRandUnits(Number(settlementRow?.reconciled_gross_cents || 0)),
    settledNet: toRandUnits(Number(settlementRow?.settled_net_cents || 0)),
    pendingGross: toRandUnits(Number(settlementRow?.pending_gross_cents || 0)),
    latestSettledAt: settlementRow?.latest_settled_at || null,
  };

  const reviewBacklog = manualReview.open + manualReview.assigned;
  const clearanceBase = kycAuditRecords.length || 1;
  const clearanceRate = ((kycAuditRecords.filter((row) => row.status === "CLEARED").length / clearanceBase) * 100).toFixed(1);

  const txVolumeLookup = new Map(
    txVolumeRows.rows.map((row) => [
      row.bucket,
      {
        completed: Number(row.completed || 0),
        failed: Number(row.failed || 0),
        pending: Number(row.pending || 0),
      },
    ]),
  );
  const txVolumeData: TxVolumePoint[] = Array.from({ length: 8 }, (_, index) => {
    const rangeDays = Math.max(
      1,
      Math.ceil((new Date(window.dateTo).getTime() - new Date(window.dateFrom).getTime()) / (1000 * 60 * 60 * 24)),
    );
    const bucketDate = startOfDay(new Date(window.dateTo));
    const offset = Math.max(0, Math.floor((rangeDays - 1) * ((7 - index) / 7)));
    bucketDate.setDate(bucketDate.getDate() - offset);
    const key = bucketDate.toISOString().slice(0, 10);
    return {
      hour: formatMonthDayLabel(bucketDate),
      completed: txVolumeLookup.get(key)?.completed ?? 0,
      failed: txVolumeLookup.get(key)?.failed ?? 0,
      pending: txVolumeLookup.get(key)?.pending ?? 0,
    };
  });

  const kycTrendLookup = new Map(
    kycTrendRows.rows.map((row) => [
      row.day_bucket,
      {
        pass: Number(row.cleared || 0),
        review: Number(row.review || 0),
        fail: Number(row.blocked || 0),
      },
    ]),
  );
  const kycTrendData: KycTrendPoint[] = Array.from({ length: 7 }, (_, index) => {
    const rangeDays = Math.max(
      1,
      Math.ceil((new Date(window.dateTo).getTime() - new Date(window.dateFrom).getTime()) / (1000 * 60 * 60 * 24)),
    );
    const day = startOfDay(new Date(window.dateTo));
    const offset = Math.max(0, Math.floor((rangeDays - 1) * ((6 - index) / 6)));
    day.setDate(day.getDate() - offset);
    const key = day.toISOString().slice(0, 10);
    const point = kycTrendLookup.get(key);
    return {
      day: formatMonthDayLabel(day),
      pass: point?.pass ?? 0,
      review: point?.review ?? 0,
      fail: point?.fail ?? 0,
    };
  });

  const pieCounts = {
    cleared: kycAuditRecords.filter((row) => row.status === "CLEARED").length,
    review: kycAuditRecords.filter((row) => row.status === "REVIEW").length,
    blocked: kycAuditRecords.filter((row) => row.status === "BLOCKED").length,
    itcPass: kycAuditRecords.filter((row) => row.itc === "PASS").length,
    vettingPass: kycAuditRecords.filter((row) => row.vetting === "PASS").length,
  };
  const kycPieData: KycPieSlice[] = [
    { name: "ITC Pass", value: Math.max(pieCounts.itcPass, 0), color: "#34d399" },
    { name: "Cleared", value: Math.max(pieCounts.cleared, 0), color: "#4A7FA5" },
    { name: "Vetting Pass", value: Math.max(pieCounts.vettingPass, 0), color: "#1B2A4A" },
    { name: "Blocked", value: Math.max(pieCounts.blocked, 0), color: "#ef4444" },
    { name: "Review", value: Math.max(pieCounts.review, 0), color: "#f5b642" },
  ].filter((slice) => slice.value > 0);

  const partnerPerformanceData: PartnerPerformancePoint[] = partnerRows.rows.map((row) => {
    const orders = Number(row.orders_count || 0);
    const delivered = Number(row.delivered_count || 0);
    return {
      name: row.partner_name,
      orders,
      delivered,
      success: orders > 0 ? Number(((delivered / orders) * 100).toFixed(1)) : 0,
    };
  });

  const revenueBucketCount = window.period === "today" ? 8 : window.period === "this_week" ? 7 : 4;
  const buildRevenueBucketDate = (index: number, sourceWindow: { dateFrom: string; dateTo: string }) => {
    if (window.period === "today") {
      const hour = new Date(sourceWindow.dateTo);
      hour.setMinutes(0, 0, 0);
      hour.setHours(hour.getHours() - (revenueBucketCount - 1 - index));
      return hour;
    }

    if (window.period === "this_week") {
      const day = new Date(sourceWindow.dateFrom);
      day.setDate(day.getDate() + index);
      return startOfDay(day);
    }

    const week = startOfWeek(new Date(sourceWindow.dateFrom));
    week.setDate(week.getDate() + index * 7);
    return week;
  };

  const formatRevenueBucketKey = (date: Date) => {
    if (window.period === "today") {
      return `${date.toISOString().slice(0, 13)}:00`;
    }
    return date.toISOString().slice(0, 10);
  };

  const formatRevenueBucketLabel = (date: Date) => {
    if (window.period === "today") return formatHourLabel(date);
    if (window.period === "this_week") return formatMonthDayLabel(date);
    return formatWeekLabel(date);
  };

  const toRevenueBucketKey = (value: string) => {
    const date = new Date(value);
    if (window.period === "today") {
      date.setMinutes(0, 0, 0);
      return `${date.toISOString().slice(0, 13)}:00`;
    }
    if (window.period === "this_week") {
      return startOfDay(date).toISOString().slice(0, 10);
    }
    return startOfWeek(date).toISOString().slice(0, 10);
  };

  const currentRevenueLookup = new Map<string, number>();
  for (const row of revenueCurrentRows.rows) {
    const key = toRevenueBucketKey(row.revenue_at);
    currentRevenueLookup.set(key, (currentRevenueLookup.get(key) || 0) + Number(row.revenue_cents || 0));
  }

  const compareRevenueLookup = new Map<string, number>();
  for (const row of revenueCompareRows.rows) {
    const key = toRevenueBucketKey(row.revenue_at);
    compareRevenueLookup.set(key, (compareRevenueLookup.get(key) || 0) + Number(row.revenue_cents || 0));
  }

  const revenueTrendData: RevenueTrendPoint[] = Array.from({ length: revenueBucketCount }, (_, index) => {
    const currentBucket = buildRevenueBucketDate(index, window);
    const compareBucket = buildRevenueBucketDate(index, comparisonWindow);
    return {
      label: formatRevenueBucketLabel(currentBucket),
      revenue: toRandUnits(currentRevenueLookup.get(formatRevenueBucketKey(currentBucket)) || 0),
      comparison: toRandUnits(compareRevenueLookup.get(formatRevenueBucketKey(compareBucket)) || 0),
    };
  });

  const currentRevenueTotalCents = revenueCurrentRows.rows.reduce((sum, row) => sum + Number(row.revenue_cents || 0), 0);
  const compareRevenueTotalCents = revenueCompareRows.rows.reduce((sum, row) => sum + Number(row.revenue_cents || 0), 0);

  const kpis: KpiMetric[] = [
    {
      id: "revenue",
      label: "Settled Net",
      value: formatMoneyFromCents(Number(settlementRow?.settled_net_cents || 0)),
      hint: formatRevenueDelta(currentRevenueTotalCents, compareRevenueTotalCents, window.compareLabel),
      accent: "#4e7dc8",
      surface: "#233863",
      icon: "REV",
    },
    {
      id: "reconciled_gross",
      label: "Reconciled Gross",
      value: formatMoneyFromCents(Number(settlementRow?.reconciled_gross_cents || 0)),
      hint: `${settlement.reconciledCount.toLocaleString("en-ZA")} processed transactions`,
      accent: "#4e7dc8",
      surface: "#eef6ff",
      icon: "GRS",
    },
    {
      id: "pipeline",
      label: "Pending Pipeline",
      value: formatMoneyFromCents(Number(settlementRow?.pending_gross_cents || 0)),
      hint: `${settlement.pendingCount.toLocaleString("en-ZA")} transactions awaiting reconciliation`,
      accent: "#059669",
      surface: "#dff8e8",
      icon: "PND",
    },
    {
      id: "review",
      label: "Manual Review Queue",
      value: reviewBacklog.toLocaleString("en-ZA"),
      hint: `${manualReview.assigned} assigned | ${manualReview.resolved} resolved | clearance ${clearanceRate}%`,
      accent: "#ea6a3f",
      surface: "#fff2bf",
      icon: "MRQ",
    },
  ];

  return {
    kpis,
    recentTransactions,
    kycAuditRecords,
    manualReview,
    manualReviewQueue,
    orderStatuses,
    settlement,
    txVolumeData,
    kycPieData: kycPieData.length > 0 ? kycPieData : [{ name: "No activity", value: 1, color: "#4A7FA5" }],
    kycTrendData,
    revenueTrendData,
    partnerPerformanceData,
    window,
    automation: {
      refreshCadence: "Daily",
      refreshAnchor: "06:00 Africa/Johannesburg",
      analystDigestSuggestion: "07:00 analyst queue digest for open, assigned, and ageing manual-review cases",
      superAdminDigestSuggestion: "06:30 executive summary for settlements, revenue, clearance rate, and partner exceptions",
    },
    generatedAt: nowIso(),
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
