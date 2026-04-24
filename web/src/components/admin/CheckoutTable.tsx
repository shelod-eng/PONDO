"use client";

import { useMemo, useState } from "react";
import { CheckoutStatusBadge, VerificationBadge } from "@/components/admin/StatusBadge";
import type { CheckoutRecord, CheckoutStatus } from "@/types/admin";

const filters: Array<"ALL" | CheckoutStatus> = ["ALL", "COMPLETED", "DELIVERED", "IN_TRANSIT", "PENDING", "BLOCKED"];

function money(amount: number) {
  return `R${amount.toLocaleString("en-ZA")}`;
}

export function CheckoutTable({ records }: { records: CheckoutRecord[] }) {
  const [filter, setFilter] = useState<"ALL" | CheckoutStatus>("ALL");

  const visible = useMemo(
    () => records.filter((record) => (filter === "ALL" ? true : record.status === filter)),
    [filter, records]
  );

  return (
    <section id="checkouts" className="admin-panel rounded-[30px] text-white">
      <div className="flex flex-col gap-4 border-b border-[rgba(45,78,116,0.7)] px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-pondo-sky-300">Checkout Operations</div>
          <h2 className="admin-display mt-2 text-4xl font-semibold">Checkout Transactions</h2>
          <span className="mt-2 block text-sm text-pondo-text-secondary">
            Full checkout pipeline | ITC to KYC to Vetting to Fulfilment
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {filters.map((item) => {
            const active = filter === item;
            return (
              <button
                key={item}
                onClick={() => setFilter(item)}
                className={[
                  "rounded-full border px-4 py-2 text-sm font-bold transition",
                  active
                    ? "border-[#f5b642] bg-[linear-gradient(135deg,#ea6a3f,#d64534)] text-white"
                    : "border-[rgba(157,194,242,0.14)] bg-white/5 text-pondo-text-secondary hover:bg-white/8 hover:text-white",
                ].join(" ")}
              >
                {item.replaceAll("_", "-")}
              </button>
            );
          })}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="admin-table min-w-full text-left">
          <thead className="text-xs font-black uppercase tracking-[0.18em]">
            <tr>
              <th className="px-4 py-4">Transaction ID</th>
              <th className="px-4 py-4">Consumer</th>
              <th className="px-4 py-4">Product</th>
              <th className="px-4 py-4">Partner</th>
              <th className="px-4 py-4">Amount</th>
              <th className="px-4 py-4">ITC</th>
              <th className="px-4 py-4">KYC</th>
              <th className="px-4 py-4">Vetting</th>
              <th className="px-4 py-4">Status</th>
              <th className="px-4 py-4">Driver</th>
              <th className="px-4 py-4">Time</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((record) => (
              <tr key={record.id} className="text-sm text-white">
                <td className="px-4 py-4 font-semibold text-pondo-sky-300">{record.id}</td>
                <td className="px-4 py-4 text-lg font-bold">{record.consumer}</td>
                <td className="px-4 py-4 text-pondo-text-secondary">{record.product}</td>
                <td className="px-4 py-4 font-bold text-pondo-sky-300">{record.partner}</td>
                <td className="px-4 py-4 text-lg font-black text-pondo-amber-400">{money(record.amount)}</td>
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
                  <CheckoutStatusBadge status={record.status} />
                </td>
                <td className="px-4 py-4 text-pondo-text-secondary">{record.driver ?? "-"}</td>
                <td className="px-4 py-4 text-pondo-text-secondary">{record.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

