"use client";

import { useMemo, useState } from "react";
import QRCode from "qrcode.react";
import JsBarcode from "jsbarcode";
import { TopNav } from "@/components/TopNav";
import { useAuth } from "@/lib/auth";
import { creditVet, initiateCheckout, login, pay, scanQr, type Role, type Transaction } from "@/lib/api";

function getErrorMessage(err: unknown) {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "request_failed";
}

function formatMoney(amountCents: number, currency: string) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency }).format(amountCents / 100);
}

function Barcode({ value }: { value: string }) {
  const svgId = useMemo(() => `barcode-${value}`, [value]);
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="text-xs text-white/60">Barcode (Transaction ID)</div>
      <svg
        id={svgId}
        className="mt-3 w-full"
        ref={(el) => {
          if (!el) return;
          try {
            JsBarcode(el, value, {
              displayValue: true,
              fontSize: 12,
              height: 60,
              margin: 0,
              background: "transparent",
              lineColor: "#fff",
            });
          } catch {
            // no-op
          }
        }}
      />
    </div>
  );
}

export default function CheckoutPage() {
  const { auth, setAuth, token } = useAuth();
  const [username, setUsername] = useState("customer@example.com");
  const [password, setPassword] = useState("demo");
  const [role, setRole] = useState<Role>("customer");

  const [amountCents, setAmountCents] = useState(19999);
  const [paymentMethod, setPaymentMethod] = useState("card");
  const [consent, setConsent] = useState(true);
  const [bureau, setBureau] = useState<"transunion" | "experian">("transunion");

  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [qrPayload, setQrPayload] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function onLogin() {
    setError("");
    setBusy(true);
    try {
      const out = await login({ username, password, role });
      setAuth({ token: out.token, role: out.role, username });
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function onInitiate() {
    setError("");
    setBusy(true);
    try {
      const out = await initiateCheckout(token, {
        customerId: username,
        amountCents,
        currency: "ZAR",
        paymentMethod,
      });
      setTransaction(out.transaction);
      setQrPayload(out.qrPayload);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function onScan() {
    if (!transaction) return;
    setError("");
    setBusy(true);
    try {
      const out = await scanQr(token, transaction.id, qrPayload);
      setTransaction(out.transaction);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function onCreditVet() {
    if (!transaction) return;
    setError("");
    setBusy(true);
    try {
      const out = await creditVet(token, transaction.id, { consent, bureau });
      setTransaction(out.transaction);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function onPay() {
    if (!transaction) return;
    setError("");
    setBusy(true);
    try {
      const out = await pay(token, transaction.id, paymentMethod);
      setTransaction(out.transaction);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <TopNav />
      <div className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Checkout Demo</h1>
        <p className="mt-2 text-sm text-white/60">Initiate a transaction, issue QR/barcode, run credit vetting, authorize payment.</p>

        {!auth ? (
          <div className="mt-6 grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-6 sm:grid-cols-4">
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
            <label>
              <div className="text-xs text-white/60">Role</div>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="mt-2 w-full rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-white/30"
              >
                <option value="customer">customer</option>
                <option value="sponsor">sponsor</option>
              </select>
            </label>
            <div className="sm:col-span-4 flex items-center justify-between">
              <button
                onClick={onLogin}
                disabled={busy}
                className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-white/90 disabled:opacity-50"
              >
                Sign in
              </button>
              {error ? <div className="text-sm text-red-300">{error}</div> : null}
            </div>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-6 sm:grid-cols-4">
            <label>
              <div className="text-xs text-white/60">Amount</div>
              <input
                value={amountCents}
                onChange={(e) => setAmountCents(Number(e.target.value))}
                type="number"
                className="mt-2 w-full rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-white/30"
              />
              <div className="mt-1 text-xs text-white/50">{formatMoney(amountCents, "ZAR")}</div>
            </label>
            <label>
              <div className="text-xs text-white/60">Payment Method</div>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="mt-2 w-full rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-white/30"
              >
                {["card", "eft", "pos", "speedpoint", "bnpl", "loyalty"].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-xs text-white/50">BNPL requires credit vet tier A/B.</div>
            </label>
            <label className="sm:col-span-2">
              <div className="text-xs text-white/60">Credit Bureau</div>
              <select
                value={bureau}
                onChange={(e) => setBureau(e.target.value as "transunion" | "experian")}
                className="mt-2 w-full rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-white/30"
              >
                <option value="transunion">TransUnion</option>
                <option value="experian">Experian</option>
              </select>
              <label className="mt-3 flex items-center gap-2 text-sm text-white/70">
                <input checked={consent} onChange={(e) => setConsent(e.target.checked)} type="checkbox" className="h-4 w-4" />
                POPIA consent for soft credit enquiry
              </label>
            </label>

            <div className="sm:col-span-4 flex flex-wrap items-center gap-3">
              <button
                onClick={onInitiate}
                disabled={busy}
                className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-white/90 disabled:opacity-50"
              >
                Initiate Transaction
              </button>
              <button
                onClick={onScan}
                disabled={busy || !transaction}
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50"
              >
                Simulate QR Scan
              </button>
              <button
                onClick={onCreditVet}
                disabled={busy || !transaction}
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50"
              >
                Run Credit Vetting
              </button>
              <button
                onClick={onPay}
                disabled={busy || !transaction}
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50"
              >
                Authorize Payment
              </button>
              {error ? <div className="text-sm text-red-300">{error}</div> : null}
            </div>
          </div>
        )}

        {transaction ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <div className="text-xs text-white/60">QR Code (HMAC-signed payload)</div>
              <div className="mt-4 flex justify-center rounded-xl border border-white/10 bg-black/20 p-4">
                <QRCode value={qrPayload} size={220} fgColor="#ffffff" bgColor="#00000000" />
              </div>
              <div className="mt-3 break-all rounded-xl border border-white/10 bg-black/20 p-3 font-mono text-[11px] text-white/70">
                {qrPayload}
              </div>
            </div>
            <div className="grid gap-4">
              <Barcode value={transaction.id} />
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="text-xs text-white/60">Transaction State</div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div className="text-white/60">status</div>
                  <div className="font-semibold">{transaction.status}</div>
                  <div className="text-white/60">gateway</div>
                  <div className="font-semibold">{transaction.gateway}</div>
                  <div className="text-white/60">gateway_status</div>
                  <div className="font-semibold">{transaction.gateway_status}</div>
                  <div className="text-white/60">credit_tier</div>
                  <div className="font-semibold">{transaction.credit_tier ?? "-"}</div>
                  <div className="text-white/60">qr_scanned_at</div>
                  <div className="font-mono text-[12px]">{transaction.qr_scanned_at ?? "-"}</div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
