"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { CheckoutTable } from "@/components/admin/CheckoutTable";
import { DriverTable } from "@/components/admin/DriverTable";
import { KYCPanel } from "@/components/admin/KYCPanel";
import { KPICards } from "@/components/admin/KPICards";
import { KYCPieChart } from "@/components/admin/charts/KYCPieChart";
import { KYCTrendChart } from "@/components/admin/charts/KYCTrendChart";
import { PartnerPerfChart } from "@/components/admin/charts/PartnerPerfChart";
import { RevenueTrendChart } from "@/components/admin/charts/RevenueTrendChart";
import { TxVolumeChart } from "@/components/admin/charts/TxVolumeChart";
import {
  adminUsers,
  baseKpis,
  checkoutRecords,
  driverAssignments,
  kycAuditRecords,
  kycPieData,
  kycTrendData,
  partnerPerformanceData,
  revenueTrendData,
  txVolumeData,
} from "@/lib/adminData";

export default function PondoAdminPage() {
  const [selectedAdminId, setSelectedAdminId] = useState(adminUsers[0].id);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 4000);
    return () => window.clearInterval(timer);
  }, []);

  const selectedAdmin = adminUsers.find((admin) => admin.id === selectedAdminId) ?? adminUsers[0];

  const kpis = useMemo(() => {
    return baseKpis.map((metric) => {
      if (metric.id === "revenue") {
        const amount = 1332148 + tick * 1480;
        return { ...metric, value: `R ${amount.toLocaleString("en-ZA").replaceAll(",", " ")}` };
      }
      if (metric.id === "completed") {
        return { ...metric, value: String(1847 + tick) };
      }
      return metric;
    });
  }, [tick]);

  return (
    <AdminShell admin={selectedAdmin} admins={adminUsers} onSelectAdmin={setSelectedAdminId}>
      <section id="overview" className="space-y-8">
        <div className="admin-panel rounded-[34px] px-6 py-7 text-white sm:px-8 sm:py-8">
          <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-4xl">
              <div className="text-[11px] font-semibold uppercase tracking-[0.34em] text-pondo-sky-300">
                PONDO Trust Commerce | Admin Proposal Portal
              </div>
              <h1 className="admin-display mt-4 text-5xl font-semibold leading-none sm:text-6xl">
                Command centre styling aligned to the proposal deck.
              </h1>
              <p className="mt-4 max-w-3xl text-lg leading-8 text-pondo-text-secondary">
                Oversight for revenue, checkouts, KYC, ITC, driver operations, and fulfilment performance in a single premium
                admin surface.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[520px]">
              <div className="rounded-[24px] border border-[rgba(157,194,242,0.14)] bg-white/5 p-4">
                <div className="text-xs uppercase tracking-[0.24em] text-pondo-sky-300">Current Session</div>
                <div className="mt-3 text-2xl font-bold text-white">{selectedAdmin.name}</div>
                <div className="mt-1 text-sm text-pondo-text-secondary">{selectedAdmin.subtitle}</div>
              </div>
              <div className="rounded-[24px] border border-emerald-400/20 bg-emerald-400/10 p-4">
                <div className="text-xs uppercase tracking-[0.24em] text-emerald-200">System Health</div>
                <div className="mt-3 text-2xl font-bold text-white">Operational</div>
                <div className="mt-1 text-sm text-emerald-100/80">Audit, payments, and routing green</div>
              </div>
              <div className="rounded-[24px] border border-[rgba(245,182,66,0.22)] bg-[linear-gradient(135deg,rgba(234,106,63,0.18),rgba(245,182,66,0.12))] p-4">
                <div className="text-xs uppercase tracking-[0.24em] text-amber-100">Proposal Match</div>
                <div className="mt-3 text-2xl font-bold text-white">Look & Feel</div>
                <div className="mt-1 text-sm text-amber-50/80">Navy, bronze, confidence, clarity</div>
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-3">
              {[
                "Boardroom-grade presentation",
                "High-trust payment operations",
                "Proposal-matched branding",
              ].map((item) => (
                <span key={item} className="admin-pill rounded-full px-4 py-2 text-sm font-semibold">
                  {item}
                </span>
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/PondoDemo/checkout"
                className="rounded-full bg-[linear-gradient(135deg,var(--pondo-orange-400),var(--pondo-orange-500))] px-5 py-3 text-sm font-bold text-white shadow-[0_14px_24px_rgba(214,69,52,0.24)] transition hover:brightness-110"
              >
                Open Checkout Demo
              </Link>
              <Link
                href="/sponsor"
                className="rounded-full border border-[rgba(157,194,242,0.18)] bg-white/5 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/8"
              >
                Sponsor Billing View
              </Link>
            </div>
          </div>
        </div>

        <KPICards metrics={kpis} />
        <CheckoutTable records={checkoutRecords} />

        <div className="space-y-8">
          <DriverTable drivers={driverAssignments} />
          <KYCPanel records={kycAuditRecords} />
        </div>

        <section id="analytics" className="space-y-8">
          <div className="grid gap-8 xl:grid-cols-[2fr_1fr]">
            <TxVolumeChart data={txVolumeData} />
            <KYCPieChart data={kycPieData} />
          </div>

          <div className="grid gap-8 xl:grid-cols-2">
            <KYCTrendChart data={kycTrendData} />
            <RevenueTrendChart data={revenueTrendData} />
          </div>

          <PartnerPerfChart data={partnerPerformanceData} />
        </section>
      </section>
    </AdminShell>
  );
}

