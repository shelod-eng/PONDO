export const demoSaIds = [
  { saId: "8001015009087", label: "Approved (Tier A)" },
  { saId: "9005054800081", label: "Approved (Tier B)" },
  { saId: "9912315009082", label: "Declined (Tier C)" },
  { saId: "7503106009089", label: "Declined (Tier C)" },
];

const scoreById = new Map([
  ["8001015009087", 712],
  ["9005054800081", 624],
  ["9912315009082", 489],
  ["7503106009089", 512],
]);

export function simulateCreditVet({ saId, bureau }) {
  const base = scoreById.get(saId) ?? 540;
  const jitter = bureau === "experian" ? 8 : 0;
  const score = Math.max(300, Math.min(850, base + jitter));
  const tier = score >= 680 ? "A" : score >= 580 ? "B" : "C";
  const approved = tier === "A" || tier === "B";
  return { score, tier, approved, bureau };
}

