"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PondoDemoNav } from "@/components/PondoDemoNav";
import {
  analyzeManualReviewDocuments,
  autocompleteAddress,
  confirmPondoCheckoutDetails,
  createDemoOrder,
  fetchDemoProducts,
  fetchPartnerCart,
  getPlaceAddress,
  login,
  persistPondoRiskAssessment,
  resolveManualReviewOrder,
  sendOtp,
  simulateDemoCredit,
  type AddressSuggestion,
  type AddressValidationResult,
  type DemoProduct,
  type DocumentAnalysisResult,
  type PaymentSettlement,
  type PartnerBootstrapSession,
  type PartnerName,
  type RiskAssessment,
  type Transaction,
  type GoogleResolvedAddress,
  validateCheckoutAddress,
  verifyOtp,
} from "@/lib/api";
import { PAYMENT_METHOD_OPTIONS, type PaymentMethod, paymentMethodLabel } from "@/lib/paymentMethods";
import { createDeviceFingerprint } from "@/lib/deviceFingerprint";
import { fetchGeoLocation, type GeoLocation } from "@/lib/geolocation";
import { useAuth } from "@/lib/auth";
import { usePondoCart } from "@/lib/pondoCart";
import { FALLBACK_IMAGE, FALLBACK_PRODUCTS, IMAGE_BY_PRODUCT } from "@/lib/demoCatalog";
import { deriveSouthAfricanIdRisk, validateSAID } from "@/lib/validateSAID";

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
  experianIncome: number | null;
  fraudScore: number;
  approved: boolean;
  screeningMode: ScreeningMode;
};

type IdentityDocumentType = "sa_id" | "drivers_licence";

type SelectedDocument = {
  fileName: string;
  fileSize: number;
  mimeType: string;
  base64Data: string;
};

const DEMO_CUSTOMER_PROFILES: DemoCustomerProfile[] = [
  {
    email: "thabo@email.com",
    label: "thabo@email.com (Thabo Nkosi)",
    screeningMode: "full",
    note: "Existing profile loaded. Final verification path now comes from South African ID, age, sex, and geo-risk scoring.",
  },
  {
    email: "sipho@email.com",
    label: "sipho@email.com (Sipho Molefe)",
    screeningMode: "full",
    note: "Existing profile loaded. Final verification path now comes from South African ID, age, sex, and geo-risk scoring.",
  },
  {
    email: "mandla@email.com",
    label: "mandla@email.com (Mandla Khumalo)",
    screeningMode: "full",
    note: "Existing profile loaded. Final verification path now comes from South African ID, age, sex, and geo-risk scoring.",
  },
  {
    email: "amara@email.com",
    label: "amara@email.com (Amara Naidoo)",
    screeningMode: "skip",
    note: "Existing profile loaded. Final verification path now comes from South African ID, age, sex, and geo-risk scoring.",
  },
  {
    email: "naledi@email.com",
    label: "naledi@email.com (Naledi Dlamini)",
    screeningMode: "skip",
    note: "Existing profile loaded. Final verification path now comes from South African ID, age, sex, and geo-risk scoring.",
  },
  {
    email: "gogo@email.com",
    label: "gogo@email.com (Gogo Mokoena)",
    screeningMode: "skip",
    note: "Existing profile loaded. Final verification path now comes from South African ID, age, sex, and geo-risk scoring.",
  },
];

const DELIVERY_TIME_SLOTS = [
  { id: "09:00-11:00", label: "09:00 - 11:00" },
  { id: "12:00-15:00", label: "12:00 - 15:00" },
] as const;

const CHECKOUT_PROVINCE_ALIASES: Record<string, string> = {
  gp: "gauteng",
  gauteng: "gauteng",
  kzn: "kwazulu-natal",
  "kwa-zulu natal": "kwazulu-natal",
  "kwazulu natal": "kwazulu-natal",
  "kwazulu-natal": "kwazulu-natal",
  wc: "western cape",
  "western cape": "western cape",
  ec: "eastern cape",
  "eastern cape": "eastern cape",
  fs: "free state",
  "free state": "free state",
  lp: "limpopo",
  limpopo: "limpopo",
  mp: "mpumalanga",
  mpumalanga: "mpumalanga",
  nc: "northern cape",
  "northern cape": "northern cape",
  nw: "north west",
  "north west": "north west",
};

const CHECKOUT_HIGH_RISK_ZONES = new Set([
  "durban|kwazulu-natal",
  "durban central|kwazulu-natal",
  "hillbrow|gauteng",
  "johannesburg cbd|gauteng",
  "alexandra|gauteng",
]);

function normalizeRiskText(value: string | undefined) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeRiskProvince(value: string | undefined) {
  const normalized = normalizeRiskText(value).replace(/\./g, "");
  return CHECKOUT_PROVINCE_ALIASES[normalized] || normalized;
}

function computeProjectedRisk(input: {
  clientGeo: GeoLocation | null;
  city: string;
  province: string;
  amountCents: number;
  deviceFingerprint: string;
  idNumber: string;
}) {
  let score = 0;
  const idRisk = deriveSouthAfricanIdRisk(input.idNumber);
  const geoFactors: string[] = [];
  const ipProvince = normalizeRiskProvince(input.clientGeo?.province);
  const ipCity = normalizeRiskText(input.clientGeo?.city);
  const deliveryProvince = normalizeRiskProvince(input.province);
  const deliveryCity = normalizeRiskText(input.city);
  const provinceMatches = ipProvince && deliveryProvince && ipProvince === deliveryProvince;
  const cityMatches = ipCity && deliveryCity && ipCity === deliveryCity;
  const ipMismatch = Boolean((ipProvince || ipCity) && (deliveryProvince || deliveryCity) && !provinceMatches && !cityMatches);
  if (idRisk && !idRisk.rejected) {
    score += idRisk.ageScore + idRisk.genderScore;
  }
  if (ipMismatch) {
    score += 40;
    geoFactors.push("IP mismatch +40");
  }
  const highRiskZone = CHECKOUT_HIGH_RISK_ZONES.has(`${deliveryCity}|${deliveryProvince}`);
  if (highRiskZone) {
    score += 30;
    geoFactors.push("High-risk zone +30");
  }
  const highValue = input.amountCents > 1_000_000;
  if (highValue) {
    score += 20;
    geoFactors.push("High-value order +20");
  }
  const fingerprintPresent = Boolean(input.deviceFingerprint);
  if (!fingerprintPresent) {
    score += 10;
    geoFactors.push("Missing device fingerprint +10");
  }
  const nonSouthAfricanIp = Boolean(input.clientGeo?.country) && normalizeRiskText(input.clientGeo?.country) !== "south africa";
  if (nonSouthAfricanIp) {
    score += 25;
    geoFactors.push("Non-SA IP +25");
  }

  return {
    score,
    ipMismatch,
    highRiskZone,
    highValue,
    nonSouthAfricanIp,
    idRisk,
    geoFactors,
    decision: score > 70 ? "manual_review_hold" : score >= 41 ? "elevated_verification" : "auto_approve",
  } as const;
}

function riskDecisionLabel(decision: RiskAssessment["decision"] | ReturnType<typeof computeProjectedRisk>["decision"]) {
  if (decision === "manual_review_hold") return "Manual Review Required";
  if (decision === "elevated_verification") return "Elevated Verification";
  return "Auto-Approve";
}

function manualReviewDisplayState(reviewStatus: string | null | undefined, riskDecision: string | null | undefined) {
  if (reviewStatus === "approved") {
    return {
      title: "Manual review approved - released to fulfilment",
      message: "The analyst approved the submitted supporting documents. The order can now move into the normal fulfilment and delivery process.",
      chip: "Released to fulfilment",
    };
  }
  if (reviewStatus === "declined") {
    return {
      title: "Manual review declined",
      message: "The analyst declined this review after checking the submitted supporting documents. The order will not move forward to fulfilment.",
      chip: "Review declined",
    };
  }
  if (riskDecision === "manual_review_hold") {
    return {
      title: "Supporting documents received - awaiting manual review",
      message: "The supporting documents were received successfully, but the order remains paused until an analyst completes the manual review.",
      chip: "Documents received - awaiting review",
    };
  }
  return {
    title: "Order received, thanks!",
    message: "The order is ready to continue through the normal fulfilment and delivery process.",
    chip: "Released to fulfilment",
  };
}

function buildReviewAssistantSummary(input: {
  reviewStatus: string | null | undefined;
  score: number | null | undefined;
  decision: string | null | undefined;
  fullName: string;
  hasIdentityDocument: boolean;
  hasProofOfAddress: boolean;
  identityDocumentType: IdentityDocumentType;
  documentAnalysis?: DocumentAnalysisResult | null;
}) {
  const reasons = [
    input.hasIdentityDocument
      ? `${input.identityDocumentType === "sa_id" ? "South African ID" : "Driver's licence"} uploaded`
      : "Primary identity document still missing",
    input.hasProofOfAddress ? "Proof of address uploaded" : "Proof of address still missing",
    typeof input.score === "number" ? `Composite risk score recorded at ${input.score}` : "Composite risk score pending",
    ...(input.documentAnalysis?.recommendation.reasons || []),
  ];

  const recommendation =
    input.reviewStatus === "approved"
      ? "approved"
      : input.reviewStatus === "declined"
        ? "declined"
        : input.documentAnalysis?.recommendation.decision === "decline"
          ? "decline"
          : input.documentAnalysis?.recommendation.decision === "approve"
            ? "approve"
        : input.hasIdentityDocument && input.hasProofOfAddress && input.decision === "manual_review_hold"
          ? "approve"
          : "decline";

  const summary =
    input.documentAnalysis?.recommendation.summary ||
    (recommendation === "approve" || recommendation === "approved"
      ? `AI review assistant recommends approval for ${input.fullName} because the required supporting documents have been received and the case is ready for fulfilment release.`
      : `AI review assistant recommends decline or continued hold for ${input.fullName} because the case is incomplete or still presents unresolved review concerns.`);

  return { recommendation, summary, reasons };
}

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

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function minDeliveryDateValue() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return toDateInputValue(date);
}

function formatDeliveryDateLabel(value: string) {
  if (!value) return "";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-ZA", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(parsed);
}

function monthLabel(value: Date) {
  return new Intl.DateTimeFormat("en-ZA", {
    month: "long",
    year: "numeric",
  }).format(value);
}

function dayNameLabels() {
  const formatter = new Intl.DateTimeFormat("en-ZA", { weekday: "short" });
  const start = new Date(Date.UTC(2026, 4, 3));
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + index);
    return formatter.format(day);
  });
}

function buildCalendarMonth(monthStart: Date, minDateValue: string) {
  const firstDay = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1);
  const lastDay = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
  const leadingDays = firstDay.getDay();
  const cells: Array<{ key: string; date: string | null; label: number | null; disabled: boolean }> = [];

  for (let index = 0; index < leadingDays; index += 1) {
    cells.push({ key: `empty-${monthStart.toISOString()}-${index}`, date: null, label: null, disabled: true });
  }

  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    const current = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
    const value = toDateInputValue(current);
    cells.push({
      key: value,
      date: value,
      label: day,
      disabled: value < minDateValue,
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ key: `tail-${monthStart.toISOString()}-${cells.length}`, date: null, label: null, disabled: true });
  }

  return cells;
}

const CALENDAR_DAY_LABELS = dayNameLabels();

function createAddressSessionToken() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `pondo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isGoogleAddressAssistUnavailable(message: string, code?: string) {
  const normalized = (code || message).toLowerCase();
  const normalizedMessage = message.toLowerCase();
  return (
    normalized === "google_maps_not_configured" ||
    normalizedMessage.includes("requires billing to be enabled") ||
    normalizedMessage.includes("places api (new) has not been used") ||
    normalizedMessage.includes("address validation api has not been used") ||
    normalizedMessage.includes("api has not been used in project")
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
  const [deliveryDate, setDeliveryDate] = useState("");
  const [deliveryWindow, setDeliveryWindow] = useState("");
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
  const [completedTransaction, setCompletedTransaction] = useState<Transaction | null>(null);
  const [completedRiskAssessment, setCompletedRiskAssessment] = useState<RiskAssessment | null>(null);
  const [completedOrderId, setCompletedOrderId] = useState("");
  const [kycReadyToConfirm, setKycReadyToConfirm] = useState(false);
  const [catalog, setCatalog] = useState<DemoProduct[]>(FALLBACK_PRODUCTS);
  const [clientGeo, setClientGeo] = useState<GeoLocation | null>(null);
  const [deviceFingerprint, setDeviceFingerprint] = useState("");
  const [calendarMonthCount] = useState(18);
  const [identityDocumentType, setIdentityDocumentType] = useState<IdentityDocumentType>("sa_id");
  const [identityDocument, setIdentityDocument] = useState<SelectedDocument | null>(null);
  const [proofOfAddressDocument, setProofOfAddressDocument] = useState<SelectedDocument | null>(null);
  const [documentAnalysis, setDocumentAnalysis] = useState<DocumentAnalysisResult | null>(null);
  const [reviewAssistantOpen, setReviewAssistantOpen] = useState(false);
  const [, setApiLogs] = useState<string[]>(["Awaiting transaction initiation..."]);

  const customer = session?.customer || null;
  const cartCount = cart.count;
  const minimumDeliveryDate = useMemo(() => minDeliveryDateValue(), []);
  const selectedDeliverySlot = useMemo(
    () => DELIVERY_TIME_SLOTS.find((slot) => slot.id === deliveryWindow) || null,
    [deliveryWindow],
  );
  const deliveryCalendarMonths = useMemo(() => {
    const [year, month] = minimumDeliveryDate.split("-").map(Number);
    const startMonth = new Date(year, (month || 1) - 1, 1);
    return Array.from({ length: calendarMonthCount }, (_, index) => {
      const monthStart = new Date(startMonth.getFullYear(), startMonth.getMonth() + index, 1);
      return {
        key: `${monthStart.getFullYear()}-${monthStart.getMonth() + 1}`,
        label: monthLabel(monthStart),
        cells: buildCalendarMonth(monthStart, minimumDeliveryDate),
      };
    });
  }, [calendarMonthCount, minimumDeliveryDate]);
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
    createDeviceFingerprint()
      .then((fingerprint) => setDeviceFingerprint(fingerprint))
      .catch(() => setDeviceFingerprint(""));
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
          setClientGeo(geo);
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
        const code = typeof e === "object" && e && "code" in e && typeof (e as { code?: unknown }).code === "string" ? (e as { code: string }).code : "";
        if (isGoogleAddressAssistUnavailable(message, code)) {
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
  const saidRisk = useMemo(() => deriveSouthAfricanIdRisk(normalizedIdNumber), [normalizedIdNumber]);
  const projectedRisk = useMemo(
    () =>
      computeProjectedRisk({
        clientGeo,
        city: addressValidation?.city || capturedCity,
        province: addressValidation?.province || capturedProvince,
        amountCents: cartSubtotalCents,
        deviceFingerprint,
        idNumber: normalizedIdNumber,
      }),
    [addressValidation?.city, addressValidation?.province, capturedCity, capturedProvince, cartSubtotalCents, clientGeo, deviceFingerprint, normalizedIdNumber],
  );
  const requiresEnhancedRiskChecks = projectedRisk.decision !== "auto_approve";
  const requiresKycPipelineView = projectedRisk.decision !== "auto_approve";
  const requiresManualReviewDocuments = projectedRisk.decision === "manual_review_hold";
  const requiresProofOfAddress = requiresManualReviewDocuments;
  const isSaidComplete = normalizedIdNumber.length === 13;
  const isSaidValid = isSaidComplete && validateSAID(normalizedIdNumber);
  const isUnderAge = Boolean(saidRisk?.rejected);
  const showSaidFeedback = saidBlurred;

  const primaryCtaClass =
    "w-full rounded-xl bg-gradient-to-r from-[#d64534] to-[#d95a18] px-4 py-3 text-lg font-bold text-white shadow-[0_8px_18px_rgba(217,90,24,0.32)] hover:from-[#ea6a3f] hover:to-[#d64534] disabled:opacity-60";

  function log(message: string) {
    setApiLogs((prev) => [`${ts()} ${message}`, ...prev].slice(0, 40));
  }

  function isPdfDocument(document: SelectedDocument | null | undefined) {
    if (!document) return false;
    return document.mimeType === "application/pdf" || document.fileName.toLowerCase().endsWith(".pdf");
  }

  function shouldRetryDocumentAnalysisWithoutProof(error: unknown, proofDocument: SelectedDocument | null) {
    if (!proofDocument || !isPdfDocument(proofDocument)) return false;
    if (!(error instanceof Error)) return false;
    const status = "status" in error && typeof error.status === "number" ? error.status : null;
    return status === 400 || status === 413;
  }

  async function rememberSelectedDocument(file: File | null) {
    if (!file) return null;
    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
          return;
        }
        reject(new Error("document_encoding_failed"));
      };
      reader.onerror = () => reject(reader.error || new Error("document_encoding_failed"));
      reader.readAsDataURL(file);
    });
    return {
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || "application/octet-stream",
      base64Data,
    };
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
      setCompletedTransaction(null);
      setCompletedRiskAssessment(null);
      setCompletedOrderId("");
      setKycReadyToConfirm(false);
      setDeliveryDate("");
      setDeliveryWindow("");
      setIdentityDocumentType("sa_id");
      setIdentityDocument(null);
      setProofOfAddressDocument(null);
      setDocumentAnalysis(null);
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
      const code = typeof e === "object" && e && "code" in e && typeof (e as { code?: unknown }).code === "string" ? (e as { code: string }).code : "";
      if (isGoogleAddressAssistUnavailable(message, code)) {
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
    if (isUnderAge) {
      setSaidBlurred(true);
      throw new Error("Customers under 18 cannot place orders on the PONDO platform.");
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
    if (!session) {
      setError("Please start checkout again.");
      return;
    }
    if (!isSaidValid) {
      setSaidBlurred(true);
      setError("Please enter a valid South African ID number before proceeding.");
      return;
    }
    if (isUnderAge) {
      setSaidBlurred(true);
      setError("Customers under 18 cannot place orders on the PONDO platform.");
      return;
    }
    if (!deliveryDate) {
      setError("Please choose a delivery date before proceeding.");
      return;
    }
    if (deliveryDate < minimumDeliveryDate) {
      setError("Please choose a delivery date from tomorrow onward.");
      return;
    }
    if (!deliveryWindow) {
      setError("Please choose a delivery time slot before proceeding.");
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
      await confirmPondoCheckoutDetails({
        sessionId: session.sessionId,
        email: capturedEmail,
        fullName: capturedFullName,
        idNumber: normalizedIdNumber,
        phone: capturedPhone,
        address: capturedAddress,
        city: capturedCity,
        province: capturedProvince,
        postalCode: capturedPostalCode,
        geoLocation: [capturedCity, capturedProvince].filter(Boolean).join(", "),
        latitude: addressValidation?.latitude ?? null,
        longitude: addressValidation?.longitude ?? null,
        termsAccepted: true,
      });
      log("T&C accepted - POPIA consent captured");
      log("Checkout session persisted to the PostgreSQL workflow store.");
      if (saidRisk) {
        log(`SA ID derived age ${saidRisk.age} (+${saidRisk.ageScore}) and sex ${saidRisk.gender} (+${saidRisk.genderScore}).`);
      }
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

    if (projectedRisk.decision === "auto_approve") {
      const autoApproved: VetResult = {
        transunionScore: 0,
        transunionApproved: true,
        kycIdentityVerified: true,
        experianIncome: null,
        fraudScore: 0.01,
        approved: true,
        screeningMode: "skip",
      };
      setVetResult(autoApproved);
      log("Composite risk remained inside the auto-approve band after SA ID and geo checks.");
      return autoApproved;
    }

    const data = await simulateDemoCredit({ saId: normalizedIdNumber, bureau: "transunion" });
    const transunionScore = data.result.score as number;
    const transunionApproved = Boolean(data.result.approved);
    const kycIdentityVerified = true;
    const geoPenalty = capturedProvince.toLowerCase().includes("kwa") ? 0.02 : 0.01;
    const fraudScore = Math.max(0.01, Number(((850 - transunionScore) / 10000 + geoPenalty).toFixed(2)));
    const approved = transunionApproved && kycIdentityVerified && fraudScore <= 0.08;

    const result: VetResult = {
      transunionScore,
      transunionApproved,
      kycIdentityVerified,
      experianIncome: null,
      fraudScore,
      approved,
      screeningMode: "full",
    };

    setVetResult(result);
    log(`TransUnion ITC score: ${transunionScore} (${transunionApproved ? "approved" : "declined"})`);
    log(`Geo-location reviewed: ${capturedCity}, ${capturedProvince}`);
    if (saidRisk) {
      log(`SA ID derived age ${saidRisk.age} (+${saidRisk.ageScore}) and sex ${saidRisk.gender} (+${saidRisk.genderScore}).`);
    }
    log(`Python fraud score: ${fraudScore.toFixed(2)} (${fraudScore <= 0.08 ? "low risk" : "high risk"})`);
    log(`Composite risk score ${projectedRisk.score} triggered ${riskDecisionLabel(projectedRisk.decision).toLowerCase()}.`);
    log(approved ? "All checks passed - customer approved for checkout" : "Checks failed - manual review required");
    return result;
  }

  async function completeApprovedPurchase(analysisOverride?: DocumentAnalysisResult | null) {
    if (!session || !customer || !cartLines.length) throw new Error("checkout_incomplete");

    const submitWithToken = async (authToken: string) => {
      return createDemoOrder(authToken, {
        customerId: capturedEmail,
        sessionId: session.sessionId,
        items: cartLines.map((line) => ({ productId: line.product.id, qty: line.qty })),
        delivery: {
          fullName: capturedFullName,
          phone: capturedPhone,
          address1: capturedAddress,
          city: capturedCity,
          province: capturedProvince,
          postalCode: capturedPostalCode,
          deliveryDate,
          deliveryWindow,
        },
        paymentMethod: selectedPaymentMethod,
        riskContext: {
          idNumber: normalizedIdNumber,
          deviceFingerprint,
          clientGeo: clientGeo
            ? {
                ip: clientGeo.ip,
                city: clientGeo.city,
                province: clientGeo.province,
                country: clientGeo.country,
                postalCode: clientGeo.postalCode,
                latitude: clientGeo.latitude,
                longitude: clientGeo.longitude,
                source: clientGeo.source,
              }
            : undefined,
          validatedAddress: {
            city: addressValidation?.city || "",
            province: addressValidation?.province || "",
            postalCode: addressValidation?.postalCode || "",
            latitude: addressValidation?.latitude ?? null,
            longitude: addressValidation?.longitude ?? null,
          },
          documentContext: {
            identityDocumentType,
            identityDocumentUploaded: Boolean(identityDocument),
            identityDocumentFileName: identityDocument?.fileName,
            proofOfAddressRequired: requiresProofOfAddress,
            proofOfAddressUploaded: Boolean(proofOfAddressDocument),
            proofOfAddressFileName: proofOfAddressDocument?.fileName,
            documentAnalysis: analysisOverride ?? documentAnalysis,
          },
          otpVerified: true,
          saidVerified: isSaidValid,
        },
      });
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

    setCompletedOrderId(submitted.transaction.id);
    setCompletedTransaction(submitted.transaction);
    setCompletedRiskAssessment(submitted.riskAssessment || null);
    setPaymentSettlement(null);
    log(`Transaction created: ${submitted.transaction.id}`);
    log(`Payment method prepared: ${paymentMethodLabel(selectedPaymentMethod)}`);
    log("Order has been written to Supabase and is awaiting PED payment at delivery.");
    log("gateway_status and status are set to Awaiting_Payment until driver-side collection completes.");
    if (submitted.riskAssessment) {
      log(`Risk score recorded: ${submitted.riskAssessment.score} (${submitted.riskAssessment.decision})`);
      log(`Risk factors: ${submitted.riskAssessment.factors.join(" | ")}`);
    }
    log(`Order submitted using ${cartLines.length} cart item(s)`);
    log(`Checkout verification completed for ${session.partnerLabel}.`);
  }

  async function onVerifyOtp() {
    setError("");
    setProcessingMessage("");
    setBusy(true);
    try {
      await verifyOtp({ requestId: otpRequestId, code: otpInput });
      setOtpVerified(true);
      log("OTP accepted - identity confirmed");

      setProcessingMessage(
        requiresEnhancedRiskChecks
          ? "Running composite risk checks using SA ID, KYC, ITC, fraud, and geolocation..."
          : "SA ID and geo-risk checks are within the auto-approve band. Finalizing order confirmation...",
      );

      const result = await runScreeningJourney();
      if (!result?.approved) {
        throw new Error("Customer did not pass the required background checks.");
      }

      const authToken = await ensureCustomerAuth(true, capturedEmail || customer?.email);
      await persistPondoRiskAssessment(authToken, {
        sessionId: session?.sessionId || "",
        saId: normalizedIdNumber,
        bureau: "transunion",
        screeningMode: result.screeningMode,
        transunionScore: result.screeningMode === "skip" ? null : result.transunionScore,
        transunionApproved: result.transunionApproved,
        kycIdentityVerified: result.kycIdentityVerified,
        experianIncome: result.experianIncome,
        fraudScore: result.fraudScore,
        approved: projectedRisk.decision === "auto_approve",
        documentContext: {
          identityDocumentType,
          identityDocumentUploaded: Boolean(identityDocument),
          identityDocumentFileName: identityDocument?.fileName,
          proofOfAddressRequired: requiresProofOfAddress,
          proofOfAddressUploaded: Boolean(proofOfAddressDocument),
          proofOfAddressFileName: proofOfAddressDocument?.fileName,
          documentAnalysis,
        },
        projectedScore: projectedRisk.score,
        projectedDecision: projectedRisk.decision,
        projectedFactors: projectedRisk.geoFactors,
        city: capturedCity,
        province: capturedProvince,
        postalCode: capturedPostalCode,
      });

      if (requiresKycPipelineView) {
        setKycReadyToConfirm(true);
        setProcessingMessage("");
        log("Verification pipeline completed. Awaiting final order confirmation.");
        return;
      }

      setProcessingMessage("Checks passed. Writing the order to Supabase and marking it as awaiting PED payment...");
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

  async function onConfirmVerifiedOrder() {
    setError("");
    if (requiresManualReviewDocuments && !identityDocument) {
      setError(`Please upload the customer's ${identityDocumentType === "sa_id" ? "South African ID document" : "driver's licence"} before placing the order into manual review.`);
      return;
    }
    if (requiresProofOfAddress && !proofOfAddressDocument) {
      setError("Please upload proof of address before placing the order into manual review.");
      return;
    }
    setBusy(true);
    setProcessingMessage(
      requiresManualReviewDocuments
        ? "Analyzing uploaded documents and preparing the analyst review summary..."
        : "All checks passed. Writing the order to Supabase...",
    );
    try {
      let latestDocumentAnalysis = documentAnalysis;
      if (requiresManualReviewDocuments && identityDocument) {
        const authToken = await ensureCustomerAuth(true, capturedEmail || customer?.email);
        const analysisInput = {
          identityDocumentType,
          fullName: capturedFullName,
          enteredIdNumber: normalizedIdNumber,
          deliveryAddress: {
            address1: capturedAddress,
            city: capturedCity,
            province: capturedProvince,
            postalCode: capturedPostalCode,
          },
          clientGeo: clientGeo
            ? {
                city: clientGeo.city,
                province: clientGeo.province,
                country: clientGeo.country,
              }
            : undefined,
          orderValueCents: cartSubtotalCents,
          identityDocument,
          proofOfAddressDocument,
        } as const;

        try {
          latestDocumentAnalysis = await analyzeManualReviewDocuments(authToken, analysisInput);
        } catch (error) {
          if (!shouldRetryDocumentAnalysisWithoutProof(error, proofOfAddressDocument)) throw error;

          log("Proof-of-address PDF could not be analyzed inline. Retrying without OCR extraction for that file.");
          setProcessingMessage("Proof-of-address PDF uploaded. Retrying verification without inline OCR extraction...");
          latestDocumentAnalysis = await analyzeManualReviewDocuments(authToken, {
            ...analysisInput,
            proofOfAddressDocument: null,
          });
        }
        setDocumentAnalysis(latestDocumentAnalysis);
        log(`Document analysis sources - ID: ${latestDocumentAnalysis.identity.source}; Proof: ${latestDocumentAnalysis.proofOfAddress?.source || "unavailable"}`);
        log(
          `Document analysis extracted - Proof address: ${
            [
              latestDocumentAnalysis.proofOfAddress?.extracted.addressLine1,
              latestDocumentAnalysis.proofOfAddress?.extracted.suburb,
              latestDocumentAnalysis.proofOfAddress?.extracted.municipality,
              latestDocumentAnalysis.proofOfAddress?.extracted.postalCode,
            ].filter(Boolean).join(", ") || "Not extracted"
          }`,
        );
        setProcessingMessage("Document analysis complete. Writing the order to Supabase...");
      }

      await completeApprovedPurchase(latestDocumentAnalysis);
      setKycReadyToConfirm(false);
      setProcessingMessage("");
      setStep(4);
    } catch (e) {
      setProcessingMessage("");
      setError(e instanceof Error ? e.message : "order_confirmation_failed");
    } finally {
      setBusy(false);
    }
  }

  async function onResolveManualReview(decision: "approved" | "declined") {
    if (!completedOrderId) return;
    setError("");
    setBusy(true);
    setProcessingMessage(decision === "approved" ? "Analyst review approved. Releasing order to fulfilment..." : "Analyst review declined. Updating the order status...");
    try {
      const authToken = await ensureCustomerAuth(true, capturedEmail || customer?.email);
      const out = await resolveManualReviewOrder(authToken, completedOrderId, decision);
      setCompletedTransaction(out.transaction);
      setProcessingMessage("");
    } catch (e) {
      setProcessingMessage("");
      setError(e instanceof Error ? e.message : "manual_review_resolve_failed");
    } finally {
      setBusy(false);
    }
  }

  const step3Label = completedOrderId ? "Completed" : requiresKycPipelineView ? "KYC Verification" : "OTP Verification";
  const completedReviewState = manualReviewDisplayState(completedTransaction?.review_status, completedRiskAssessment?.decision);
  const reviewAssistant = buildReviewAssistantSummary({
    reviewStatus: completedTransaction?.review_status,
    score: completedRiskAssessment?.score,
    decision: completedRiskAssessment?.decision,
    fullName: capturedFullName,
    hasIdentityDocument: Boolean(identityDocument),
    hasProofOfAddress: Boolean(proofOfAddressDocument),
    identityDocumentType,
    documentAnalysis,
  });

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
                            ? "border-pondo-line"
                            : "border-red-400 bg-red-50/40"
                          : "border-pondo-line",
                      ].join(" ")}
                    />
                    {showSaidFeedback && !isSaidValid ? (
                      <p className="mt-1 text-xs font-semibold text-red-600">Enter a valid 13-digit South African ID number.</p>
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
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-600">Delivery Date</label>
                    <div className="rounded-xl border border-pondo-line bg-white">
                      <div className="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-pondo-navy-900">
                        {deliveryDate ? `Selected: ${formatDeliveryDateLabel(deliveryDate)}` : "Choose a delivery date from tomorrow onward"}
                      </div>
                      <div className="max-h-80 space-y-4 overflow-y-auto px-3 py-3">
                        {deliveryCalendarMonths.map((month) => (
                          <div key={month.key}>
                            <div className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-slate-500">{month.label}</div>
                            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-400">
                              {CALENDAR_DAY_LABELS.map((label) => (
                                <div key={`${month.key}-${label}`} className="py-1">
                                  {label}
                                </div>
                              ))}
                            </div>
                            <div className="grid grid-cols-7 gap-1">
                              {month.cells.map((cell) => (
                                cell.date ? (
                                  <button
                                    key={cell.key}
                                    type="button"
                                    disabled={cell.disabled}
                                    onClick={() => setDeliveryDate(cell.date || "")}
                                    className={[
                                      "h-9 rounded-lg text-sm font-semibold transition",
                                      deliveryDate === cell.date
                                        ? "bg-pondo-orange-500 text-white"
                                        : cell.disabled
                                          ? "cursor-not-allowed bg-slate-100 text-slate-300"
                                          : "bg-slate-50 text-pondo-navy-900 hover:bg-[#eef3ff]",
                                    ].join(" ")}
                                  >
                                    {cell.label}
                                  </button>
                                ) : (
                                  <div key={cell.key} className="h-9 rounded-lg bg-transparent" />
                                )
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">The calendar is always visible so customers can scroll and choose an available delivery day directly.</p>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-600">Delivery Time Slot</label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {DELIVERY_TIME_SLOTS.map((slot) => {
                        const active = deliveryWindow === slot.id;
                        return (
                          <button
                            key={slot.id}
                            type="button"
                            onClick={() => setDeliveryWindow(slot.id)}
                            className={[
                              "rounded-lg border px-3 py-2 text-sm font-semibold transition",
                              active
                                ? "border-pondo-orange-500 bg-pondo-orange-500 text-white"
                                : "border-pondo-line bg-white text-pondo-navy-900 hover:bg-[#eef3ff]",
                            ].join(" ")}
                          >
                            {slot.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">Available delivery windows are risk-managed and verified before dispatch.</p>
                  </div>
                </div>

                <div className="rounded-xl border border-pondo-line bg-pondo-surface-soft p-3">
                  <div className="mb-2 text-sm font-bold text-pondo-navy-800">Terms & Conditions - POPIA Compliant</div>
                  <div className="max-h-28 overflow-y-auto rounded bg-white p-2 text-xs text-slate-600">
                    By proceeding, you consent to PONDO collecting and processing your personal information (name, SA ID, contact details, geo-location, and delivery information) for KYC verification, ITC credit checks, manual review where required, and fraud detection in accordance with POPIA and internal risk controls.
                  </div>
                  <label className="mt-3 flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} />
                    I accept PONDO&apos;s Terms & Conditions and POPIA consent
                  </label>
                </div>

                <button onClick={onContinueToOtp} disabled={busy || addressLookupBusy || addressValidationBusy} className={primaryCtaClass}>
                  {busy ? "Sending OTP..." : addressValidationBusy ? "Validating Address..." : requiresKycPipelineView ? "Continue to KYC Verification" : "Continue to OTP Verification"}
                </button>
              </div>
            ) : null}

            {step === 3 && customer ? (
              <div className="space-y-4">
                {!kycReadyToConfirm ? (
                  <div className="rounded-2xl border border-pondo-line bg-[#f7faff] p-4">
                    <h2 className="text-2xl font-extrabold">{requiresKycPipelineView ? "KYC Verification" : "OTP Verification"}</h2>
                    <p className="mt-2 text-sm text-slate-700">
                      We sent a one-time PIN by SMS to <span className="font-bold">{capturedPhone}</span>. Verify the OTP to continue.
                      {requiresEnhancedRiskChecks
                        ? " Composite risk from SA ID age, sex, and geolocation sits above the auto-approve band, so elevated verification checks will run after OTP."
                        : " SA ID and geolocation scoring are within the auto-approve band, so the order can move directly to confirmation after verification."}
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

                    <div className="mt-3">
                      <input value={otpInput} onChange={(e) => setOtpInput(e.target.value)} placeholder="Enter OTP" className="w-full rounded-lg border border-pondo-line bg-white px-3 py-2 text-slate-800" />
                      <button onClick={onVerifyOtp} disabled={busy || !otpRequestId || !otpInput.trim()} className="mt-3 rounded-lg bg-pondo-orange-500 px-4 py-2 font-bold text-white hover:bg-pondo-orange-400 disabled:opacity-60">
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
                ) : (
                  <div className="rounded-2xl border border-pondo-line bg-white p-6 shadow-sm">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h2 className="text-2xl font-extrabold text-pondo-navy-900">KYC Verification Pipeline</h2>
                        <p className="mt-2 max-w-2xl text-sm text-slate-700">
                          This order requires an additional verification step before it can be released for fulfilment.
                        </p>
                      </div>
                      <div className={[
                        "rounded-full px-4 py-2 text-xs font-black uppercase tracking-[0.08em]",
                        projectedRisk.decision === "manual_review_hold"
                          ? "border border-red-200 bg-red-50 text-red-600"
                          : "border border-amber-200 bg-amber-50 text-amber-700",
                      ].join(" ")}>
                        Risk Score: {projectedRisk.decision === "manual_review_hold" ? Math.max(projectedRisk.score, 100) : projectedRisk.score}
                        {" - "}
                        {riskDecisionLabel(projectedRisk.decision)}
                      </div>
                    </div>

                    <div className="mt-5 space-y-3">
                      {[
                        {
                          title: "ID / Document Scan",
                          detail: requiresManualReviewDocuments
                            ? identityDocumentType === "sa_id"
                              ? "South African ID validation and supporting document capture"
                              : "Driver's licence capture and identity confirmation"
                            : "South African ID validation and identity confirmation",
                          state: requiresManualReviewDocuments ? "Pending" : isSaidValid ? "Passed" : "Pending",
                        },
                        {
                          title: "Manual Review Routing",
                          detail: projectedRisk.decision === "manual_review_hold"
                            ? `Additional verification is required before analyst review${requiresProofOfAddress ? " with proof-of-address support attached" : ""}`
                            : "Not required for this checkout",
                          state: projectedRisk.decision === "manual_review_hold" ? "Pending" : "Skipped",
                        },
                      ].map((item) => (
                        <div key={item.title} className="flex items-center justify-between rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-sm font-black text-white">?</div>
                            <div>
                              <div className="font-bold text-emerald-800">{item.title}</div>
                              <div className="text-xs text-slate-600">{item.detail}</div>
                            </div>
                          </div>
                          <div className="text-xs font-black uppercase tracking-[0.08em] text-emerald-700">{item.state}</div>
                        </div>
                      ))}
                    </div>

                    {requiresManualReviewDocuments ? (
                      <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
                        <div className="text-lg font-extrabold text-pondo-navy-900">Secure Order Verification</div>
                        <p className="mt-1 text-sm text-slate-700">
                          For your protection and to ensure secure order processing, this order requires additional verification before approval.
                          Please upload the requested supporting documents below.
                        </p>

                        <div className="mt-4 grid gap-4 lg:grid-cols-2">
                          <div className="rounded-xl border border-pondo-line bg-white p-4">
                            <div className="text-sm font-bold text-pondo-navy-900">Identity document</div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {[
                                { id: "sa_id" as const, label: "South African ID" },
                                { id: "drivers_licence" as const, label: "Driver's Licence" },
                              ].map((option) => (
                                <button
                                  key={option.id}
                                  type="button"
                                  onClick={() => setIdentityDocumentType(option.id)}
                                  className={[
                                    "rounded-full border px-3 py-1.5 text-sm font-semibold transition",
                                    identityDocumentType === option.id
                                      ? "border-pondo-orange-500 bg-pondo-orange-500 text-white"
                                      : "border-pondo-line bg-white text-pondo-navy-900 hover:bg-[#eef3ff]",
                                  ].join(" ")}
                                >
                                  {option.label}
                                </button>
                              ))}
                            </div>
                            <label className="mt-4 block">
                              <span className="mb-2 block text-xs font-bold uppercase tracking-[0.08em] text-slate-500">Upload identity document</span>
                              <input
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png"
                                onChange={async (event) => {
                                  setIdentityDocument(await rememberSelectedDocument(event.target.files?.[0] || null));
                                  setDocumentAnalysis(null);
                                }}
                                className="block w-full rounded-lg border border-pondo-line bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-pondo-orange-500 file:px-3 file:py-2 file:font-bold file:text-white"
                              />
                            </label>
                            <div className="mt-2 text-xs text-slate-500">
                              {identityDocument
                                ? `Selected: ${identityDocument.fileName}`
                                : `Accepted formats: PDF, JPG, PNG. Use the customer's ${identityDocumentType === "sa_id" ? "ID card/book" : "driver's licence"} image or scan.`}
                            </div>
                          </div>

                          <div className="rounded-xl border border-pondo-line bg-white p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-bold text-pondo-navy-900">Proof of address</div>
                              <div className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-amber-800">
                                Required
                              </div>
                            </div>
                            <p className="mt-2 text-xs text-slate-600">
                              Proof of address is now required because this checkout has been routed into manual review.
                            </p>
                            <label className="mt-4 block">
                              <span className="mb-2 block text-xs font-bold uppercase tracking-[0.08em] text-slate-500">Upload proof of address</span>
                              <input
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png"
                                onChange={async (event) => {
                                  setProofOfAddressDocument(await rememberSelectedDocument(event.target.files?.[0] || null));
                                  setDocumentAnalysis(null);
                                }}
                                className="block w-full rounded-lg border border-pondo-line bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-sky-600 file:px-3 file:py-2 file:font-bold file:text-white"
                              />
                            </label>
                            <div className="mt-2 text-xs text-slate-500">
                              {proofOfAddressDocument
                                ? `Selected: ${proofOfAddressDocument.fileName}`
                                : "Examples: utility bill, bank statement, municipal letter, or lease document."}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    <button onClick={onConfirmVerifiedOrder} disabled={busy} className="mt-5 w-full rounded-xl bg-[#1fb782] px-4 py-3 text-lg font-black text-white shadow-[0_10px_20px_rgba(31,183,130,0.28)] hover:bg-[#19a575] disabled:opacity-60">
                      {busy
                        ? "Confirming..."
                        : projectedRisk.decision === "manual_review_hold"
                          ? "Submit Documents and Queue Manual Review"
                          : "All Checks Passed - Confirm Order"}
                    </button>
                  </div>
                )}
              </div>
            ) : null}

            {step === 4 && completedOrderId ? (
              <div className="space-y-4">
                <div className={
                  completedRiskAssessment?.decision === "manual_review_hold"
                    ? completedTransaction?.review_status === "approved"
                      ? "rounded-2xl border border-emerald-300 bg-white p-5 shadow-sm"
                      : completedTransaction?.review_status === "declined"
                        ? "rounded-2xl border border-red-300 bg-white p-5 shadow-sm"
                        : "rounded-2xl border border-amber-300 bg-white p-5 shadow-sm"
                    : "rounded-2xl border border-emerald-300 bg-white p-5 shadow-sm"
                }>
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-2xl font-black text-emerald-700">
                      ?
                    </div>
                    <div>
                      <h2 className={
                        completedRiskAssessment?.decision === "manual_review_hold"
                          ? completedTransaction?.review_status === "approved"
                            ? "text-2xl font-extrabold text-emerald-950"
                            : completedTransaction?.review_status === "declined"
                              ? "text-2xl font-extrabold text-red-950"
                              : "text-2xl font-extrabold text-amber-950"
                          : "text-2xl font-extrabold text-emerald-950"
                      }>
                        {completedRiskAssessment?.decision === "manual_review_hold"
                          ? completedReviewState.title
                          : "Order received, thanks!"}
                      </h2>
                      <p className="text-sm text-slate-700">
                        {completedRiskAssessment?.decision === "manual_review_hold"
                          ? `Confirmation has been sent to ${capturedEmail}. ${completedReviewState.message}`
                          : `Confirmation has been sent to ${capturedEmail} and SMS confirmation has been sent to ${capturedPhone}. Payment will be collected on delivery using the PED device.`}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 border-t border-slate-200 pt-4 text-sm text-slate-800">
                    <p><span className="font-bold">Delivery to</span> {capturedFullName}, {capturedAddress}, South Africa</p>
                    <div className="mt-4">
                      <div className="font-bold">{deliveryDate ? formatDeliveryDateLabel(deliveryDate) : etaDateLabel()}</div>
                      <div>{selectedDeliverySlot ? `Delivery window: ${selectedDeliverySlot.label}` : "Estimated delivery"}</div>
                    </div>
                    <div className="mt-4">
                      <div><span className="font-bold">Partner:</span> {session?.partnerLabel} fulfilment</div>
                      <div><span className="font-bold">Items:</span> {cartCount} item totalling {money(cartSubtotalCents)}</div>
                      <div><span className="font-bold">gateway_status:</span> {completedTransaction?.gateway_status || "Awaiting_Payment"}</div>
                      <div><span className="font-bold">status:</span> {completedTransaction?.status || "Awaiting_Payment"}</div>
                    </div>
                  </div>

                  <div className="mt-5 rounded-xl border border-pondo-line bg-[#f7faff] px-4 py-3 text-sm text-slate-700">
                    {completedRiskAssessment?.decision === "manual_review_hold"
                      ? completedTransaction?.review_status === "approved"
                        ? "Manual review is complete and the order has been released to fulfilment. PED payment is still collected later in the normal delivery journey."
                        : completedTransaction?.review_status === "declined"
                          ? "Manual review declined this order after document review. Fulfilment and PED payment are both stopped."
                          : "Supporting documents have been attached to this case. Ops review is now required, and settlement and reconciliation remain blank until manual approval and PED payment both complete."
                      : "Email and SMS notifications include the order summary, delivery address, estimated fulfilment date, and the PONDO verification outcome. Settlement and reconciliation will only update after PED payment is completed at the customer doorstep."}
                  </div>

                  {completedRiskAssessment?.decision === "manual_review_hold" ? (
                    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                      <div className="font-bold text-pondo-navy-900">Manual Review Status</div>
                      <div className="mt-2">{completedReviewState.message}</div>
                      <div className="mt-2 text-xs uppercase tracking-[0.08em] text-slate-500">Verification: {completedRiskAssessment.verifiedStatus}</div>
                    </div>
                  ) : null}

                  <div className="mt-4 flex flex-wrap gap-3">
                    <button onClick={() => router.push(`/PondoDemo/confirmation/${completedOrderId}`)} className="rounded-lg bg-pondo-orange-500 px-4 py-2 font-bold text-white hover:bg-pondo-orange-400">
                      Track fulfilment progress
                    </button>
                    <button onClick={() => router.push("/PondoDemo/shop")} className="rounded-lg border border-pondo-line bg-white px-4 py-2 font-bold text-pondo-navy-900 hover:bg-[#eef3ff]">
                      Continue shopping
                    </button>
                    {completedRiskAssessment?.decision === "manual_review_hold" && completedTransaction?.review_status !== "approved" && completedTransaction?.review_status !== "declined" ? (
                      <button
                        onClick={() => setReviewAssistantOpen(true)}
                        className="rounded-lg bg-pondo-navy-900 px-4 py-2 font-bold text-white hover:bg-[#243b68]"
                      >
                        Open AI Review Assistant Demo
                      </button>
                    ) : null}
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    {vetResult?.screeningMode === "full" || requiresEnhancedRiskChecks ? (
                      <>
                        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">OTP verified</div>
                        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">ID verified</div>
                        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">Credit and fraud checks completed</div>
                        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
                          {completedRiskAssessment?.decision === "manual_review_hold"
                            ? completedReviewState.chip
                            : "Released to fulfilment"}
                        </div>
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
              {step === 4 ? (
                paymentSettlement ? (
                  <div className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                    Supabase settlement recorded to {paymentSettlement.bankLabel} using {selectedPaymentMethodMeta.label}.
                  </div>
                ) : completedRiskAssessment?.decision === "manual_review_hold" ? (
                  <div className={`mt-3 rounded-lg px-3 py-2 text-xs ${
                    completedTransaction?.review_status === "approved"
                      ? "border border-emerald-300 bg-emerald-50 text-emerald-800"
                      : completedTransaction?.review_status === "declined"
                        ? "border border-red-300 bg-red-50 text-red-800"
                        : "border border-amber-300 bg-amber-50 text-amber-900"
                  }`}>
                    {completedTransaction?.review_status === "approved"
                      ? "Manual review approved. The order is released to fulfilment and awaits the normal PED collection step."
                      : completedTransaction?.review_status === "declined"
                        ? "Manual review declined the order after document review. PED collection, settlement, and fulfilment will not proceed."
                        : "Manual review is pending. Supporting documents were received, but PED collection, settlement, and reconciliation stay blocked until ops release the order."}
                  </div>
                ) : (
                  <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    Payment is currently awaiting PED collection. `gateway_status`, `status`, `reconciled_at`, and `settled_at` will update after doorstep payment is completed.
                  </div>
                )
              ) : null}
            </div>
          </aside>
        </div>
      </div>

      {reviewAssistantOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4">
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.28)]">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Demo Review Popup</div>
                <h3 className="mt-2 text-2xl font-extrabold text-pondo-navy-900">AI Review Assistant</h3>
                <p className="mt-2 text-sm text-slate-600">
                  This demo pop-screen represents a back-office analyst workflow. The customer would not see this in production.
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

            <div className="overflow-y-auto px-6 py-5">
              <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-4 text-sm text-sky-900">
                <div className="font-bold">Assistant recommendation</div>
                <div className="mt-2">{reviewAssistant.summary}</div>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="text-sm font-bold text-pondo-navy-900">Review signals considered</div>
                <div className="mt-3 grid gap-2 lg:grid-cols-2 text-sm text-slate-700">
                  {reviewAssistant.reasons.map((reason) => (
                    <div key={reason} className="rounded-xl bg-white px-3 py-2">
                      {reason}
                    </div>
                  ))}
                </div>
              </div>

              {documentAnalysis ? (
                <div className="mt-5 grid gap-4 xl:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                    <div className="text-sm font-bold text-pondo-navy-900">Identity extraction</div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 text-sm text-slate-700">
                      {[
                        ["ID number", documentAnalysis.identity.extracted.idNumber || "Not extracted"],
                        ["Full name", documentAnalysis.identity.extracted.fullName || "Not extracted"],
                        ["Date of birth", documentAnalysis.identity.extracted.birthDate || "Not extracted"],
                        ["Gender", documentAnalysis.identity.extracted.gender || "Not extracted"],
                        ["Citizenship", documentAnalysis.identity.extracted.citizenship || "Not extracted"],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">{label}</div>
                          <div className="mt-1 text-sm text-slate-800">{value}</div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 text-xs text-slate-500">Source: {documentAnalysis.identity.source}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                    <div className="text-sm font-bold text-pondo-navy-900">Address extraction</div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 text-sm text-slate-700">
                      {[
                        ["Account holder", documentAnalysis.proofOfAddress?.extracted.accountHolderName || "Not extracted"],
                        ["Document type", documentAnalysis.proofOfAddress?.extracted.documentType || "Not extracted"],
                        ["Invoice date", documentAnalysis.proofOfAddress?.extracted.invoiceDate || "Not extracted"],
                        ["Address line 1", documentAnalysis.proofOfAddress?.extracted.addressLine1 || "Not extracted"],
                        ["Suburb", documentAnalysis.proofOfAddress?.extracted.suburb || "Not extracted"],
                        ["Municipality / area", documentAnalysis.proofOfAddress?.extracted.municipality || "Not extracted"],
                        ["Postal code", documentAnalysis.proofOfAddress?.extracted.postalCode || "Not extracted"],
                        [
                          "Valid for review",
                          documentAnalysis.proofOfAddress?.extracted.validForReview === null || documentAnalysis.proofOfAddress?.extracted.validForReview === undefined
                            ? "Not determined"
                            : documentAnalysis.proofOfAddress.extracted.validForReview
                              ? "Yes"
                              : "No",
                        ],
                        ["Document age (days)", documentAnalysis.proofOfAddress?.extracted.documentAgeDays?.toString() || "Not extracted"],
                        ["Confidence score", documentAnalysis.proofOfAddress?.extracted.confidenceScore?.toString() || "Not extracted"],
                        [
                          "Full extracted address",
                          [
                            documentAnalysis.proofOfAddress?.extracted.addressLine1,
                            documentAnalysis.proofOfAddress?.extracted.suburb,
                            documentAnalysis.proofOfAddress?.extracted.municipality,
                            documentAnalysis.proofOfAddress?.extracted.postalCode,
                          ].filter(Boolean).join(", ") || "Not extracted",
                        ],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">{label}</div>
                          <div className="mt-1 text-sm text-slate-800">{value}</div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">SAPS zone check</div>
                      <div className="mt-1 text-sm text-slate-800">
                        {documentAnalysis.comparisons.sapsAreaMatch
                          ? `${documentAnalysis.comparisons.sapsAreaMatch} (${documentAnalysis.comparisons.sapsRiskTier})`
                          : "No direct match"}
                      </div>
                    </div>
                    <div className="mt-3 text-xs text-slate-500">Source: {documentAnalysis.proofOfAddress?.source || "unavailable"}</div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="border-t border-slate-200 px-6 py-5">
              <div className="flex flex-wrap gap-3">
              <button
                onClick={async () => {
                  await onResolveManualReview("approved");
                  setReviewAssistantOpen(false);
                }}
                disabled={busy}
                className="rounded-xl bg-[#1fb782] px-5 py-3 font-bold text-white hover:bg-[#19a575] disabled:opacity-60"
              >
                {busy ? "Updating review..." : "Approve And Release To Fulfilment"}
              </button>
              <button
                onClick={async () => {
                  await onResolveManualReview("declined");
                  setReviewAssistantOpen(false);
                }}
                disabled={busy}
                className="rounded-xl border border-red-300 bg-white px-5 py-3 font-bold text-red-700 hover:bg-red-50 disabled:opacity-60"
              >
                {busy ? "Updating review..." : "Decline Review"}
              </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

