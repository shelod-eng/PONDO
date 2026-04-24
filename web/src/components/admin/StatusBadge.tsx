import type { CheckoutStatus, VerificationState } from "@/types/admin";

function paletteForVerification(state: VerificationState) {
  switch (state) {
    case "PASS":
      return "border-emerald-400/20 bg-emerald-400/14 text-emerald-300";
    case "FAIL":
      return "border-red-400/20 bg-red-400/14 text-red-300";
    case "REVIEW":
      return "border-amber-400/20 bg-amber-400/14 text-amber-200";
    case "PENDING":
      return "border-slate-400/20 bg-slate-300/10 text-slate-300";
    default:
      return "border-slate-400/20 bg-slate-300/10 text-slate-400";
  }
}

export function VerificationBadge({ state }: { state: VerificationState }) {
  const label =
    state === "PASS"
      ? "PASS"
      : state === "FAIL"
        ? "FAIL"
        : state === "REVIEW"
          ? "REVIEW"
          : state === "PENDING"
            ? "PENDING"
            : "N/A";

  return (
    <span className={["inline-flex rounded-full border px-3 py-1 text-xs font-bold", paletteForVerification(state)].join(" ")}>
      {label}
    </span>
  );
}

export function CheckoutStatusBadge({ status }: { status: CheckoutStatus }) {
  const palette =
    status === "COMPLETED" || status === "DELIVERED"
      ? "border-emerald-400/20 bg-emerald-400/14 text-emerald-300"
      : status === "IN_TRANSIT"
        ? "border-sky-400/20 bg-sky-400/14 text-sky-200"
        : status === "BLOCKED"
          ? "border-red-400/20 bg-red-400/14 text-red-300"
          : "border-amber-400/20 bg-amber-400/14 text-amber-200";

  return <span className={["inline-flex rounded-full border px-3 py-1 text-xs font-bold", palette].join(" ")}>{status.replaceAll("_", " ")}</span>;
}

export function DotBadge({
  active,
  label,
  activeLabel,
}: {
  active: boolean;
  label?: string;
  activeLabel?: string;
}) {
  const text = active ? activeLabel ?? label ?? "Active" : label ?? "Offline";

  return (
    <span
      className={[
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold",
        active ? "border-emerald-400/20 bg-emerald-400/14 text-emerald-300" : "border-slate-400/20 bg-slate-300/10 text-slate-300",
      ].join(" ")}
    >
      <span className={["h-2.5 w-2.5 rounded-full", active ? "bg-emerald-400" : "bg-slate-400"].join(" ")} />
      {text}
    </span>
  );
}
