"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { PondoDemoNav } from "@/components/PondoDemoNav";
import { useAuth } from "@/lib/auth";
import { getDemoOrder, login, resolveManualReviewOrder, type DemoOrderDetail } from "@/lib/api";

function money(cents: number) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(cents / 100);
}

function manualReviewState(reviewStatus: string | null | undefined, riskDecision: string | null | undefined) {
  if (reviewStatus === "approved") {
    return {
      title: "Manual review approved - released to fulfilment",
      message: "The supporting documents were reviewed and approved. The order has been released into the normal fulfilment process.",
    };
  }
  if (reviewStatus === "declined") {
    return {
      title: "Manual review declined",
      message: "The supporting documents were reviewed and the order was declined. It will not proceed to fulfilment.",
    };
  }
  if (riskDecision === "manual_review_hold") {
    return {
      title: "Supporting documents received - awaiting manual review",
      message: "The supporting documents were received successfully, but the order remains paused until an analyst completes the review.",
    };
  }
  return {
    title: "Order confirmed",
    message: "Every verified order generates a unique QR code for PED-assisted delivery collection.",
  };
}

function buildReviewAssistantSummary(reviewStatus: string | null | undefined, riskDecision: string | null | undefined) {
  const recommendation =
    reviewStatus === "approved"
      ? "approved"
      : reviewStatus === "declined"
        ? "declined"
        : riskDecision === "manual_review_hold"
          ? "approve"
          : "approve";

  return {
    summary:
      recommendation === "declined"
        ? "AI review assistant recommends decline because the review outcome remains unresolved against the current verification state."
        : "AI review assistant recommends approval because the supporting documents have been submitted and the case is ready for fulfilment release in this demo flow.",
    reasons: [
      "Supporting documents submitted",
      "Manual-review case awaiting analyst decision",
      "Back-office approval is required before fulfilment release",
    ],
  };
}

export default function ConfirmationPage() {
  const { id } = useParams<{ id: string }>();
  const { auth, setAuth, token } = useAuth();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<DemoOrderDetail | null>(null);
  const [reviewAssistantOpen, setReviewAssistantOpen] = useState(false);

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

  async function onResolveReview(decision: "approved" | "declined") {
    if (!token || !id) return;
    setBusy(true);
    setError("");
    try {
      const out = await resolveManualReviewOrder(token, id, decision);
      setData((current) => (current ? { ...current, transaction: out.transaction } : current));
    } catch (e) {
      setError(e instanceof Error ? e.message : "manual_review_resolve_failed");
    } finally {
      setBusy(false);
    }
  }

  const tx = data?.transaction;
  const underManualReview = tx?.risk_decision === "manual_review_hold";
  const reviewState = manualReviewState(tx?.review_status, tx?.risk_decision);
  const reviewAssistant = buildReviewAssistantSummary(tx?.review_status, tx?.risk_decision);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#e9f1ff_0%,#f7faff_34%,#edf4ff_100%)] text-pondo-navy-900">
      <PondoDemoNav />
      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">{underManualReview ? reviewState.title : "Order confirmed"}</h1>
        <p className="mt-2 text-sm text-slate-600">
          {underManualReview ? reviewState.message : "Every verified order generates a unique QR code for PED-assisted delivery collection."}
        </p>

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
                    Status: <span className="font-semibold text-pondo-navy-800">{tx.status}</span> | Gateway:{" "}
                    <span className="font-semibold text-pondo-navy-800">{tx.gateway}</span>
                  </div>
                  {underManualReview ? (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      {tx.review_status === "approved"
                        ? "Manual review is complete and the order has been released to fulfilment."
                        : tx.review_status === "declined"
                          ? "Manual review declined this order after document review."
                          : "Supporting documents received does not mean review approved. Fulfilment stays paused until a manual-review analyst releases the order."}
                    </div>
                  ) : null}
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
              {underManualReview && tx?.review_status !== "approved" && tx?.review_status !== "declined" ? (
                <button
                  onClick={() => setReviewAssistantOpen(true)}
                  className="rounded-xl bg-pondo-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-[#243b68]"
                >
                  Open AI Review Assistant Demo
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-pondo-line bg-white p-6 text-sm text-slate-600">Loading...</div>
        )}
      </div>

      {reviewAssistantOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4">
          <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.28)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Demo Review Popup</div>
                <h3 className="mt-2 text-2xl font-extrabold text-pondo-navy-900">AI Review Assistant</h3>
                <p className="mt-2 text-sm text-slate-600">
                  This pop-screen stands in for a back-office analyst workflow and is hidden from customers in a production setup.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReviewAssistantOpen(false)}
                className="rounded-full border border-slate-200 px-3 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-4 text-sm text-sky-900">
              <div className="font-bold">Assistant recommendation</div>
              <div className="mt-2">{reviewAssistant.summary}</div>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="text-sm font-bold text-pondo-navy-900">Review signals considered</div>
              <div className="mt-3 space-y-2 text-sm text-slate-700">
                {reviewAssistant.reasons.map((reason) => (
                  <div key={reason} className="rounded-xl bg-white px-3 py-2">
                    {reason}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                onClick={async () => {
                  await onResolveReview("approved");
                  setReviewAssistantOpen(false);
                }}
                disabled={busy}
                className="rounded-xl bg-[#1fb782] px-5 py-3 font-bold text-white hover:bg-[#19a575] disabled:opacity-60"
              >
                {busy ? "Updating..." : "Approve And Release To Fulfilment"}
              </button>
              <button
                onClick={async () => {
                  await onResolveReview("declined");
                  setReviewAssistantOpen(false);
                }}
                disabled={busy}
                className="rounded-xl border border-red-300 bg-white px-5 py-3 font-bold text-red-700 hover:bg-red-50 disabled:opacity-60"
              >
                {busy ? "Updating..." : "Decline Review"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
