"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { useAuth } from "@/lib/auth";
import { getSponsorTransaction, type SponsorTransactionDetail } from "@/lib/api";

function fmt(ts: string | null) {
  if (!ts) return "-";
  return new Date(ts).toLocaleString("en-ZA");
}

export default function SponsorTxnDetail() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [data, setData] = useState<SponsorTransactionDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token || !id) return;
    getSponsorTransaction(token, id)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "fetch_failed"));
  }, [token, id]);

  const tx = data?.transaction;
  const audit = data?.audit || [];

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <TopNav />
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Transaction Detail</h1>
          <Link href="/sponsor" className="text-sm font-semibold text-white/80 hover:text-white hover:underline">
            Back
          </Link>
        </div>

        {error ? <div className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">{error}</div> : null}

        {tx ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <div className="text-xs text-white/60">Core</div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div className="text-white/60">id</div>
                <div className="font-mono text-xs">{tx.id}</div>
                <div className="text-white/60">customer</div>
                <div>{tx.customer_id}</div>
                <div className="text-white/60">amount</div>
                <div>
                  {(tx.amount_cents / 100).toFixed(2)} {tx.currency}
                </div>
                <div className="text-white/60">status</div>
                <div className="font-semibold">{tx.status}</div>
                <div className="text-white/60">gateway</div>
                <div className="font-semibold">{tx.gateway}</div>
                <div className="text-white/60">gateway_status</div>
                <div className="font-semibold">{tx.gateway_status}</div>
                <div className="text-white/60">credit_tier</div>
                <div className="font-semibold">{tx.credit_tier ?? "-"}</div>
                <div className="text-white/60">risk_score</div>
                <div className="font-semibold">{tx.risk_score ?? "-"}</div>
                <div className="text-white/60">risk_decision</div>
                <div className="font-semibold">{tx.risk_decision ?? "-"}</div>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <div className="text-xs text-white/60">Lifecycle</div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div className="text-white/60">created_at</div>
                <div className="font-mono text-xs">{fmt(tx.created_at)}</div>
                <div className="text-white/60">qr_scanned_at</div>
                <div className="font-mono text-xs">{fmt(tx.qr_scanned_at)}</div>
                <div className="text-white/60">reconciled_at</div>
                <div className="font-mono text-xs">{fmt(tx.reconciled_at)}</div>
                <div className="text-white/60">settled_at</div>
                <div className="font-mono text-xs">{fmt(tx.settled_at)}</div>
                <div className="text-white/60">external_ref</div>
                <div className="font-mono text-xs">{tx.external_ref ?? "-"}</div>
              </div>
            </div>

            <div className="sm:col-span-2 rounded-2xl border border-white/10 bg-white/5 p-6">
              <div className="text-xs text-white/60">Audit Log (append-only)</div>
              <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-black/20">
                <table className="w-full text-left text-sm">
                  <thead className="bg-black/20 text-xs text-white/60">
                    <tr>
                      <th className="px-4 py-3">At</th>
                      <th className="px-4 py-3">Actor</th>
                      <th className="px-4 py-3">Action</th>
                      <th className="px-4 py-3">Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-4 text-white/60">
                          No entries yet.
                        </td>
                      </tr>
                    ) : (
                      audit.map((a, idx: number) => (
                        <tr key={idx} className="border-t border-white/10 align-top">
                          <td className="px-4 py-3 font-mono text-xs">{fmt(a.at)}</td>
                          <td className="px-4 py-3 text-white/80">{a.actor}</td>
                          <td className="px-4 py-3 font-semibold">{a.action}</td>
                          <td className="px-4 py-3 font-mono text-xs text-white/70">{JSON.stringify(a.data)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">Loading transaction…</div>
        )}
      </div>
    </div>
  );
}
