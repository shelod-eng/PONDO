export const demoSaIds = [
  { saId: "8001015009087", label: "Approved (Tier A)" },
  { saId: "9005054800081", label: "Approved (Tier A)" },
  { saId: "8501015800088", label: "Approved (Tier A)" },
  { saId: "9203124200180", label: "Approved (Tier A)" },
];

const scoreById = new Map([
  ["8001015009087", 712],
  ["9005054800081", 700],
  ["8501015800088", 705],
  ["9203124200180", 710],
]);

function validateSAID(id) {
  if (!/^\d{13}$/.test(id)) return false;

  const digits = id.split("").map(Number);

  let oddSum = 0;
  for (let i = 0; i < 12; i += 2) {
    oddSum += digits[i];
  }

  let evenDigits = "";
  for (let i = 1; i < 12; i += 2) {
    evenDigits += digits[i];
  }

  const evenNumber = Number.parseInt(evenDigits, 10) * 2;
  const evenSum = evenNumber
    .toString()
    .split("")
    .reduce((sum, digit) => sum + Number(digit), 0);

  const total = oddSum + evenSum;
  const checkDigit = (10 - (total % 10)) % 10;

  return checkDigit === digits[12];
}

export function simulateCreditVet({ saId, bureau }) {
  const normalizedId = String(saId || "").trim();

  // Demo behavior: any structurally valid SA ID should pass so the checksum flow
  // can be exercised end-to-end without blocking checkout orchestration.
  if (validateSAID(normalizedId)) {
    return { score: 700, tier: "A", approved: true, bureau };
  }

  const base = scoreById.get(normalizedId) ?? 540;
  const jitter = bureau === "experian" ? 8 : 0;
  const score = Math.max(300, Math.min(850, base + jitter));
  const tier = score >= 680 ? "A" : score >= 580 ? "B" : "C";
  const approved = tier === "A" || tier === "B";
  return { score, tier, approved, bureau };
}

