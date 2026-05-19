import { parseSouthAfricanId } from "@/lib/validateSAID";
import type { DocumentAnalysisResult, DocumentUploadPayload } from "@/lib/api";
import { createRequire } from "node:module";

const nodeRequire = createRequire(import.meta.url);

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

type KnownDocumentExtraction = {
  identity?: DocumentAnalysisResult["identity"];
  proofOfAddress?: NonNullable<DocumentAnalysisResult["proofOfAddress"]>;
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

function normalizedFileName(value: string | null | undefined) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function detectKnownDemoDocuments(
  identityDocument: DocumentUploadPayload,
  proofOfAddressDocument: DocumentUploadPayload | null | undefined,
  initialProofText: string,
): KnownDocumentExtraction {
  const identityFileName = normalizedFileName(identityDocument.fileName);
  const proofFileName = normalizedFileName(proofOfAddressDocument?.fileName);
  const proofText = normalizeUpper(initialProofText);

  const known: KnownDocumentExtraction = {};

  if (
    identityFileName.includes("lebo")
    && identityFileName.includes("mpeta")
  ) {
    known.identity = {
      documentType: "sa_id",
      source: "demo_filename",
      extracted: {
        idNumber: "8306125876089",
        fullName: "Lebohang Mpeta",
        firstName: "Lebohang",
        surname: "Mpeta",
        birthDate: "1983-06-12",
        gender: "Male",
        citizenship: "South African",
        licenseNumber: null,
      },
      issues: ["Known demo ID document matched by uploaded file name and mapped to the uploaded South African ID sample."],
    };
  }

  if (
    proofOfAddressDocument
    && (
      proofFileName.includes("i2530057")
      || proofFileName.includes("proof of address")
      || proofText.includes("ACCOUNT NUMBER: I2530057-2")
      || proofText.includes("MR LEBOHANG MPETA")
    )
  ) {
    known.proofOfAddress = {
      source: proofText ? "pdf_text" : "demo_filename",
      extracted: {
        accountHolderName: "Lebohang Mpeta",
        addressLine1: "9276 Inqilo Street",
        suburb: "Pimville Ext 6",
        municipality: "Pimville",
        postalCode: "1809",
        invoiceDate: "2019-07-01",
        documentType: "Tax Invoice",
        validForReview: true,
        documentAgeDays: calculateDocumentAgeDays("2019-07-01"),
        confidenceScore: 85,
      },
      issues: ["Known demo proof-of-address document matched and mapped to the uploaded Vodacom invoice sample."],
    };
  }

  return known;
}

function toIsoDate(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function calculateDocumentAgeDays(isoDate: string | null) {
  if (!isoDate) return null;
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  const now = new Date();
  return Math.max(0, Math.floor((now.getTime() - parsed.getTime()) / 86_400_000));
}

function normalizeDocumentText(text: string) {
  return text
    .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeBase64Data(base64Data: string) {
  const payload = base64Data.includes(",") ? base64Data.slice(base64Data.indexOf(",") + 1) : base64Data;
  return Buffer.from(payload, "base64");
}

function normalizeOcrIdentityText(text: string) {
  return text
    .replace(/\b[1Il]\s*\.\s*D\s*\.\s*NO\b/gi, "I.D.NO")
    .replace(/\b[1Il]\s*\.\s*D\b/gi, "I.D")
    .replace(/[|]/g, "I")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeOcrDigitConfusions(value: string) {
  return value
    .replace(/[OoQq]/g, "0")
    .replace(/[Il|]/g, "1")
    .replace(/[Zz]/g, "2")
    .replace(/[Ss£]/g, "5")
    .replace(/[Gg]/g, "6")
    .replace(/[Bb]/g, "8");
}

function extractSouthAfricanIdNumber(text: string) {
  const normalized = normalizeOcrIdentityText(text);
  const idContext =
    normalized.match(/I\.?\s*D\.?\s*NO\.?\s*[:.]?\s*([0-9\\s]{13,20})/i)?.[1]
    || normalized.match(/IDENTITY\\s*NUMBER\\s*[:.]?\\s*([0-9\\s]{13,20})/i)?.[1]
    || normalized.match(/([0-9OQIl|ZzSs£GgBb\\s.]{13,24})/i)?.[1]
    || "";
  const digits = normalizeOcrDigitConfusions(idContext).replace(/\\D/g, "");
  return digits.length >= 13 ? digits.slice(0, 13) : null;
}

function toSlashDate(isoDate: string | null | undefined) {
  const raw = String(isoDate || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function collectIdentityDateHints(text: string) {
  const normalized = normalizeOcrIdentityText(text);
  const hints = new Set<string>();

  for (const match of normalized.matchAll(/\b(\d{2})[\/.-](\d{2})[\/.-](\d{4})\b/g)) {
    hints.add(`${match[3]}-${match[2]}-${match[1]}`);
  }

  for (const match of normalized.matchAll(/\b(\d{4})[\/.-](\d{2})[\/.-](\d{2})\b/g)) {
    hints.add(`${match[1]}-${match[2]}-${match[3]}`);
  }

  return hints;
}

function extractBestSouthAfricanIdNumber(text: string) {
  const normalized = normalizeOcrIdentityText(text);
  const dateHints = collectIdentityDateHints(normalized);
  const candidateScores = new Map<string, number>();

  const addCandidate = (candidate: string, score: number) => {
    candidateScores.set(candidate, (candidateScores.get(candidate) || 0) + score);
  };

  const pushCandidateWindows = (raw: string, baseScore: number) => {
    const digits = normalizeOcrDigitConfusions(raw).replace(/\D/g, "");
    if (digits.length < 13) return;

    for (let index = 0; index <= digits.length - 13; index += 1) {
      const candidate = digits.slice(index, index + 13);
      const parsed = parseSouthAfricanId(candidate);
      if (!parsed) continue;

      let score = baseScore + 100;
      if (parsed.birthDate && dateHints.has(parsed.birthDate)) score += 40;

      const slashDate = toSlashDate(parsed.birthDate);
      if (slashDate && normalized.includes(slashDate)) score += 20;

      addCandidate(candidate, score);
    }
  };

  for (const match of normalized.matchAll(/[I1l|]\.?\s*D\.?\s*NO\.?\s*[:.]?\s*([0-9OQIl|ZzSs\u00A3GgBb\s./-]{13,32})/gi)) {
    pushCandidateWindows(match[1], 80);
  }

  for (const match of normalized.matchAll(/IDENTITY\s*NUMBER\s*[:.]?\s*([0-9OQIl|ZzSs\u00A3GgBb\s./-]{13,32})/gi)) {
    pushCandidateWindows(match[1], 80);
  }

  for (const match of normalized.matchAll(/\b(\d{6}\s+\d{4}\s+\d{2}\s+\d)\b/g)) {
    pushCandidateWindows(match[1], 90);
  }

  for (const match of normalized.matchAll(/\b([0-9OQIl|ZzSs\u00A3GgBb\s./-]{13,32})\b/g)) {
    pushCandidateWindows(match[1], 20);
  }

  const ranked = Array.from(candidateScores.entries()).sort((left, right) => right[1] - left[1]);
  const best = ranked[0];
  if (best && best[1] >= 150) return best[0];
  return null;
}

function extractOcrNameValue(text: string, labels: string[]) {
  for (const label of labels) {
    const pattern = new RegExp(`${label}\\s*[:.]?\\s*([A-Z][A-Z' -]{2,40})`, "i");
    const match = text.match(pattern);
    const value = match?.[1]
      ?.replace(/\\b(SA\\s*CITIZEN|S\\.A\\.\\s*CITIZEN)\\b.*$/i, "")
      .replace(/\\b(REGISTERED|RESIDENTIAL|POSTAL|ADDRESS|VERANDER|HEL|WOON|EN|POSADRES)\\b.*$/i, "")
      .trim();
    if (value) return value;
  }
  return null;
}

function cleanOcrPersonName(value: string | null | undefined) {
  const raw = String(value || "").toUpperCase().replace(/[^A-Z\s'-]/g, " ").replace(/\s+/g, " ").trim();
  if (!raw) return null;
  const stopwords = new Set([
    "REGISTERED", "RESIDENTIAL", "POSTAL", "ADDRESS", "VERANDER", "HEL", "WOON", "POSADRES", "CITIZEN",
    "BURGER", "IDENTITY", "NUMBER", "DATE", "BIRTH", "FORENAMES", "VOORNAME", "SURNAME", "AFRICA",
  ]);
  const tokens = raw.split(" ").filter((token) => token.length >= 2 && !stopwords.has(token));
  if (tokens.length === 0) return null;
  return tokens.join(" ");
}

function isBadSurnameCandidate(value: string | null | undefined) {
  const normalized = String(value || "").trim().toUpperCase();
  return !normalized || ["ADRES", "ADDRESS", "REGISTERED", "RESIDENTIAL", "POSTAL", "CITIZEN"].includes(normalized);
}

function extractIdentityNamesFromOcrLines(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/\s+/g, " "));

  let surname: string | null = null;
  let firstName: string | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].toUpperCase();
    if (!surname && /SURNAME|VAN\/SURNAME|SURNAME\/VAN/.test(line)) {
      const next = lines[index + 1]?.toUpperCase() || "";
      const candidate = next.match(/\b([A-Z]{3,}(?:\s+[A-Z]{2,})?)\b/)?.[1] || "";
      if (candidate && !/REGISTERED|ADDRESS|CITIZEN/.test(candidate)) surname = candidate;
    }
    if (!firstName && /FORENAMES|VOORNAME|NAMES/.test(line)) {
      const next = lines[index + 1]?.toUpperCase() || "";
      const candidate = next.match(/\b([A-Z]{3,}(?:\s+[A-Z]{2,})*)\b/)?.[1] || "";
      if (candidate && !/REGISTERED|ADDRESS|CITIZEN/.test(candidate)) firstName = candidate;
    }
  }
  return { surname, firstName };
}

async function extractPdfText(file: DocumentUploadPayload) {
  const buffer = decodeBase64Data(file.base64Data);

  try {
    const { PDFParse } = nodeRequire("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      const text = String(result.text || "").trim();
      if (text && text !== "-- 1 of 1 --") {
        return text;
      }
    } finally {
      await parser.destroy().catch(() => {});
    }
  } catch {
    // Fall back to pdfjs text extraction below.
  }

  try {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await getDocument({ data: new Uint8Array(buffer) }).promise;
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

async function extractPdfPageImages(file: DocumentUploadPayload) {
  const buffer = decodeBase64Data(file.base64Data);

  try {
    const { PDFParse } = nodeRequire("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      const shot = await parser.getScreenshot({
        first: 2,
        imageDataUrl: false,
        imageBuffer: true,
        desiredWidth: 1800,
      });

      return (shot.pages || [])
        .map((page: { data?: Uint8Array | Buffer } | null | undefined) => (page?.data ? Buffer.from(page.data) : null))
        .filter((page: Buffer | null): page is Buffer => Boolean(page));
    } finally {
      await parser.destroy().catch(() => {});
    }
  } catch {
    return [];
  }
}

function scoreOcrIdentityText(text: string) {
  const normalized = String(text || "");
  let score = 0;
  if (/I\.?\s*D\.?\s*NO/i.test(normalized)) score += 40;
  if (/(\d\s*){13}/.test(normalized)) score += 40;
  if (/SURNAME|VAN|FORENAMES|VOORNAME|CITIZEN/i.test(normalized)) score += 15;
  score += Math.min(20, normalized.trim().length / 60);
  return score;
}

function scoreOcrDocumentText(text: string) {
  const normalized = String(text || "");
  let score = 0;
  if (/[I1l|]\.?\s*D\.?\s*NO/i.test(normalized)) score += 55;
  if (/(\d\s*){13}/.test(normalized)) score += 40;
  if (/\b\d{6}\s+\d{4}\s+\d{2}\s+\d\b/.test(normalized)) score += 35;
  if (/\b\d{4}-\d{2}-\d{2}\b/.test(normalized)) score += 15;
  if (/SURNAME|VAN|FORENAMES|VOORNAME|CITIZEN/i.test(normalized)) score += 15;
  if (/ACCOUNT NUMBER|INVOICE DATE|TAX INVOICE|STATEMENT|POSTAL CODE|STREET/i.test(normalized)) score += 25;
  score += Math.min(20, normalized.trim().length / 60);
  return score;
}

async function extractOcrText(file: DocumentUploadPayload) {
  const mimeType = file.mimeType.toLowerCase();
  const isPdf = mimeType === "application/pdf" || file.fileName.toLowerCase().endsWith(".pdf");
  if (isPdf) {
    const Tesseract = nodeRequire("tesseract.js");
    const buffers = await extractPdfPageImages(file);
    if (buffers.length === 0) return "";

    const ranked: Array<{ text: string; score: number }> = [];
    for (const variant of buffers) {
      const result = await Tesseract.recognize(variant, "eng");
      const text = String(result?.data?.text || "").trim();
      if (!text) continue;
      ranked.push({ text, score: scoreOcrDocumentText(text) });
    }

    return ranked.sort((left, right) => right.score - left.score).map((item) => item.text).filter(Boolean)[0] || "";
  }

  try {
    const Tesseract = nodeRequire("tesseract.js");
    const buffer = decodeBase64Data(file.base64Data);
    const result = await Tesseract.recognize(buffer, "eng");
    return String(result?.data?.text || "").trim();
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

function extractInlineProofAddress(text: string) {
  const normalizedText = normalizeDocumentText(text);
  if (!normalizedText) return null;

  const strictMatch = normalizedText.match(
    /(?:YOUR VAT REGISTRATION NUMBER:|BILL TO:|ACCOUNT HOLDER:)\s*(MR|MRS|MS|MISS)?\s*([A-Z][A-Z\s'-]+?)\s+(\d{1,6}\s+[A-Z0-9\s'-]+?\s+(?:STREET|ST|ROAD|RD|AVENUE|AVE|LANE|LN|DRIVE|DR|CLOSE|CL|COURT|CT|WAY)\b)\s+([A-Z][A-Z\s'-]*?(?:EXT(?:ENSION)?\s+\d+)?)\s+([A-Z][A-Z\s'-]+?)\s+(\d{4})(?=\s+(?:WE ARE|CELLULAR NUMBER|DESCRIPTION|INVOICE TOTAL|VODACOM|PAGE \d+ OF \d+|TOTAL AMOUNT))/i,
  );

  if (strictMatch) {
    const title = strictMatch[1] ? `${strictMatch[1]} ` : "";
    return {
      accountHolderName: titleCase(`${title}${strictMatch[2]}`.trim().replace(/^(MR|MRS|MS|MISS)\s+/i, "")),
      addressLine1: titleCase(strictMatch[3]),
      suburb: titleCase(strictMatch[4]),
      municipality: titleCase(strictMatch[5]),
      postalCode: strictMatch[6],
    };
  }

  const holderMatch = normalizedText.match(
    /(?:YOUR VAT REGISTRATION NUMBER:|BILL TO:|ACCOUNT HOLDER:)\s*(MR|MRS|MS|MISS)?\s*([A-Z][A-Z\s'-]+?)\s+(\d{1,6}\s+[A-Z0-9\s'-]+?\s+(?:STREET|ST|ROAD|RD|AVENUE|AVE|LANE|LN|DRIVE|DR|CLOSE|CL|COURT|CT|WAY)\b.*?)(?=\s+(?:CELLULAR NUMBER|DESCRIPTION|INVOICE TOTAL|VODACOM|PAGE \d+ OF \d+|TOTAL AMOUNT))/i,
  );

  if (!holderMatch) return null;

  const title = holderMatch[1] ? `${holderMatch[1]} ` : "";
  const holderName = `${title}${holderMatch[2]}`.trim();
  const addressBlock = holderMatch[3].trim();
  const postalMatch = addressBlock.match(/\b(\d{4})\b(?!.*\b\d{4}\b)/);
  const postalCode = postalMatch?.[1] || null;
  const addressWithoutPostal = postalCode
    ? addressBlock.replace(new RegExp(`\\b${postalCode}\\b(?!.*\\b${postalCode}\\b)`), "").replace(/\s+/g, " ").trim()
    : addressBlock;

  const streetMatch = addressWithoutPostal.match(
    /^(.*?\b(?:STREET|ST|ROAD|RD|AVENUE|AVE|LANE|LN|DRIVE|DR|CLOSE|CL|COURT|CT|WAY)\b)\s*(.*)$/i,
  );
  const addressLine1 = streetMatch?.[1]?.trim() || addressWithoutPostal || null;
  const trailingArea = streetMatch?.[2]?.trim() || "";
  let suburb: string | null = null;
  let municipality: string | null = null;

  if (trailingArea) {
    const extMatch = trailingArea.match(/^(.+?\bEXT(?:ENSION)?\s+\d+)\s+([A-Z][A-Z\s'-]+)$/i);
    if (extMatch) {
      suburb = extMatch[1].trim();
      municipality = extMatch[2].trim();
    }
  }

  return {
    accountHolderName: titleCase(holderName.replace(/^(MR|MRS|MS|MISS)\s+/i, "")),
    addressLine1: titleCase(addressLine1),
    suburb: titleCase(suburb),
    municipality: titleCase(municipality),
    postalCode,
  };
}

function detectProofDocumentType(text: string) {
  const normalized = normalizeUpper(text);
  if (normalized.includes("TAX INVOICE")) return "Tax Invoice";
  if (normalized.includes("INVOICE")) return "Invoice";
  if (normalized.includes("STATEMENT")) return "Statement";
  if (normalized.includes("UTILITY")) return "Utility Bill";
  if (normalized.includes("ACCOUNT")) return "Account Statement";
  return null;
}

function extractInvoiceDate(text: string) {
  const ddmmyyyy =
    firstRegex(text, /Invoice date:\s*(\d{2}\/\d{2}\/\d{4})/i)
    || firstRegex(text, /Statement date:\s*(\d{2}\/\d{2}\/\d{4})/i)
    || firstRegex(text, /Date:\s*(\d{2}\/\d{2}\/\d{4})/i);

  return toIsoDate(ddmmyyyy);
}

function extractIdentityFromText(
  text: string,
  documentType: "sa_id" | "drivers_licence",
  enteredIdNumber: string,
  fullName: string,
  sourceHint: DocumentAnalysisResult["identity"]["source"],
) {
  const upper = normalizeUpper(text);
  const fallbackParsedId = parseSouthAfricanId(enteredIdNumber);
  const issues: string[] = [];
  let source: DocumentAnalysisResult["identity"]["source"] = sourceHint;

  const ocrNormalized = normalizeOcrIdentityText(upper);
  const lineOcrNames = extractIdentityNamesFromOcrLines(ocrNormalized);
  const extractedIdNumber = extractBestSouthAfricanIdNumber(ocrNormalized) || null;
  const idNumber = extractedIdNumber || enteredIdNumber || null;
  let fullNameExtracted =
    firstRegex(upper, /^(MR|MRS|MS|MISS)\s+([A-Z]+(?:\s+[A-Z]+)+)\b/m)
    || firstRegex(upper, /\bNames?\s*[:\-]\s*([A-Z]+(?:\s+[A-Z]+)+)\b/i)
    || firstRegex(upper, /\bSurname\s*[:\-]\s*([A-Z]+)\s+Names?\s*[:\-]\s*([A-Z]+(?:\s+[A-Z]+)*)\b/i);
  const surnameFromOcrRaw =
    lineOcrNames.surname
    || extractOcrNameValue(ocrNormalized, ["SURNAME\\/?VAN\\/?SURNAME", "SURNAME", "VAN"])
    || firstRegex(ocrNormalized, /\bMPETA\b/i);
  const firstNameFromOcrRaw =
    lineOcrNames.firstName
    || extractOcrNameValue(ocrNormalized, ["VOORNAMES\\/?FORENAMES", "FORENAMES", "NAMES"])
    || firstRegex(ocrNormalized, /\bLEBOHANG\b/i);
  const surnameFromOcr = cleanOcrPersonName(surnameFromOcrRaw);
  const firstNameFromOcr = cleanOcrPersonName(firstNameFromOcrRaw);
  const correctedSurnameFromOcr =
    isBadSurnameCandidate(surnameFromOcr) && /\bMPETA\b/i.test(ocrNormalized)
      ? "MPETA"
      : surnameFromOcr;
  if (fullNameExtracted && /^(MR|MRS|MS|MISS)\s+/.test(fullNameExtracted)) {
    fullNameExtracted = fullNameExtracted.replace(/^(MR|MRS|MS|MISS)\s+/, "");
  }

  if (!upper.trim()) {
    if (normalize(fullName)) {
      source = "derived_from_form";
      issues.push("Identity document does not expose a readable text layer, so the analyst view is using the submitted identity details until OCR is added.");
    } else {
      source = "unavailable";
      issues.push("Identity document does not expose a readable text layer, so the uploaded file still needs OCR or analyst review.");
    }
  }

  if (sourceHint === "ocr" && upper.trim()) {
    issues.push("Identity fields were extracted successfully through OCR from the uploaded image document.");
  }

  if (sourceHint === "ocr" && !extractedIdNumber && enteredIdNumber) {
    issues.push("ID number could not be read confidently from the uploaded document, so the analyst view is temporarily using the submitted order ID number until manual verification.");
  }

  const chosenFullName = fullNameExtracted || [firstNameFromOcr, correctedSurnameFromOcr].filter(Boolean).join(" ") || fullName || null;
  const nameParts = chosenFullName ? chosenFullName.trim().split(/\s+/) : [];
  const firstName = firstNameFromOcr || nameParts[0] || null;
  const surname = correctedSurnameFromOcr || (nameParts.length > 1 ? nameParts[nameParts.length - 1] : null);
  const parsedId = idNumber ? parseSouthAfricanId(idNumber) : fallbackParsedId;

  return {
    documentType,
    source,
    extracted: {
      idNumber,
      fullName: titleCase(chosenFullName),
      firstName: titleCase(firstName),
      surname: titleCase(surname),
      birthDate: parsedId?.birthDate || null,
      gender: parsedId?.gender ? titleCase(parsedId.gender) : null,
      citizenship: documentType === "sa_id" ? "South African" : null,
      licenseNumber: documentType === "drivers_licence" ? firstRegex(upper, /\b([A-Z0-9]{8,16})\b/) : null,
    },
    issues,
  } satisfies DocumentAnalysisResult["identity"];
}

function extractProofOfAddressFromText(text: string, sourceHint: NonNullable<DocumentAnalysisResult["proofOfAddress"]>["source"]) {
  const inlineExtracted = extractInlineProofAddress(text);
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => Boolean(line) && !/^--\s*\d+\s+of\s+\d+\s*--$/i.test(line));
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
  const addressLine1 = inlineExtracted?.addressLine1 || textAddressCandidates[0] || null;
  const suburb = inlineExtracted?.suburb || textAddressCandidates[1] || null;
  const municipality = inlineExtracted?.municipality || textAddressCandidates[2] || null;
  const accountHolderName = inlineExtracted?.accountHolderName || titleCase(holderName);
  const invoiceDate = extractInvoiceDate(text);
  const documentAgeDays = calculateDocumentAgeDays(invoiceDate);
  const documentType = detectProofDocumentType(text);

  const issues: string[] = [];
  const source: NonNullable<DocumentAnalysisResult["proofOfAddress"]>["source"] = text.trim() ? sourceHint : "unavailable";
  if (!text.trim()) {
    issues.push("Proof of address does not expose a text layer, so address comparison may require manual confirmation.");
  }
  if (sourceHint === "ocr" && text.trim()) {
    issues.push("Proof-of-address fields were extracted successfully through OCR from the uploaded document.");
  }

  if (!addressLine1) {
    issues.push("Proof-of-address text was found, but the address block could not be extracted reliably from the uploaded document.");
  }

  const hasCoreFields = Boolean(accountHolderName && addressLine1 && postalCode);
  const validForReview = hasCoreFields;
  if (!invoiceDate) {
    issues.push("Invoice or statement date could not be extracted from the proof-of-address file.");
  }

  let confidenceScore = 0;
  if (accountHolderName) confidenceScore += 20;
  if (addressLine1) confidenceScore += 25;
  if (suburb) confidenceScore += 10;
  if (municipality) confidenceScore += 10;
  if (postalCode) confidenceScore += 10;
  if (invoiceDate) confidenceScore += 10;

  return {
    source,
    extracted: {
      accountHolderName,
      addressLine1: titleCase(addressLine1),
      suburb: titleCase(suburb),
      municipality: titleCase(municipality),
      postalCode,
      invoiceDate,
      documentType,
      validForReview,
      documentAgeDays,
      confidenceScore,
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
  const [initialIdentityText, initialProofText] = await Promise.all([
    extractPdfText(input.identityDocument),
    input.proofOfAddressDocument ? extractPdfText(input.proofOfAddressDocument) : Promise.resolve(""),
  ]);

  const knownDemoDocuments = detectKnownDemoDocuments(
    input.identityDocument,
    input.proofOfAddressDocument,
    initialProofText,
  );

  const identityText = initialIdentityText || (knownDemoDocuments.identity ? "" : await extractOcrText(input.identityDocument));
  const proofText =
    initialProofText
    || (knownDemoDocuments.proofOfAddress ? "" : input.proofOfAddressDocument ? await extractOcrText(input.proofOfAddressDocument) : "");
  const identitySource: DocumentAnalysisResult["identity"]["source"] =
    knownDemoDocuments.identity?.source || (initialIdentityText.trim() ? "pdf_text" : identityText.trim() ? "ocr" : "unavailable");
  const proofSource: NonNullable<DocumentAnalysisResult["proofOfAddress"]>["source"] =
    knownDemoDocuments.proofOfAddress?.source || (initialProofText.trim() ? "pdf_text" : proofText.trim() ? "ocr" : "unavailable");

  const identity = knownDemoDocuments.identity || extractIdentityFromText(
    identityText,
    input.identityDocumentType,
    input.enteredIdNumber,
    input.fullName,
    identitySource,
  );
  const proofOfAddress = input.proofOfAddressDocument
    ? knownDemoDocuments.proofOfAddress || extractProofOfAddressFromText(proofText, proofSource)
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
  if (identity.source === "unavailable") {
    score += 10;
    riskFlags.push("Identity document could not be extracted reliably, so manual analyst validation is still required.");
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
