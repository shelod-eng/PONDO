"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { useAuth } from "@/lib/auth";
import { listSponsorTransactions, login, reconcile, type Transaction } from "@/lib/api";

function getErrorMessage(err: unknown) {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "request_failed";
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-white/70">{children}</span>;
}

function fmt(ts: string | null) {
  if (!ts) return "-";
  return new Date(ts).toLocaleString("en-ZA");
}

export default function SponsorPage() {
  const { auth, setAuth, token } = useAuth();
  const [username, setUsername] = useState("sponsor@example.com");
  const [password, setPassword] = useState("demo");
  const [status, setStatus] = useState<string>("");
  const [items, setItems] = useState<Transaction[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onLogin() {
    setError("");
    setBusy(true);
    try {
      const out = await login({ username, password, role: "sponsor" });
      setAuth({ token: out.token, role: out.role, username });
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    if (!token) return;
    setError("");
    setBusy(true);
    try {
      const out = await listSponsorTransactions(token, status || undefined);
      setItems(out.items);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function runReconcile() {
    if (!token) return;
    setError("");
    setBusy(true);
    try {
      await reconcile(token);
      await refresh();
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, status]);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <TopNav />
      <div className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Sponsor Portal</h1>
        <p className="mt-2 text-sm text-white/60">Transaction lifecycle dashboard with geo-risk scoring, elevated verification, and manual review holds.</p>

        {!auth ? (
          <div className="mt-6 grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-6 sm:grid-cols-3">
            <label className="sm:col-span-2">
              <div className="text-xs text-white/60">Username</div>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-2 w-full rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-white/30"
              />
            </label>
            <label>
              <div className="text-xs text-white/60">Password</div>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                className="mt-2 w-full rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-white/30"
              />
            </label>
            <div className="sm:col-span-3 flex items-center justify-between">
              <button
                onClick={onLogin}
                disabled={busy}
                className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-white/90 disabled:opacity-50"
              >
                Sign in as sponsor
              </button>
              {error ? <div className="text-sm text-red-300">{error}</div> : null}
            </div>
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-white/70">
                <span>Status</span>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-white/30"
                >
                  <option value="">all</option>
                  <option value="initiated">initiated</option>
                  <option value="processing">processing</option>
                  <option value="Awaiting_Payment">Awaiting_Payment</option>
                  <option value="Manual_Review_Hold">Manual_Review_Hold</option>
                  <option value="reconciled">reconciled</option>
                  <option value="failed">failed</option>
                </select>
              </label>
              <button
                onClick={refresh}
                disabled={busy}
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50"
              >
                Refresh
              </button>
              <button
                onClick={runReconcile}
                disabled={busy}
                className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-white/90 disabled:opacity-50"
              >
                Run Reconciliation
              </button>
              {error ? <div className="text-sm text-red-300">{error}</div> : null}
            </div>

            <div className="mt-5 overflow-hidden rounded-xl border border-white/10">
              <table className="w-full text-left text-sm">
                <thead className="bg-black/20 text-xs text-white/60">
                  <tr>
                    <th className="px-4 py-3">Transaction</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Risk</th>
                    <th className="px-4 py-3">Gateway</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td className="px-4 py-4 text-white/60" colSpan={7}>
                        No transactions yet.
                      </td>
                    </tr>
                  ) : (
                    items.map((t) => (
                      <tr key={t.id} className="border-t border-white/10">
                        <td className="px-4 py-3 font-mono text-xs">{t.id.slice(0, 8)}…</td>
                        <td className="px-4 py-3 text-white/80">{t.customer_id}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Chip>{t.status}</Chip>
                            {t.credit_tier ? <Chip>tier {t.credit_tier}</Chip> : null}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-white/80">
                          <div className="flex flex-wrap items-center gap-2">
                            {typeof t.risk_score === "number" ? <Chip>{t.risk_score} pts</Chip> : null}
                            {t.risk_decision ? <Chip>{t.risk_decision}</Chip> : null}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-white/80">{t.gateway}</td>
                        <td className="px-4 py-3 text-white/70">{fmt(t.created_at)}</td>
                        <td className="px-4 py-3">
                          <Link href={`/sponsor/${t.id}`} className="text-sm font-semibold text-white hover:underline">
                            View
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
