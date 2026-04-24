"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AdminUser } from "@/types/admin";

function fmtClock(date: Date) {
  return date.toLocaleTimeString("en-ZA", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function AdminHeader({
  admins,
  selectedAdminId,
  onSelectAdmin,
}: {
  admins: AdminUser[];
  selectedAdminId: string;
  onSelectAdmin: (id: string) => void;
}) {
  const [clock, setClock] = useState("--:--:--");

  useEffect(() => {
    const timer = window.setInterval(() => setClock(fmtClock(new Date())), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <header className="sticky top-0 z-20 border-b border-[rgba(45,78,116,0.9)] bg-[rgba(6,21,42,0.92)] backdrop-blur">
      <div className="flex flex-col gap-5 px-5 py-4 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-5">
          <Link href="/" className="flex items-center gap-3">
            <div className="relative h-11 w-11">
              <span className="absolute left-0 top-2 h-7 w-7 rounded-full border-[3px] border-[#f5b642]/80" />
              <span className="absolute left-3 top-0 h-7 w-7 rounded-full border-[3px] border-[#4e7dc8]/85" />
            </div>
            <div>
              <div className="admin-display text-2xl font-bold tracking-tight text-white">PONDO Trust Commerce</div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.34em] text-pondo-sky-300">
                Admin Command Centre
              </div>
            </div>
          </Link>

          <div className="admin-pill inline-flex items-center gap-3 rounded-full px-4 py-2 text-sm font-semibold">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
            LIVE | {clock}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {admins.map((admin) => {
            const active = admin.id === selectedAdminId;
            return (
              <button
                key={admin.id}
                onClick={() => onSelectAdmin(admin.id)}
                className={[
                  "flex min-w-[180px] items-center gap-3 rounded-2xl border px-5 py-3 text-left transition",
                  active
                    ? "border-[#f5b642] bg-[linear-gradient(135deg,rgba(234,106,63,0.18),rgba(78,125,200,0.16))] text-white admin-glow"
                    : "border-[rgba(157,194,242,0.12)] bg-white/5 text-slate-100 hover:bg-white/8",
                ].join(" ")}
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(6,21,42,0.95)] text-sm font-black text-white">
                  {admin.avatar}
                </span>
                <span>
                  <span className="block text-base font-bold">{admin.name.split(" ")[0]}</span>
                  <span className="block text-xs text-pondo-sky-300">{admin.subtitle}</span>
                </span>
              </button>
            );
          })}

          <div className="rounded-full bg-[linear-gradient(135deg,var(--pondo-orange-400),var(--pondo-orange-500))] px-5 py-3 text-sm font-bold text-white shadow-[0_14px_24px_rgba(214,69,52,0.24)]">
            Proposal Aligned
          </div>
        </div>
      </div>
    </header>
  );
}

