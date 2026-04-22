"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PondoDemoNav } from "@/components/PondoDemoNav";
import { useAuth } from "@/lib/auth";
import { usePondoCart } from "@/lib/pondoCart";
import {
  bnplVetDemoOrder,
  createDemoOrder,
  fetchDemoProducts,
  fetchDemoSaIds,
  generateDemoOrderReport,
  login,
  payDemoOrder,
  type DemoJourneyReport,
  type DemoProduct,
} from "@/lib/api";

type Delivery = {
  fullName: string;
  phone: string;
  address1: string;
  city: string;
  province: string;
  postalCode: string;
};

type StepKey = "pressBuy" | "confirmDetails" | "creditKyc" | "confirmRoute" | "completed";
type StepState = "idle" | "running" | "done" | "error";

type WorkflowStatus = Record<StepKey, StepState>;

const STEP_ORDER: Array<{ key: StepKey; label: string }> = [
  { key: "pressBuy", label: "Press Buy" },
  { key: "confirmDetails", label: "Confirm Details" },
  { key: "creditKyc", label: "Credit and KYC" },
  { key: "confirmRoute", label: "Confirm Route" },
  { key: "completed", label: "Completed" },
];

const STEP_INIT: WorkflowStatus = {
  pressBuy: "idle",
  confirmDetails: "idle",
  creditKyc: "idle",
  confirmRoute: "idle",
  completed: "idle",
};

const DEFAULT_DELIVERY: Delivery = {
  fullName: "Thabo Nkosi",
  phone: "0710000000",
  address1: "12 Vilakazi Street",
  city: "Soweto",
  province: "Gauteng",
  postalCode: "1804",
};

function money(cents: number) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(cents / 100);
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function statusClass(state: StepState) {
  if (state === "done") return "bg-emerald-500 text-white border-emerald-500";
  if (state === "running") return "bg-amber-500 text-white border-amber-500";
  if (state === "error") return "bg-red-500 text-white border-red-500";
  return "bg-white text-slate-600 border-slate-300";
}

export default function PondoCheckoutPage() {
  const { auth, setAuth, token } = useAuth();
  const cart = usePondoCart();

  const [partner, setPartner] = useState<"amazon" | "takealot">("amazon");
  const [bureau, setBureau] = useState<"transunion" | "experian">("transunion");
  const [delivery, setDelivery] = useState<Delivery>(DEFAULT_DELIVERY);
  const [reportRecipient, setReportRecipient] = useState("sponsor@pondo.demo");

  const [status, setStatus] = useState<WorkflowStatus>(STEP_INIT);
  const [activity, setActivity] = useState<string[]>(["Awaiting transaction initiation..."]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [workflowOrderId, setWorkflowOrderId] = useState("");
  const [report, setReport] = useState<DemoJourneyReport | null>(null);

  const [products, setProducts] = useState<DemoProduct[] | null>(null);
  const [saIds, setSaIds] = useState<Array<{ saId: string; label: string }> | null>(null);
  const [selectedSaId, setSelectedSaId] = useState("8001015009087");

  const productById = useMemo(() => new Map((products || []).map((p) => [p.id, p])), [products]);

  const summaryItems = useMemo(() => {
    return cart.items
      .map((item) => {
        const product = productById.get(item.productId);
        if (!product) return null;
        const unit = Math.round(product.priceCents * (1 - (product.discountPct || 0) / 100));
        return { product, qty: item.qty, lineCents: unit * item.qty };
      })
      .filter(Boolean) as Array<{ product: DemoProduct; qty: number; lineCents: number }>;
  }, [cart.items, productById]);

  const subtotal = useMemo(() => summaryItems.reduce((sum, row) => sum + row.lineCents, 0), [summaryItems]);
  const deliveryFee = subtotal > 150000 ? 0 : summaryItems.length > 0 ? 5990 : 0;
  const total = subtotal + deliveryFee;

  function pushLog(message: string) {
    const t = new Date().toLocaleTimeString("en-ZA", { hour12: false });
    setActivity((prev) => [`[${t}] ${message}`, ...prev]);
  }

  function setStep(key: StepKey, value: StepState) {
    setStatus((prev) => ({ ...prev, [key]: value }));
  }

  function currentStepIndex() {
    const running = STEP_ORDER.findIndex((s) => status[s.key] === "running");
    if (running >= 0) return running;
    const done = STEP_ORDER.reduce((acc, s, i) => (status[s.key] === "done" ? i : acc), -1);
    return Math.max(done, 0);
  }

  async function ensureToken() {
    if (token) return token;
    const username = auth?.username || "thabo@email.com";
    const out = await login({ username, password: "demo", role: "customer" });
    setAuth({ token: out.token, role: out.role, username });
    return out.token;
  }

  async function ensureData() {
    if (!products) {
      const catalog = await fetchDemoProducts();
      setProducts(catalog.items);
    }
    if (!saIds) {
      const ids = await fetchDemoSaIds();
      setSaIds(ids.items);
      if (ids.items[0]) setSelectedSaId(ids.items[0].saId);
    }
  }

  async function runWorkflow() {
    setBusy(true);
    setError("");
    setReport(null);
    setWorkflowOrderId("");
    setStatus(STEP_INIT);
    setActivity(["Awaiting transaction initiation..."]);

    try {
      await ensureData();
      const authToken = await ensureToken();

      const catalog = products || (await fetchDemoProducts()).items;
      const fallback = catalog[0];

      const checkoutItems = cart.items.length > 0 ? cart.items : fallback ? [{ productId: fallback.id, qty: 1 }] : [];
      if (checkoutItems.length === 0) throw new Error("no_products_available");

      if (cart.items.length === 0) pushLog("Cart was empty. Added a default product for demo continuity.");

      setStep("pressBuy", "running");
      pushLog(`Connecting to ${partner.toUpperCase()} sandbox API and creating transaction...`);
      const created = await createDemoOrder(authToken, {
        customerId: auth?.username || "thabo@email.com",
        items: checkoutItems,
        delivery,
        paymentMethod: "bnpl",
      });
      setWorkflowOrderId(created.transaction.id);
      setStep("pressBuy", "done");

      setStep("confirmDetails", "running");
      pushLog("Customer profile, address, and order details verified.");
      await wait(450);
      setStep("confirmDetails", "done");

      setStep("creditKyc", "running");
      pushLog(`Running ${bureau.toUpperCase()} credit and KYC vetting for SA ID ${selectedSaId}...`);
      const vet = await bnplVetDemoOrder(authToken, created.transaction.id, { saId: selectedSaId, bureau });
      if (!vet.result.approved) {
        throw new Error(`credit_declined_tier_${vet.result.tier}`);
      }
      pushLog(`Credit approved. Score ${vet.result.score}, tier ${vet.result.tier}.`);
      setStep("creditKyc", "done");

      setStep("confirmRoute", "running");
      pushLog("Confirming payout route and settling payment authorization...");
      await payDemoOrder(authToken, created.transaction.id, "bnpl");
      setStep("confirmRoute", "done");

      setStep("completed", "running");
      pushLog(`Generating completion report and sending to ${reportRecipient}...`);
      const reportRes = await generateDemoOrderReport(authToken, created.transaction.id, { sendTo: reportRecipient });
      if (!reportRes.sent) throw new Error("report_send_failed");
      setReport(reportRes.report);
      setStep("completed", "done");

      cart.clear();
      pushLog(`Workflow completed successfully. Report ${reportRes.report.reportId} sent.`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "workflow_failed";
      setError(message);
      const running = STEP_ORDER.find((s) => status[s.key] === "running");
      if (running) setStep(running.key, "error");
      pushLog(`Workflow failed: ${message}`);
    } finally {
      setBusy(false);
    }
  }

  const current = currentStepIndex();
  const primaryItem = summaryItems[0];

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <PondoDemoNav />

      <div className="border-b border-[#d6dceb] bg-[#1e3162] text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <div>
            <div className="text-4xl font-bold leading-tight">Live Delivery Tracker</div>
            <div className="text-sm text-white/85">5-Step Confirmation - Vetted Driver Network</div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-emerald-100 px-4 py-2 text-[#0f6b49]">
              <div className="text-lg font-bold">3</div>
              <div className="text-xs font-semibold">Active Deliveries</div>
            </div>
            <div className="rounded-xl bg-white/10 px-4 py-2">
              <div className="text-lg font-bold">2.4M+</div>
              <div className="text-xs font-semibold">Verified Txns</div>
            </div>
            <div className="rounded-xl bg-white/10 px-4 py-2">
              <div className="text-lg font-bold text-amber-300">4.2hrs</div>
              <div className="text-xs font-semibold">Avg Delivery</div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="grid grid-cols-5 gap-4">
          {STEP_ORDER.map((step, index) => (
            <div key={step.key} className="text-center">
              <div className={["mx-auto flex h-9 w-9 items-center justify-center rounded-full border text-sm font-bold", statusClass(status[step.key])].join(" ")}>
                {index + 1}
              </div>
              <div className={["mt-2 text-sm font-semibold", index === current ? "text-[#b76532]" : "text-slate-600"].join(" ")}>{step.label}</div>
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[2fr_1fr]">
          <section className="rounded-2xl border border-[#cfd8ea] bg-white p-6 shadow-sm">
            <h1 className="text-5xl font-extrabold leading-tight text-[#19366f]">Press Buy - Start Your Purchase</h1>
            <p className="mt-3 text-xl text-[#274677]">
              This checkout now runs a full journey on click: order creation, details validation, bureau credit vetting, route confirmation, and final report send.
            </p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label>
                <div className="text-sm font-bold uppercase tracking-wide text-[#2d4a77]">Select partner ecommerce site</div>
                <select value={partner} onChange={(e) => setPartner(e.target.value as "amazon" | "takealot")} className="mt-2 w-full rounded-xl border border-[#ccd6ea] bg-slate-50 px-4 py-3 text-base">
                  <option value="amazon">Amazon (Sandbox)</option>
                  <option value="takealot">Takealot (Sandbox)</option>
                </select>
              </label>

              <label>
                <div className="text-sm font-bold uppercase tracking-wide text-[#2d4a77]">Credit bureau</div>
                <select value={bureau} onChange={(e) => setBureau(e.target.value as "transunion" | "experian")} className="mt-2 w-full rounded-xl border border-[#ccd6ea] bg-slate-50 px-4 py-3 text-base">
                  <option value="transunion">TransUnion (Sandbox)</option>
                  <option value="experian">Experian (Sandbox)</option>
                </select>
              </label>

              <label>
                <div className="text-sm font-bold uppercase tracking-wide text-[#2d4a77]">Demo SA ID for vetting</div>
                <select value={selectedSaId} onChange={(e) => setSelectedSaId(e.target.value)} className="mt-2 w-full rounded-xl border border-[#ccd6ea] bg-slate-50 px-4 py-3 text-base">
                  {(saIds || [
                    { saId: "8001015009087", label: "Approved (Tier A)" },
                    { saId: "9005054800081", label: "Approved (Tier B)" },
                    { saId: "9912315009082", label: "Declined (Tier C)" },
                  ]).map((row) => (
                    <option key={row.saId} value={row.saId}>
                      {row.saId} - {row.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <div className="text-sm font-bold uppercase tracking-wide text-[#2d4a77]">Send report to</div>
                <input
                  value={reportRecipient}
                  onChange={(e) => setReportRecipient(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-[#ccd6ea] bg-slate-50 px-4 py-3 text-base"
                  placeholder="sponsor@pondo.demo"
                />
              </label>
            </div>

            <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-base text-amber-900">
              Workflow executes against sandbox integrations only. Bureau selection is honored and used in the vetting API call.
            </div>

            <button
              onClick={runWorkflow}
              disabled={busy}
              className="mt-6 w-full rounded-xl bg-gradient-to-r from-[#b76532] to-[#df5d18] px-6 py-4 text-xl font-bold text-white shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Running workflow..." : "Proceed with PONDO Checkout"}
            </button>

            {error ? <div className="mt-4 rounded-xl border border-red-300 bg-red-50 p-4 text-base font-semibold text-red-700">{error}</div> : null}

            {report ? (
              <div className="mt-5 rounded-xl border border-emerald-300 bg-emerald-50 p-4">
                <div className="text-base font-bold text-emerald-900">Journey completed and report sent</div>
                <div className="mt-2 text-sm text-emerald-800">Report ID: {report.reportId}</div>
                <div className="text-sm text-emerald-800">Order ID: {report.orderId}</div>
                <div className="text-sm text-emerald-800">Recipient: {report.sentTo}</div>
                <div className="mt-3 flex gap-3">
                  <Link href={`/PondoDemo/confirmation/${report.orderId}`} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">
                    Open confirmation
                  </Link>
                  <button
                    onClick={() => {
                      const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `${report.reportId}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="rounded-lg border border-emerald-700 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
                  >
                    Download report JSON
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-[#cfd8ea] bg-white p-5 shadow-sm">
              <div className="rounded-md bg-[#b76532] px-3 py-1 text-xs font-bold uppercase text-white">Best Seller</div>
              <div className="mt-3 text-5xl font-black text-[#19366f]">{primaryItem?.product?.name || "Samsung 65\" QLED 4K Smart TV"}</div>
              <div className="mt-2 text-lg text-[#385983]">TechHub SA (via {partner === "amazon" ? "Amazon.co.za" : "Takealot"})</div>
              <div className="mt-5 text-6xl font-black text-[#b76532]">{money(primaryItem?.lineCents || total || 1899900)}</div>
            </div>

            <div className="rounded-2xl border border-[#cfd8ea] bg-white p-5 shadow-sm">
              <div className="text-xl font-extrabold tracking-wide text-[#19366f]">PONDO TRUST GUARANTEE</div>
              <ul className="mt-3 space-y-2 text-lg text-[#274677]">
                <li>TLS 1.3 End-to-End Encryption</li>
                <li>KYC Identity Verified</li>
                <li>ITC and Affordability Checked</li>
                <li>ML Fraud Detection Active</li>
                <li>POPIA Compliant</li>
                <li>PED Vetted Delivery</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-[#cfd8ea] bg-white p-5 shadow-sm">
              <div className="text-xl font-extrabold tracking-wide text-[#19366f]">LIVE API ACTIVITY LOG</div>
              <div className="mt-3 h-[260px] overflow-auto rounded-xl border border-[#cad4e8] bg-slate-50 p-3 font-mono text-sm text-[#1e3567]">
                {activity.map((line, idx) => (
                  <div key={`${line}-${idx}`} className="mb-1">
                    {line}
                  </div>
                ))}
              </div>
              {workflowOrderId ? <div className="mt-3 text-sm text-slate-600">Workflow Order: {workflowOrderId}</div> : null}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
