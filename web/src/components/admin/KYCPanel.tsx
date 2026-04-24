import { VerificationBadge } from "@/components/admin/StatusBadge";
import type { KycAuditRecord } from "@/types/admin";

function money(amount: number) {
  return `R${amount.toLocaleString("en-ZA")}`;
}

function statusPalette(status: KycAuditRecord["status"]) {
  switch (status) {
    case "CLEARED":
      return "border-emerald-400/20 bg-emerald-400/14 text-emerald-300";
    case "BLOCKED":
      return "border-red-400/20 bg-red-400/14 text-red-300";
    default:
      return "border-amber-400/20 bg-amber-400/14 text-amber-200";
  }
}

export function KYCPanel({ records }: { records: KycAuditRecord[] }) {
  const counts = {
    cleared: records.filter((record) => record.status === "CLEARED").length,
    review: records.filter((record) => record.status === "REVIEW").length,
    blocked: records.filter((record) => record.status === "BLOCKED").length,
  };

  return (
    <section id="kyc" className="admin-panel rounded-[30px] text-white">
      <div className="flex flex-col gap-4 border-b border-[rgba(45,78,116,0.7)] px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-pondo-sky-300">Compliance Visibility</div>
          <h2 className="admin-display mt-2 text-4xl font-semibold">ITC | KYC | Vetting Records</h2>
          <p className="mt-2 text-sm text-pondo-text-secondary">Real-time backend verification log</p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm font-bold">
          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/14 px-4 py-2 text-emerald-300">Cleared: {counts.cleared}</span>
          <span className="rounded-full border border-amber-400/20 bg-amber-400/14 px-4 py-2 text-amber-200">Review: {counts.review}</span>
          <span className="rounded-full border border-red-400/20 bg-red-400/14 px-4 py-2 text-red-300">Blocked: {counts.blocked}</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="admin-table min-w-full text-left">
          <thead className="text-xs font-black uppercase tracking-[0.18em]">
            <tr>
              <th className="px-4 py-4">Ref</th>
              <th className="px-4 py-4">Consumer</th>
              <th className="px-4 py-4">SA ID</th>
              <th className="px-4 py-4">ITC Check</th>
              <th className="px-4 py-4">KYC Check</th>
              <th className="px-4 py-4">Vetting</th>
              <th className="px-4 py-4">Status</th>
              <th className="px-4 py-4">Time</th>
              <th className="px-4 py-4">Product</th>
              <th className="px-4 py-4">Amount</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.ref} className="text-sm text-white">
                <td className="px-4 py-4 font-semibold text-pondo-sky-300">{record.ref}</td>
                <td className="px-4 py-4 text-lg font-bold">{record.consumer}</td>
                <td className="px-4 py-4 font-mono text-pondo-text-secondary">{record.saIdMasked}</td>
                <td className="px-4 py-4">
                  <VerificationBadge state={record.itc} />
                </td>
                <td className="px-4 py-4">
                  <VerificationBadge state={record.kyc} />
                </td>
                <td className="px-4 py-4">
                  <VerificationBadge state={record.vetting} />
                </td>
                <td className="px-4 py-4">
                  <span className={["inline-flex rounded-full border px-3 py-1 text-xs font-bold", statusPalette(record.status)].join(" ")}>
                    {record.status}
                  </span>
                </td>
                <td className="px-4 py-4 text-pondo-text-secondary">{record.time}</td>
                <td className="px-4 py-4 text-pondo-text-secondary">{record.product}</td>
                <td className="px-4 py-4 text-lg font-black text-pondo-amber-400">{money(record.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

