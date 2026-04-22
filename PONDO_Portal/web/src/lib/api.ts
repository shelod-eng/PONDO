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
};

export type DemoOrderDetail = { transaction: Transaction; details: unknown; audit: AuditEntry[] };
export type DemoJourneyReport = {
  reportId: string;
  orderId: string;
  generatedAt: string;
  sentTo: string;
  customerId: string;
  amountCents: number;
  status: string;
  gateway: string;
  gatewayStatus: string;
  creditTier: string | null;
  details: unknown;
  auditCount: number;
  journey: {
    initiated: boolean;
    creditChecked: boolean;
    settled: boolean;
    completed: boolean;
  };
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

async function apiFetch<T>(path: string, init?: RequestInit & { token?: string }) {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json");
  if (init?.token) headers.set("authorization", `Bearer ${init.token}`);

  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers, cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error || "request_failed"), { status: res.status, data });
  return data as T;
}

export async function login(input: { username: string; password: string; role: Role }) {
  return apiFetch<{ token: string; role: Role }>("/auth/login", { method: "POST", body: JSON.stringify(input) });
}

export async function initiateCheckout(
  token: string,
  input: { customerId: string; amountCents: number; currency: string; paymentMethod: string; gateway?: string },
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

export async function pay(token: string, transactionId: string, method: string) {
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

export async function createDemoOrder(
  token: string,
  input: { customerId: string; items: Array<{ productId: string; qty: number }>; delivery: DeliveryDetails; paymentMethod: "card" | "eft" | "bnpl" },
) {
  return apiFetch<{ transaction: Transaction; qrPayload: string }>("/api/pondo/orders", { method: "POST", token, body: JSON.stringify(input) });
}

export async function bnplVetDemoOrder(token: string, id: string, input: { saId: string; bureau: "transunion" | "experian" }) {
  return apiFetch<{ result: { score: number; tier: string; approved: boolean; bureau: string }; transaction: Transaction }>(`/api/pondo/orders/${id}/bnpl-vet`, {
    method: "POST",
    token,
    body: JSON.stringify(input),
  });
}

export async function payDemoOrder(token: string, id: string, paymentMethod: "card" | "eft" | "bnpl") {
  return apiFetch<{ transaction: Transaction }>(`/api/pondo/orders/${id}/pay`, { method: "POST", token, body: JSON.stringify({ paymentMethod }) });
}

export async function getDemoOrder(token: string, id: string) {
  return apiFetch<DemoOrderDetail>(`/api/pondo/orders/${id}`, { token });
}

export async function generateDemoOrderReport(token: string, id: string, input?: { sendTo?: string }) {
  return apiFetch<{ sent: boolean; report: DemoJourneyReport }>(`/api/pondo/orders/${id}/report`, {
    method: "POST",
    token,
    body: JSON.stringify(input || {}),
  });
}

export async function sponsorDemoSummary(token: string) {
  return apiFetch<{ live: number; completed: number; failed: number; processing: number; grossCents: number }>("/api/pondo/sponsor/summary", { token });
}

export async function sponsorDemoOrders(token: string) {
  return apiFetch<{ items: Array<Transaction & { live?: boolean; details?: unknown }> }>("/api/pondo/sponsor/orders", { token });
}

export function sponsorDemoEventSource(token: string) {
  return new EventSource(`${API_BASE_URL}/api/pondo/sponsor/stream?token=${encodeURIComponent(token)}`);
}
