import { findProduct } from "./catalog.js";

const partnerLabels = {
  amazon: "Amazon.co.za",
  temu: "Temu",
  takealot: "Takealot",
  woocommerce: "WooCommerce",
  shopify: "Shopify",
};

const partnerSeeds = {
  "thabo@email.com": {
    fullName: "Thabo Nkosi",
    idNumber: "8501015800083",
    phone: "+27 72 345 6789",
    address: "14 Main Rd, Soweto, Gauteng",
    geoLocation: "-26.2041, 28.0473",
    monthlyIncome: 28000,
    affordabilityBand: "A",
  },
  "naledi@email.com": {
    fullName: "Naledi Dlamini",
    idNumber: "9203124200186",
    phone: "+27 73 555 0090",
    address: "22 Vilakazi St, Orlando West, Gauteng",
    geoLocation: "-26.2347, 27.9084",
    monthlyIncome: 25000,
    affordabilityBand: "B",
  },
  "sipho@email.com": {
    fullName: "Sipho Molefe",
    idNumber: "8812036100095",
    phone: "+27 82 111 2040",
    address: "3 Market St, Durban Central, KZN",
    geoLocation: "-29.8587, 31.0218",
    monthlyIncome: 14000,
    affordabilityBand: "B",
  },
  "amara@email.com": {
    fullName: "Amara Naidoo",
    idNumber: "8001015009087",
    phone: "+27 79 888 4400",
    address: "81 Sandton Dr, Sandton, Gauteng",
    geoLocation: "-26.1076, 28.0567",
    monthlyIncome: 36000,
    affordabilityBand: "A+",
  },
  "zanele@email.com": {
    fullName: "Zanele Mthembu",
    idNumber: "9005054800081",
    phone: "+27 83 555 1234",
    address: "55 Loop St, Cape Town, Western Cape",
    geoLocation: "-33.9249, 18.4241",
    monthlyIncome: 32000,
    affordabilityBand: "A",
  },
};

const otpStore = new Map();

function randomDigits(length) {
  let value = "";
  for (let i = 0; i < length; i += 1) value += String(Math.floor(Math.random() * 10));
  return value;
}

export function listPartnerNames() {
  return Object.keys(partnerLabels);
}

export function bootstrapPartnerSession({ partner, email }) {
  const safePartner = String(partner || "").toLowerCase();
  if (!partnerLabels[safePartner]) throw new Error("unsupported_partner");

  const safeEmail = String(email || "").trim().toLowerCase();
  const user = partnerSeeds[safeEmail] || {
    fullName: "Demo Customer",
    idNumber: "8001015009087",
    phone: "+27 71 000 0000",
    address: "12 Main Rd, Johannesburg, Gauteng",
    geoLocation: "-26.2041, 28.0473",
    monthlyIncome: 18000,
    affordabilityBand: "B",
  };

  const product = findProduct("samsung-65-qled");
  if (!product) throw new Error("missing_demo_product");

  const sessionId = `sess_${Date.now().toString(36)}_${randomDigits(5)}`;
  return {
    sessionId,
    partner: safePartner,
    partnerLabel: partnerLabels[safePartner],
    customer: {
      email: safeEmail || "thabo@email.com",
      ...user,
    },
    product: {
      ...product,
      merchantName: "TechHub SA",
    },
  };
}

export function sendOtpCode({ sessionId, channel, destination }) {
  const requestId = `otp_${Date.now().toString(36)}_${randomDigits(4)}`;
  const code = "7842";
  const expiresAt = Date.now() + 5 * 60 * 1000;
  otpStore.set(requestId, { code, expiresAt, sessionId, channel, destination });
  return { requestId, otpCode: code, expiresAt };
}

export function verifyOtpCode({ requestId, code }) {
  const record = otpStore.get(requestId);
  if (!record) return { ok: false, reason: "otp_not_found" };
  if (Date.now() > record.expiresAt) return { ok: false, reason: "otp_expired" };
  if (String(code || "").trim() !== record.code) return { ok: false, reason: "otp_invalid" };
  return { ok: true, reason: "otp_verified", sessionId: record.sessionId };
}
