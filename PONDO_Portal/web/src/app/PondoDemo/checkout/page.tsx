"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PondoDemoNav } from "@/components/PondoDemoNav";
import {
  fetchDemoProducts,
  fetchPartnerCart,
  getDemoOrderProcess,
  login,
  sendOtp,
  simulateDemoCredit,
  type DeliveryProcess,
  type DemoProduct,
  type PaymentSettlement,
  type PartnerBootstrapSession,
  type PartnerName,
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

const deliveryLoopNodes = [
  {
    title: "Node 1: Pick & Dispatch",
    detail: "Parcels are tagged and dispatched with a unique PONDO QR token.",
  },
  {
    title: "Node 2: Vetted Drivers",
    detail: "Drivers are KYC-cleared and trust-vetted before they can carry PED deliveries.",
  },
  {
    title: "Node 3: Field Verification",
    detail: "Driver and buyer identities are verified at the door before final handover.",
  },
];

const pedSecurityBlocks = [
  {
    title: "PED Devices & SoftPOS",
    detail: "Yoco or SoftPOS hardware enables secure, mobile field transactions.",
  },
  {
    title: "Vetted Custody",
    detail: "KYC-cleared drivers preserve custody for cash or digital handovers.",
  },
  {
    title: "Centralized Return Protocol",
    detail: "PED devices are returned to base each shift to close risk loops.",
  },
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
    detail: "Final payment confirmation automatically triggers invoice initiation.",
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

type RiskProfile = {
  label: string;
  checks: "background" | "auto-pass" | "fail";
  reason: string;
  transunionScore: number;
  income: number;
  fraudScore: number;
};

const riskProfiles: Record<string, RiskProfile> = {
  "thabo@email.com": {
    label: "Thabo Nkosi - Male Profile: Low Risk",
    checks: "background",
    reason: "Male profile requires KYC, credit vetting, affordability, fraud, and geolocation checks.",
    transunionScore: 705,
    income: 28000,
    fraudScore: 0.03,
  },
  "sipho@email.com": {
    label: "Sipho Molefe - Male Profile: High-Risk Area",
    checks: "background",
    reason: "High-risk geolocation triggers full background checks.",
    transunionScore: 682,
    income: 18000,
    fraudScore: 0.07,
  },
  "mandla@email.com": {
    label: "Mandla Khumalo - Male Profile: Medium Risk",
    checks: "background",
    reason: "Male profile requires full background checks before approval.",
    transunionScore: 695,
    income: 24000,
    fraudScore: 0.05,
  },
  "amara@email.com": {
    label: "Amara Naidoo - Female 30+ Auto Pass",
    checks: "auto-pass",
    reason: "Female profile age 30+ qualifies for automatic approval in this demo flow.",
    transunionScore: 720,
    income: 36000,
    fraudScore: 0.01,
  },
  "naledi@email.com": {
    label: "Naledi Dlamini - Female 30+ Auto Pass",
    checks: "auto-pass",
    reason: "Female profile age 30+ qualifies for automatic approval in this demo flow.",
    transunionScore: 710,
    income: 32000,
    fraudScore: 0.01,
  },
  "gogo@email.com": {
    label: "Gogo Mokoena - Elderly Citizen Auto Pass",
    checks: "auto-pass",
    reason: "Elderly citizen profile always passes without background checks in this demo flow.",
    transunionScore: 690,
    income: 19000,
    fraudScore: 0.01,
  },
  "risk@email.com": {
    label: "Risk Profile - Fails Checks",
    checks: "fail",
    reason: "Risk profile is configured to fail KYC, affordability, and fraud thresholds.",
    transunionScore: 520,
    income: 9000,
    fraudScore: 0.19,
  },
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
  const items = ["Press Buy", "Confirm Details", step3Label];
  return (
    <div className="mb-8 grid grid-cols-3 gap-3 text-center text-[11px] text-slate-500">
      {items.map((label, idx) => {
        const current = idx + 1;
        const active = current <= step;
        return (
          <div key={label} className="flex flex-col items-center gap-2">
            <div className={["h-7 w-7 rounded-full border text-xs font-bold leading-7", active ? "border-[#d84335] bg-[#d84335] text-white" : "border-[var(--pondo-line)] text-slate-500"].join(" ")}>
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
  const [, setGeoLocationData] = useState<GeoLocation | null>(null);
  const [geoLocationLoading, setGeoLocationLoading] = useState(false);
  const [saidTouched, setSaidTouched] = useState(false);

  const [vetResult, setVetResult] = useState<VetResult | null>(null);
  const [routeDecision, setRouteDecision] = useState<RouteDecision | null>(null);
  const [paymentSettlement, setPaymentSettlement] = useState<PaymentSettlement | null>(null);
  const [completedOrderId, setCompletedOrderId] = useState("");
  const [deliveryProcessSnapshot, setDeliveryProcessSnapshot] = useState<DeliveryProcess | null>(null);
  const [catalog, setCatalog] = useState<DemoProduct[]>(FALLBACK_PRODUCTS);
  const [apiLogs, setApiLogs] = useState<string[]>(["Awaiting transaction initiation..."]);

  const customer = session?.customer || null;
  const cartCount = cart.count;

  useEffect(() => {
    fetchDemoProducts()
      .then((out) => setCatalog(out.items))
      .catch(() => setCatalog(FALLBACK_PRODUCTS));
  }, []);

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

  const selectedRiskProfile = riskProfiles[email] || riskProfiles["amara@email.com"];

  const primaryCtaClass =
    "w-full rounded-xl bg-gradient-to-r from-[#d84335] to-[#e24a2a] px-4 py-3 text-lg font-bold text-white shadow-[0_8px_18px_rgba(216,67,53,0.28)] hover:from-[#e85a49] hover:to-[#d84335] disabled:opacity-60";
  const normalizedIdNumber = capturedIdNumber.replace(/\D/g, "");
  const isSaidComplete = normalizedIdNumber.length === 13;
  const isSaidValid = isSaidComplete && validateSAID(normalizedIdNumber);
  const showSaidFeedback = saidTouched || isSaidComplete;

  const deliverySteps = useMemo(() => {
    if (deliveryProcessSnapshot) return deliveryProcessSnapshot.steps;
    return confirmationSteps.map((item, idx) => ({
      index: idx + 1,
      title: item.title,
      detail: item.detail,
      status: "pending" as const,
      completedAt: null,
    }));
  }, [deliveryProcessSnapshot]);

  const driverArrivedOnSite = useMemo(() => {
    if (!deliveryProcessSnapshot) return false;
    const onSiteStep = deliveryProcessSnapshot.steps.find((item) => item.index === 4);
    return onSiteStep ? onSiteStep.status !== "pending" : false;
  }, [deliveryProcessSnapshot]);

  function log(message: string) {
    setApiLogs((prev) => [`${ts()} ${message}`, ...prev].slice(0, 40));
  }

  async function ensureCustomerAuth(forceRefresh = false) {
    if (token && !forceRefresh) return token;
    const out = await login({ username: email || "customer@example.com", password: "demo", role: "customer" });
    setAuth({ token: out.token, role: out.role, username: email || "customer@example.com" });
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
      setError("Please enter a valid South African ID number before requesting OTP.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const out = await sendOtp({ sessionId: session.sessionId, channel: "sms", destination: capturedPhone });
      setOtpRequestId(out.requestId);
      setDemoOtp(out.demoOtp);
      setOtpVerified(false);
      log(`OTP sent to ${capturedPhone} via Twilio SMS`);
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
      log("Running KYC, credit, affordability, and fraud checks in the background...");
      const approved = await onRunChecks();
      if (!approved) return;
      onConfirmRoute();
      setStep(5);
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
      let transunionScore = selectedRiskProfile.transunionScore;
      if (selectedRiskProfile.checks === "background") {
        const data = await simulateDemoCredit({ saId: capturedIdNumber, bureau: "transunion" });
        transunionScore = Math.max(selectedRiskProfile.transunionScore, data.result.score as number);
      }
      const transunionApproved = selectedRiskProfile.checks !== "fail" && transunionScore >= 650;
      const kycIdentityVerified = selectedRiskProfile.checks !== "fail";
      const experianIncome = selectedRiskProfile.income;
      const fraudScore = selectedRiskProfile.fraudScore;
      const approved = selectedRiskProfile.checks === "auto-pass" || (transunionApproved && kycIdentityVerified && experianIncome >= 15000 && fraudScore <= 0.08);

      setVetResult({
        transunionScore,
        transunionApproved,
        kycIdentityVerified,
        experianIncome,
        fraudScore,
        approved,
      });

      if (selectedRiskProfile.checks === "auto-pass") {
        log(`${selectedRiskProfile.label}: auto-approved. No background checks performed.`);
      } else {
        log(`${selectedRiskProfile.label}: ${selectedRiskProfile.reason}`);
        log(`TransUnion ITC score: ${transunionScore} (${transunionApproved ? "approved" : "declined"})`);
        log(`Experian affordability: income ${new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(experianIncome)}/mo`);
        log(`Python fraud score: ${fraudScore.toFixed(2)} (${fraudScore <= 0.08 ? "low risk" : "high risk"})`);
      }
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

  const step3Label = routeDecision ? "Completed" : "OTP Verification";

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
                      {Object.entries(riskProfiles).map(([profileEmail, profile]) => (
                        <option key={profileEmail} value={profileEmail}>
                          {profileEmail} ({profile.label})
                        </option>
                      ))}
                    </select>
                    <div className="mt-2 text-xs text-slate-500">{selectedRiskProfile.reason}</div>
                  </label>
                </div>



                <button onClick={onPressBuy} disabled={busy || !cartCount} className={primaryCtaClass}>
                  {busy ? "Loading..." : cartCount ? `Press Buy (${cartCount} item${cartCount > 1 ? "s" : ""})` : "Cart is empty"}
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
                        <p className="mt-1 text-xs font-semibold text-emerald-700">Valid South African ID number.</p>
                      ) : (
                        <p className="mt-1 text-xs font-semibold text-red-600">Enter a valid 13-digit South African ID number.</p>
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
                  onClick={async () => {
                    if (!isSaidValid) {
                      setSaidTouched(true);
                      setError("Please enter a valid South African ID number before proceeding.");
                      return;
                    }
                    if (!termsAccepted) {
                      setError("Please accept Terms & Conditions before proceeding");
                      return;
                    }
                    log("T&C accepted - POPIA consent captured");
                    await onSendOtp();
                    setStep(3);
                  }}
                  className={primaryCtaClass}
                >
                  Continue to OTP Verification
                </button>
              </div>
            ) : null}

            {step === 3 && customer ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-[var(--pondo-line)] bg-[var(--pondo-surface-soft)] p-4">
                  <h2 className="text-2xl font-extrabold">OTP Verification</h2>
                  <p className="mt-2 text-sm text-slate-700">
                    We sent a one-time PIN by SMS to <span className="font-bold">{capturedPhone}</span>. Verify the OTP to continue. KYC, credit, fraud, and affordability checks will run securely in the background after OTP verification.
                  </p>
                  <div className="mt-5 flex flex-wrap items-center gap-2">
                    <button onClick={onSendOtp} disabled={busy} className="rounded-lg bg-[#d84335] px-4 py-2 font-bold text-white hover:bg-[#c93327] disabled:opacity-60">Resend OTP to {capturedPhone}</button>
                    {demoOtp ? <div className="text-xs font-semibold text-emerald-700">Demo OTP: {demoOtp}</div> : null}
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_120px]">
                    <input value={otpInput} onChange={(e) => setOtpInput(e.target.value)} placeholder="Enter OTP" className="w-full rounded-lg border border-[var(--pondo-line)] bg-white px-3 py-3 text-slate-800" />
                    <button onClick={onVerifyOtp} disabled={busy || !otpRequestId} className="rounded-lg bg-[#d84335] px-4 py-2 font-bold text-white hover:bg-[#c93327] disabled:opacity-60">{busy ? "Checking..." : "Verify OTP"}</button>
                  </div>
                  {otpVerified ? <div className="mt-3 text-sm font-semibold text-emerald-700">OTP verified - background checks completed.</div> : null}
                </div>
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
                <div className="rounded-xl border border-emerald-400 bg-white p-5 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-full bg-emerald-100 text-xl font-black text-emerald-700">✓</div>
                    <div>
                      <h2 className="text-2xl font-extrabold text-emerald-900">Order received, thanks!</h2>
                      <p className="text-sm text-slate-700">
                        Confirmation has been sent to {capturedEmail} and SMS confirmation has been sent to {capturedPhone}.
                      </p>
                    </div>
                  </div>
                  <div className="my-5 border-t border-[var(--pondo-line)]" />
                  <div className="space-y-4 text-sm text-slate-900">
                    <div>
                      <span className="font-bold">Delivery to </span>
                      {capturedFullName}, {capturedAddress}, {capturedCity}, {capturedProvince}, {capturedPostalCode}, South Africa
                    </div>
                    <div>
                      <div className="font-bold">Monday, 04 May 2026</div>
                      <div>Estimated delivery</div>
                    </div>
                    <div>
                      <div><span className="font-bold">Partner:</span> {session?.partnerLabel || "Amazon SA"} fulfilment</div>
                      <div><span className="font-bold">Items:</span> {cartCount} item{cartCount > 1 ? "s" : ""} totalling {money(cartSubtotalCents)}</div>
                    </div>
                  </div>
                  <div className="mt-5 rounded-lg border border-[var(--pondo-line)] bg-[var(--pondo-surface-soft)] px-4 py-3 text-sm text-slate-700">
                    Email and SMS notifications include the order summary, delivery address, estimated fulfilment date, and the PONDO verification outcome.
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button onClick={() => router.push("/PondoDemo/sponsor")} className="rounded-lg bg-[#d84335] px-4 py-2 font-bold text-white hover:bg-[#c93327]">Track fulfilment progress</button>
                    <button onClick={() => router.push("/PondoDemo/shop")} className="rounded-lg border border-[var(--pondo-line)] bg-white px-4 py-2 font-bold text-[var(--pondo-navy-900)] hover:bg-[#f7faff]">Continue shopping</button>
                  </div>
                  {vetResult ? (
                    <div className="mt-4 grid gap-2 text-xs text-emerald-800 sm:grid-cols-4">
                      <div className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1">KYC verified</div>
                      <div className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1">Credit approved</div>
                      <div className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1">Affordability passed</div>
                      <div className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1">Fraud low risk</div>
                    </div>
                  ) : null}
                </div>
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
              <div className="text-sm font-black text-[var(--pondo-navy-900)]">API Event Log</div>
              <div className="mt-3 space-y-2 text-xs text-slate-600">
                {apiLogs.map((entry) => (
                  <div key={entry} className="rounded-lg bg-[#f7faff] px-3 py-2">
                    {entry}
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>



        {deliveryProcessSnapshot ? (
          <section className="mt-6 rounded-2xl border border-[var(--pondo-line)] bg-white p-5 shadow-sm">
            <h3 className="text-2xl font-black text-[var(--pondo-navy-900)]">Delivery Loop Binds Digital Orders To Physical Reality</h3>
            <div className="mt-2 text-sm text-slate-600">Operational loop started after payment clearance.</div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {deliveryLoopNodes.map((node, idx) => {
                const nodeStatus = deliverySteps[idx]?.status || "pending";
                return (
                  <div
                    key={node.title}
                    className={[
                      "rounded-xl border p-4",
                      nodeStatus === "completed"
                        ? "border-emerald-300 bg-emerald-50"
                        : nodeStatus === "active"
                          ? "border-[var(--pondo-orange-500)] bg-[#fff6ea]"
                          : "border-[var(--pondo-line)] bg-[#f7faff]",
                    ].join(" ")}
                  >
                    <div className="text-xs font-black uppercase tracking-[0.15em] text-slate-500">Node {idx + 1}</div>
                    <div className="mt-1 text-xl font-extrabold text-[var(--pondo-navy-900)]">{node.title.replace(`Node ${idx + 1}: `, "")}</div>
                    <div className="mt-1 text-sm text-slate-700">{node.detail}</div>
                    <div className="mt-2 text-[11px] font-bold uppercase tracking-wide text-[var(--pondo-navy-800)]">{nodeStatus}</div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {driverArrivedOnSite ? (
          <section className="mt-6 rounded-2xl border border-[var(--pondo-line)] bg-white p-5 shadow-sm">
            <h3 className="text-2xl font-black text-[var(--pondo-navy-900)]">Securing The Payment Enabled Delivery (PED) Experience</h3>
            <div className="mt-2 text-sm text-slate-600">Driver is now on-site. PED controls are active for handover.</div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {pedSecurityBlocks.map((item, idx) => (
                <div key={item.title} className="rounded-xl border border-[var(--pondo-line)] bg-[#f7faff] p-4">
                  <div className="text-xs font-black uppercase tracking-[0.15em] text-slate-500">Control {idx + 1}</div>
                  <div className="mt-1 text-xl font-extrabold text-[var(--pondo-navy-900)]">{item.title}</div>
                  <div className="mt-1 text-sm text-slate-700">{item.detail}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-lg border border-emerald-500/35 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              On card payment success, funds are settled into PONDO business account ({paymentSettlement?.bankLabel || "selected bank"}) and notification is dispatched to shelod@gmail.com.
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
