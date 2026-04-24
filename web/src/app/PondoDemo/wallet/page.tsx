"use client";

import { useMemo, useState } from "react";
import { PondoDemoNav } from "@/components/PondoDemoNav";
import { getWalletBalance, login, topUpWallet, type SettlementBank } from "@/lib/api";
import { PAYMENT_METHOD_OPTIONS, type PaymentMethod, paymentMethodLabel } from "@/lib/paymentMethods";
import { useAuth } from "@/lib/auth";

function money(cents: number) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(cents / 100);
}

const walletMethods = PAYMENT_METHOD_OPTIONS.filter((option) => option.id !== "evoucher_wallet");

export default function WalletPage() {
  const { token, setAuth } = useAuth();
  const [customerId, setCustomerId] = useState("amara@email.com");
  const [amountRand, setAmountRand] = useState("500");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("payfast");
  const [settlementBank, setSettlementBank] = useState<SettlementBank>("absa");
  const [walletBalanceCents, setWalletBalanceCents] = useState(0);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const amountCents = useMemo(() => Math.max(0, Math.round(Number(amountRand || 0) * 100)), [amountRand]);

  async function ensureAuth() {
    if (token) return token;
    const out = await login({ username: customerId, password: "demo", role: "customer" });
    setAuth({ token: out.token, role: out.role, username: customerId });
    return out.token;
  }

  async function refreshBalance(authToken: string) {
    const out = await getWalletBalance(authToken, customerId);
    setWalletBalanceCents(out.balanceCents);
  }

  async function onTopUp() {
    if (!amountCents) {
      setMessage("Enter a top-up amount greater than zero.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const authToken = await ensureAuth();
      const out = await topUpWallet(authToken, {
        customerId,
        amountCents,
        paymentMethod,
        settlementBank,
        notifyEmail: customerId,
      });
      setWalletBalanceCents(out.walletBalanceCents);
      setMessage(`Wallet top-up completed via ${paymentMethodLabel(paymentMethod)}. New balance: ${money(out.walletBalanceCents)}.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "wallet_topup_failed");
    } finally {
      setBusy(false);
    }
  }

  async function onRefresh() {
    setBusy(true);
    setMessage("");
    try {
      const authToken = await ensureAuth();
      await refreshBalance(authToken);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "wallet_refresh_failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f1f3f7] text-pondo-navy-900">
      <PondoDemoNav />
      <div className="mx-auto max-w-[960px] px-4 py-6">
        <h1 className="text-5xl font-black tracking-tight">Wallet Top-Up</h1>
        <p className="mt-2 text-sm text-slate-600">Top up the eVoucher wallet using the same payment methods supported in checkout.</p>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <section className="rounded-2xl border border-pondo-line bg-white p-5 shadow-sm">
            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                <div className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-600">Customer</div>
                <input
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="w-full rounded-lg border border-pondo-line bg-white px-3 py-2 text-slate-800"
                />
              </label>
              <label>
                <div className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-600">Amount (ZAR)</div>
                <input
                  value={amountRand}
                  onChange={(e) => setAmountRand(e.target.value)}
                  className="w-full rounded-lg border border-pondo-line bg-white px-3 py-2 text-slate-800"
                />
              </label>
            </div>

            <label className="mt-4 block">
              <div className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-600">Payment Method</div>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full rounded-lg border border-pondo-line bg-white px-3 py-2 text-slate-800"
              >
                {walletMethods.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div className="mt-2 text-xs text-slate-500">
                {walletMethods.find((option) => option.id === paymentMethod)?.helper}
              </div>
            </label>

            <label className="mt-4 block">
              <div className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-600">Settlement Bank</div>
              <select
                value={settlementBank}
                onChange={(e) => setSettlementBank(e.target.value as SettlementBank)}
                className="w-full rounded-lg border border-pondo-line bg-white px-3 py-2 text-slate-800"
              >
                <option value="absa">ABSA Business Account</option>
                <option value="fnb">FNB Business Account</option>
                <option value="standard_bank">Standard Bank Business Account</option>
              </select>
            </label>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onTopUp}
                disabled={busy}
                className="rounded-xl bg-pondo-orange-500 px-5 py-3 text-sm font-bold text-white hover:bg-pondo-orange-400 disabled:opacity-60"
              >
                {busy ? "Processing..." : "Complete Wallet Top-Up"}
              </button>
              <button
                type="button"
                onClick={onRefresh}
                disabled={busy}
                className="rounded-xl border border-pondo-line bg-white px-5 py-3 text-sm font-semibold text-pondo-navy-800 hover:bg-[#eef3ff] disabled:opacity-60"
              >
                Refresh Balance
              </button>
            </div>

            {message ? (
              <div className="mt-4 rounded-xl border border-pondo-line bg-[#f7faff] px-4 py-3 text-sm text-slate-700">
                {message}
              </div>
            ) : null}
          </section>

          <aside className="rounded-2xl border border-pondo-line bg-white p-5 shadow-sm">
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Wallet Balance</div>
            <div className="mt-4 text-4xl font-black text-pondo-orange-500">{money(walletBalanceCents)}</div>
            <div className="mt-3 text-sm text-slate-600">
              Wallet payments can now be topped up via {paymentMethodLabel(paymentMethod)} and then reused in the checkout journey.
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

