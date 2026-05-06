import { NextRequest } from "next/server";

export type ClientGeo = {
  ip?: string;
  city?: string;
  province?: string;
  country?: string;
  postalCode?: string;
  latitude?: number | null;
  longitude?: number | null;
  source?: string;
};

export type ValidatedAddress = {
  city?: string;
  province?: string;
  postalCode?: string;
  latitude?: number | null;
  longitude?: number | null;
};

export type RiskAssessment = {
  score: number;
  decision: "auto_approve" | "elevated_verification" | "manual_review_hold";
  decisionLabel: string;
  bandLabel: string;
  recommendedPath: string;
  factors: string[];
  notes: string[];
  ipAddress: string;
  ipGeo: {
    city: string;
    province: string;
    country: string;
    postalCode: string;
    latitude: number | null;
    longitude: number | null;
    source: string;
  };
  deliveryGeo: {
    city: string;
    province: string;
    postalCode: string;
    latitude: number | null;
    longitude: number | null;
  };
  flags: {
    ipMismatch: boolean;
    highRiskZone: boolean;
    highValue: boolean;
    fingerprintPresent: boolean;
    nonSouthAfricanIp: boolean;
  };
  mismatchIsNormal: boolean;
  verifiedStatus: string;
};

const DEFAULT_GEO = {
  city: "Johannesburg",
  province: "Gauteng",
  country: "South Africa",
  postalCode: "2000",
  latitude: -26.2041,
  longitude: 28.0473,
  source: "default",
};

const PROVINCE_ALIASES: Record<string, string> = {
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

const HIGH_RISK_ZONES = [
  { city: "durban", province: "kwazulu-natal" },
  { city: "durban central", province: "kwazulu-natal" },
  { city: "hillbrow", province: "gauteng" },
  { city: "johannesburg cbd", province: "gauteng" },
  { city: "alexandra", province: "gauteng" },
];

function normalizeText(value: string | undefined) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeProvince(value: string | undefined) {
  const normalized = normalizeText(value).replace(/\./g, "");
  return PROVINCE_ALIASES[normalized] || normalized;
}

function parseNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function isPrivateIp(ip: string) {
  const normalized = ip.trim().toLowerCase();
  return (
    !normalized ||
    normalized === "::1" ||
    normalized === "127.0.0.1" ||
    normalized.startsWith("10.") ||
    normalized.startsWith("192.168.") ||
    normalized.startsWith("::ffff:127.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(normalized)
  );
}

export function extractClientIp(req: NextRequest) {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "";
}

async function lookupIp2Location(ip: string, apiKey: string) {
  const res = await fetch(`https://api.ip2location.io/?key=${encodeURIComponent(apiKey)}&ip=${encodeURIComponent(ip)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`ip2location_failed_${res.status}`);
  const data = await res.json();
  return {
    city: data.city_name || DEFAULT_GEO.city,
    province: data.region_name || DEFAULT_GEO.province,
    country: data.country_name || DEFAULT_GEO.country,
    postalCode: data.zip_code || DEFAULT_GEO.postalCode,
    latitude: parseNumber(data.latitude),
    longitude: parseNumber(data.longitude),
    source: "ip2location",
  };
}

async function lookupIpApi(ip: string) {
  const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, { cache: "no-store" });
  if (!res.ok) throw new Error(`ipapi_failed_${res.status}`);
  const data = await res.json();
  if (data?.error) throw new Error("ipapi_error");
  return {
    city: data.city || DEFAULT_GEO.city,
    province: data.region || data.region_code || DEFAULT_GEO.province,
    country: data.country_name || DEFAULT_GEO.country,
    postalCode: data.postal || DEFAULT_GEO.postalCode,
    latitude: parseNumber(data.latitude),
    longitude: parseNumber(data.longitude),
    source: "ipapi",
  };
}

export async function lookupIpGeo(ip: string, fallback?: ClientGeo) {
  if (isPrivateIp(ip)) {
    return {
      city: fallback?.city || DEFAULT_GEO.city,
      province: fallback?.province || DEFAULT_GEO.province,
      country: fallback?.country || DEFAULT_GEO.country,
      postalCode: fallback?.postalCode || DEFAULT_GEO.postalCode,
      latitude: fallback?.latitude ?? DEFAULT_GEO.latitude,
      longitude: fallback?.longitude ?? DEFAULT_GEO.longitude,
      source: fallback?.source || "fallback_private_ip",
    };
  }

  const ip2LocationApiKey = process.env.IP2LOCATION_API_KEY?.trim();
  try {
    if (ip2LocationApiKey) return await lookupIp2Location(ip, ip2LocationApiKey);
  } catch {}

  try {
    return await lookupIpApi(ip);
  } catch {}

  return {
    city: fallback?.city || DEFAULT_GEO.city,
    province: fallback?.province || DEFAULT_GEO.province,
    country: fallback?.country || DEFAULT_GEO.country,
    postalCode: fallback?.postalCode || DEFAULT_GEO.postalCode,
    latitude: fallback?.latitude ?? DEFAULT_GEO.latitude,
    longitude: fallback?.longitude ?? DEFAULT_GEO.longitude,
    source: fallback?.source || "fallback_default",
  };
}

export function deriveManualDeliveryLocation(address1: string, city: string, province: string, postalCode: string) {
  const normalizedAddress = String(address1 || "").trim();
  const tokens = normalizedAddress
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const detectedPostalCode = String(postalCode || "").trim() || normalizedAddress.match(/\b\d{4}\b/)?.[0] || "";
  const tokenWithoutPostal = tokens.map((token) => token.replace(/\b\d{4}\b/g, "").trim()).filter(Boolean);
  const fallbackProvince = tokenWithoutPostal[tokenWithoutPostal.length - 1] || "";
  const fallbackCity = tokenWithoutPostal[tokenWithoutPostal.length - 2] || "";

  return {
    city: String(city || "").trim() || fallbackCity,
    province: String(province || "").trim() || fallbackProvince,
    postalCode: detectedPostalCode,
  };
}

export function assessGeoRisk(input: {
  ipAddress: string;
  ipGeo: Awaited<ReturnType<typeof lookupIpGeo>>;
  deliveryGeo: {
    city: string;
    province: string;
    postalCode: string;
    latitude?: number | null;
    longitude?: number | null;
  };
  amountCents: number;
  deviceFingerprint?: string;
  otpVerified?: boolean;
  saidVerified?: boolean;
}) {
  let score = 0;
  const factors: string[] = [];
  const notes: string[] = [];

  const normalizedIpCity = normalizeText(input.ipGeo.city);
  const normalizedIpProvince = normalizeProvince(input.ipGeo.province);
  const normalizedDeliveryCity = normalizeText(input.deliveryGeo.city);
  const normalizedDeliveryProvince = normalizeProvince(input.deliveryGeo.province);

  const provinceMatches = normalizedIpProvince && normalizedDeliveryProvince && normalizedIpProvince === normalizedDeliveryProvince;
  const cityMatches = normalizedIpCity && normalizedDeliveryCity && normalizedIpCity === normalizedDeliveryCity;
  const ipMismatch = !provinceMatches && !cityMatches;
  if (ipMismatch) {
    score += 40;
    factors.push(`IP mismatch +40 (${input.ipGeo.province || "Unknown"} vs ${input.deliveryGeo.province || "Unknown"})`);
    notes.push("IP and delivery address do not match. This is treated as elevated risk, not fraud by default.");
  } else {
    factors.push("IP and delivery region aligned +0");
    notes.push("IP and delivery region align. No mismatch risk points were added.");
  }

  const highRiskZone = HIGH_RISK_ZONES.some(
    (zone) => zone.city === normalizedDeliveryCity && zone.province === normalizedDeliveryProvince,
  );
  if (highRiskZone) {
    score += 30;
    factors.push(`High-risk zone +30 (${input.deliveryGeo.city}, ${input.deliveryGeo.province})`);
    notes.push("Delivery address falls inside a known higher-risk zone and requires closer fulfilment controls.");
  }

  const highValue = input.amountCents > 1_000_000;
  if (highValue) {
    score += 20;
    factors.push(`High-value order +20 (${input.amountCents / 100})`);
    notes.push("Order value exceeds R10,000, so enhanced geo-risk controls are applied.");
  }

  const fingerprintPresent = Boolean(input.deviceFingerprint);
  if (!fingerprintPresent) {
    score += 10;
    factors.push("Missing device fingerprint +10");
    notes.push("No stable device fingerprint was captured for this session.");
  } else {
    factors.push("Device fingerprint captured +0");
    notes.push("Device fingerprint captured successfully for session comparison.");
  }

  const normalizedCountry = normalizeText(input.ipGeo.country);
  const nonSouthAfricanIp = Boolean(normalizedCountry) && normalizedCountry !== "south africa";
  if (nonSouthAfricanIp) {
    score += 25;
    factors.push(`Non-SA IP +25 (${input.ipGeo.country})`);
    notes.push("Public IP resolved outside South Africa, which adds additional scrutiny.");
  }

  const decision =
    score > 70 ? "manual_review_hold" : score >= 41 ? "elevated_verification" : "auto_approve";
  const decisionLabel =
    decision === "manual_review_hold"
      ? "Manual Review Hold"
      : decision === "elevated_verification"
        ? "Elevated Verification"
        : "Auto-Approve";
  const bandLabel =
    decision === "manual_review_hold"
      ? "> 70 points"
      : decision === "elevated_verification"
        ? "41 - 70 points"
        : "0 - 40 points";
  const recommendedPath =
    decision === "manual_review_hold"
      ? "Hold order for human review before fulfilment and PED collection."
      : decision === "elevated_verification"
        ? "Run elevated verification checks, then allow fulfilment if checks pass."
        : "OTP-only path may continue automatically to fulfilment scheduling.";
  const verifiedStatus = input.otpVerified && input.saidVerified ? "otp_and_id_verified" : input.otpVerified ? "otp_verified" : "pending";

  return {
    score,
    decision,
    decisionLabel,
    bandLabel,
    recommendedPath,
    factors,
    notes,
    ipAddress: input.ipAddress,
    ipGeo: {
      city: input.ipGeo.city,
      province: input.ipGeo.province,
      country: input.ipGeo.country,
      postalCode: input.ipGeo.postalCode,
      latitude: input.ipGeo.latitude,
      longitude: input.ipGeo.longitude,
      source: input.ipGeo.source,
    },
    deliveryGeo: {
      city: input.deliveryGeo.city,
      province: input.deliveryGeo.province,
      postalCode: input.deliveryGeo.postalCode,
      latitude: input.deliveryGeo.latitude ?? null,
      longitude: input.deliveryGeo.longitude ?? null,
    },
    flags: {
      ipMismatch,
      highRiskZone,
      highValue,
      fingerprintPresent,
      nonSouthAfricanIp,
    },
    mismatchIsNormal: ipMismatch,
    verifiedStatus,
  } satisfies RiskAssessment;
}
