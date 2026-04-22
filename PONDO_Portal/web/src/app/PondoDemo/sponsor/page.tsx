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

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="text-xs text-white/60">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      {hint ? <div className="mt-2 text-xs text-white/50">{hint}</div> : null}
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
  const [orders, setOrders] = useState<Array<Transaction & { live?: boolean }>>([]);

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
      setSummary(s);
      setOrders(o.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "refresh_failed");
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const es = sponsorDemoEventSource(token);
    const onAny = () => refresh();
    es.addEventListener("order.updated", onAny);
    es.addEventListener("ready", onAny);
    es.onerror = () => {
      // silent retry handled by EventSource
    };
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const recent = useMemo(() => {
    return [...orders].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 30);
  }, [orders]);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <PondoDemoNav />
      <div className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Sponsor Dashboard</h1>
        <p className="mt-2 text-sm text-white/60">
          Live orchestration feed (marked <span className="font-semibold text-white">LIVE</span>) • audit log • reconciliation-ready summary.
        </p>

        {!auth ? (
          <div className="mt-6 grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-6 sm:grid-cols-3">
            <label className="sm:col-span-2">
              <div className="text-xs text-white/60">Username</div>
              <input value={username} onChange={(e) => setUsername(e.target.value)} className="mt-2 w-full rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-white/30" />
            </label>
            <label>
              <div className="text-xs text-white/60">Password</div>
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" className="mt-2 w-full rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-white/30" />
            </label>
            <div className="sm:col-span-3 flex items-center justify-between">
              <button onClick={onLogin} disabled={busy} className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-white/90 disabled:opacity-50">
                Sign in as sponsor
              </button>
              {error ? <div className="text-sm text-red-300">{error}</div> : null}
            </div>
          </div>
        ) : (
          <>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="LIVE Orders" value={String(summary?.live ?? "—")} hint="Orders created via /PondoDemo checkout." />
              <StatCard label="Processing" value={String(summary?.processing ?? "—")} hint="initiated / processing (demo)." />
              <StatCard label="Completed" value={String(summary?.completed ?? "—")} hint="settled + reconciled (demo)." />
              <StatCard label="Gross" value={summary ? money(summary.grossCents) : "—"} hint="Sum of completed orders." />
            </div>

            {error ? <div className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">{error}</div> : null}

            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">Orchestration Table</div>
                  <div className="mt-1 text-xs text-white/50">Real-time updates via SSE from the API.</div>
                </div>
                <button onClick={refresh} className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10">
                  Refresh
                </button>
              </div>

              <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
                <table className="w-full text-left text-sm">
                  <thead className="bg-black/20 text-xs text-white/60">
                    <tr>
                      <th className="px-4 py-3">LIVE</th>
                      <th className="px-4 py-3">Order</th>
                      <th className="px-4 py-3">Customer</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Gateway</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3">Created</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-4 text-white/60">
                          No orders yet. Create one from{" "}
                          <Link href="/PondoDemo/shop" className="font-semibold text-white hover:underline">
                            Shop
                          </Link>
                          .
                        </td>
                      </tr>
                    ) : (
                      recent.map((t) => (
                        <tr key={t.id} className="border-t border-white/10">
                          <td className="px-4 py-3">
                            <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-xs font-semibold text-emerald-200">LIVE</span>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs">{t.id.slice(0, 8)}…</td>
                          <td className="px-4 py-3 text-white/80">{t.customer_id}</td>
                          <td className="px-4 py-3">
                            <div className="text-xs text-white/60">{t.status}</div>
                            <div className="text-xs font-semibold">{t.gateway_status}</div>
                          </td>
                          <td className="px-4 py-3 text-white/80">{t.gateway}</td>
                          <td className="px-4 py-3 font-semibold">{money(t.amount_cents)}</td>
                          <td className="px-4 py-3 text-white/70">{fmt(t.created_at)}</td>
                          <td className="px-4 py-3">
                            <Link href={`/sponsor/${t.id}`} className="text-sm font-semibold text-white hover:underline">
                              Audit
                            </Link>
                          </td>
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

