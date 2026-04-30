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
import { PAYMENT_METHOD_OPTIONS, type PaymentMethod, paymentMethodLabel } from "@/lib/paymentMethods";
import { useAuth } from "@/lib/auth";
import { usePondoCart } from "@/lib/pondoCart";
import { FALLBACK_IMAGE, FALLBACK_PRODUCTS, IMAGE_BY_PRODUCT } from "@/lib/demoCatalog";
import { validateSAID } from "@/lib/validateSAID";

const partnerOptions: Array<{ id: PartnerName; label: string }> = [
  { id: "amazon", label: "Amazon SA" },
  { id: "takealot", label: "Takealot" },
];

const approvedDemoProfiles = [
  {
    idNumber: "8001015009087",
    fullName: "Amara Naidoo",
    segment: "Female 35+ - direct approval",
    checksRequired: false,
    phone: "+27 79 888 4400",
    email: "amara@email.com",
    address: "81 Sandton Dr, Sandton",
    city: "Johannesburg",
    province: "Gauteng",
    postalCode: "2090",
    monthlyIncome: 36000,
    affordabilityBand: "A+",
  },
  {
    idNumber: "9005054800081",
    fullName: "Zanele Mthembu",
    segment: "Female 35+ - direct approval",
    checksRequired: false,
    phone: "+27 83 555 1234",
    email: "zanele@email.com",
    address: "55 Loop St, Cape Town",
    city: "Cape Town",
    province: "Western Cape",
    postalCode: "8001",
    monthlyIncome: 32000,
    affordabilityBand: "A",
  },
  {
    idNumber: "8501015800088",
    fullName: "Thabo Nkosi",
    segment: "Male - checks required",
    checksRequired: true,
    phone: "+27 72 345 6789",
    email: "thabo@email.com",
    address: "14 Main Rd, Soweto",
    city: "Johannesburg",
    province: "Gauteng",
    postalCode: "1804",
    monthlyIncome: 28000,
    affordabilityBand: "A",
  },
  {
    idNumber: "9203124200180",
    fullName: "Sibusiso Mokoena",
    segment: "Male - checks required",
    checksRequired: true,
    phone: "+27 73 555 0090",
    email: "sibusiso@email.com",
    address: "22 Vilakazi St, Orlando West",
    city: "Johannesburg",
    province: "Gauteng",
    postalCode: "1804",
    monthlyIncome: 25000,
    affordabilityBand: "B",
  },
  {
    idNumber: "7806155200085",
    fullName: "Mandla Khumalo",
    segment: "Male - checks required",
    checksRequired: true,
    phone: "+27 82 444 9021",
    email: "mandla@email.com",
    address: "8 Florida Rd, Morningside",
    city: "Durban",
    province: "KwaZulu-Natal",
    postalCode: "4001",
    monthlyIncome: 30000,
    affordabilityBand: "A",
  },
  {
    idNumber: "5101015800080",
    fullName: "Grace Maseko",
    segment: "Elderly citizen - direct approval",
    checksRequired: false,
    phone: "+27 71 222 6633",
    email: "grace@email.com",
    address: "10 Protea Ave, Bryanston",
    city: "Johannesburg",
    province: "Gauteng",
    postalCode: "2191",
    monthlyIncome: 18000,
    affordabilityBand: "Pensioner verified",
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
    detail: "Successful payment confirmation closes the journey and triggers invoicing.",
  },
];

const journeyVideoFrames = [
  {
    title: "1. Press Buy",
    detail: "Initiates with an accessible explainer to guide user onboarding.",
  },
  {
    title: "2. Confirm Details",
    detail: "Captures Name, ID, Address, Email, and POPIA consent before OTP.",
  },
  {
    title: "3. OTP Verification",
    detail: "Verifies the customer by SMS before backend risk checks run.",
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

const CUSTOMER_PAYMENT_OPTIONS = PAYMENT_METHOD_OPTIONS.filter(
  (option) => !["bnpl", "ussd", "evoucher_wallet"].includes(option.id),
);

type VetResult = {
  transunionScore: number;
  transunionApproved: boolean;
  kycIdentityVerified: boolean;
  experianIncome: number;
  fraudScore: number;
  approved: boolean;
  checksPerformed: boolean;
  exemptionReason: string;
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
            <div className={["h-7 w-7 rounded-full border text-xs font-bold leading-7", active ? "border-pondo-orange-500 bg-pondo-orange-500 text-white" : "border-pondo-line text-slate-500"].join(" ")}>
              {current}
            </div>
            <div className={active ? "text-pondo-navy-700" : "text-slate-500"}>{label}</div>
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [session, setSession] = useState<PartnerBootstrapSession | null>(null);
  const [otpRequestId, setOtpRequestId] = useState("");
  const [otpInput, setOtpInput] = useState("");
  const [otpVerified, setOtpVerified] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [demoOtp, setDemoOtp] = useState("");

  // Captured customer details. These stay blank when checkout starts so the client captures them directly.
  const [capturedFullName, setCapturedFullName] = useState("");
  const [capturedIdNumber, setCapturedIdNumber] = useState("");
  const [capturedPhone, setCapturedPhone] = useState("");
  const [capturedEmail, setCapturedEmail] = useState("");
  const [capturedAddress, setCapturedAddress] = useState("");
  const [capturedCity, setCapturedCity] = useState("");
  const [capturedProvince, setCapturedProvince] = useState("");
  const [capturedPostalCode, setCapturedPostalCode] = useState("");
  const [saidTouched, setSaidTouched] = useState(false);

  const [vetResult, setVetResult] = useState<VetResult | null>(null);
  const [routeDecision, setRouteDecision] = useState<RouteDecision | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>("card");
  const [settlementBank, setSettlementBank] = useState<SettlementBank>("absa");
  const [paymentSettlement, setPaymentSettlement] = useState<PaymentSettlement | null>(null);
  const [completedOrderId, setCompletedOrderId] = useState("");
  const [deliveryProcessSnapshot, setDeliveryProcessSnapshot] = useState<DeliveryProcess | null>(null);
  const [catalog, setCatalog] = useState<DemoProduct[]>(FALLBACK_PRODUCTS);
  const [journeyFrame, setJourneyFrame] = useState(0);
  const [playJourney, setPlayJourney] = useState(false);
  const [showFulfilmentTracking, setShowFulfilmentTracking] = useState(false);

  const [, setApiLogs] = useState<string[]>(["Awaiting transaction initiation..."]);

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

  const selectedPaymentMethodMeta = useMemo(
    () => CUSTOMER_PAYMENT_OPTIONS.find((option) => option.id === selectedPaymentMethod) || CUSTOMER_PAYMENT_OPTIONS[0],
    [selectedPaymentMethod],
  );
  const normalizedIdNumber = capturedIdNumber.replace(/\D/g, "");
  const isSaidComplete = normalizedIdNumber.length === 13;
  const isSaidValid = isSaidComplete && validateSAID(normalizedIdNumber);
  const showSaidFeedback = saidTouched || isSaidComplete;
  const matchedDemoProfile = useMemo(
    () => approvedDemoProfiles.find((profile) => profile.idNumber === normalizedIdNumber) || null,
    [normalizedIdNumber],
  );
  const requiredDetailsCaptured =
    capturedFullName.trim() &&
    capturedPhone.trim() &&
    capturedEmail.trim() &&
    capturedAddress.trim() &&
    capturedCity.trim() &&
    capturedProvince.trim() &&
    capturedPostalCode.trim();
  const estimatedDeliveryDate = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 3);
    return new Intl.DateTimeFormat("en-ZA", {
      weekday: "long",
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
  }, []);

  const primaryCtaClass =
    "w-full rounded-xl bg-gradient-to-r from-[#d64534] to-[#d95a18] px-4 py-3 text-lg font-bold text-white shadow-[0_8px_18px_rgba(217,90,24,0.32)] hover:from-[#ea6a3f] hover:to-[#d64534] disabled:opacity-60";

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
        helperText: `PONDO is tracking ${session?.partnerLabel || "partner"} dispatch, driver movement, on-site verification, and ${selectedPaymentMethodMeta.label} payment confirmation in the background.`,
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
          "Third-party ITC, KYC, affordability, and fraud checks succeeded. Partner dispatch tracking is primed and will advance automatically when fulfilment events and the selected payment method signal are received.",
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
  }, [deliveryProcessSnapshot, routeDecision, selectedPaymentMethodMeta.label, session?.partnerLabel, vetResult?.approved]);

  function log(message: string) {
    setApiLogs((prev) => [`${ts()} ${message}`, ...prev].slice(0, 40));
  }

  async function ensureCustomerAuth(forceRefresh = false, preferredUsername?: string) {
    const username = (preferredUsername || capturedEmail || "customer@example.com").trim().toLowerCase();
    if (token && !forceRefresh) return token;
    const out = await login({ username, password: "demo", role: "customer" });
    setAuth({ token: out.token, role: out.role, username });
    return out.token;
  }

  function clearCustomerCapture() {
    setCapturedFullName("");
    setCapturedIdNumber("");
    setCapturedPhone("");
    setCapturedEmail("");
    setCapturedAddress("");
    setCapturedCity("");
    setCapturedProvince("");
    setCapturedPostalCode("");
    setSaidTouched(false);
    setOtpInput("");
    setOtpRequestId("");
    setOtpVerified(false);
    setTermsAccepted(false);
    setDemoOtp("");
    setShowFulfilmentTracking(false);
  }

  function applyDemoProfile(profile: (typeof approvedDemoProfiles)[number]) {
    setCapturedFullName(profile.fullName);
    setCapturedIdNumber(profile.idNumber);
    setCapturedPhone(profile.phone);
    setCapturedEmail(profile.email);
    setCapturedAddress(profile.address);
    setCapturedCity(profile.city);
    setCapturedProvince(profile.province);
    setCapturedPostalCode(profile.postalCode);
    setSaidTouched(true);
    setOtpInput("");
    setOtpRequestId("");
    setOtpVerified(false);
    setDemoOtp("");
    setVetResult(null);
    setRouteDecision(null);
    setShowFulfilmentTracking(false);
  }

  async function onPressBuy() {
    if (!cart.items.length) {
      setError("Your cart is empty. Add items before starting checkout.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await ensureCustomerAuth(false, `checkout.${partner}@pondo.demo`);
      log(`Connecting to ${partner.toUpperCase()} sandbox API...`);
      const out = await fetchPartnerCart({ partner, email: `checkout.${partner}@pondo.demo` });
      setSession(out.session);
      clearCustomerCapture();
      setOtpRequestId("");
      setOtpVerified(false);
      setTermsAccepted(false);
      setVetResult(null);
      setRouteDecision(null);
      setPaymentSettlement(null);
      setCompletedOrderId("");
      setDeliveryProcessSnapshot(null);
      setShowFulfilmentTracking(false);
      setStep(2);
      log(`${out.session.partnerLabel} cart API connected for ${cart.items.length} line item(s)`);
      log(`Cart locked for checkout: ${cart.items.length} line item(s)`);
      log("Customer details cleared for direct client capture");
    } catch (e) {
      setError(e instanceof Error ? e.message : "press_buy_failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSendOtp() {
    if (!session) return;
    if (!isSaidValid) {
      setSaidTouched(true);
      setError("Enter a valid 13-digit South African ID number before requesting OTP.");
      return;
    }
    if (!capturedPhone.trim()) {
      setError("Enter the customer's mobile number before requesting OTP.");
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
      log("OTP verified - running backend KYC, credit, fraud, and affordability checks");
      const approved = await onRunChecks();
      if (approved) {
        onConfirmRoute();
        log(`Email confirmation queued for ${capturedEmail}`);
        log(`SMS confirmation queued for ${capturedPhone}`);
      }
    } catch (e) {
      setOtpVerified(false);
      setError(e instanceof Error ? e.message : "otp_verify_failed");
    } finally {
      setBusy(false);
    }
  }

  async function onRunChecks() {
    if (!session) return false;
    setError("");
    setBusy(true);
    try {
      if (matchedDemoProfile && !matchedDemoProfile.checksRequired) {
        const result: VetResult = {
          transunionScore: 0,
          transunionApproved: true,
          kycIdentityVerified: true,
          experianIncome: matchedDemoProfile.monthlyIncome,
          fraudScore: 0,
          approved: true,
          checksPerformed: false,
          exemptionReason: matchedDemoProfile.segment,
        };
        setVetResult(result);
        log(`Direct approval applied: ${matchedDemoProfile.segment}`);
        log(`Email confirmation queued for ${capturedEmail}`);
        log(`SMS confirmation queued for ${capturedPhone}`);
        return true;
      }

      const data = await simulateDemoCredit({ saId: normalizedIdNumber, bureau: "transunion" });
      const transunionScore = data.result.score as number;
      const transunionApproved = Boolean(data.result.approved);
      const kycIdentityVerified = Boolean(matchedDemoProfile);
      const experianIncome = matchedDemoProfile?.monthlyIncome ?? 12000;
      const fraudScore = Math.max(0.01, Number(((850 - transunionScore) / 10000 + 0.01).toFixed(2)));
      const approved = transunionApproved && kycIdentityVerified && experianIncome >= 15000 && fraudScore <= 0.08;

      setVetResult({
        transunionScore,
        transunionApproved,
        kycIdentityVerified,
        experianIncome,
        fraudScore,
        approved,
        checksPerformed: true,
        exemptionReason: "",
      });

      log(`TransUnion ITC score: ${transunionScore} (${transunionApproved ? "approved" : "declined"})`);
      log(`KYC biometric verification: ${kycIdentityVerified ? "identity matched approved profile" : "profile not found"}`);
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

  async function onProceedToChecks() {
    if (!isSaidValid) {
      setSaidTouched(true);
      setError("Please enter a valid South African ID number before proceeding.");
      return;
    }
    if (!requiredDetailsCaptured) {
      setError("Please complete all client detail fields before proceeding.");
      return;
    }
    if (!termsAccepted) {
      setError("Please accept Terms & Conditions and POPIA consent before proceeding.");
      return;
    }

    log("T&C accepted - POPIA consent captured");
    setStep(3);
    await onSendOtp();
    setShowFulfilmentTracking(false);
  }

  const step3Label = vetResult?.approved ? "Completed" : "OTP Verification";

  async function onCompletePurchase() {
    if (!session || !routeDecision || !vetResult?.approved || !cartLines.length) return;
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
          paymentMethod: selectedPaymentMethod,
        });
        const pay = await payDemoOrder(authToken, order.transaction.id, selectedPaymentMethod, {
          settlementBank,
          notifyEmail: "shelod@gmail.com",
          notifyChannels: ["sms", "email"],
        });
        return { order, pay };
      };

      let authToken = await ensureCustomerAuth(true, capturedEmail);
      let submitted;
      try {
        submitted = await submitWithToken(authToken);
      } catch (e) {
        const status = typeof e === "object" && e && "status" in e ? (e as { status?: number }).status : undefined;
        if (status !== 401) throw e;
        log("Session expired. Refreshing login token...");
        authToken = await ensureCustomerAuth(true, capturedEmail);
        submitted = await submitWithToken(authToken);
      }

      setCompletedOrderId(submitted.order.transaction.id);
      setPaymentSettlement(submitted.pay.settlement);
      log(`Transaction cleared: ${submitted.order.transaction.id}`);
      log(`Payment method confirmed: ${paymentMethodLabel(selectedPaymentMethod)}`);
      log(`Funds settled to PONDO ${submitted.pay.settlement.bankLabel} (${submitted.pay.settlement.accountRef})`);
      log("Driver arrival and partner delivery confirmation tracking is running in the background.");
      log("Customer notification will be released only once on-site arrival is confirmed.");
      log(`Order submitted using ${cartLines.length} cart item(s)`);
      log(`Webhook posted to ${session.partnerLabel} for ${paymentMethodLabel(selectedPaymentMethod)}`);
      log(`Partner-managed delivery tracking active - ETA ${routeDecision.etaMinutes} min`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "complete_failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#e9f1ff_0%,#f7faff_34%,#edf4ff_100%)] text-pondo-navy-900">
      <PondoDemoNav />

      <div className="border-b border-[#324978] bg-pondo-navy-900">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-4">
          <div>
            <div className="text-xl font-black tracking-tight text-white">Live Delivery Tracker</div>
            <div className="text-xs font-semibold text-slate-200">5-Step Confirmation - Vetted Driver Network</div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="rounded-full bg-emerald-100 px-4 py-2 text-center text-emerald-700"><span className="font-bold">3 Active Deliveries</span></div>
            <div className="rounded-lg bg-white/12 px-4 py-2 text-center"><div className="font-bold text-sky-200">2.4M+</div><div className="text-slate-100">Verified Txns</div></div>
            <div className="rounded-lg bg-white/12 px-4 py-2 text-center"><div className="font-bold text-pondo-orange-400">4.2hrs</div><div className="text-slate-100">Avg Delivery</div></div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1400px] px-6 py-7">
        <Stepper step={step} step3Label={step3Label} />

        <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
          <div className="rounded-2xl border border-pondo-line bg-white p-5 shadow-lg">
            {step === 1 ? (
              <div className="space-y-5">
                <h1 className="text-3xl font-extrabold text-pondo-navy-900">Press Buy - Start Your Purchase</h1>
                <p className="text-sm text-slate-700">PONDO starts the business logic from the locked cart, connects to the selected partner commerce API, and then guides the client through a secure checkout journey.</p>
                <div className="overflow-hidden rounded-xl border border-pondo-line bg-pondo-surface-soft">
                  <div className="flex items-center justify-between border-b border-pondo-line bg-[#f3f8ff] px-3 py-2">
                    <div className="text-sm font-bold text-pondo-navy-900">Checkout Explainer Video (Storyboard)</div>
                    <div className="text-xs text-slate-500">Frame {journeyFrame + 1} / {journeyVideoFrames.length}</div>
                  </div>
                  <div className="space-y-3 p-3">
                    <div className="rounded-lg border border-pondo-line bg-white p-4">
                      <div className="text-2xl font-black text-pondo-navy-900">{journeyVideoFrames[journeyFrame].title}</div>
                      <div className="mt-2 text-sm text-slate-700">{journeyVideoFrames[journeyFrame].detail}</div>
                    </div>
                    <div className="h-2 overflow-hidden rounded bg-[#dbe8ff]">
                      <div className="h-full bg-pondo-orange-500 transition-all duration-500" style={{ width: `${((journeyFrame + 1) / journeyVideoFrames.length) * 100}%` }} />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setPlayJourney((v) => !v)}
                        className="rounded-lg border border-pondo-line bg-white px-3 py-1.5 text-xs font-semibold text-pondo-navy-800 hover:bg-[#edf4ff]"
                      >
                        {playJourney ? "Pause" : "Play"} explainer
                      </button>
                      <button
                        onClick={() => setJourneyFrame((prev) => (prev + 1) % journeyVideoFrames.length)}
                        className="rounded-lg border border-pondo-line bg-white px-3 py-1.5 text-xs font-semibold text-pondo-navy-800 hover:bg-[#edf4ff]"
                      >
                        Next frame
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label>
                    <div className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-600">Select Partner eCommerce Site</div>
                    <select value={partner} onChange={(e) => setPartner(e.target.value as PartnerName)} className="w-full rounded-lg border border-pondo-line bg-white px-3 py-2 text-slate-800">
                      {partnerOptions.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="rounded-xl border border-pondo-line bg-[#f7faff] px-4 py-3 text-sm text-slate-700">
                    Partner integration starts with the cart items selected on the Shop page. The client captures their own details on the next screen.
                  </div>
                </div>



                <button onClick={onPressBuy} disabled={busy || !cartCount} className={primaryCtaClass}>
                  {busy ? "Loading..." : cartCount ? `Proceed with PONDO Checkout (${cartCount} item${cartCount > 1 ? "s" : ""})` : "Cart is empty"}
                </button>
              </div>
            ) : null}

            {step === 2 && session ? (
              <div className="space-y-4">
                <h2 className="text-2xl font-extrabold">Confirm Your Details</h2>
                <div className="rounded-lg border border-emerald-500/40 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Enter the client details below. The SA ID checksum is validated when the ID field is completed or exited.</div>

                <div className="rounded-xl border border-pondo-line bg-pondo-surface-soft p-3">
                  <div className="mb-2 text-sm font-bold text-pondo-navy-800">Approved demo SA ID profiles</div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {approvedDemoProfiles.map((profile) => (
                      <button
                        key={profile.idNumber}
                        type="button"
                        onClick={() => applyDemoProfile(profile)}
                        className="rounded-lg border border-pondo-line bg-white px-3 py-2 text-left text-xs hover:bg-[#edf4ff]"
                      >
                        <span className="block font-bold text-pondo-navy-900">{profile.fullName}</span>
                        <span className="font-mono text-slate-600">{profile.idNumber}</span>
                        <span className="mt-1 block text-[11px] font-semibold text-pondo-orange-500">{profile.segment}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Full Name</label>
                    <input 
                      value={capturedFullName} 
                      onChange={(e) => setCapturedFullName(e.target.value)} 
                      className="w-full rounded-lg border border-pondo-line px-3 py-2 text-slate-800" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">ID Number</label>
                    <input 
                      value={capturedIdNumber} 
                      onChange={(e) => {
                        setCapturedIdNumber(e.target.value.replace(/\D/g, "").slice(0, 13));
                        if (!saidTouched) setSaidTouched(true);
                        setOtpInput("");
                        setOtpRequestId("");
                        setOtpVerified(false);
                        setDemoOtp("");
                        setVetResult(null);
                        setRouteDecision(null);
                        setShowFulfilmentTracking(false);
                      }}
                      onBlur={() => {
                        setSaidTouched(true);
                        setOtpInput("");
                        setOtpRequestId("");
                        setOtpVerified(false);
                        setDemoOtp("");
                        setVetResult(null);
                        setRouteDecision(null);
                        setShowFulfilmentTracking(false);
                      }}
                      inputMode="numeric"
                      maxLength={13}
                      placeholder="Enter your 13-digit SA ID number"
                      className={[
                        "w-full rounded-lg border px-3 py-2 text-slate-800",
                        showSaidFeedback
                          ? isSaidValid
                            ? "border-emerald-500 bg-emerald-50/40"
                            : "border-red-400 bg-red-50/40"
                          : "border-pondo-line",
                      ].join(" ")}
                    />
                    {showSaidFeedback ? (
                      isSaidValid ? (
                        <p className="mt-1 text-xs font-semibold text-emerald-700">
                          Valid South African ID number{matchedDemoProfile ? ` - matched to ${matchedDemoProfile.fullName}.` : "."}
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
                      className="w-full rounded-lg border border-pondo-line px-3 py-2 text-slate-800" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Email</label>
                    <input 
                      value={capturedEmail} 
                      onChange={(e) => setCapturedEmail(e.target.value)} 
                      className="w-full rounded-lg border border-pondo-line px-3 py-2 text-slate-800" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Address</label>
                    <input 
                      value={capturedAddress} 
                      onChange={(e) => setCapturedAddress(e.target.value)} 
                      className="w-full rounded-lg border border-pondo-line px-3 py-2 text-slate-800" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Postal Code</label>
                    <input 
                      value={capturedPostalCode} 
                      onChange={(e) => setCapturedPostalCode(e.target.value)} 
                      className="w-full rounded-lg border border-pondo-line px-3 py-2 text-slate-800" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">City</label>
                    <input 
                      value={capturedCity} 
                      onChange={(e) => setCapturedCity(e.target.value)} 
                      className="w-full rounded-lg border border-pondo-line px-3 py-2 text-slate-800" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Province/Region</label>
                    <input 
                      value={capturedProvince} 
                      onChange={(e) => setCapturedProvince(e.target.value)} 
                      className="w-full rounded-lg border border-pondo-line px-3 py-2 text-slate-800" 
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-pondo-line bg-pondo-surface-soft p-3">
                  <div className="mb-2 text-sm font-bold text-pondo-navy-800">Terms & Conditions - POPIA Compliant</div>
                  <div className="max-h-28 overflow-y-auto rounded bg-white p-2 text-xs text-slate-600">
                    By proceeding, you consent to PONDO collecting and processing your personal information (name, SA ID, contact details, geo-location, financial data) for KYC verification, ITC credit checks, affordability assessment, and fraud detection in accordance with POPIA and internal risk controls.
                  </div>
                  <label className="mt-3 flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} />
                    I accept PONDO&apos;s Terms & Conditions and POPIA consent
                  </label>
                </div>

                <button
                  onClick={() => void onProceedToChecks()}
                  disabled={busy}
                  className={primaryCtaClass}
                >
                  {busy ? "Sending OTP..." : "Proceed to Credit & KYC, Fraud and Affordability"}
                </button>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="space-y-4">
                {vetResult ? (
                  <div className="space-y-3">
                    {vetResult.approved ? (
                      <div className="rounded-2xl border border-emerald-300 bg-white p-5 shadow-sm">
                        <div className="flex items-start gap-3">
                          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-100 text-xl font-black text-emerald-700">✓</div>
                          <div>
                            <h3 className="text-2xl font-black text-emerald-800">Order received, thanks!</h3>
                            <p className="mt-1 text-sm text-slate-700">
                              Confirmation has been sent to {capturedEmail} and SMS confirmation has been sent to {capturedPhone}.
                            </p>
                          </div>
                        </div>
                        <div className="mt-4 border-t border-slate-200 pt-4 text-sm text-slate-800">
                          <div><span className="font-bold">Delivery to {capturedFullName}</span>, {capturedAddress}, {capturedCity}, {capturedProvince}, {capturedPostalCode}, South Africa</div>
                          <div className="mt-3"><span className="font-bold">{estimatedDeliveryDate}</span></div>
                          <div className="text-slate-600">Estimated delivery</div>
                          <div className="mt-3"><span className="font-bold">Partner:</span> {session?.partnerLabel || "Partner"} fulfilment</div>
                          <div><span className="font-bold">Items:</span> {cartCount} item{cartCount > 1 ? "s" : ""} totalling {money(cartSubtotalCents)}</div>
                        </div>
                        <div className="mt-4 rounded-xl border border-pondo-line bg-[#f7faff] p-4 text-sm text-slate-700">
                          Email and SMS notifications include the order summary, delivery address, estimated fulfilment date, and the PONDO verification outcome.
                        </div>
                        <div className="mt-4 flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={() => setStep(5)}
                            className="rounded-xl bg-pondo-navy-900 px-4 py-2 font-bold text-white hover:bg-pondo-navy-800"
                          >
                            Continue to PONDO payment
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowFulfilmentTracking(true)}
                            className="rounded-xl bg-pondo-orange-500 px-4 py-2 font-bold text-white hover:bg-pondo-orange-400"
                          >
                            Track fulfilment progress
                          </button>
                          <button
                            type="button"
                            onClick={() => router.push("/PondoDemo/shop")}
                            className="rounded-xl border border-pondo-line bg-white px-4 py-2 font-bold text-pondo-navy-800 hover:bg-[#edf4ff]"
                          >
                            Continue shopping
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-red-500/40 bg-red-50 px-4 py-3 text-sm text-red-700">
                        We could not complete this order automatically. The verification outcome has been sent for manual review.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border border-pondo-line bg-pondo-surface-soft p-4">
                    <h2 className="text-2xl font-extrabold text-pondo-navy-900">OTP Verification</h2>
                    <p className="mt-1 text-sm text-slate-700">
                      We sent a one-time PIN by SMS to <span className="font-bold">{capturedPhone}</span>. Verify the OTP to continue. KYC, credit, fraud, and affordability checks will run securely in the backend after OTP verification.
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <button
                        onClick={onSendOtp}
                        disabled={busy || !isSaidValid || !capturedPhone.trim()}
                        className="rounded-lg bg-pondo-orange-500 px-4 py-2 font-bold text-white hover:bg-pondo-orange-400 disabled:opacity-60"
                      >
                        Resend OTP to {capturedPhone}
                      </button>
                      {demoOtp ? <div className="text-xs text-emerald-700">Demo OTP: {demoOtp}</div> : null}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <input
                        value={otpInput}
                        onChange={(e) => setOtpInput(e.target.value)}
                        placeholder="Enter OTP"
                        className="w-full rounded-lg border border-pondo-line bg-white px-3 py-2 text-slate-800"
                      />
                      <button
                        onClick={onVerifyOtp}
                        disabled={busy || !otpRequestId || !otpInput.trim()}
                        className="rounded-lg bg-pondo-orange-500 px-4 py-2 font-bold text-white hover:bg-pondo-orange-400 disabled:opacity-60"
                      >
                        {busy ? "Verifying..." : "Verify OTP"}
                      </button>
                    </div>
                    {otpVerified ? <div className="mt-2 text-sm font-semibold text-emerald-700">OTP verified - identity confirmed</div> : null}
                  </div>
                )}
              </div>
            ) : null}

            {step === 4 && vetResult ? (
              <div className="space-y-4">
                <h2 className="text-2xl font-extrabold">Checks Completed</h2>
                <div className="rounded-xl border border-pondo-line bg-pondo-surface-soft text-slate-800">
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
                <div className="rounded-xl border border-pondo-line bg-pondo-surface-soft p-4">
                  <div className="mb-2 text-sm font-bold text-pondo-navy-800">PED (Payment Enabled Delivery)</div>
                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    <div>Driver: <span className="font-semibold">{routeDecision.driverName}</span></div>
                    <div>Badge: <span className="font-semibold">{routeDecision.driverBadge}</span></div>
                    <div>Vehicle: <span className="font-semibold">{routeDecision.vehicle}</span></div>
                    <div>ETA: <span className="font-semibold">{routeDecision.etaMinutes} min</span></div>
                  </div>
                  <div className="mt-3 text-xs text-slate-600">PED device and payment rails are active, the driver is KYC-cleared, and the custody chain is verified.</div>
                </div>

                <label className="block">
                  <div className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-600">Payment Method</div>
                  <select
                    value={selectedPaymentMethod}
                    onChange={(e) => setSelectedPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full rounded-lg border border-pondo-line bg-white px-3 py-2 text-slate-800"
                  >
                    {CUSTOMER_PAYMENT_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <div className="mt-2 text-xs text-slate-500">{selectedPaymentMethodMeta.helper}</div>
                </label>

                <div className="rounded-xl border border-[#d64534]/35 bg-[#fff6ea] px-4 py-3 text-sm text-[#914500]">
                  Final T&C: By clicking &quot;Complete Purchase&quot; you confirm payment for {cartCount} cart item(s), total {money(finalCustomerShareCents)}, using {selectedPaymentMethodMeta.label}, and consent to PED delivery.
                </div>
                <label>
                  <div className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-600">PONDO Settlement Account</div>
                  <select value={settlementBank} onChange={(e) => setSettlementBank(e.target.value as SettlementBank)} className="w-full rounded-lg border border-pondo-line bg-white px-3 py-2 text-slate-800">
                    <option value="absa">ABSA Business Account</option>
                    <option value="fnb">FNB Business Account</option>
                    <option value="standard_bank">Standard Bank Business Account</option>
                  </select>
                </label>
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  Final notification is released only after on-site arrival is confirmed and the {selectedPaymentMethodMeta.label} payment succeeds.
                </div>

                <button
                  onClick={onCompletePurchase}
                  disabled={busy || Boolean(completedOrderId) || cartLines.length === 0}
                  className="w-full rounded-xl bg-gradient-to-r from-[#d64534] to-[#d95a18] px-4 py-3 text-2xl font-extrabold text-white shadow-[0_10px_22px_rgba(217,90,24,0.35)] hover:from-[#ea6a3f] hover:to-[#d64534] disabled:opacity-60"
                >
                  {busy ? "Processing..." : completedOrderId ? "Purchase Completed" : "Complete Purchase - Clear Transaction"}
                </button>

                {completedOrderId ? (
                  <div className="rounded-xl border border-emerald-500/40 bg-emerald-50 p-4 text-sm text-emerald-800">
                    Transaction cleared successfully. Order ID: <span className="font-mono">{completedOrderId}</span>
                    {paymentSettlement ? (
                      <div className="mt-2">
                        {selectedPaymentMethodMeta.label} funds settled to <span className="font-semibold">{paymentSettlement.bankLabel}</span> ({paymentSettlement.accountRef}).
                      </div>
                    ) : null}
                    <div className="mt-3 flex gap-3">
                      <button onClick={() => router.push(`/PondoDemo/confirmation/${completedOrderId}`)} className="rounded-lg bg-emerald-600 px-4 py-2 font-bold text-white hover:bg-emerald-500">View Confirmation</button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {error ? <div className="mt-4 rounded-lg border border-red-400/35 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-pondo-line bg-white p-4">
              <div className="mb-2 inline-block rounded bg-pondo-orange-500 px-2 py-1 text-[11px] font-bold uppercase text-white">Cart Locked Checkout</div>
              <div className="text-xl font-bold text-pondo-navy-900">Order Summary ({cartCount})</div>
              <div className="mt-1 text-sm text-slate-600">Only cart items are shown and submitted for payment.</div>
              <div className="mt-3 space-y-2">
                {cartLines.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-pondo-line bg-[#f7faff] px-3 py-2 text-sm text-slate-600">Your cart is empty.</div>
                ) : (
                  cartLines.map((line) => (
                    <div key={line.product.id} className="grid grid-cols-[44px_1fr] gap-2 rounded-lg border border-pondo-line bg-[#f7faff] p-2">
                      <div
                        className="h-11 w-11 rounded-md bg-slate-100"
                        style={{
                          backgroundImage: `url(${IMAGE_BY_PRODUCT[line.product.id] || FALLBACK_IMAGE})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }}
                      />
                      <div>
                        <div className="text-sm font-bold text-pondo-navy-900">{line.product.name}</div>
                        <div className="text-xs text-slate-600">Qty {line.qty} x {money(line.unitCents)}</div>
                        <div className="mt-1 text-sm font-extrabold text-pondo-orange-500">{money(line.lineCents)}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-3 text-3xl font-extrabold text-pondo-orange-500">{money(cartSubtotalCents)}</div>
            </div>

            <div className="rounded-2xl border border-pondo-line bg-white p-4">
              <div className="mb-2 text-sm font-bold uppercase tracking-widest text-pondo-navy-800">PONDO Trust Guarantee</div>
              <ul className="space-y-2 text-sm text-slate-700">
                <li>TLS 1.3 End-to-End Encryption</li>
                <li>KYC Identity Verified</li>
                <li>ITC & Affordability Checked</li>
                <li>ML Fraud Detection Active</li>
                <li>POPIA Compliant</li>
                <li>PED Vetted Delivery</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-pondo-line bg-white p-4">
              <div className="mb-2 text-sm font-bold uppercase tracking-widest text-pondo-navy-800">Partner Integrations</div>
              <div className="flex flex-wrap gap-2 text-xs">
                {["Amazon SA", "Takealot", "TransUnion", "Experian", "Twilio SMS", "KYC Provider"].map((tag) => (
                  <span key={tag} className="rounded border border-pondo-line bg-pondo-surface-soft px-2 py-1 text-slate-700">{tag}</span>
                ))}
              </div>
            </div>
          </aside>
        </div>



        {partnerTrackingView.show && showFulfilmentTracking ? (
          <section className="mt-6 rounded-2xl border border-pondo-line bg-white p-5 shadow-sm">
            <h3 className="text-2xl font-black text-pondo-navy-900">Partner Delivery Confirmation Sequence</h3>
            <div className="mt-2 text-sm text-slate-600">
              {partnerTrackingView.processLabel} • {partnerTrackingView.progressPct}% complete
            </div>
            <div className="mt-2 text-sm text-slate-600">{partnerTrackingView.helperText}</div>
            <div className="mt-3 h-2 overflow-hidden rounded bg-[#dbe8ff]">
              <div
                className="h-full bg-pondo-orange-500 transition-all duration-500"
                style={{ width: `${partnerTrackingView.progressPct}%` }}
              />
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {partnerTrackingView.steps.map((item) => (
                <div
                  key={item.title}
                  className={[
                    "rounded-xl border p-4 transition",
                    item.status === "completed" ? "border-emerald-300 bg-emerald-50" : item.status === "active" ? "border-pondo-orange-500 bg-[#fff6ea]" : "border-pondo-line bg-[#f7faff]",
                  ].join(" ")}
                >
                  <div className="text-xs font-black uppercase tracking-[0.15em] text-slate-500">Step {item.index}</div>
                  <div className="mt-1 text-xl font-extrabold leading-tight text-pondo-navy-900">{item.title}</div>
                  <div className="mt-2 text-sm text-slate-700">{item.detail}</div>
                  <div className="mt-3 text-[11px] font-bold uppercase tracking-wide text-pondo-navy-800">{item.status}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
              PONDO keeps the delivery loop, PED validation, and partner orchestration running in the backend while this customer view shows partner-facing confirmation milestones only.
            </div>
            {driverArrivedOnSite && paymentSettlement ? (
              <div className="mt-3 rounded-lg border border-emerald-500/35 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                Driver arrival has been confirmed and the {selectedPaymentMethodMeta.label} payment has cleared. PONDO has been notified and settlement is recorded into {paymentSettlement.bankLabel}.
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}

