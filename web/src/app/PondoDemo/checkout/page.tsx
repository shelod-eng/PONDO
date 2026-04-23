"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PondoDemoNav } from "@/components/PondoDemoNav";
import {
  createDemoOrder,
  fetchDemoProducts,
  fetchPartnerCart,
  getDemoOrderProcess,
  login,
  payDemoOrder,
  sendOtp,
  simulateDemoCredit,
  type DeliveryProcess,
  type DemoProduct,
  type PaymentSettlement,
  type PartnerBootstrapSession,
  type PartnerName,
  type SettlementBank,
  verifyOtp,
} from "@/lib/api";
import { fetchGeoLocation, type GeoLocation } from "@/lib/geolocation";
import { useAuth } from "@/lib/auth";
import { usePondoCart } from "@/lib/pondoCart";
import { FALLBACK_IMAGE, FALLBACK_PRODUCTS, IMAGE_BY_PRODUCT } from "@/lib/demoCatalog";
import { validateSAID } from "@/lib/validateSAID";

const partnerOptions: Array<{ id: PartnerName; label: string }> = [
  { id: "amazon", label: "Amazon" },
  { id: "temu", label: "Temu" },
  { id: "takealot", label: "Takealot" },
  { id: "shopify", label: "Shopify" },
  { id: "woocommerce", label: "WooCommerce" },
];

const confirmationSteps = [
  {
    title: "Dispatch Initiation",
    detail: "Email, WhatsApp, and SMS dispatches confirm that the order is in route.",
  },
  {
    title: "Active Tracking",
    detail: "System confirms live dispatch and starts real-time package tracking.",
  },
  {
    title: "Driver Assignment",
    detail: "PONDO verifies and confirms the specific delivery person to the buyer.",
  },
  {
    title: "On-Site Verification",
    detail: "Identity is verified at the door with physical identification checks.",
  },
  {
    title: "Conclusion",
    detail: "Yoco or Vodacom SoftPOS card payment success closes the journey and triggers invoicing.",
  },
];

const journeyVideoFrames = [
  {
    title: "1. Press Buy",
    detail: "Initiates with an accessible explainer to guide user onboarding.",
  },
  {
    title: "2. Confirm Details",
    detail: "Enforces Name, ID, Address and Email with OTP and consent capture.",
  },
  {
    title: "3. Quick Credit & KYC",
    detail: "Verifies identity and runs ITC + affordability checks before progress.",
  },
  {
    title: "4. Confirm Route",
    detail: "Finalizes T&Cs and confirms operational split and delivery routing.",
  },
  {
    title: "5. Completed",
    detail: "Transaction reaches cleared status pending physical fulfillment.",
  },
];

type VetResult = {
  transunionScore: number;
  transunionApproved: boolean;
  kycIdentityVerified: boolean;
  experianIncome: number;
  fraudScore: number;
  approved: boolean;
};

type RouteDecision = {
  merchantSharePct: number;
  customerSharePct: number;
  driverName: string;
  driverBadge: string;
  vehicle: string;
  etaMinutes: number;
};

function money(cents: number) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(cents / 100);
}

function discountedPriceCents(p: DemoProduct) {
  return Math.round(p.priceCents * (1 - (p.discountPct || 0) / 100));
}

function ts() {
  const d = new Date();
  return `[${d.toLocaleTimeString("en-ZA", { hour12: false })}]`;
}

function Stepper({ step, step3Label }: { step: number; step3Label: string }) {
  // Customer sees only 3 steps (Steps 3 & 4 hidden in backend)
  const items = ["Press Buy", "Confirm Details", step3Label];
  return (
    <div className="mb-8 grid grid-cols-3 gap-3 text-center text-[11px] text-slate-500">
      {items.map((label, idx) => {
        const current = idx + 1;
        const active = current <= step;
        return (
          <div key={label} className="flex flex-col items-center gap-2">
            <div className={["h-7 w-7 rounded-full border text-xs font-bold leading-7", active ? "border-[var(--pondo-orange-500)] bg-[var(--pondo-orange-500)] text-white" : "border-[var(--pondo-line)] text-slate-500"].join(" ")}>
              {current}
            </div>
            <div className={active ? "text-[var(--pondo-navy-700)]" : "text-slate-500"}>{label}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function PondoCheckoutPage() {
  const router = useRouter();
  const { token, setAuth } = useAuth();
  const cart = usePondoCart();

  const [step, setStep] = useState(1);
  const [partner, setPartner] = useState<PartnerName>("amazon");
  const [email, setEmail] = useState("amara@email.com");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [session, setSession] = useState<PartnerBootstrapSession | null>(null);
  const [otpRequestId, setOtpRequestId] = useState("");
  const [otpInput, setOtpInput] = useState("");
  const [otpVerified, setOtpVerified] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [demoOtp, setDemoOtp] = useState("");

  // Captured customer details (editable from partner defaults)
  const [capturedFullName, setCapturedFullName] = useState("");
  const [capturedIdNumber, setCapturedIdNumber] = useState("");
  const [capturedPhone, setCapturedPhone] = useState("");
  const [capturedEmail, setCapturedEmail] = useState("");
  const [capturedAddress, setCapturedAddress] = useState("");
  const [capturedCity, setCapturedCity] = useState("");
  const [capturedProvince, setCapturedProvince] = useState("");
  const [capturedPostalCode, setCapturedPostalCode] = useState("");
  const [geoLocationData, setGeoLocationData] = useState<GeoLocation | null>(null);
  const [geoLocationLoading, setGeoLocationLoading] = useState(false);
  const [saidTouched, setSaidTouched] = useState(false);

  const [vetResult, setVetResult] = useState<VetResult | null>(null);
  const [routeDecision, setRouteDecision] = useState<RouteDecision | null>(null);
  const [settlementBank, setSettlementBank] = useState<SettlementBank>("absa");
  const [paymentSettlement, setPaymentSettlement] = useState<PaymentSettlement | null>(null);
  const [completedOrderId, setCompletedOrderId] = useState("");
  const [deliveryProcessSnapshot, setDeliveryProcessSnapshot] = useState<DeliveryProcess | null>(null);
  const [catalog, setCatalog] = useState<DemoProduct[]>(FALLBACK_PRODUCTS);
  const [journeyFrame, setJourneyFrame] = useState(0);
  const [playJourney, setPlayJourney] = useState(false);

  const [apiLogs, setApiLogs] = useState<string[]>(["Awaiting transaction initiation..."]);

  const customer = session?.customer || null;
  const cartCount = cart.count;

  useEffect(() => {
    fetchDemoProducts()
      .then((out) => setCatalog(out.items))
      .catch(() => setCatalog(FALLBACK_PRODUCTS));
  }, []);

  useEffect(() => {
    if (!playJourney) return;
    const timer = window.setInterval(() => {
      setJourneyFrame((prev) => (prev + 1) % journeyVideoFrames.length);
    }, 1700);
    return () => window.clearInterval(timer);
  }, [playJourney]);

  useEffect(() => {
    if (!completedOrderId || !token) return;
    let disposed = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const load = async () => {
      try {
        const out = await getDemoOrderProcess(token, completedOrderId);
        if (disposed) return;
        setDeliveryProcessSnapshot(out);
        if (out.status === "completed" && intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      } catch {
        // Process may not be available for a split second after payment; keep polling.
      }
    };

    load();
    intervalId = setInterval(load, 2000);
    return () => {
      disposed = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [completedOrderId, token]);

  // When session loads, populate captured details and fetch geolocation
  useEffect(() => {
    if (!session?.customer) return;
    
    // Pre-fill captured details from partner session
    setCapturedFullName(session.customer.fullName);
    setCapturedIdNumber(session.customer.idNumber);
    setCapturedPhone(session.customer.phone);
    setCapturedEmail(session.customer.email);
    setCapturedAddress(session.customer.address);
    
    // Fetch geolocation based on client IP
    setGeoLocationLoading(true);
    fetchGeoLocation()
      .then((geo) => {
        setGeoLocationData(geo);
        if (geo) {
          setCapturedCity(geo.city);
          setCapturedProvince(geo.province);
          setCapturedPostalCode(geo.postalCode);
        }
        log(`Geolocation detected: ${geo?.city}, ${geo?.province}`);
      })
      .catch((e) => {
        console.error("Geolocation fetch failed:", e);
        log("Geolocation detection failed - using defaults");
      })
      .finally(() => setGeoLocationLoading(false));
  }, [session]);

  const productById = useMemo(() => {
    const map = new Map(catalog.map((p) => [p.id, p]));
    for (const p of FALLBACK_PRODUCTS) {
      if (!map.has(p.id)) map.set(p.id, p);
    }
    return map;
  }, [catalog]);

  const cartLines = useMemo(() => {
    return cart.items
      .map((item) => {
        const p = productById.get(item.productId);
        if (!p) return null;
        const unitCents = discountedPriceCents(p);
        return { product: p, qty: item.qty, lineCents: unitCents * item.qty, unitCents };
      })
      .filter(Boolean) as Array<{ product: DemoProduct; qty: number; lineCents: number; unitCents: number }>;
  }, [cart.items, productById]);

  const cartSubtotalCents = useMemo(() => cartLines.reduce((sum, line) => sum + line.lineCents, 0), [cartLines]);

  const finalCustomerShareCents = useMemo(() => {
    if (!cartSubtotalCents) return 0;
    const pct = routeDecision?.customerSharePct ?? 95;
    return Math.round((cartSubtotalCents * pct) / 100);
  }, [cartSubtotalCents, routeDecision]);

  const selectedProfileHint = useMemo(() => {
    if (email === "amara@email.com") {
      return "Recommended: This profile is configured to pass KYC, ITC, affordability, and fraud thresholds in demo mode.";
    }
    return "This profile may pass or fail depending on ITC and affordability checks.";
  }, [email]);
  const normalizedIdNumber = capturedIdNumber.replace(/\D/g, "");
  const isSaidComplete = normalizedIdNumber.length === 13;
  const isSaidValid = isSaidComplete && validateSAID(normalizedIdNumber);
  const showSaidFeedback = saidTouched || isSaidComplete;

  const primaryCtaClass =
    "w-full rounded-xl bg-gradient-to-r from-[var(--pondo-orange-500)] to-[#d95a18] px-4 py-3 text-lg font-bold text-white shadow-[0_8px_18px_rgba(217,90,24,0.32)] hover:from-[var(--pondo-orange-400)] hover:to-[var(--pondo-orange-500)] disabled:opacity-60";

  const driverArrivedOnSite = useMemo(() => {
    if (!deliveryProcessSnapshot) return false;
    const onSiteStep = deliveryProcessSnapshot.steps.find((item) => item.index === 4);
    return onSiteStep ? onSiteStep.status !== "pending" : false;
  }, [deliveryProcessSnapshot]);

  const partnerTrackingView = useMemo(() => {
    const steps = confirmationSteps.map((item, idx) => ({
      index: idx + 1,
      title: item.title,
      detail: item.detail,
      status: "pending" as const,
      completedAt: null as string | null,
    }));

    if (deliveryProcessSnapshot) {
      return {
        show: true,
        progressPct: deliveryProcessSnapshot.progressPct,
        processLabel:
          deliveryProcessSnapshot.status === "completed"
            ? "Partner confirmation completed"
            : `${session?.partnerLabel || "Partner"} fulfilment is active`,
        helperText: `PONDO is tracking ${session?.partnerLabel || "partner"} dispatch, driver movement, on-site verification, and SoftPOS payment confirmation in the background.`,
        steps: steps.map((item, idx) => ({
          ...item,
          status: deliveryProcessSnapshot.steps[idx]?.status || item.status,
          completedAt: deliveryProcessSnapshot.steps[idx]?.completedAt || item.completedAt,
        })),
      };
    }

    if (routeDecision && vetResult?.approved) {
      return {
        show: true,
        progressPct: 12,
        processLabel: `${session?.partnerLabel || "Partner"} route confirmed`,
        helperText:
          "Third-party ITC, KYC, affordability, and fraud checks succeeded. Partner dispatch tracking is primed and will advance automatically when fulfilment events and Yoco or Vodacom SoftPOS payment signals are received.",
        steps: steps.map((item, idx) => ({
          ...item,
          status: idx === 0 ? ("active" as const) : item.status,
        })),
      };
    }

    return {
      show: false,
      progressPct: 0,
      processLabel: "",
      helperText: "",
      steps,
    };
  }, [deliveryProcessSnapshot, routeDecision, session?.partnerLabel, vetResult?.approved]);

  function log(message: string) {
    setApiLogs((prev) => [`${ts()} ${message}`, ...prev].slice(0, 40));
  }

  async function ensureCustomerAuth(forceRefresh = false, preferredUsername?: string) {
    const username = (preferredUsername || capturedEmail || email || "customer@example.com").trim().toLowerCase();
    if (token && !forceRefresh) return token;
    const out = await login({ username, password: "demo", role: "customer" });
    setAuth({ token: out.token, role: out.role, username });
    return out.token;
  }

  async function onPressBuy() {
    if (!cart.items.length) {
      setError("Your cart is empty. Add items before starting checkout.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await ensureCustomerAuth();
      log(`Connecting to ${partner.toUpperCase()} sandbox API...`);
      const out = await fetchPartnerCart({ partner, email });
      setSession(out.session);
      setOtpRequestId("");
      setOtpVerified(false);
      setTermsAccepted(false);
      setVetResult(null);
      setRouteDecision(null);
      setPaymentSettlement(null);
      setCompletedOrderId("");
      setDeliveryProcessSnapshot(null);
      setStep(2);
      log(`Partner profile fetched: ${out.session.product.name} @ ${money(out.session.product.priceCents)}`);
      log(`Cart locked for checkout: ${cart.items.length} line item(s)`);
      log(`Customer profile pre-loaded from ${out.session.partnerLabel}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "press_buy_failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSendOtp() {
    if (!session || !customer) return;
    if (!isSaidValid) {
      setSaidTouched(true);
      setError("Enter a valid 13-digit South African ID number before requesting OTP.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const out = await sendOtp({ sessionId: session.sessionId, channel: "sms", destination: customer.phone });
      setOtpRequestId(out.requestId);
      setDemoOtp(out.demoOtp);
      setOtpVerified(false);
      log(`OTP sent to ${customer.phone} via Twilio SMS`);
      log(`OTP reference: ${out.requestId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "otp_send_failed");
    } finally {
      setBusy(false);
    }
  }

  async function onVerifyOtp() {
    setError("");
    setBusy(true);
    try {
      await verifyOtp({ requestId: otpRequestId, code: otpInput });
      setOtpVerified(true);
      log("OTP accepted - identity confirmed");
    } catch (e) {
      setOtpVerified(false);
      setError(e instanceof Error ? e.message : "otp_verify_failed");
    } finally {
      setBusy(false);
    }
  }

  async function onRunChecks() {
    if (!customer) return;
    setError("");
    setBusy(true);
    try {
      const data = await simulateDemoCredit({ saId: normalizedIdNumber, bureau: "transunion" });
      const transunionScore = data.result.score as number;
      const transunionApproved = Boolean(data.result.approved);
      const kycIdentityVerified = true;
      const experianIncome = customer.monthlyIncome;
      const fraudScore = Math.max(0.01, Number(((850 - transunionScore) / 10000 + 0.01).toFixed(2)));
      const approved = transunionApproved && kycIdentityVerified && experianIncome >= 15000 && fraudScore <= 0.08;

      setVetResult({
        transunionScore,
        transunionApproved,
        kycIdentityVerified,
        experianIncome,
        fraudScore,
        approved,
      });

      log(`TransUnion ITC score: ${transunionScore} (${transunionApproved ? "approved" : "declined"})`);
      log(`Experian affordability: income ${new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(experianIncome)}/mo`);
      log(`Python fraud score: ${fraudScore.toFixed(2)} (${fraudScore <= 0.08 ? "low risk" : "high risk"})`);
      log(approved ? "All checks passed - customer approved for checkout" : "Checks failed - manual review required");
      
      return approved;
    } catch (e) {
      setError(e instanceof Error ? e.message : "run_checks_failed");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function onConfirmRoute() {
    const route: RouteDecision = {
      merchantSharePct: 5,
      customerSharePct: 95,
      driverName: "Lungelo Dube",
      driverBadge: "PED-2047",
      vehicle: "White Toyota Hilux",
      etaMinutes: 45,
    };
    setRouteDecision(route);
    log(`Payment route confirmed - merchant ${route.merchantSharePct}% / customer ${route.customerSharePct}%`);
    log(`PED courier assigned: ${route.driverName} (${route.driverBadge})`);
  }

  const step3Label = completedOrderId ? "Completed" : "Credit & KYC";

  async function onCompletePurchase() {
    if (!session || !customer || !routeDecision || !vetResult?.approved || !cartLines.length) return;
    setError("");
    setBusy(true);
    try {
      const submitWithToken = async (authToken: string) => {
        const order = await createDemoOrder(authToken, {
          customerId: capturedEmail,
          items: cartLines.map((line) => ({ productId: line.product.id, qty: line.qty })),
          delivery: {
            fullName: capturedFullName,
            phone: capturedPhone,
            address1: capturedAddress,
            city: capturedCity,
            province: capturedProvince,
            postalCode: capturedPostalCode,
          },
          paymentMethod: "card",
        });
        const pay = await payDemoOrder(authToken, order.transaction.id, "card", {
          settlementBank,
          notifyEmail: "shelod@gmail.com",
          notifyChannels: ["sms", "email"],
        });
        return { order, pay };
      };

      let authToken = await ensureCustomerAuth(true, capturedEmail || customer.email);
      let submitted;
      try {
        submitted = await submitWithToken(authToken);
      } catch (e) {
        const status = typeof e === "object" && e && "status" in e ? (e as { status?: number }).status : undefined;
        if (status !== 401) throw e;
        log("Session expired. Refreshing login token...");
        authToken = await ensureCustomerAuth(true, capturedEmail || customer.email);
        submitted = await submitWithToken(authToken);
      }

      setCompletedOrderId(submitted.order.transaction.id);
      setPaymentSettlement(submitted.pay.settlement);
      log(`Transaction cleared: ${submitted.order.transaction.id}`);
      log("Yoco / Vodacom SoftPOS card payment confirmed");
      log(`Funds settled to PONDO ${submitted.pay.settlement.bankLabel} (${submitted.pay.settlement.accountRef})`);
      log("Driver arrival and partner delivery confirmation tracking is running in the background.");
      log("Customer notification will be released only once on-site arrival is confirmed.");
      log(`Order submitted using ${cartLines.length} cart item(s)`);
      log(`Webhook posted to ${session.partnerLabel}`);
      log(`Partner-managed delivery tracking active - ETA ${routeDecision.etaMinutes} min`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "complete_failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#e9f1ff_0%,#f7faff_34%,#edf4ff_100%)] text-[var(--pondo-navy-900)]">
      <PondoDemoNav />

      <div className="border-b border-[#324978] bg-[var(--pondo-navy-900)]">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-4">
          <div>
            <div className="text-xl font-black tracking-tight text-white">Live Delivery Tracker</div>
            <div className="text-xs font-semibold text-slate-200">5-Step Confirmation - Vetted Driver Network</div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="rounded-full bg-emerald-100 px-4 py-2 text-center text-emerald-700"><span className="font-bold">3 Active Deliveries</span></div>
            <div className="rounded-lg bg-white/12 px-4 py-2 text-center"><div className="font-bold text-sky-200">2.4M+</div><div className="text-slate-100">Verified Txns</div></div>
            <div className="rounded-lg bg-white/12 px-4 py-2 text-center"><div className="font-bold text-[var(--pondo-orange-400)]">4.2hrs</div><div className="text-slate-100">Avg Delivery</div></div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1400px] px-6 py-7">
        <Stepper step={step} step3Label={step3Label} />

        <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
          <div className="rounded-2xl border border-[var(--pondo-line)] bg-white p-5 shadow-lg">
            {step === 1 ? (
              <div className="space-y-5">
                <h1 className="text-3xl font-extrabold text-[var(--pondo-navy-900)]">Press Buy - Start Your Purchase</h1>
                <p className="text-sm text-slate-700">PONDO acts as your trusted checkout layer. We fetch your details from the partner eCommerce site and guide you through a secure, verified payment journey.</p>
                <div className="overflow-hidden rounded-xl border border-[var(--pondo-line)] bg-[var(--pondo-surface-soft)]">
                  <div className="flex items-center justify-between border-b border-[var(--pondo-line)] bg-[#f3f8ff] px-3 py-2">
                    <div className="text-sm font-bold text-[var(--pondo-navy-900)]">Checkout Explainer Video (Storyboard)</div>
                    <div className="text-xs text-slate-500">Frame {journeyFrame + 1} / {journeyVideoFrames.length}</div>
                  </div>
                  <div className="space-y-3 p-3">
                    <div className="rounded-lg border border-[var(--pondo-line)] bg-white p-4">
                      <div className="text-2xl font-black text-[var(--pondo-navy-900)]">{journeyVideoFrames[journeyFrame].title}</div>
                      <div className="mt-2 text-sm text-slate-700">{journeyVideoFrames[journeyFrame].detail}</div>
                    </div>
                    <div className="h-2 overflow-hidden rounded bg-[#dbe8ff]">
                      <div className="h-full bg-[var(--pondo-orange-500)] transition-all duration-500" style={{ width: `${((journeyFrame + 1) / journeyVideoFrames.length) * 100}%` }} />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setPlayJourney((v) => !v)}
                        className="rounded-lg border border-[var(--pondo-line)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--pondo-navy-800)] hover:bg-[#edf4ff]"
                      >
                        {playJourney ? "Pause" : "Play"} explainer
                      </button>
                      <button
                        onClick={() => setJourneyFrame((prev) => (prev + 1) % journeyVideoFrames.length)}
                        className="rounded-lg border border-[var(--pondo-line)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--pondo-navy-800)] hover:bg-[#edf4ff]"
                      >
                        Next frame
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label>
                    <div className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-600">Select Partner eCommerce Site</div>
                    <select value={partner} onChange={(e) => setPartner(e.target.value as PartnerName)} className="w-full rounded-lg border border-[var(--pondo-line)] bg-white px-3 py-2 text-slate-800">
                      {partnerOptions.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <div className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-600">Your Account Email (Demo)</div>
                    <select value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg border border-[var(--pondo-line)] bg-white px-3 py-2 text-slate-800">
                      <option value="amara@email.com">amara@email.com (Amara Naidoo - Pass Profile)</option>
                      <option value="thabo@email.com">thabo@email.com (Thabo Nkosi)</option>
                      <option value="naledi@email.com">naledi@email.com (Naledi Dlamini)</option>
                      <option value="sipho@email.com">sipho@email.com (Sipho Molefe)</option>
                    </select>
                  </label>
                </div>



                <button onClick={onPressBuy} disabled={busy || !cartCount} className={primaryCtaClass}>
                  {busy ? "Loading..." : cartCount ? `Proceed with PONDO Checkout (${cartCount} item${cartCount > 1 ? "s" : ""})` : "Cart is empty"}
                </button>
              </div>
            ) : null}

            {step === 2 && customer ? (
              <div className="space-y-4">
                <h2 className="text-2xl font-extrabold">Confirm Your Details</h2>
                <div className="rounded-lg border border-emerald-500/40 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Edit and verify your personal details. Geolocation is auto-detected from your IP address.</div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Full Name</label>
                    <input 
                      value={capturedFullName} 
                      onChange={(e) => setCapturedFullName(e.target.value)} 
                      className="w-full rounded-lg border border-[var(--pondo-line)] px-3 py-2 text-slate-800" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">ID Number</label>
                    <input 
                      value={capturedIdNumber} 
                      onChange={(e) => {
                        setCapturedIdNumber(e.target.value.replace(/\D/g, "").slice(0, 13));
                        if (!saidTouched) setSaidTouched(true);
                      }}
                      onBlur={() => setSaidTouched(true)}
                      inputMode="numeric"
                      maxLength={13}
                      placeholder="Enter your 13-digit SA ID number"
                      className={[
                        "w-full rounded-lg border px-3 py-2 text-slate-800",
                        showSaidFeedback
                          ? isSaidValid
                            ? "border-emerald-500 bg-emerald-50/40"
                            : "border-red-400 bg-red-50/40"
                          : "border-[var(--pondo-line)]",
                      ].join(" ")}
                    />
                    {showSaidFeedback ? (
                      isSaidValid ? (
                        <p className="mt-1 text-xs font-semibold text-emerald-700">
                          Valid South African ID number.
                        </p>
                      ) : (
                        <p className="mt-1 text-xs font-semibold text-red-600">
                          Enter a valid 13-digit South African ID number.
                        </p>
                      )
                    ) : null}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Phone Number</label>
                    <input 
                      value={capturedPhone} 
                      onChange={(e) => setCapturedPhone(e.target.value)} 
                      className="w-full rounded-lg border border-[var(--pondo-line)] px-3 py-2 text-slate-800" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Email</label>
                    <input 
                      value={capturedEmail} 
                      onChange={(e) => setCapturedEmail(e.target.value)} 
                      className="w-full rounded-lg border border-[var(--pondo-line)] px-3 py-2 text-slate-800" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Address</label>
                    <input 
                      value={capturedAddress} 
                      onChange={(e) => setCapturedAddress(e.target.value)} 
                      className="w-full rounded-lg border border-[var(--pondo-line)] px-3 py-2 text-slate-800" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Postal Code</label>
                    <input 
                      value={capturedPostalCode} 
                      onChange={(e) => setCapturedPostalCode(e.target.value)} 
                      className="w-full rounded-lg border border-[var(--pondo-line)] px-3 py-2 text-slate-800" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">City {geoLocationLoading ? "(detecting...)" : ""}</label>
                    <input 
                      value={capturedCity} 
                      onChange={(e) => setCapturedCity(e.target.value)} 
                      disabled={geoLocationLoading}
                      className="w-full rounded-lg border border-[var(--pondo-line)] px-3 py-2 text-slate-800 disabled:bg-slate-50" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Province/Region {geoLocationLoading ? "(detecting...)" : ""}</label>
                    <input 
                      value={capturedProvince} 
                      onChange={(e) => setCapturedProvince(e.target.value)} 
                      disabled={geoLocationLoading}
                      className="w-full rounded-lg border border-[var(--pondo-line)] px-3 py-2 text-slate-800 disabled:bg-slate-50" 
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--pondo-line)] bg-[var(--pondo-surface-soft)] p-3">
                  <div className="mb-2 text-sm font-bold text-[var(--pondo-navy-800)]">OTP Verification (Twilio SMS / SendGrid Email)</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={onSendOtp} disabled={busy || !isSaidValid} className="rounded-lg bg-[var(--pondo-orange-500)] px-4 py-2 font-bold text-white hover:bg-[var(--pondo-orange-400)] disabled:opacity-60">Send OTP to {capturedPhone}</button>
                    {demoOtp ? <div className="text-xs text-emerald-700">Demo OTP: {demoOtp}</div> : null}
                  </div>
                  {!isSaidValid ? (
                    <div className="mt-2 text-xs text-slate-500">
                      OTP unlocks once a structurally valid SA ID number is entered.
                    </div>
                  ) : null}
                  <div className="mt-3 flex gap-2">
                    <input value={otpInput} onChange={(e) => setOtpInput(e.target.value)} placeholder="Enter OTP" className="w-full rounded-lg border border-[var(--pondo-line)] bg-white px-3 py-2 text-slate-800" />
                    <button onClick={onVerifyOtp} disabled={busy || !otpRequestId} className="rounded-lg bg-[var(--pondo-orange-500)] px-4 py-2 font-bold text-white hover:bg-[var(--pondo-orange-400)] disabled:opacity-60">Verify OTP</button>
                  </div>
                  {otpVerified ? <div className="mt-2 text-sm font-semibold text-emerald-700">OTP verified - identity confirmed</div> : null}
                </div>

                <div className="rounded-xl border border-[var(--pondo-line)] bg-[var(--pondo-surface-soft)] p-3">
                  <div className="mb-2 text-sm font-bold text-[var(--pondo-navy-800)]">Terms & Conditions - POPIA Compliant</div>
                  <div className="max-h-28 overflow-y-auto rounded bg-white p-2 text-xs text-slate-600">
                    By proceeding, you consent to PONDO collecting and processing your personal information (name, SA ID, contact details, geo-location, financial data) for KYC verification, ITC credit checks, affordability assessment, and fraud detection in accordance with POPIA and internal risk controls.
                  </div>
                  <label className="mt-3 flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} />
                    I accept PONDO&apos;s Terms & Conditions and POPIA consent
                  </label>
                </div>

                <button
                  onClick={() => {
                    if (!isSaidValid) {
                      setSaidTouched(true);
                      setError("Please enter a valid South African ID number before proceeding.");
                      return;
                    }
                    if (!otpVerified || !termsAccepted) {
                      setError("Please verify OTP and accept Terms & Conditions before proceeding");
                      return;
                    }
                    log("T&C accepted - POPIA consent captured");
                    setStep(3);
                  }}
                  className={primaryCtaClass}
                >
                  Proceed to Credit & KYC Check
                </button>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="space-y-4">
                <h2 className="text-2xl font-extrabold">Credit & KYC</h2>
                <p className="text-sm text-slate-700">PONDO integrates with TransUnion, Experian, and third-party KYC providers to verify your identity and assess affordability before proceeding.</p>
                <div className="rounded-xl border border-[var(--pondo-line)] bg-[var(--pondo-surface-soft)] text-slate-800">
                  <div className="border-b border-slate-300 px-4 py-3">TransUnion ITC Credit Check</div>
                  <div className="border-b border-slate-300 px-4 py-3">KYC Biometric Verification (ID + Face Match)</div>
                  <div className="border-b border-slate-300 px-4 py-3">Experian Affordability Vetting</div>
                  <div className="px-4 py-3">Python ML Fraud Detection Score</div>
                </div>
                <button
                  onClick={async () => {
                    const approved = await onRunChecks();
                    if (!approved) return;
                    log("Step 3 complete - running Step 4 route confirmation in background...");
                    onConfirmRoute();
                    setStep(5);
                  }}
                  disabled={busy || Boolean(vetResult?.approved)}
                  className={primaryCtaClass}
                >
                  {busy ? "Running checks..." : vetResult?.approved ? "Checks complete" : "Run ITC - KYC - Affordability - Fraud Checks"}
                </button>
                {vetResult?.approved ? (
                  <div className="rounded-lg border border-emerald-500/40 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    Step 3 complete. Step 4 route confirmation was completed in the background.
                  </div>
                ) : null}
              </div>
            ) : null}

            {step === 4 && vetResult ? (
              <div className="space-y-4">
                <h2 className="text-2xl font-extrabold">Checks Completed</h2>
                <div className="rounded-xl border border-[var(--pondo-line)] bg-[var(--pondo-surface-soft)] text-slate-800">
                  <div className="flex items-center justify-between border-b border-slate-300 px-4 py-3"><span>TransUnion ITC Credit Check</span><span className="font-bold">Score: {vetResult.transunionScore} - {vetResult.transunionApproved ? "Approved" : "Declined"}</span></div>
                  <div className="flex items-center justify-between border-b border-slate-300 px-4 py-3"><span>KYC Biometric Verification</span><span className="font-bold">{vetResult.kycIdentityVerified ? "Identity Verified" : "Verification Failed"}</span></div>
                  <div className="flex items-center justify-between border-b border-slate-300 px-4 py-3"><span>Experian Affordability Vetting</span><span className="font-bold">Income {new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(vetResult.experianIncome)}/mo</span></div>
                  <div className="flex items-center justify-between px-4 py-3"><span>Python ML Fraud Detection Score</span><span className="font-bold">Score: {vetResult.fraudScore.toFixed(2)} ({vetResult.fraudScore <= 0.08 ? "Low Risk" : "High Risk"})</span></div>
                </div>

                <div className={["rounded-lg px-4 py-3 text-sm font-bold", vetResult.approved ? "border border-emerald-500/40 bg-emerald-50 text-emerald-800" : "border border-red-500/40 bg-red-50 text-red-700"].join(" ")}>
                  {vetResult.approved ? "All checks passed - customer approved for checkout" : "Checks failed - transaction cannot continue"}
                </div>

                <button onClick={onConfirmRoute} disabled={!vetResult.approved} className={primaryCtaClass}>
                  Confirm Payment Route
                </button>
              </div>
            ) : null}

            {step === 5 && routeDecision ? (
              <div className="space-y-4">
                <h2 className="text-2xl font-extrabold">Finalize Purchase</h2>
                <div className="rounded-xl border border-[var(--pondo-line)] bg-[var(--pondo-surface-soft)] p-4">
                  <div className="mb-2 text-sm font-bold text-[var(--pondo-navy-800)]">PED (Payment Enabled Delivery)</div>
                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    <div>Driver: <span className="font-semibold">{routeDecision.driverName}</span></div>
                    <div>Badge: <span className="font-semibold">{routeDecision.driverBadge}</span></div>
                    <div>Vehicle: <span className="font-semibold">{routeDecision.vehicle}</span></div>
                    <div>ETA: <span className="font-semibold">{routeDecision.etaMinutes} min</span></div>
                  </div>
                  <div className="mt-3 text-xs text-slate-600">PED device (Yoco/SoftPOS) active, KYC-cleared driver, vetted custody chain active.</div>
                </div>

                <div className="rounded-xl border border-[var(--pondo-orange-500)]/35 bg-[#fff6ea] px-4 py-3 text-sm text-[#914500]">
                  Final T&C: By clicking &quot;Complete Purchase&quot; you confirm payment for {cartCount} cart item(s), total {money(finalCustomerShareCents)}, and consent to PED delivery.
                </div>
                <label>
                  <div className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-600">PONDO Settlement Account</div>
                  <select value={settlementBank} onChange={(e) => setSettlementBank(e.target.value as SettlementBank)} className="w-full rounded-lg border border-[var(--pondo-line)] bg-white px-3 py-2 text-slate-800">
                    <option value="absa">ABSA Business Account</option>
                    <option value="fnb">FNB Business Account</option>
                    <option value="standard_bank">Standard Bank Business Account</option>
                  </select>
                </label>
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  Final notification is released only after on-site arrival is confirmed and the Yoco or Vodacom SoftPOS card payment succeeds.
                </div>

                <button
                  onClick={onCompletePurchase}
                  disabled={busy || Boolean(completedOrderId) || cartLines.length === 0}
                  className="w-full rounded-xl bg-gradient-to-r from-[var(--pondo-orange-500)] to-[#d95a18] px-4 py-3 text-2xl font-extrabold text-white shadow-[0_10px_22px_rgba(217,90,24,0.35)] hover:from-[var(--pondo-orange-400)] hover:to-[var(--pondo-orange-500)] disabled:opacity-60"
                >
                  {busy ? "Processing..." : completedOrderId ? "Purchase Completed" : "Complete Purchase - Clear Transaction"}
                </button>

                {completedOrderId ? (
                  <div className="rounded-xl border border-emerald-500/40 bg-emerald-50 p-4 text-sm text-emerald-800">
                    Transaction cleared successfully. Order ID: <span className="font-mono">{completedOrderId}</span>
                    {paymentSettlement ? (
                      <div className="mt-2">
                        Funds settled to <span className="font-semibold">{paymentSettlement.bankLabel}</span> ({paymentSettlement.accountRef}).
                      </div>
                    ) : null}
                    <div className="mt-3 flex gap-3">
                      <button onClick={() => router.push(`/PondoDemo/confirmation/${completedOrderId}`)} className="rounded-lg bg-emerald-600 px-4 py-2 font-bold text-white hover:bg-emerald-500">View Confirmation</button>
                      <button onClick={() => router.push("/PondoDemo/sponsor")} className="rounded-lg border border-emerald-300 px-4 py-2 font-bold text-emerald-800 hover:bg-emerald-100">Open Sponsor Dashboard</button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {error ? <div className="mt-4 rounded-lg border border-red-400/35 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-[var(--pondo-line)] bg-white p-4">
              <div className="mb-2 inline-block rounded bg-[var(--pondo-orange-500)] px-2 py-1 text-[11px] font-bold uppercase text-white">Cart Locked Checkout</div>
              <div className="text-xl font-bold text-[var(--pondo-navy-900)]">Order Summary ({cartCount})</div>
              <div className="mt-1 text-sm text-slate-600">Only cart items are shown and submitted for payment.</div>
              <div className="mt-3 space-y-2">
                {cartLines.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[var(--pondo-line)] bg-[#f7faff] px-3 py-2 text-sm text-slate-600">Your cart is empty.</div>
                ) : (
                  cartLines.map((line) => (
                    <div key={line.product.id} className="grid grid-cols-[44px_1fr] gap-2 rounded-lg border border-[var(--pondo-line)] bg-[#f7faff] p-2">
                      <div
                        className="h-11 w-11 rounded-md bg-slate-100"
                        style={{
                          backgroundImage: `url(${IMAGE_BY_PRODUCT[line.product.id] || FALLBACK_IMAGE})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }}
                      />
                      <div>
                        <div className="text-sm font-bold text-[var(--pondo-navy-900)]">{line.product.name}</div>
                        <div className="text-xs text-slate-600">Qty {line.qty} x {money(line.unitCents)}</div>
                        <div className="mt-1 text-sm font-extrabold text-[var(--pondo-orange-500)]">{money(line.lineCents)}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-3 text-3xl font-extrabold text-[var(--pondo-orange-500)]">{money(cartSubtotalCents)}</div>
            </div>

            <div className="rounded-2xl border border-[var(--pondo-line)] bg-white p-4">
              <div className="mb-2 text-sm font-bold uppercase tracking-widest text-[var(--pondo-navy-800)]">PONDO Trust Guarantee</div>
              <ul className="space-y-2 text-sm text-slate-700">
                <li>TLS 1.3 End-to-End Encryption</li>
                <li>KYC Identity Verified</li>
                <li>ITC & Affordability Checked</li>
                <li>ML Fraud Detection Active</li>
                <li>POPIA Compliant</li>
                <li>PED Vetted Delivery</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-[var(--pondo-line)] bg-white p-4">
              <div className="mb-2 text-sm font-bold uppercase tracking-widest text-[var(--pondo-navy-800)]">Live API Activity Log</div>
              <div className="h-48 overflow-y-auto rounded-lg border border-[var(--pondo-line)] bg-[var(--pondo-surface-soft)] p-3 font-mono text-xs text-[var(--pondo-navy-700)]">
                {apiLogs.map((line, idx) => (
                  <div key={`${line}-${idx}`} className="mb-1">{line}</div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--pondo-line)] bg-white p-4">
              <div className="mb-2 text-sm font-bold uppercase tracking-widest text-[var(--pondo-navy-800)]">Partner Integrations</div>
              <div className="flex flex-wrap gap-2 text-xs">
                {["Amazon", "Temu", "Takealot", "Shopify", "WooCommerce", "TransUnion", "Experian", "Twilio", "SendGrid"].map((tag) => (
                  <span key={tag} className="rounded border border-[var(--pondo-line)] bg-[var(--pondo-surface-soft)] px-2 py-1 text-slate-700">{tag}</span>
                ))}
              </div>
            </div>
          </aside>
        </div>



        {partnerTrackingView.show ? (
          <section className="mt-6 rounded-2xl border border-[var(--pondo-line)] bg-white p-5 shadow-sm">
            <h3 className="text-2xl font-black text-[var(--pondo-navy-900)]">Partner Delivery Confirmation Sequence</h3>
            <div className="mt-2 text-sm text-slate-600">
              {partnerTrackingView.processLabel} • {partnerTrackingView.progressPct}% complete
            </div>
            <div className="mt-2 text-sm text-slate-600">{partnerTrackingView.helperText}</div>
            <div className="mt-3 h-2 overflow-hidden rounded bg-[#dbe8ff]">
              <div
                className="h-full bg-[var(--pondo-orange-500)] transition-all duration-500"
                style={{ width: `${partnerTrackingView.progressPct}%` }}
              />
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {partnerTrackingView.steps.map((item) => (
                <div
                  key={item.title}
                  className={[
                    "rounded-xl border p-4 transition",
                    item.status === "completed" ? "border-emerald-300 bg-emerald-50" : item.status === "active" ? "border-[var(--pondo-orange-500)] bg-[#fff6ea]" : "border-[var(--pondo-line)] bg-[#f7faff]",
                  ].join(" ")}
                >
                  <div className="text-xs font-black uppercase tracking-[0.15em] text-slate-500">Step {item.index}</div>
                  <div className="mt-1 text-xl font-extrabold leading-tight text-[var(--pondo-navy-900)]">{item.title}</div>
                  <div className="mt-2 text-sm text-slate-700">{item.detail}</div>
                  <div className="mt-3 text-[11px] font-bold uppercase tracking-wide text-[var(--pondo-navy-800)]">{item.status}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
              PONDO keeps the delivery loop, PED validation, and partner orchestration running in the backend while this customer view shows partner-facing confirmation milestones only.
            </div>
            {driverArrivedOnSite && paymentSettlement ? (
              <div className="mt-3 rounded-lg border border-emerald-500/35 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                Driver arrival has been confirmed and the Yoco or Vodacom SoftPOS card payment has cleared. PONDO has been notified and settlement is recorded into {paymentSettlement.bankLabel}.
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
