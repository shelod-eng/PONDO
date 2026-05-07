"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { PondoDemoNav } from "@/components/PondoDemoNav";
import { useAuth } from "@/lib/auth";
import { getDemoOrder, login, type DemoOrderDetail } from "@/lib/api";

function money(cents: number) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(cents / 100);
}

export default function ConfirmationPage() {
  const { id } = useParams<{ id: string }>();
  const { auth, setAuth, token } = useAuth();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<DemoOrderDetail | null>(null);

  useEffect(() => {
    if (!token || !id) return;
    getDemoOrder(token, id)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "load_failed"));
  }, [token, id]);

  async function quickLogin() {
    setBusy(true);
    setError("");
    try {
      const out = await login({ username: "customer@example.com", password: "demo", role: "customer" });
      setAuth({ token: out.token, role: out.role, username: "customer@example.com" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "login_failed");
    } finally {
      setBusy(false);
    }
  }

  const tx = data?.transaction;

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#e9f1ff_0%,#f7faff_34%,#edf4ff_100%)] text-pondo-navy-900">
      <PondoDemoNav />
      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Order confirmed</h1>
        <p className="mt-2 text-sm text-slate-600">Every verified order generates a unique QR code for PED-assisted delivery collection.</p>

        {!auth ? (
          <div className="mt-6 rounded-2xl border border-pondo-line bg-white p-6">
            <div className="text-sm text-slate-600">Sign in to view your confirmation.</div>
            <button onClick={quickLogin} disabled={busy} className="mt-4 rounded-xl bg-pondo-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-pondo-orange-400 disabled:opacity-50">
              Quick login (demo customer)
            </button>
            {error ? <div className="mt-3 text-sm text-red-300">{error}</div> : null}
          </div>
        ) : tx ? (
          <div className="mt-6 grid gap-4">
            <div className="rounded-2xl border border-pondo-line bg-white p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs text-slate-500">Order ID</div>
                  <div className="mt-1 font-mono text-sm">{tx.id}</div>
                  <div className="mt-3 text-xs text-slate-500">Total</div>
                  <div className="mt-1 text-lg font-semibold">{money(tx.amount_cents)}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    Status: <span className="font-semibold text-pondo-navy-800">{tx.status}</span> â€¢ Gateway:{" "}
                    <span className="font-semibold text-pondo-navy-800">{tx.gateway}</span>
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <QRCodeCanvas value={tx.qr_payload} size={160} fgColor="#ffffff" bgColor="#00000000" />
                </div>
              </div>
              <div className="mt-4 break-all rounded-xl border border-pondo-line bg-pondo-surface-soft p-3 font-mono text-[11px] text-slate-600">{tx.qr_payload}</div>
            </div>

            <div className="flex items-center justify-between">
              <Link href="/PondoDemo/shop" className="text-sm font-semibold text-pondo-navy-800/80 hover:text-white hover:underline">
                Continue shopping
              </Link>

            </div>
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-pondo-line bg-white p-6 text-sm text-slate-600">Loadingâ€¦</div>
        )}
      </div>
    </div>
  );
}

