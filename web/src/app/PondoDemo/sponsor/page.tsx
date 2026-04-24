"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PondoDemoNav } from "@/components/PondoDemoNav";
import { useAuth } from "@/lib/auth";
import { login, sponsorDemoEventSource, sponsorDemoOrders, sponsorDemoSummary, type Transaction } from "@/lib/api";

function money(cents: number) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(cents / 100);
}

function fmt(ts: string | null) {
  if (!ts) return "-";
  return new Date(ts).toLocaleString("en-ZA");
}

type SandboxOrder = Transaction & { partner: "Amazon" | "Takealot"; productName: string };

const sandboxOrders: SandboxOrder[] = [
  {
    id: "pnd-amz-88201",
    customer_id: "thabo@email.com",
    amount_cents: 1899900,
    currency: "ZAR",
    payment_method: "bnpl",
    gateway: "payflex",
    gateway_status: "authorized",
    credit_tier: "A",
    qr_payload: "sandbox-amz-88201",
    status: "processing",
    qr_scanned_at: null,
    reconciled_at: null,
    settled_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    external_ref: "amz-88201",
    partner: "Amazon",
    productName: "Samsung 65\" QLED 4K TV",
  },
  {
    id: "pnd-tko-88199",
    customer_id: "naledi@email.com",
    amount_cents: 229900,
    currency: "ZAR",
    payment_method: "card",
    gateway: "peach",
    gateway_status: "settled",
    credit_tier: null,
    qr_payload: "sandbox-tko-88199",
    status: "reconciled",
    qr_scanned_at: null,
    reconciled_at: new Date().toISOString(),
    settled_at: new Date().toISOString(),
    created_at: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
    updated_at: new Date().toISOString(),
    external_ref: "tko-88199",
    partner: "Takealot",
    productName: "Air Max 90 Sneakers",
  },
];

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-pondo-line bg-white p-5">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-2 text-4xl font-black text-pondo-navy-900">{value}</div>
      {hint ? <div className="mt-2 text-xs text-slate-500">{hint}</div> : null}
    </div>
  );
}

export default function PondoSponsorDashboard() {
  const { auth, setAuth, token } = useAuth();
  const [username, setUsername] = useState("sponsor@example.com");
  const [password, setPassword] = useState("demo");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<{ live: number; completed: number; failed: number; processing: number; grossCents: number } | null>(null);
  const [orders, setOrders] = useState<SandboxOrder[]>(sandboxOrders);
  const [sandboxMode, setSandboxMode] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [partnerFilter, setPartnerFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  async function onLogin() {
    setBusy(true);
    setError("");
    try {
      const out = await login({ username, password, role: "sponsor" });
      setAuth({ token: out.token, role: out.role, username });
    } catch (e) {
      setError(e instanceof Error ? e.message : "login_failed");
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    if (!token) return;
    setError("");
    try {
      const [s, o] = await Promise.all([sponsorDemoSummary(token), sponsorDemoOrders(token)]);
      const merged = [...o.items.map((x) => ({ ...x, partner: "Amazon" as const, productName: "Live checkout order" })), ...sandboxOrders]
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
        .slice(0, 40);
      setSummary(s);
      setOrders(merged);
      setSandboxMode(false);
    } catch {
      setSummary({
        live: sandboxOrders.length,
        completed: sandboxOrders.filter((x) => x.status === "reconciled").length,
        failed: sandboxOrders.filter((x) => x.status === "failed").length,
        processing: sandboxOrders.filter((x) => x.status === "processing" || x.status === "initiated").length,
        grossCents: sandboxOrders.filter((x) => x.status === "reconciled").reduce((sum, x) => sum + x.amount_cents, 0),
      });
      setOrders(sandboxOrders);
      setSandboxMode(true);
      setError("API unavailable - showing Amazon/Takealot sandbox data.");
    }
  }

  useEffect(() => {
    if (!auth || auth.role !== "sponsor") return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, auth?.role]);

  useEffect(() => {
    if (!token || auth?.role !== "sponsor") return;
    const es = sponsorDemoEventSource(token);
    const onAny = () => refresh();
    es.addEventListener("order.updated", onAny);
    es.addEventListener("ready", onAny);
    es.onerror = () => {
      // silent retry handled by EventSource
    };
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, auth?.role]);

  const recent = useMemo(() => [...orders].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 30), [orders]);

  const visibleOrders = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return recent.filter((order) => {
      if (statusFilter !== "all" && order.status !== statusFilter) return false;
      if (partnerFilter !== "all" && order.partner !== partnerFilter) return false;
      if (!term) return true;
      return (
        order.id.toLowerCase().includes(term) ||
        order.customer_id.toLowerCase().includes(term) ||
        order.productName.toLowerCase().includes(term) ||
        order.gateway.toLowerCase().includes(term)
      );
    });
  }, [partnerFilter, recent, searchTerm, statusFilter]);

  function exportCsv() {
    const header = ["partner", "order_id", "customer", "product", "status", "gateway", "amount_zar", "created_at"];
    const rows = visibleOrders.map((o) => [
      o.partner,
      o.id,
      o.customer_id,
      o.productName,
      o.status,
      o.gateway,
      (o.amount_cents / 100).toFixed(2),
      o.created_at,
    ]);
    const escape = (v: string) => `"${String(v).replaceAll('"', '""')}"`;
    const csv = [header, ...rows].map((r) => r.map((x) => escape(String(x))).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pondo-sponsor-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-[#f1f3f7] text-pondo-navy-900">
      <PondoDemoNav />
      <div className="mx-auto max-w-[1240px] px-4 py-6">
        <h1 className="text-5xl font-black tracking-tight">Sponsor Dashboard</h1>
        <p className="mt-2 text-sm text-slate-600">Live orchestration feed, audit log, and reconciliation-ready summary.</p>

        {!auth || auth.role !== "sponsor" ? (
          <div className="mt-6 grid gap-4 rounded-2xl border border-pondo-line bg-white p-6 sm:grid-cols-3">
            <label className="sm:col-span-2">
              <div className="text-xs text-slate-500">Username</div>
              <input value={username} onChange={(e) => setUsername(e.target.value)} className="mt-2 w-full rounded-xl border border-pondo-line bg-white px-3 py-2 text-sm outline-none" />
            </label>
            <label>
              <div className="text-xs text-slate-500">Password</div>
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" className="mt-2 w-full rounded-xl border border-pondo-line bg-white px-3 py-2 text-sm outline-none" />
            </label>
            <div className="sm:col-span-3 flex items-center justify-between">
              <button onClick={onLogin} disabled={busy} className="rounded-xl bg-pondo-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-pondo-orange-400 disabled:opacity-50">
                Sign in as sponsor
              </button>
              <div className="text-xs text-slate-500">Sandbox data appears automatically after sign-in.</div>
            </div>
            {error ? <div className="sm:col-span-3 text-sm text-red-600">{error}</div> : null}
          </div>
        ) : (
          <>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="LIVE Orders" value={String(summary?.live ?? "--")} hint="Amazon + Takealot sandbox stream." />
              <StatCard label="Processing" value={String(summary?.processing ?? "--")} hint="initiated / processing" />
              <StatCard label="Completed" value={String(summary?.completed ?? "--")} hint="settled + reconciled" />
              <StatCard label="Gross" value={summary ? money(summary.grossCents) : "--"} hint="Sum of completed orders" />
            </div>

            <div className="mt-4 flex items-center justify-between rounded-xl border border-pondo-line bg-white px-4 py-3">
              <div className="text-sm font-semibold">Data mode: {sandboxMode ? "Sandbox mock data" : "Live + sandbox blend"}</div>
              <button onClick={refresh} className="rounded-lg border border-pondo-line bg-[#f7faff] px-3 py-1.5 text-sm font-semibold text-pondo-navy-800 hover:bg-[#e9f0ff]">
                Refresh
              </button>
            </div>

            {error ? <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">{error}</div> : null}

            <div className="mt-4 rounded-2xl border border-pondo-line bg-white p-6">
              <div className="text-sm font-semibold">Orchestration Table</div>
              <div className="mt-1 text-xs text-slate-500">Includes Amazon/Takealot sandbox records for demo reliability.</div>

              <div className="mt-4 grid gap-3 rounded-xl border border-pondo-line bg-[#f7faff] p-3 sm:grid-cols-2 lg:grid-cols-4">
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search order, customer, product..."
                  className="rounded-lg border border-pondo-line bg-white px-3 py-2 text-sm outline-none"
                />
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-pondo-line bg-white px-3 py-2 text-sm">
                  <option value="all">All statuses</option>
                  <option value="initiated">Initiated</option>
                  <option value="processing">Processing</option>
                  <option value="authorized">Authorized</option>
                  <option value="settled">Settled</option>
                  <option value="reconciled">Reconciled</option>
                  <option value="failed">Failed</option>
                </select>
                <select value={partnerFilter} onChange={(e) => setPartnerFilter(e.target.value)} className="rounded-lg border border-pondo-line bg-white px-3 py-2 text-sm">
                  <option value="all">All partners</option>
                  <option value="Amazon">Amazon</option>
                  <option value="Takealot">Takealot</option>
                </select>
                <button onClick={exportCsv} className="rounded-lg bg-pondo-navy-900 px-3 py-2 text-sm font-semibold text-white hover:bg-pondo-navy-800">
                  Export visible rows (CSV)
                </button>
              </div>

              <div className="mt-4 overflow-hidden rounded-xl border border-pondo-line">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#eef2f8] text-xs text-slate-600">
                    <tr>
                      <th className="px-4 py-3">Partner</th>
                      <th className="px-4 py-3">Order</th>
                      <th className="px-4 py-3">Customer</th>
                      <th className="px-4 py-3">Product</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Gateway</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleOrders.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-4 text-slate-600">
                          No orders match these filters. Create one from <Link href="/PondoDemo/shop" className="font-semibold text-pondo-navy-800 hover:underline">Shop</Link> or clear filters.
                        </td>
                      </tr>
                    ) : (
                      visibleOrders.map((t) => (
                        <tr key={t.id} className="border-t border-pondo-line">
                          <td className="px-4 py-3 font-semibold">{t.partner}</td>
                          <td className="px-4 py-3 font-mono text-xs">{t.id}</td>
                          <td className="px-4 py-3">{t.customer_id}</td>
                          <td className="px-4 py-3">{t.productName}</td>
                          <td className="px-4 py-3">
                            <span className="rounded-full bg-[#eaf2ff] px-2 py-0.5 text-xs font-semibold text-pondo-navy-800">{t.status}</span>
                          </td>
                          <td className="px-4 py-3">{t.gateway}</td>
                          <td className="px-4 py-3 font-semibold">{money(t.amount_cents)}</td>
                          <td className="px-4 py-3 text-slate-600">{fmt(t.created_at)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

