"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PondoDemoNav } from "@/components/PondoDemoNav";
import {
  autocompleteAddress,
  createDemoOrder,
  fetchDemoProducts,
  fetchPartnerCart,
  getPlaceAddress,
  login,
  payDemoOrder,
  sendOtp,
  simulateDemoCredit,
  type AddressSuggestion,
  type AddressValidationResult,
  type DemoProduct,
  type PaymentSettlement,
  type PartnerBootstrapSession,
  type PartnerName,
  type GoogleResolvedAddress,
  validateCheckoutAddress,
  verifyOtp,
} from "@/lib/api";
import { PAYMENT_METHOD_OPTIONS, type PaymentMethod, paymentMethodLabel } from "@/lib/paymentMethods";
import { fetchGeoLocation } from "@/lib/geolocation";
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

const CUSTOMER_PAYMENT_OPTIONS = PAYMENT_METHOD_OPTIONS.filter(
  (option) => !["bnpl", "ussd", "evoucher_wallet"].includes(option.id),
);

type ScreeningMode = "full" | "skip";

type DemoCustomerProfile = {
  email: string;
  label: string;
  screeningMode: ScreeningMode;
  note: string;
};

type VetResult = {
  transunionScore: number;
  transunionApproved: boolean;
  kycIdentityVerified: boolean;
  experianIncome: number;
  fraudScore: number;
  approved: boolean;
  screeningMode: ScreeningMode;
};

const DEMO_CUSTOMER_PROFILES: DemoCustomerProfile[] = [
  {
    email: "thabo@email.com",
    label: "thabo@email.com (Thabo Nkosi - Male Profile: High Risk Checks)",
    screeningMode: "full",
    note: "Male profile requires KYC, credit, affordability, fraud, and geolocation review.",
  },
  {
    email: "sipho@email.com",
    label: "sipho@email.com (Sipho Molefe - Male Profile: High Risk Checks)",
    screeningMode: "full",
    note: "Male profile requires KYC, credit, affordability, fraud, and geolocation review.",
  },
  {
    email: "mandla@email.com",
    label: "mandla@email.com (Mandla Khumalo - Male Profile: High Risk Checks)",
    screeningMode: "full",
    note: "Male profile requires KYC, credit, affordability, fraud, and geolocation review.",
  },
  {
    email: "amara@email.com",
    label: "amara@email.com (Amara Naidoo - Female Profile: No Background Checks)",
    screeningMode: "skip",
    note: "Female profile is configured for direct progression after OTP verification.",
  },
  {
    email: "naledi@email.com",
    label: "naledi@email.com (Naledi Dlamini - Female Profile: No Background Checks)",
    screeningMode: "skip",
    note: "Female profile is configured for direct progression after OTP verification.",
  },
  {
    email: "gogo@email.com",
    label: "gogo@email.com (Gogo Mokoena - Elderly Citizen: No Background Checks)",
    screeningMode: "skip",
    note: "Elderly citizen profile is configured for direct progression after OTP verification.",
  },
];

function money(cents: number) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function discountedPriceCents(p: DemoProduct) {
  return Math.round(p.priceCents * (1 - (p.discountPct || 0) / 100));
}

function ts() {
  const d = new Date();
  return `[${d.toLocaleTimeString("en-ZA", { hour12: false })}]`;
}

function etaDateLabel() {
  const eta = new Date();
  eta.setDate(eta.getDate() + 2);
  return new Intl.DateTimeFormat("en-ZA", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(eta);
}

function formatCombinedAddress(address: string, city: string, province: string, postalCode: string) {
  return [address, city, province, postalCode].map((part) => part.trim()).filter(Boolean).join(", ");
}

function createAddressSessionToken() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `pondo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isGoogleAddressAssistUnavailable(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized === "google_maps_not_configured" ||
    normalized.includes("requires billing to be enabled") ||
    normalized.includes("places api (new) has not been used") ||
    normalized.includes("address validation api has not been used") ||
    normalized.includes("api has not been used in project")
  );
}

function Stepper({ step, step3Label }: { step: number; step3Label: string }) {
  const visualStep = Math.min(step, 3);
  const items = ["Press Buy", "Confirm Details", step3Label];

  return (
    <div className="mb-8 grid grid-cols-3 gap-3 text-center text-[11px] text-slate-500">
      {items.map((label, idx) => {
        const current = idx + 1;
        const active = current <= visualStep;
        return (
          <div key={label} className="flex flex-col items-center gap-2">
            <div
              className={[
                "h-7 w-7 rounded-full border text-xs font-bold leading-7",
                active ? "border-pondo-orange-500 bg-pondo-orange-500 text-white" : "border-pondo-line text-slate-500",
              ].join(" ")}
            >
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
  const [email, setEmail] = useState("amara@email.com");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [processingMessage, setProcessingMessage] = useState("");

  const [session, setSession] = useState<PartnerBootstrapSession | null>(null);
  const [otpRequestId, setOtpRequestId] = useState("");
  const [otpInput, setOtpInput] = useState("");
  const [otpVerified, setOtpVerified] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [demoOtp, setDemoOtp] = useState("");

  const [capturedFullName, setCapturedFullName] = useState("");
  const [capturedIdNumber, setCapturedIdNumber] = useState("");
  const [capturedPhone, setCapturedPhone] = useState("");
  const [capturedEmail, setCapturedEmail] = useState("");
  const [capturedAddress, setCapturedAddress] = useState("");
  const [capturedCity, setCapturedCity] = useState("");
  const [capturedProvince, setCapturedProvince] = useState("");
  const [capturedPostalCode, setCapturedPostalCode] = useState("");
  const [geoLocationLoading, setGeoLocationLoading] = useState(false);
  const [saidBlurred, setSaidBlurred] = useState(false);
  const [addressSessionToken, setAddressSessionToken] = useState("");
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [addressSuggestionsOpen, setAddressSuggestionsOpen] = useState(false);
  const [addressSuggestionsLoading, setAddressSuggestionsLoading] = useState(false);
  const [addressAssistAvailable, setAddressAssistAvailable] = useState(false);
  const [addressLookupBusy, setAddressLookupBusy] = useState(false);
  const [, setSelectedGooglePlaceId] = useState("");
  const [addressValidation, setAddressValidation] = useState<AddressValidationResult | null>(null);
  const [addressValidationBusy, setAddressValidationBusy] = useState(false);

  const [vetResult, setVetResult] = useState<VetResult | null>(null);
  const [paymentSettlement, setPaymentSettlement] = useState<PaymentSettlement | null>(null);
  const [completedOrderId, setCompletedOrderId] = useState("");
  const [catalog, setCatalog] = useState<DemoProduct[]>(FALLBACK_PRODUCTS);
  const [, setApiLogs] = useState<string[]>(["Awaiting transaction initiation..."]);

  const customer = session?.customer || null;
  const cartCount = cart.count;
  const selectedProfile = useMemo(
    () => DEMO_CUSTOMER_PROFILES.find((profile) => profile.email === email) || DEMO_CUSTOMER_PROFILES[0],
    [email],
  );
  const selectedPaymentMethod: PaymentMethod = "card";
  const selectedPaymentMethodMeta = useMemo(
    () => CUSTOMER_PAYMENT_OPTIONS.find((option) => option.id === selectedPaymentMethod) || CUSTOMER_PAYMENT_OPTIONS[0],
    [selectedPaymentMethod],
  );

  function applyResolvedAddress(address: GoogleResolvedAddress | AddressValidationResult) {
    setCapturedAddress(address.formattedAddress || capturedAddress);
    setCapturedCity(address.city || "");
    setCapturedProvince(address.province || "");
    setCapturedPostalCode(address.postalCode || "");
    setSelectedGooglePlaceId(address.placeId || "");
  }

  useEffect(() => {
    fetchDemoProducts()
      .then((out) => setCatalog(out.items))
      .catch(() => setCatalog(FALLBACK_PRODUCTS));
  }, []);

  useEffect(() => {
    if (!session?.customer) return;

    setCapturedFullName(session.customer.fullName);
    setCapturedIdNumber(session.customer.idNumber);
    setCapturedPhone(session.customer.phone);
    setCapturedEmail(session.customer.email);
    setCapturedAddress(formatCombinedAddress(session.customer.address, "", "", ""));
    setSaidBlurred(false);
    setAddressSessionToken(createAddressSessionToken());
    setAddressSuggestions([]);
    setAddressSuggestionsOpen(false);
    setAddressValidation(null);
    setSelectedGooglePlaceId("");

    setGeoLocationLoading(true);
    fetchGeoLocation()
      .then((geo) => {
        if (geo) {
          setCapturedCity(geo.city);
          setCapturedProvince(geo.province);
          setCapturedPostalCode(geo.postalCode);
          setCapturedAddress(formatCombinedAddress(session.customer.address, geo.city, geo.province, geo.postalCode));
        }
        log(`Geolocation detected: ${geo?.city}, ${geo?.province}`);
      })
      .catch((e) => {
        console.error("Geolocation fetch failed:", e);
        log("Geolocation detection failed - using defaults");
      })
      .finally(() => setGeoLocationLoading(false));
  }, [session]);

  useEffect(() => {
    if (step !== 2 || !addressAssistAvailable) return;

    const query = capturedAddress.trim();
    if (query.length < 3) {
      setAddressSuggestions([]);
      setAddressSuggestionsOpen(false);
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      setAddressSuggestionsLoading(true);
      try {
        const out = await autocompleteAddress({ input: query, sessionToken: addressSessionToken || undefined });
        setAddressSuggestions(out.suggestions);
        setAddressSuggestionsOpen(out.suggestions.length > 0);
      } catch (e) {
        const message = e instanceof Error ? e.message : "address_autocomplete_failed";
        if (isGoogleAddressAssistUnavailable(message)) {
          setAddressAssistAvailable(false);
          setAddressSuggestions([]);
          setAddressSuggestionsOpen(false);
          log("Google address lookup is unavailable. Falling back to manual single-field address entry.");
          return;
        }
        setAddressSuggestions([]);
      } finally {
        setAddressSuggestionsLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [addressAssistAvailable, addressSessionToken, capturedAddress, step]);

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

  const cartSubtotalCents = useMemo(
    () => cartLines.reduce((sum, line) => sum + line.lineCents, 0),
    [cartLines],
  );
  const normalizedIdNumber = capturedIdNumber.replace(/\D/g, "");
  const isSaidComplete = normalizedIdNumber.length === 13;
  const isSaidValid = isSaidComplete && validateSAID(normalizedIdNumber);
  const showSaidFeedback = saidBlurred;

  const primaryCtaClass =
    "w-full rounded-xl bg-gradient-to-r from-[#d64534] to-[#d95a18] px-4 py-3 text-lg font-bold text-white shadow-[0_8px_18px_rgba(217,90,24,0.32)] hover:from-[#ea6a3f] hover:to-[#d64534] disabled:opacity-60";

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
      setOtpInput("");
      setOtpVerified(false);
      setTermsAccepted(false);
      setVetResult(null);
      setPaymentSettlement(null);
      setCompletedOrderId("");
      setProcessingMessage("");
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

  async function onSelectAddressSuggestion(suggestion: AddressSuggestion) {
    setError("");
    setAddressLookupBusy(true);
    try {
      const out = await getPlaceAddress({
        placeId: suggestion.placeId,
        sessionToken: addressSessionToken || undefined,
      });
      applyResolvedAddress(out.place);
      setAddressValidation(null);
      setAddressSuggestions([]);
      setAddressSuggestionsOpen(false);
      log(`Google place selected: ${out.place.formattedAddress}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "address_place_lookup_failed");
    } finally {
      setAddressLookupBusy(false);
    }
  }

  async function ensureValidatedAddress() {
    const trimmedAddress = capturedAddress.trim();
    if (!trimmedAddress) throw new Error("Please enter a delivery address before proceeding.");

    if (!addressAssistAvailable) {
      return;
    }

    if (addressValidation?.verdict === "validated" && addressValidation.formattedAddress === trimmedAddress) {
      return;
    }

    setAddressValidationBusy(true);
    try {
      const out = await validateCheckoutAddress({
        address: trimmedAddress,
        sessionToken: addressSessionToken || undefined,
      });
      setAddressValidation(out.validation);
      applyResolvedAddress(out.validation);

      if (out.validation.verdict === "needs_confirmation") {
        log(`Google address validation needs confirmation: ${out.validation.formattedAddress || trimmedAddress}`);
        throw new Error("Please confirm the Google-suggested delivery address before proceeding.");
      }

      log(`Google validated address: ${out.validation.formattedAddress}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "address_validation_failed";
      if (isGoogleAddressAssistUnavailable(message)) {
        setAddressAssistAvailable(false);
        setAddressValidation(null);
        setAddressSuggestions([]);
        setAddressSuggestionsOpen(false);
        log("Google address validation is unavailable. Proceeding with manual single-field delivery address.");
        return;
      }
      throw e;
    } finally {
      setAddressValidationBusy(false);
    }
  }

  async function requestOtp() {
    if (!session || !customer) return;
    if (!isSaidValid) {
      setSaidBlurred(true);
      throw new Error("Enter a valid 13-digit South African ID number before requesting OTP.");
    }

    const out = await sendOtp({
      sessionId: session.sessionId,
      channel: "sms",
      destination: capturedPhone || customer.phone,
    });
    setOtpRequestId(out.requestId);
    setDemoOtp(out.demoOtp);
    setOtpVerified(false);
    log(`OTP sent to ${capturedPhone || customer.phone} via Twilio SMS`);
    log(`OTP reference: ${out.requestId}`);
  }

  async function onContinueToOtp() {
    if (!isSaidValid) {
      setSaidBlurred(true);
      setError("Please enter a valid South African ID number before proceeding.");
      return;
    }
    if (!termsAccepted) {
      setError("Please accept Terms & Conditions before proceeding.");
      return;
    }

    setError("");
    setBusy(true);
    try {
      await ensureValidatedAddress();
      log("T&C accepted - POPIA consent captured");
      await requestOtp();
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "otp_send_failed");
    } finally {
      setBusy(false);
    }
  }

  async function runScreeningJourney() {
    if (!customer) return null;

    if (selectedProfile.screeningMode === "skip") {
      const autoApproved: VetResult = {
        transunionScore: 0,
        transunionApproved: true,
        kycIdentityVerified: true,
        experianIncome: customer.monthlyIncome,
        fraudScore: 0.01,
        approved: true,
        screeningMode: "skip",
      };
      setVetResult(autoApproved);
      log("OTP accepted - trusted profile progressed without manual background checks.");
      return autoApproved;
    }

    const data = await simulateDemoCredit({ saId: normalizedIdNumber, bureau: "transunion" });
    const transunionScore = data.result.score as number;
    const transunionApproved = Boolean(data.result.approved);
    const kycIdentityVerified = true;
    const experianIncome = customer.monthlyIncome;
    const geoPenalty = capturedProvince.toLowerCase().includes("kwa") ? 0.02 : 0.01;
    const fraudScore = Math.max(0.01, Number(((850 - transunionScore) / 10000 + geoPenalty).toFixed(2)));
    const approved = transunionApproved && kycIdentityVerified && experianIncome >= 15000 && fraudScore <= 0.08;

    const result: VetResult = {
      transunionScore,
      transunionApproved,
      kycIdentityVerified,
      experianIncome,
      fraudScore,
      approved,
      screeningMode: "full",
    };

    setVetResult(result);
    log(`TransUnion ITC score: ${transunionScore} (${transunionApproved ? "approved" : "declined"})`);
    log(`Experian affordability: income ${new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(experianIncome)}/mo`);
    log(`Geo-location reviewed: ${capturedCity}, ${capturedProvince}`);
    log(`Python fraud score: ${fraudScore.toFixed(2)} (${fraudScore <= 0.08 ? "low risk" : "high risk"})`);
    log(approved ? "All checks passed - customer approved for checkout" : "Checks failed - manual review required");
    return result;
  }

  async function completeApprovedPurchase() {
    if (!session || !customer || !cartLines.length) throw new Error("checkout_incomplete");

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
        settlementBank: "absa",
        notifyEmail: capturedEmail,
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
    log(`Payment method confirmed: ${paymentMethodLabel(selectedPaymentMethod)}`);
    log(`Funds settled to PONDO ${submitted.pay.settlement.bankLabel} (${submitted.pay.settlement.accountRef})`);
    log("Order, settlement, and delivery process records were written to the Supabase-backed database.");
    log(`Order submitted using ${cartLines.length} cart item(s)`);
    log(`Webhook posted to ${session.partnerLabel} for ${paymentMethodLabel(selectedPaymentMethod)}`);
  }

  async function onVerifyOtp() {
    setError("");
    setProcessingMessage("");
    setBusy(true);
    try {
      await verifyOtp({ requestId: otpRequestId, code: otpInput });
      setOtpVerified(true);
      log("OTP accepted - identity confirmed");

      if (selectedProfile.screeningMode === "full") {
        setProcessingMessage("Running KYC, credit, affordability, fraud, and geolocation checks...");
      } else {
        setProcessingMessage("Profile is exempt from background checks. Finalizing order confirmation...");
      }

      const result = await runScreeningJourney();
      if (!result?.approved) {
        throw new Error("Customer did not pass the required background checks.");
      }

      setProcessingMessage("Checks passed. Writing the order and settlement to Supabase...");
      await completeApprovedPurchase();
      setProcessingMessage("");
      setStep(4);
    } catch (e) {
      setOtpVerified(false);
      setProcessingMessage("");
      setError(e instanceof Error ? e.message : "otp_verify_failed");
    } finally {
      setBusy(false);
    }
  }

  const step3Label = completedOrderId ? "Completed" : "OTP Verification";

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
            <div className="rounded-full bg-emerald-100 px-4 py-2 text-center text-emerald-700">
              <span className="font-bold">3 Active Deliveries</span>
            </div>
            <div className="rounded-lg bg-white/12 px-4 py-2 text-center">
              <div className="font-bold text-sky-200">2.4M+</div>
              <div className="text-slate-100">Verified Txns</div>
            </div>
            <div className="rounded-lg bg-white/12 px-4 py-2 text-center">
              <div className="font-bold text-pondo-orange-400">4.2hrs</div>
              <div className="text-slate-100">Avg Delivery</div>
            </div>
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
                <p className="text-sm text-slate-700">
                  PONDO acts as your trusted checkout layer. We fetch your details from the partner eCommerce site and guide you through a secure, verified payment journey.
                </p>

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
                  <label>
                    <div className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-600">Your Account Email (Demo)</div>
                    <select value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg border border-pondo-line bg-white px-3 py-2 text-slate-800">
                      {DEMO_CUSTOMER_PROFILES.map((profile) => (
                        <option key={profile.email} value={profile.email}>
                          {profile.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                  {selectedProfile.note}
                </div>

                <button onClick={onPressBuy} disabled={busy || !cartCount} className={primaryCtaClass}>
                  {busy ? "Loading..." : cartCount ? `Press Buy (${cartCount} item${cartCount > 1 ? "s" : ""})` : "Cart is empty"}
                </button>
              </div>
            ) : null}

            {step === 2 && customer ? (
              <div className="space-y-4">
                <h2 className="text-2xl font-extrabold">Confirm Your Details</h2>
                <div className="rounded-lg border border-emerald-500/40 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  Edit and verify your personal details. Geolocation is auto-detected from your IP address.
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-600">Full Name</label>
                    <input value={capturedFullName} onChange={(e) => setCapturedFullName(e.target.value)} className="w-full rounded-lg border border-pondo-line px-3 py-2 text-slate-800" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-600">ID Number</label>
                    <input
                      value={capturedIdNumber}
                      onChange={(e) => {
                        setCapturedIdNumber(e.target.value.replace(/\D/g, "").slice(0, 13));
                      }}
                      onBlur={() => {
                        setSaidBlurred(true);
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
                        <p className="mt-1 text-xs font-semibold text-emerald-700">Valid South African ID number.</p>
                      ) : (
                        <p className="mt-1 text-xs font-semibold text-red-600">Enter a valid 13-digit South African ID number.</p>
                      )
                    ) : null}
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-600">Phone Number</label>
                    <input value={capturedPhone} onChange={(e) => setCapturedPhone(e.target.value)} className="w-full rounded-lg border border-pondo-line px-3 py-2 text-slate-800" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-600">Email</label>
                    <input value={capturedEmail} onChange={(e) => setCapturedEmail(e.target.value)} className="w-full rounded-lg border border-pondo-line px-3 py-2 text-slate-800" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-bold text-slate-600">
                      Delivery Address {geoLocationLoading ? "(detecting area details...)" : ""}
                    </label>
                    <input
                      value={capturedAddress}
                      onChange={(e) => {
                        setCapturedAddress(e.target.value);
                        setAddressValidation(null);
                        setSelectedGooglePlaceId("");
                      }}
                      onFocus={() => {
                        if (addressSuggestions.length) setAddressSuggestionsOpen(true);
                      }}
                      onBlur={() => {
                        window.setTimeout(() => setAddressSuggestionsOpen(false), 120);
                      }}
                      placeholder="Start typing your delivery address"
                      className="w-full rounded-lg border border-pondo-line px-3 py-2 text-slate-800"
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full bg-sky-50 px-2 py-1 font-semibold text-sky-800">
                        {addressAssistAvailable ? "Google autocomplete enabled" : "Manual address entry"}
                      </span>
                      {addressSuggestionsLoading || addressLookupBusy ? (
                        <span className="text-slate-500">Looking up address suggestions...</span>
                      ) : null}
                      {capturedCity || capturedProvince || capturedPostalCode ? (
                        <span className="text-slate-500">
                          Delivery zone: {[capturedCity, capturedProvince, capturedPostalCode].filter(Boolean).join(" • ")}
                        </span>
                      ) : null}
                    </div>
                    {addressSuggestionsOpen && addressSuggestions.length ? (
                      <div className="mt-2 overflow-hidden rounded-xl border border-pondo-line bg-white shadow-lg">
                        {addressSuggestions.map((suggestion) => (
                          <button
                            key={suggestion.placeId}
                            type="button"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              void onSelectAddressSuggestion(suggestion);
                            }}
                            className="block w-full border-b border-slate-100 px-4 py-3 text-left last:border-b-0 hover:bg-sky-50"
                          >
                            <div className="text-sm font-semibold text-pondo-navy-900">{suggestion.mainText}</div>
                            {suggestion.secondaryText ? (
                              <div className="mt-1 text-xs text-slate-500">{suggestion.secondaryText}</div>
                            ) : null}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {addressValidation ? (
                      addressValidation.verdict === "validated" ? (
                        <div className="mt-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                          Google verified this delivery address.
                        </div>
                      ) : (
                        <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                          <div className="font-semibold">Google suggests reviewing this address before we continue.</div>
                          <div className="mt-1">{addressValidation.formattedAddress || capturedAddress}</div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                applyResolvedAddress(addressValidation);
                                setAddressValidation(null);
                                log(`Customer accepted Google-suggested address: ${addressValidation.formattedAddress}`);
                              }}
                              className="rounded-full bg-amber-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-400"
                            >
                              Use suggested address
                            </button>
                          </div>
                        </div>
                      )
                    ) : null}
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

                <button onClick={onContinueToOtp} disabled={busy || addressLookupBusy || addressValidationBusy} className={primaryCtaClass}>
                  {busy ? "Sending OTP..." : addressValidationBusy ? "Validating Address..." : "Continue to OTP Verification"}
                </button>
              </div>
            ) : null}

            {step === 3 && customer ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-pondo-line bg-[#f7faff] p-4">
                  <h2 className="text-2xl font-extrabold">OTP Verification</h2>
                  <p className="mt-2 text-sm text-slate-700">
                    We sent a one-time PIN by SMS to <span className="font-bold">{capturedPhone}</span>. Verify the OTP to continue.
                    {selectedProfile.screeningMode === "full"
                      ? " KYC, credit, fraud, affordability, and geolocation checks will run automatically after verification."
                      : " This profile will move directly to order confirmation after verification."}
                  </p>

                  <div className="mt-5 flex flex-wrap items-center gap-2">
                    <button
                      onClick={async () => {
                        setError("");
                        setBusy(true);
                        try {
                          await requestOtp();
                        } catch (e) {
                          setError(e instanceof Error ? e.message : "otp_send_failed");
                        } finally {
                          setBusy(false);
                        }
                      }}
                      disabled={busy}
                      className="rounded-lg bg-pondo-orange-500 px-4 py-2 font-bold text-white hover:bg-pondo-orange-400 disabled:opacity-60"
                    >
                      Resend OTP to {capturedPhone}
                    </button>
                    {demoOtp ? <div className="text-xs font-semibold text-emerald-700">Demo OTP: {demoOtp}</div> : null}
                  </div>

                  <div className="mt-3 flex gap-2">
                    <input value={otpInput} onChange={(e) => setOtpInput(e.target.value)} placeholder="Enter OTP" className="w-full rounded-lg border border-pondo-line bg-white px-3 py-2 text-slate-800" />
                    <button onClick={onVerifyOtp} disabled={busy || !otpRequestId || !otpInput.trim()} className="rounded-lg bg-pondo-orange-500 px-4 py-2 font-bold text-white hover:bg-pondo-orange-400 disabled:opacity-60">
                      {busy ? "Verifying..." : "Verify OTP"}
                    </button>
                  </div>

                  {processingMessage ? (
                    <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
                      {processingMessage}
                    </div>
                  ) : null}

                  {otpVerified && !processingMessage ? (
                    <div className="mt-2 text-sm font-semibold text-emerald-700">OTP verified - identity confirmed</div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {step === 4 && completedOrderId ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-emerald-300 bg-white p-5 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-2xl font-black text-emerald-700">
                      ✓
                    </div>
                    <div>
                      <h2 className="text-2xl font-extrabold text-emerald-950">Order received, thanks!</h2>
                      <p className="text-sm text-slate-700">
                        Confirmation has been sent to {capturedEmail} and SMS confirmation has been sent to {capturedPhone}.
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 border-t border-slate-200 pt-4 text-sm text-slate-800">
                    <p><span className="font-bold">Delivery to</span> {capturedFullName}, {capturedAddress}, South Africa</p>
                    <div className="mt-4">
                      <div className="font-bold">{etaDateLabel()}</div>
                      <div>Estimated delivery</div>
                    </div>
                    <div className="mt-4">
                      <div><span className="font-bold">Partner:</span> {session?.partnerLabel} fulfilment</div>
                      <div><span className="font-bold">Items:</span> {cartCount} item totalling {money(cartSubtotalCents)}</div>
                    </div>
                  </div>

                  <div className="mt-5 rounded-xl border border-pondo-line bg-[#f7faff] px-4 py-3 text-sm text-slate-700">
                    Email and SMS notifications include the order summary, delivery address, estimated fulfilment date, and the PONDO verification outcome.
                  </div>

                  <div className="mt-4 flex flex-wrap gap-3">
                    <button onClick={() => router.push(`/PondoDemo/confirmation/${completedOrderId}`)} className="rounded-lg bg-pondo-orange-500 px-4 py-2 font-bold text-white hover:bg-pondo-orange-400">
                      Track fulfilment progress
                    </button>
                    <button onClick={() => router.push("/PondoDemo/shop")} className="rounded-lg border border-pondo-line bg-white px-4 py-2 font-bold text-pondo-navy-900 hover:bg-[#eef3ff]">
                      Continue shopping
                    </button>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    {vetResult?.screeningMode === "full" ? (
                      <>
                        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">KYC verified</div>
                        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">Credit approved</div>
                        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">Affordability passed</div>
                        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">Fraud low risk</div>
                      </>
                    ) : (
                      <>
                        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">OTP verified</div>
                        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">Trusted profile</div>
                        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">No KYC required</div>
                        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">Order confirmed</div>
                      </>
                    )}
                  </div>
                </div>
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
              {step === 4 && paymentSettlement ? (
                <div className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                  Supabase settlement recorded to {paymentSettlement.bankLabel} using {selectedPaymentMethodMeta.label}.
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
