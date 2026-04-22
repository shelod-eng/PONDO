export const demoSaIds = [
  { saId: "8001015009087", label: "Approved (Tier A)" },
  { saId: "9005054800081", label: "Approved (Tier A)" },
  { saId: "8501015800083", label: "Approved (Tier A)" },
  { saId: "9203124200186", label: "Approved (Tier A)" },
];

const scoreById = new Map([
  ["8001015009087", 712],
  ["9005054800081", 700],
  ["8501015800083", 705],
  ["9203124200186", 710],
]);

export function simulateCreditVet({ saId, bureau }) {
  // Always approve the four demo profiles
  if (["8001015009087", "9005054800081", "8501015800083", "9203124200186"].includes(saId)) {
    return { score: 700, tier: "A", approved: true, bureau };
  }
  const base = scoreById.get(saId) ?? 540;
  const jitter = bureau === "experian" ? 8 : 0;
  const score = Math.max(300, Math.min(850, base + jitter));
  const tier = score >= 680 ? "A" : score >= 580 ? "B" : "C";
  const approved = tier === "A" || tier === "B";
  return { score, tier, approved, bureau };
}

