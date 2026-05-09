import type { PaymentMethod } from "./paymentMethods";
import type { AdminDashboardData } from "@/types/admin";

export type Role = "customer" | "sponsor";

export type Transaction = {
  id: string;
  customer_id: string;
  amount_cents: number;
  currency: string;
  payment_method: string;
  gateway: string;
  gateway_status: string;
  credit_tier: string | null;
  risk_score?: number | null;
  risk_decision?: string | null;
  risk_level?: string | null;
  review_status?: string | null;
  qr_payload: string;
  status: string;
  qr_scanned_at: string | null;
  reconciled_at: string | null;
  settled_at: string | null;
  created_at: string;
  updated_at: string;
  external_ref: string | null;
};

export type AuditEntry = { at: string; actor: string; action: string; data: unknown };
export type SponsorTransactionDetail = { transaction: Transaction; audit: AuditEntry[] };

export type DemoProduct = {
  id: string;
  brand: string;
  name: string;
  category: string;
  priceCents: number;
  discountPct: number;
  rating: number;
  stock: number;
};

export type DeliveryDetails = {
  fullName: string;
  phone: string;
  address1: string;
  city: string;
  province: string;
  postalCode: string;
  deliveryDate?: string;
  deliveryWindow?: string;
};

export type OrderRiskContext = {
  idNumber?: string;
  deviceFingerprint?: string;
  documentContext?: {
    identityDocumentType?: "sa_id" | "drivers_licence";
    identityDocumentUploaded?: boolean;
    identityDocumentFileName?: string;
    proofOfAddressRequired?: boolean;
    proofOfAddressUploaded?: boolean;
    proofOfAddressFileName?: string;
    documentAnalysis?: DocumentAnalysisResult | null;
  };
  clientGeo?: {
    ip?: string;
    city?: string;
    province?: string;
    country?: string;
    postalCode?: string;
    latitude?: number | null;
    longitude?: number | null;
    source?: string;
  };
  validatedAddress?: {
    city?: string;
    province?: string;
    postalCode?: string;
    latitude?: number | null;
    longitude?: number | null;
  };
  otpVerified?: boolean;
  saidVerified?: boolean;
};

export type DemoOrderDetail = { transaction: Transaction; details: unknown; audit: AuditEntry[] };
export type DocumentUploadPayload = {
  fileName: string;
  mimeType: string;
  base64Data: string;
};

export type DocumentAnalysisResult = {
  identity: {
    documentType: "sa_id" | "drivers_licence";
    source: "pdf_text" | "derived_from_form" | "demo_filename" | "unavailable";
    extracted: {
      idNumber: string | null;
      fullName: string | null;
      firstName: string | null;
      surname: string | null;
      birthDate: string | null;
      gender: string | null;
      citizenship: string | null;
      licenseNumber: string | null;
    };
    issues: string[];
  };
  proofOfAddress: {
    source: "pdf_text" | "derived_from_form" | "demo_filename" | "unavailable";
    extracted: {
      accountHolderName: string | null;
      addressLine1: string | null;
      suburb: string | null;
      municipality: string | null;
      postalCode: string | null;
      provider: string | null;
    };
    issues: string[];
  } | null;
  comparisons: {
    idMatchesEnteredId: boolean | null;
    nameMatchesOrderName: boolean | null;
    addressMatchesDeliveryAddress: boolean | null;
    postalCodeMatches: boolean | null;
    geoMatchesProvince: boolean | null;
    sapsAreaMatch: string | null;
    sapsRiskTier: string | null;
    sapsSeverityIndex: number | null;
    riskFlags: string[];
  };
  recommendation: {
    decision: "approve" | "manual_review" | "decline";
    score: number;
    summary: string;
    reasons: string[];
  };
};
export type RiskAssessment = {
  score: number;
  decision: "auto_approve" | "elevated_verification" | "manual_review_hold";
  decisionLabel: string;
  bandLabel: string;
  recommendedPath: string;
  factors: string[];
  notes: string[];
  ipAddress: string;
  ipGeo: {
    city: string;
    province: string;
    country: string;
    postalCode: string;
    latitude: number | null;
    longitude: number | null;
    source: string;
  };
  deliveryGeo: {
    city: string;
    province: string;
    postalCode: string;
    latitude: number | null;
    longitude: number | null;
  };
  flags: {
    ipMismatch: boolean;
    highRiskZone: boolean;
    highValue: boolean;
    fingerprintPresent: boolean;
    nonSouthAfricanIp: boolean;
    underAge: boolean;
  };
  mismatchIsNormal: boolean;
  identityRisk: {
    birthDate: string | null;
    age: number | null;
    gender: "male" | "female" | null;
    ageScore: number;
    genderScore: number;
    totalScore: number;
    rejected: boolean;
  } | null;
  verifiedStatus: string;
};
export type DeliveryProcessStep = {
  index: number;
  title: string;
  detail: string;
  status: "pending" | "active" | "completed";
  completedAt: string | null;
};
export type DeliveryProcess = {
  orderId: string;
  status: "running" | "completed";
  startedAt: string;
  updatedAt: string;
  progressPct: number;
  activeStep: number | null;
  steps: DeliveryProcessStep[];
};
export type SettlementBank = "absa" | "fnb" | "standard_bank";
export type PaymentSettlement = {
  bank: SettlementBank;
  bankLabel: string;
  accountRef: string;
  settledAt: string;
  amountCents: number;
  currency: string;
};
export type PaymentNotification = {
  channel: "sms" | "email";
  destination: string;
  status: "sent";
  sentAt: string;
  message: string;
};
export type WalletTopUpResult = {
  transaction: Transaction;
  settlement: PaymentSettlement;
  walletBalanceCents: number;
};
export type PartnerName = "amazon" | "temu" | "takealot" | "woocommerce" | "shopify";
export type PartnerBootstrapSession = {
  sessionId: string;
  partner: PartnerName;
  partnerLabel: string;
  customer: {
    email: string;
    fullName: string;
    idNumber: string;
    phone: string;
    address: string;
    geoLocation: string;
    monthlyIncome: number;
    affordabilityBand: string;
  };
  product: {
    id: string;
    brand: string;
    name: string;
    category: string;
    priceCents: number;
    discountPct: number;
    rating: number;
    stock: number;
    merchantName: string;
  };
};

export type AddressSuggestion = {
  placeId: string;
  text: string;
  mainText: string;
  secondaryText: string;
};

export type GoogleResolvedAddress = {
  formattedAddress: string;
  city: string;
  province: string;
  postalCode: string;
  placeId: string;
  latitude: number | null;
  longitude: number | null;
};

export type AddressValidationResult = GoogleResolvedAddress & {
  verdict: "validated" | "needs_confirmation";
  addressComplete: boolean;
  hasInferredComponents: boolean;
  hasReplacedComponents: boolean;
  hasUnconfirmedComponents: boolean;
  possibleNextAction: string;
};

const configuredApiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
const API_BASE_URLS = Array.from(new Set([configuredApiBase, "", "http://localhost:4100", "http://localhost:4000"].filter((value) => value !== undefined))) as string[];
const API_BASE_URL = API_BASE_URLS[0];

function extractErrorMessage(status: number, data: unknown, text: string) {
  let code = "";
  if (data && typeof data === "object") {
    const payload = data as {
      error?: unknown;
      message?: unknown;
      details?: {
        formErrors?: unknown;
        fieldErrors?: Record<string, unknown>;
      };
    };
    const maybeError = payload.error;
    const maybeMessage = payload.message;
    if (typeof maybeError === "string" && maybeError.trim()) code = maybeError.trim();
    if (typeof maybeMessage === "string" && maybeMessage.trim()) return { code, message: maybeMessage.trim() };
    const formErrors = Array.isArray(payload.details?.formErrors) ? payload.details?.formErrors : [];
    const firstFormError = formErrors.find((item) => typeof item === "string" && item.trim());
    if (typeof firstFormError === "string") return { code, message: firstFormError.trim() };

    const fieldErrors = payload.details?.fieldErrors;
    if (fieldErrors && typeof fieldErrors === "object") {
      for (const [field, value] of Object.entries(fieldErrors)) {
        if (!Array.isArray(value)) continue;
        const firstFieldError = value.find((item) => typeof item === "string" && item.trim());
        if (typeof firstFieldError === "string") {
          return { code, message: `${field}: ${firstFieldError.trim()}` };
        }
      }
    }
    if (code) return { code, message: code };
  }
  if (text.trim()) return { code, message: text.trim() };
  return { code: code || `request_failed_${status}`, message: `request_failed_${status}` };
}

function normalizeFetchFailure(error: unknown) {
  if (error instanceof Error) {
    const code =
      typeof (error as { code?: unknown }).code === "string"
        ? ((error as { code?: string }).code ?? "")
        : "";
    const normalized = error.message.toLowerCase();
    if (normalized === "failed to fetch" || normalized.includes("fetch failed") || normalized.includes("networkerror")) {
      return Object.assign(new Error("The service is temporarily unavailable. Please try again in a moment."), {
        code: code || "service_unreachable",
      });
    }
    return error;
  }

  return new Error("The service is temporarily unavailable. Please try again in a moment.");
}

function shouldFallbackToNextBase(error: unknown) {
  if (!(error instanceof Error)) return false;

  const status = typeof (error as { status?: unknown }).status === "number"
    ? ((error as { status?: number }).status ?? 0)
    : 0;
  const code = typeof (error as { code?: unknown }).code === "string"
    ? ((error as { code?: string }).code ?? "")
    : "";

  // Only fall back when the endpoint truly looks unavailable on this base.
  if (status === 404 || status === 405) {
    return !code || code === "api_endpoint_unavailable" || code === "request_failed_404" || code === "request_failed_405";
  }

  return status === 502 || status === 503 || status === 504;
}

async function apiFetch<T>(path: string, init?: RequestInit & { token?: string }) {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json");
  if (init?.token) headers.set("authorization", `Bearer ${init.token}`);

  let lastError: Error | null = null;
  for (let i = 0; i < API_BASE_URLS.length; i += 1) {
    const baseUrl = API_BASE_URLS[i];
    const hasNext = i < API_BASE_URLS.length - 1;
    try {
      const res = await fetch(`${baseUrl}${path}`, { ...init, headers, cache: "no-store" });
      const rawText = await res.text();
      const contentType = res.headers.get("content-type") || "";
      const isJson = contentType.includes("application/json") || contentType.includes("+json");
      let data: unknown = {};
      if (rawText) {
        if (isJson) {
          try {
            data = JSON.parse(rawText);
          } catch {
            const parseErr = Object.assign(new Error("invalid_api_response"), { path, baseUrl, status: res.status });
            lastError = parseErr;
            if (hasNext) continue;
            throw parseErr;
          }
        } else {
          data = { message: rawText };
        }
      }

      if (res.ok) {
        if (isJson) return data as T;
        const nonJsonErr = Object.assign(new Error("api_endpoint_unavailable"), { path, baseUrl, status: res.status });
        lastError = nonJsonErr;
        if (hasNext) continue;
        throw nonJsonErr;
      }

      const { code, message } = extractErrorMessage(res.status, data, rawText);

      // Fallback to the next candidate when this backend does not expose the route.
      if ((res.status === 404 || res.status === 405 || res.status === 502 || res.status === 503 || res.status === 504) && hasNext) continue;

      throw Object.assign(new Error(message), { status: res.status, data, baseUrl, path, code: code || message });
    } catch (error) {
      const normalized = normalizeFetchFailure(error);
      lastError = normalized;
      if (hasNext && shouldFallbackToNextBase(error)) continue;
      throw lastError;
    }
  }

  throw lastError || new Error("request_failed");
}

export async function login(input: { username: string; password: string; role: Role }) {
  return apiFetch<{ token: string; role: Role }>("/auth/login", { method: "POST", body: JSON.stringify(input) });
}

export async function initiateCheckout(
  token: string,
  input: { customerId: string; amountCents: number; currency: string; paymentMethod: PaymentMethod; gateway?: string },
) {
  return apiFetch<{ transaction: Transaction; qrPayload: string; barcodePayload: string }>("/api/checkout/initiate", {
    method: "POST",
    token,
    body: JSON.stringify(input),
  });
}

export async function scanQr(token: string, transactionId: string, payload: string) {
  return apiFetch<{ transaction: Transaction }>(`/api/checkout/${transactionId}/scan`, {
    method: "POST",
    token,
    body: JSON.stringify({ payload }),
  });
}

export async function creditVet(token: string, transactionId: string, input: { consent: boolean; bureau?: "transunion" | "experian" }) {
  return apiFetch<{ eligible: boolean; tier: string; score: number; transaction: Transaction }>(`/api/checkout/${transactionId}/credit-vet`, {
    method: "POST",
    token,
    body: JSON.stringify(input),
  });
}

export async function pay(token: string, transactionId: string, method: PaymentMethod) {
  return apiFetch<{ transaction: Transaction }>(`/api/checkout/${transactionId}/pay`, {
    method: "POST",
    token,
    body: JSON.stringify({ method }),
  });
}

export async function reconcile(token: string) {
  return apiFetch<{ reconciled: number }>("/api/reconcile/run", { method: "POST", token });
}

export async function listSponsorTransactions(token: string, status?: string) {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch<{ items: Transaction[] }>(`/api/sponsor/transactions${q}`, { token });
}

export async function getSponsorTransaction(token: string, id: string) {
  return apiFetch<SponsorTransactionDetail>(`/api/sponsor/transactions/${id}`, { token });
}

// --- /PondoDemo helpers ---
export async function fetchDemoProducts(input?: { q?: string; category?: string }) {
  const q = input?.q ? `q=${encodeURIComponent(input.q)}` : "";
  const c = input?.category ? `category=${encodeURIComponent(input.category)}` : "";
  const qs = [q, c].filter(Boolean).join("&");
  const suffix = qs ? `?${qs}` : "";
  return apiFetch<{ items: DemoProduct[]; categories: string[] }>(`/api/pondo/catalog/products${suffix}`);
}

export async function fetchDemoSaIds() {
  return apiFetch<{ items: Array<{ saId: string; label: string }> }>("/api/pondo/credit/demo-ids");
}

export async function simulateDemoCredit(input: { saId: string; bureau: "transunion" | "experian" }) {
  return apiFetch<{ result: { score: number; tier: string; approved: boolean; bureau: string } }>("/api/pondo/credit/simulate", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function createDemoOrder(
  token: string,
  input: {
    customerId: string;
    sessionId?: string;
    items: Array<{ productId: string; qty: number }>;
    delivery: DeliveryDetails;
    paymentMethod: PaymentMethod;
    riskContext?: OrderRiskContext;
  },
) {
  return apiFetch<{ transaction: Transaction; qrPayload: string; riskAssessment: RiskAssessment | null }>("/api/pondo/orders", {
    method: "POST",
    token,
    body: JSON.stringify(input),
  });
}

export async function bnplVetDemoOrder(token: string, id: string, input: { saId: string; bureau: "transunion" | "experian" }) {
  return apiFetch<{ result: { score: number; tier: string; approved: boolean; bureau: string }; transaction: Transaction }>(`/api/pondo/orders/${id}/bnpl-vet`, {
    method: "POST",
    token,
    body: JSON.stringify(input),
  });
}

export async function payDemoOrder(
  token: string,
  id: string,
  paymentMethod: PaymentMethod,
  options?: { settlementBank?: SettlementBank; notifyEmail?: string; notifyChannels?: Array<"sms" | "email"> },
) {
  return apiFetch<{ transaction: Transaction; settlement: PaymentSettlement; notifications: PaymentNotification[] }>(
    `/api/pondo/orders/${id}/pay`,
    {
      method: "POST",
      token,
      body: JSON.stringify({ paymentMethod, ...options }),
    },
  );
}

export async function getDemoOrder(token: string, id: string) {
  return apiFetch<DemoOrderDetail>(`/api/pondo/orders/${id}`, { token });
}

export async function resolveManualReviewOrder(token: string, id: string, decision: "approved" | "declined") {
  return apiFetch<{ transaction: Transaction }>(`/api/pondo/orders/${encodeURIComponent(id)}/manual-review`, {
    method: "POST",
    token,
    body: JSON.stringify({ decision }),
  });
}

export async function analyzeManualReviewDocuments(
  token: string,
  input: {
    identityDocumentType: "sa_id" | "drivers_licence";
    fullName: string;
    enteredIdNumber: string;
    deliveryAddress: {
      address1: string;
      city: string;
      province: string;
      postalCode: string;
    };
    clientGeo?: {
      city?: string;
      province?: string;
      country?: string;
    };
    orderValueCents: number;
    identityDocument: DocumentUploadPayload;
    proofOfAddressDocument?: DocumentUploadPayload | null;
  },
) {
  return apiFetch<DocumentAnalysisResult>("/api/pondo/documents/analyze", {
    method: "POST",
    token,
    body: JSON.stringify(input),
  });
}

export async function getDemoOrderProcess(token: string, id: string) {
  return apiFetch<DeliveryProcess>(`/api/pondo/orders/${id}/process`, { token });
}

export async function sponsorDemoSummary(token: string) {
  return apiFetch<{ live: number; completed: number; failed: number; processing: number; grossCents: number }>("/api/pondo/sponsor/summary", { token });
}

export async function sponsorDemoOrders(token: string) {
  return apiFetch<{ items: Array<Transaction & { live?: boolean; details?: unknown }> }>("/api/pondo/sponsor/orders", { token });
}

export async function fetchAdminDashboard() {
  return apiFetch<AdminDashboardData>("/api/pondo/admin/dashboard");
}

export async function topUpWallet(
  token: string,
  input: {
    customerId: string;
    amountCents: number;
    paymentMethod: PaymentMethod;
    settlementBank?: SettlementBank;
    notifyEmail?: string;
  },
) {
  return apiFetch<WalletTopUpResult>("/api/pondo/wallet/top-up", {
    method: "POST",
    token,
    body: JSON.stringify(input),
  });
}

export async function getWalletBalance(token: string, customerId: string) {
  return apiFetch<{ customerId: string; balanceCents: number }>(`/api/pondo/wallet/${encodeURIComponent(customerId)}`, { token });
}

export function sponsorDemoEventSource(token: string) {
  return new EventSource(`${API_BASE_URL}/api/pondo/sponsor/stream?token=${encodeURIComponent(token)}`);
}

// --- PONDO trust-checkout endpoints aligned to payment journey spec ---
export async function fetchPartnerCart(input: { partner: PartnerName; email: string }) {
  return apiFetch<{ session: PartnerBootstrapSession }>("/api/pondo/fetch-cart", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function sendOtp(input: { sessionId: string; channel: "sms" | "email"; destination: string }) {
  return apiFetch<{ requestId: string; expiresAt: number; demoOtp: string }>("/api/pondo/send-otp", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function verifyOtp(input: { requestId: string; code: string }) {
  return apiFetch<{ ok: true; sessionId: string }>("/api/pondo/verify-otp", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function confirmPondoCheckoutDetails(
  input: {
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
    termsAccepted: true;
  },
) {
  const { sessionId, ...body } = input;
  return apiFetch<{ ok: true; sessionId: string }>(`/api/pondo/checkout-sessions/${encodeURIComponent(sessionId)}/confirm-details`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function persistPondoRiskAssessment(
  token: string,
  input: {
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
      documentAnalysis?: DocumentAnalysisResult | null;
    };
    projectedScore?: number;
    projectedDecision?: "auto_approve" | "elevated_verification" | "manual_review_hold";
    projectedFactors?: string[];
    city?: string;
    province?: string;
    postalCode?: string;
  },
) {
  const { sessionId, ...body } = input;
  return apiFetch<{ ok: true; approved: boolean }>(`/api/pondo/checkout-sessions/${encodeURIComponent(sessionId)}/risk-checks`, {
    method: "POST",
    token,
    body: JSON.stringify(body),
  });
}

export async function autocompleteAddress(input: { input: string; sessionToken?: string }) {
  return apiFetch<{ suggestions: AddressSuggestion[] }>("/api/pondo/address/autocomplete", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getPlaceAddress(input: { placeId: string; sessionToken?: string }) {
  return apiFetch<{ place: GoogleResolvedAddress }>("/api/pondo/address/place", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function validateCheckoutAddress(input: { address: string; sessionToken?: string }) {
  return apiFetch<{ validation: AddressValidationResult }>("/api/pondo/address/validate", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
