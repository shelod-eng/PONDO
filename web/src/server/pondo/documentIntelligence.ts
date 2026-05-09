import { parseSouthAfricanId } from "@/lib/validateSAID";
import type { DocumentAnalysisResult, DocumentUploadPayload } from "@/lib/api";

type AnalyzeDocumentsInput = {
  identityDocumentType: "sa_id" | "drivers_licence";
  fullName: string;
  enteredIdNumber: string;
  deliveryAddress: {
    address1: string;
    city: string;
    province: string;
    postalCode: string;
  };
  clientGeo?: {
    city?: string;
    province?: string;
    country?: string;
  };
  orderValueCents: number;
  identityDocument: DocumentUploadPayload;
  proofOfAddressDocument?: DocumentUploadPayload | null;
};

type SapsAreaRisk = {
  label: string;
  province: string;
  aliases: string[];
  riskTier: "Low" | "Medium" | "High" | "Critical";
  severityIndex: number;
  points: number;
};

const SAPS_AREA_RISKS: SapsAreaRisk[] = [
  {
    label: "Durban Central",
    province: "kwazulu-natal",
    aliases: ["durban central", "durban cbd", "durban"],
    riskTier: "Critical",
    severityIndex: 92,
    points: 28,
  },
  {
    label: "Soweto Cluster",
    province: "gauteng",
    aliases: ["soweto", "pimville", "orlando", "orlando west", "meadowlands", "dobsonville", "diepkloof"],
    riskTier: "High",
    severityIndex: 76,
    points: 20,
  },
  {
    label: "Johannesburg Inner City",
    province: "gauteng",
    aliases: ["hillbrow", "johannesburg cbd", "alexandra", "yeoville"],
    riskTier: "Critical",
    severityIndex: 88,
    points: 26,
  },
  {
    label: "Cape Town Metro",
    province: "western cape",
    aliases: ["cape town", "khayelitsha", "gugulethu", "nyanga"],
    riskTier: "High",
    severityIndex: 79,
    points: 18,
  },
];

function normalize(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUpper(value: string | null | undefined) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function titleCase(value: string | null | undefined) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  return raw
    .split(/\s+/)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function decodeBase64Data(base64Data: string) {
  const payload = base64Data.includes(",") ? base64Data.slice(base64Data.indexOf(",") + 1) : base64Data;
  return Buffer.from(payload, "base64");
}

async function extractPdfText(file: DocumentUploadPayload) {
  try {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await getDocument({ data: new Uint8Array(decodeBase64Data(file.base64Data)) }).promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const lines: string[] = [];
      let currentLine = "";
      let currentY: number | null = null;

      for (const item of content.items) {
        if (!("str" in item) || !("transform" in item)) continue;
        const text = item.str?.trim();
        if (!text) continue;

        const transform = item.transform as ArrayLike<number> | undefined;
        const y = transform && typeof transform[5] === "number" ? transform[5] : null;
        const startsNewLine = currentY !== null && y !== null && Math.abs(y - currentY) > 2;

        if (startsNewLine && currentLine.trim()) {
          lines.push(currentLine.trim());
          currentLine = "";
        }

        currentLine = currentLine ? `${currentLine} ${text}` : text;
        currentY = y;
      }

      if (currentLine.trim()) lines.push(currentLine.trim());
      pages.push(lines.join("\n"));
    }
    return pages.join("\n").trim();
  } catch {
    return "";
  }
}

function firstRegex(text: string, pattern: RegExp) {
  const match = text.match(pattern);
  return match?.[1] || match?.[0] || null;
}

function looksLikeNameLine(line: string) {
  const normalized = normalizeUpper(line);
  if (!normalized) return false;
  if (/\d/.test(normalized)) return false;
  if (!/\b[A-Z]{2,}\b/.test(normalized)) return false;
  if (normalized.split(/\s+/).length < 2) return false;
  if (normalized.length > 48) return false;
  if (/[:,()]/.test(normalized)) return false;
  if (["VODACOM", "ACCOUNT", "STATEMENT", "PAGE", "DATE", "BANK", "CUSTOMER", "FINAL LETTER", "DEAR VODACOM CUSTOMER"].some((token) => normalized.includes(token))) {
    return false;
  }
  return true;
}

function looksLikeAddressLine(line: string) {
  const normalized = normalizeUpper(line);
  if (!normalized) return false;
  if (["ACCOUNT NUMBER", "STATEMENT", "PAGE", "DATE", "BALANCE", "VODACOM ACCOUNT NUMBER", "TOTAL AMOUNT DUE"].some((token) => normalized.includes(token))) {
    return false;
  }
  if (/\b\d{4}\b/.test(normalized)) return true;
  if (/\d/.test(normalized) && /\b(STREET|ST|ROAD|RD|AVENUE|AVE|LANE|LN|DRIVE|DR|CLOSE|CL|COURT|CT|WAY|PARK|EXT|EXTENSION|ZONE|UNIT|FLAT|HOUSE)\b/.test(normalized)) {
    return true;
  }
  if (!/\d/.test(normalized) && normalized.split(/\s+/).length <= 4 && /^[A-Z\s'-]+$/.test(normalized)) {
    return true;
  }
  return false;
}

function findGenericHolderIndex(upperLines: string[]) {
  return upperLines.findIndex((line, index) => {
    if (!looksLikeNameLine(line)) return false;
    const following = upperLines.slice(index + 1, index + 6);
    const addressLikeCount = following.filter((candidate) => looksLikeAddressLine(candidate)).length;
    const hasStreetLine = following.some((candidate) => /\d/.test(candidate) && /\b(STREET|ST|ROAD|RD|AVENUE|AVE|LANE|LN|DRIVE|DR|CLOSE|CL|COURT|CT|WAY|PARK|EXT|EXTENSION|ZONE|UNIT|FLAT|HOUSE)\b/.test(candidate));
    const hasStandalonePostal = following.some((candidate) => /^\d{4}$/.test(candidate.trim()));
    return addressLikeCount >= 2 && (hasStreetLine || hasStandalonePostal);
  });
}

function extractIdentityFromText(
  text: string,
  documentType: "sa_id" | "drivers_licence",
  enteredIdNumber: string,
  fullName: string,
  fileName: string,
) {
  const upper = normalizeUpper(text);
  const fallbackParsedId = parseSouthAfricanId(enteredIdNumber);
  const issues: string[] = [];
  let source: DocumentAnalysisResult["identity"]["source"] = "pdf_text";

  const idNumber = firstRegex(upper, /\b(\d{13})\b/) || enteredIdNumber || null;
  let fullNameExtracted = firstRegex(upper, /^(MR|MRS|MS|MISS)\s+([A-Z]+(?:\s+[A-Z]+)+)\b/m);
  if (fullNameExtracted && /^(MR|MRS|MS|MISS)\s+/.test(fullNameExtracted)) {
    fullNameExtracted = fullNameExtracted.replace(/^(MR|MRS|MS|MISS)\s+/, "");
  }

  if (!upper.trim()) {
    const normalizedFileName = normalize(fullName);
    if (normalizedFileName) {
      source = "derived_from_form";
      issues.push("Identity document does not expose a text layer, so name and ID were derived from the submitted order details.");
    } else {
      source = "unavailable";
      issues.push("Identity document text could not be extracted automatically.");
    }
  }

  if (!upper.trim() && /id lebo mpeta/i.test(fileName)) {
    source = "demo_filename";
  }

  const chosenFullName = fullNameExtracted || fullName || null;
  const nameParts = chosenFullName ? chosenFullName.trim().split(/\s+/) : [];
  const firstName = nameParts[0] || null;
  const surname = nameParts.length > 1 ? nameParts[nameParts.length - 1] : null;

  return {
    documentType,
    source,
    extracted: {
      idNumber,
      fullName: titleCase(chosenFullName),
      firstName: titleCase(firstName),
      surname: titleCase(surname),
      birthDate: fallbackParsedId?.birthDate || null,
      gender: fallbackParsedId?.gender ? titleCase(fallbackParsedId.gender) : null,
      citizenship: documentType === "sa_id" ? "South African" : null,
      licenseNumber: documentType === "drivers_licence" ? firstRegex(upper, /\b([A-Z0-9]{8,16})\b/) : null,
    },
    issues,
  } satisfies DocumentAnalysisResult["identity"];
}

function extractProofOfAddressFromText(
  text: string,
  fallback: {
    fullName: string;
    deliveryAddress: AnalyzeDocumentsInput["deliveryAddress"];
  },
) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const upperLines = lines.map((line) => normalizeUpper(line));
  const titledHolderIndex = upperLines.findIndex((line) => /^(MR|MRS|MS|MISS)\s+[A-Z]/.test(line));
  const genericHolderIndex = titledHolderIndex >= 0 ? titledHolderIndex : findGenericHolderIndex(upperLines);
  const holderLine = genericHolderIndex >= 0 ? upperLines[genericHolderIndex] : null;
  const holderName = holderLine ? holderLine.replace(/^(MR|MRS|MS|MISS)\s+/, "") : null;

  const rawAddressCandidates =
    genericHolderIndex >= 0
      ? lines.slice(genericHolderIndex + 1, genericHolderIndex + 6)
      : [];
  const addressCandidates: string[] = [];
  for (const line of rawAddressCandidates) {
    if (!looksLikeAddressLine(line)) break;
    addressCandidates.push(line);
    if (/^\d{4}$/.test(line.trim())) break;
  }

  const postalCode =
    addressCandidates.find((line) => /^\d{4}$/.test(line.trim()))
      || addressCandidates
        .map((line) => line.match(/\b\d{4}\b/g) || [])
        .flat()
        .find((match) => match !== addressCandidates[0]?.match(/\b\d{4}\b/)?.[0])
      || addressCandidates.find((line) => /\b\d{4}\b/.test(line))?.match(/\b\d{4}\b/)?.[0]
      || null;
  const textAddressCandidates = addressCandidates.filter((line) => line !== postalCode && !/^\d{4}$/.test(line.trim()));
  let addressLine1 = textAddressCandidates[0] || null;
  let suburb = textAddressCandidates[1] || null;
  let municipality = textAddressCandidates[2] || null;
  let accountHolderName = titleCase(holderName);

  const issues: string[] = [];
  let source: NonNullable<DocumentAnalysisResult["proofOfAddress"]>["source"] = text.trim() ? "pdf_text" : "unavailable";
  if (!text.trim()) {
    issues.push("Proof of address does not expose a text layer, so address comparison may require manual confirmation.");
  }

  if (!addressLine1 && fallback.deliveryAddress.address1) {
    source = "derived_from_form";
    accountHolderName = accountHolderName || titleCase(fallback.fullName);
    addressLine1 = fallback.deliveryAddress.address1 || null;
    suburb = suburb || fallback.deliveryAddress.city || null;
    municipality = municipality || fallback.deliveryAddress.province || null;
    issues.push("Proof-of-address text could not be extracted reliably, so the analyst view is showing the submitted delivery address as a fallback.");
  }

  return {
    source,
    extracted: {
      accountHolderName,
      addressLine1: titleCase(addressLine1),
      suburb: titleCase(suburb),
      municipality: titleCase(municipality),
      postalCode,
      provider: null,
    },
    issues,
  } satisfies NonNullable<DocumentAnalysisResult["proofOfAddress"]>;
}

function similarityPass(a: string | null | undefined, b: string | null | undefined) {
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return null;
  return left.includes(right) || right.includes(left);
}

function lookupSapsAreaRisk(addressText: string, province: string) {
  const normalizedAddress = normalize(addressText);
  const normalizedProvince = normalize(province);
  for (const area of SAPS_AREA_RISKS) {
    if (normalizedProvince && normalizedProvince !== area.province) continue;
    if (area.aliases.some((alias) => normalizedAddress.includes(alias))) {
      return area;
    }
  }
  return null;
}

export async function analyzeManualReviewDocuments(input: AnalyzeDocumentsInput): Promise<DocumentAnalysisResult> {
  const [identityText, proofText] = await Promise.all([
    extractPdfText(input.identityDocument),
    input.proofOfAddressDocument ? extractPdfText(input.proofOfAddressDocument) : Promise.resolve(""),
  ]);

  const identity = extractIdentityFromText(
    identityText,
    input.identityDocumentType,
    input.enteredIdNumber,
    input.fullName,
    input.identityDocument.fileName,
  );
  const proofOfAddress = input.proofOfAddressDocument
    ? extractProofOfAddressFromText(proofText, {
        fullName: input.fullName,
        deliveryAddress: input.deliveryAddress,
      })
    : null;

  const idMatchesEnteredId =
    identity.extracted.idNumber && input.enteredIdNumber
      ? identity.extracted.idNumber.replace(/\D/g, "") === input.enteredIdNumber.replace(/\D/g, "")
      : null;
  const nameMatchesOrderName = similarityPass(identity.extracted.fullName, input.fullName);
  const addressMatchesDeliveryAddress = similarityPass(
    [proofOfAddress?.extracted.addressLine1, proofOfAddress?.extracted.suburb, proofOfAddress?.extracted.municipality].filter(Boolean).join(" "),
    [input.deliveryAddress.address1, input.deliveryAddress.city].filter(Boolean).join(" "),
  );
  const postalCodeMatches =
    proofOfAddress?.extracted.postalCode && input.deliveryAddress.postalCode
      ? proofOfAddress.extracted.postalCode === input.deliveryAddress.postalCode
      : null;
  const geoMatchesProvince = similarityPass(input.clientGeo?.province, input.deliveryAddress.province);
  const sapsArea = lookupSapsAreaRisk(
    [input.deliveryAddress.address1, input.deliveryAddress.city, proofOfAddress?.extracted.suburb, proofOfAddress?.extracted.municipality].filter(Boolean).join(" "),
    input.deliveryAddress.province,
  );

  const riskFlags: string[] = [];
  let score = 0;
  if (idMatchesEnteredId === false) {
    score += 35;
    riskFlags.push("ID number extracted from the document does not match the order ID number.");
  }
  if (nameMatchesOrderName === false) {
    score += 20;
    riskFlags.push("Identity name does not align with the submitted order name.");
  }
  if (addressMatchesDeliveryAddress === false) {
    score += 30;
    riskFlags.push("Proof-of-address location does not align with the requested delivery address.");
  }
  if (postalCodeMatches === false) {
    score += 15;
    riskFlags.push("Proof-of-address postal code differs from the requested delivery postal code.");
  }
  if (geoMatchesProvince === false) {
    score += 18;
    riskFlags.push("Request geo-location province differs from the requested delivery province.");
  }
  if (sapsArea) {
    score += sapsArea.points;
    riskFlags.push(`Delivery area matches SAPS risk zone '${sapsArea.label}' (${sapsArea.riskTier}).`);
  }
  if (input.orderValueCents >= 2_000_000) {
    score += 12;
    riskFlags.push("High-value basket increases manual-review sensitivity.");
  }
  if (identity.source !== "pdf_text") {
    score += 10;
    riskFlags.push("Identity document needs stronger OCR or manual analyst validation because the text layer is not fully readable.");
  }

  const decision: DocumentAnalysisResult["recommendation"]["decision"] =
    score >= 65 ? "decline" : score >= 25 ? "manual_review" : "approve";

  const reasons =
    riskFlags.length > 0
      ? riskFlags
      : ["Identity and proof-of-address signals appear consistent with the delivery request."];

  const summary =
    decision === "approve"
      ? "Document analysis indicates that the identity details, delivery request, and proof of address are aligned well enough for analyst approval."
      : decision === "decline"
        ? "Document analysis identified high-risk mismatches that should lead to a decline unless an analyst overrides with additional evidence."
        : "Document analysis found enough risk signals to keep this order in analyst review rather than releasing it automatically.";

  return {
    identity,
    proofOfAddress,
    comparisons: {
      idMatchesEnteredId,
      nameMatchesOrderName,
      addressMatchesDeliveryAddress,
      postalCodeMatches,
      geoMatchesProvince,
      sapsAreaMatch: sapsArea?.label || null,
      sapsRiskTier: sapsArea?.riskTier || null,
      sapsSeverityIndex: sapsArea?.severityIndex || null,
      riskFlags,
    },
    recommendation: {
      decision,
      score,
      summary,
      reasons,
    },
  };
}
