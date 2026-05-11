"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { CheckoutTable } from "@/components/admin/CheckoutTable";
import { KPICards } from "@/components/admin/KPICards";
import { KYCPanel } from "@/components/admin/KYCPanel";
import { KYCPieChart } from "@/components/admin/charts/KYCPieChart";
import { KYCTrendChart } from "@/components/admin/charts/KYCTrendChart";
import { PartnerPerfChart } from "@/components/admin/charts/PartnerPerfChart";
import { RevenueTrendChart } from "@/components/admin/charts/RevenueTrendChart";
import { TxVolumeChart } from "@/components/admin/charts/TxVolumeChart";
import { fetchAdminDashboard } from "@/lib/api";
import {
  adminUsers,
  baseKpis,
  checkoutRecords,
  kycAuditRecords,
  kycPieData,
  kycTrendData,
  partnerPerformanceData,
  revenueTrendData,
  txVolumeData,
} from "@/lib/adminData";
import type { AdminDashboardData, AdminDashboardPeriod, AdminSection, AdminUser } from "@/types/admin";

const powerBiReports = [
  {
    id: "01",
    title: "Overview KPIs",
    file: "01_overview_kpis.sql",
    grain: "Topline KPI cards and order status aggregates",
    purpose: "Supports cards, topline summary bands, and overview charts for executive operations monitoring.",
  },
  {
    id: "02",
    title: "Checkout Transactions",
    file: "02_checkout_transactions.sql",
    grain: "One row per payment transaction with pipeline status context",
    purpose: "Feeds the checkout operations page with status splits, funnel timing, and transaction tables.",
  },
  {
    id: "03",
    title: "Manual Review Queue",
    file: "03_manual_review_queue.sql",
    grain: "One row per analyst case",
    purpose: "Feeds analyst queue, backlog, ageing, and resolution monitoring.",
  },
  {
    id: "04",
    title: "Risk / KYC / Vetting",
    file: "04_risk_kyc_vetting.sql",
    grain: "One row per risk assessment / verification outcome",
    purpose: "Feeds the risk, ITC, KYC, fraud, and trend visuals for compliance operations.",
  },
  {
    id: "08",
    title: "Power BI Extracts",
    file: "08_powerbi_extracts.sql",
    grain: "Wide BI-friendly facts for checkout, order items, and audit events",
    purpose: "Feeds downstream Power BI models directly from `pondo_core` for real transaction reporting.",
  },
];

function formatGeneratedAt(value: string | undefined) {
  if (!value) return "Live refresh in progress";
  return new Date(value).toLocaleString("en-ZA", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatWindowCaption(dashboard: AdminDashboardData | null, selectedPeriod: AdminDashboardPeriod) {
  if (dashboard?.window) {
    return `${dashboard.window.label} | ${formatGeneratedAt(dashboard.window.dateFrom)} to ${formatGeneratedAt(dashboard.window.dateTo)}`;
  }
  switch (selectedPeriod) {
    case "today":
      return "Today | intraday operational period";
    case "this_week":
      return "This Week | current weekly operational period";
    case "last_month":
      return "Last Month | previous calendar month";
    default:
      return "This Month | current operational period";
  }
}

function defaultSectionForAdmin(admin: AdminUser): AdminSection {
  return admin.role === "analyst" ? "manual_review_queue" : "overview_kpis";
}

function SectionHeader({
  eyebrow,
  title,
  description,
  badge,
}: {
  eyebrow: string;
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-[rgba(45,78,116,0.7)] pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-pondo-sky-300">{eyebrow}</div>
        <h1 className="admin-display mt-2 text-4xl font-semibold text-white sm:text-5xl">{title}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-pondo-text-secondary">{description}</p>
      </div>
      {badge ? (
        <div className="rounded-full border border-[rgba(157,194,242,0.16)] bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-pondo-sky-300">
          {badge}
        </div>
      ) : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-[24px] border border-[rgba(157,194,242,0.12)] bg-white/4 p-5 text-white">
      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-pondo-sky-300">{label}</div>
      <div className="mt-3 text-3xl font-black text-white">{value}</div>
      <div className="mt-2 text-sm text-pondo-text-secondary">{hint}</div>
    </div>
  );
}

export default function PondoAdminPage() {
  const [selectedAdminId, setSelectedAdminId] = useState(adminUsers[0].id);
  const [selectedPeriod, setSelectedPeriod] = useState<AdminDashboardPeriod>("this_month");
  const [selectedSection, setSelectedSection] = useState<AdminSection>("overview_kpis");
  const [dashboard, setDashboard] = useState<AdminDashboardData | null>(null);
  const [dashboardState, setDashboardState] = useState<"loading" | "live" | "fallback">("loading");
  const [selectedOrderStatus, setSelectedOrderStatus] = useState<string>("ALL");
  const [selectedQueueStatus, setSelectedQueueStatus] = useState<string>("ALL");

  useEffect(() => {
    let active = true;
    setDashboardState("loading");
    fetchAdminDashboard(selectedPeriod)
      .then((data) => {
        if (!active) return;
        setDashboard(data);
        setDashboardState("live");
      })
      .catch(() => {
        if (!active) return;
        setDashboardState("fallback");
      });

    return () => {
      active = false;
    };
  }, [selectedPeriod]);

  const selectedAdmin = adminUsers.find((admin) => admin.id === selectedAdminId) ?? adminUsers[0];

  useEffect(() => {
    setSelectedSection(defaultSectionForAdmin(selectedAdmin));
  }, [selectedAdmin]);

  useEffect(() => {
    setSelectedOrderStatus("ALL");
    setSelectedQueueStatus("ALL");
  }, [selectedPeriod]);

  const kpis = dashboard?.kpis ?? baseKpis.slice(0, 4);
  const liveCheckoutRecords = dashboard?.recentTransactions ?? checkoutRecords;
  const liveKycAuditRecords = dashboard?.kycAuditRecords ?? kycAuditRecords;
  const liveOrderStatuses = dashboard?.orderStatuses ?? [];
  const liveTxVolumeData = dashboard?.txVolumeData ?? txVolumeData;
  const liveKycPieData = dashboard?.kycPieData ?? kycPieData;
  const liveKycTrendData = dashboard?.kycTrendData ?? kycTrendData;
  const liveRevenueTrendData = dashboard?.revenueTrendData ?? revenueTrendData;
  const livePartnerPerformanceData = dashboard?.partnerPerformanceData ?? partnerPerformanceData;
  const totalOrders = liveOrderStatuses.reduce((sum, item) => sum + item.count, 0);
  const totalOrderValue = liveOrderStatuses.reduce((sum, item) => sum + item.amount, 0);
  const dataStatusLabel =
    dashboardState === "live" ? "Live pondo_core data" : dashboardState === "fallback" ? "Fallback demo snapshot" : "Loading live data";
  const periodCaption = formatWindowCaption(dashboard, selectedPeriod);

  const visibleCheckoutRecords = useMemo(
    () => liveCheckoutRecords.filter((item) => selectedOrderStatus === "ALL" || item.status === selectedOrderStatus),
    [liveCheckoutRecords, selectedOrderStatus],
  );

  const visibleQueueItems = useMemo(
    () =>
      (dashboard?.manualReviewQueue ?? []).filter((item) =>
        selectedQueueStatus === "ALL" ? true : item.status.toUpperCase() === selectedQueueStatus,
      ),
    [dashboard?.manualReviewQueue, selectedQueueStatus],
  );

  const renderControlBar = () => (
    <section className="admin-panel rounded-[28px] p-5 text-white">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-pondo-sky-300">Reporting Controls</div>
          <h2 className="mt-2 text-2xl font-bold text-white">
            {selectedAdmin.role === "analyst" ? "Analyst workload view" : "Super Admin reporting view"}
          </h2>
          <p className="mt-2 text-sm leading-7 text-pondo-text-secondary">
            Period-aware reporting from `pondo_core`, aligned to the checkout, risk, settlement, and manual-review journey.
          </p>
        </div>

        <div className="flex flex-col gap-3 xl:items-end">
          <div className="flex flex-wrap gap-2">
            {[
              { id: "today" as AdminDashboardPeriod, label: "Today" },
              { id: "this_week" as AdminDashboardPeriod, label: "This Week" },
              { id: "this_month" as AdminDashboardPeriod, label: "This Month" },
              { id: "last_month" as AdminDashboardPeriod, label: "Last Month" },
            ].map((period) => {
              const active = selectedPeriod === period.id;
              return (
                <button
                  key={period.id}
                  type="button"
                  onClick={() => setSelectedPeriod(period.id)}
                  className={[
                    "rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] transition",
                    active
                      ? "border-[#f5b642] bg-[linear-gradient(135deg,#ea6a3f,#d64534)] text-white"
                      : "border-[rgba(157,194,242,0.14)] bg-white/5 text-pondo-text-secondary hover:bg-white/8 hover:text-white",
                  ].join(" ")}
                >
                  {period.label}
                </button>
              );
            })}
          </div>
          <div className="text-right text-sm text-pondo-text-secondary">{periodCaption}</div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        <div className="rounded-[22px] border border-[rgba(157,194,242,0.12)] bg-white/4 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-pondo-sky-300">Current Access</div>
          <div className="mt-2 text-xl font-bold text-white">{selectedAdmin.name}</div>
          <div className="mt-1 text-sm text-pondo-text-secondary">{selectedAdmin.subtitle} | {selectedAdmin.email}</div>
        </div>
        <div className="rounded-[22px] border border-emerald-400/18 bg-emerald-400/10 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-200">Daily Refresh Outlook</div>
          <div className="mt-2 text-xl font-bold text-white">{dashboard?.automation.refreshCadence ?? "Daily"}</div>
          <div className="mt-1 text-sm text-emerald-100/80">{dashboard?.automation.refreshAnchor ?? "06:00 Africa/Johannesburg"}</div>
        </div>
        <div className="rounded-[22px] border border-amber-400/18 bg-amber-400/10 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-200">Triggered Analyst Reports</div>
          <div className="mt-2 text-sm leading-7 text-amber-100/85">
            {selectedAdmin.role === "analyst"
              ? dashboard?.automation.analystDigestSuggestion ?? "07:00 analyst queue digest"
              : dashboard?.automation.superAdminDigestSuggestion ?? "06:30 Super Admin executive summary"}
          </div>
        </div>
      </div>
    </section>
  );

  const renderOverview = () => (
    <section className="space-y-8">
      <div className="admin-panel rounded-[34px] px-6 py-7 text-white sm:px-8 sm:py-8">
        <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-4xl">
            <div className="text-[11px] font-semibold uppercase tracking-[0.34em] text-pondo-sky-300">
              PONDO Trust Commerce | Overview KPI Command Centre
            </div>
            <h1 className="admin-display mt-4 text-5xl font-semibold leading-none sm:text-6xl">
              Real transaction oversight from the `pondo_core` operational schema.
            </h1>
            <p className="mt-4 max-w-3xl text-lg leading-8 text-pondo-text-secondary">
              This section is focused on topline commercial health, settlement movement, KYC clearance, and review pressure
              across the live operational dataset.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[520px]">
            <div className="rounded-[24px] border border-[rgba(157,194,242,0.14)] bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.24em] text-pondo-sky-300">Signed In As</div>
              <div className="mt-3 text-2xl font-bold text-white">{selectedAdmin.name}</div>
              <div className="mt-1 text-sm text-pondo-text-secondary">{selectedAdmin.subtitle}</div>
              <div className="mt-2 text-xs uppercase tracking-[0.18em] text-pondo-sky-300">
                {selectedAdmin.role === "super_admin" ? "Super Admin reporting owner" : "Analyst review operations"}
              </div>
            </div>
            <div className="rounded-[24px] border border-emerald-400/20 bg-emerald-400/10 p-4">
              <div className="text-xs uppercase tracking-[0.24em] text-emerald-200">Access Mode</div>
              <div className="mt-3 text-2xl font-bold text-white">No Password Demo</div>
              <div className="mt-1 text-sm text-emerald-100/80">User drop-down only for admin and analyst access</div>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <span className="admin-pill rounded-full px-4 py-2 text-sm font-semibold">Overview KPI cards</span>
          <span className="admin-pill rounded-full px-4 py-2 text-sm font-semibold">Live settlement and review health</span>
          <span className="admin-pill rounded-full px-4 py-2 text-sm font-semibold">Charts backed by live processed transactions</span>
          <span className="admin-pill rounded-full px-4 py-2 text-sm font-semibold">{dashboard?.window.label ?? "This Month"} vs {dashboard?.window.compareLabel ?? "Last Month"}</span>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/PondoDemo/checkout"
            className="rounded-full bg-[linear-gradient(135deg,var(--pondo-orange-400),var(--pondo-orange-500))] px-5 py-3 text-sm font-bold text-white shadow-[0_14px_24px_rgba(214,69,52,0.24)] transition hover:brightness-110"
          >
            Open Checkout Demo
          </Link>
          <span className="rounded-full border border-[rgba(157,194,242,0.18)] bg-white/5 px-5 py-3 text-sm font-bold text-white">
            {dataStatusLabel} | {formatGeneratedAt(dashboard?.generatedAt)}
          </span>
        </div>
      </div>

      <KPICards metrics={kpis} />

      <div className="grid gap-8 xl:grid-cols-[2fr_1fr]">
        <TxVolumeChart data={liveTxVolumeData} />
        <KYCPieChart data={liveKycPieData} />
      </div>

      <div className="grid gap-8 xl:grid-cols-2">
        <RevenueTrendChart
          data={liveRevenueTrendData}
          currentLabel={dashboard?.window.label ?? "This Month"}
          comparisonLabel={dashboard?.window.compareLabel ?? "Last Month"}
        />
        <PartnerPerfChart data={livePartnerPerformanceData} />
      </div>
    </section>
  );

  const renderCheckouts = () => (
    <section className="space-y-8">
      <div className="admin-panel rounded-[30px] p-6 text-white">
        <SectionHeader
          eyebrow="Checkout Transactions"
          title="Checkout operations by real transaction status"
          description="When Checkout Transactions is selected, this page isolates payment pipeline, order status, settlement readiness, and operational transaction visibility only."
          badge={dataStatusLabel}
        />

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <StatCard label="Total Orders" value={totalOrders.toLocaleString("en-ZA")} hint="All orders in current result set" />
          <StatCard label="Order Value" value={`R ${totalOrderValue.toLocaleString("en-ZA")}`} hint="Aggregate order value by status" />
          <StatCard
            label="Visible Transactions"
            value={visibleCheckoutRecords.length.toLocaleString("en-ZA")}
            hint={selectedOrderStatus === "ALL" ? "All dashboard statuses" : `${selectedOrderStatus.replaceAll("_", " ")} only`}
          />
          <StatCard
            label="Generated At"
            value={dashboard?.generatedAt ? new Date(dashboard.generatedAt).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false }) : "--:--"}
            hint="Latest API refresh"
          />
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[{ status: "ALL", count: totalOrders, amount: totalOrderValue }, ...liveOrderStatuses.map((item) => ({ status: item.status.toUpperCase(), count: item.count, amount: item.amount }))].map((item) => {
            const active = selectedOrderStatus === item.status;
            return (
              <button
                key={item.status}
                onClick={() => setSelectedOrderStatus(item.status)}
                className={[
                  "rounded-[24px] border p-4 text-left transition",
                  active
                    ? "border-[rgba(245,182,66,0.45)] bg-[linear-gradient(135deg,rgba(214,69,52,0.22),rgba(78,125,200,0.18))] shadow-[0_18px_30px_rgba(3,10,24,0.22)]"
                    : "border-[rgba(157,194,242,0.12)] bg-white/4 hover:bg-white/7",
                ].join(" ")}
              >
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-pondo-sky-300">{item.status.replaceAll("_", " ")}</div>
                <div className="mt-3 text-3xl font-black text-white">{item.count.toLocaleString("en-ZA")}</div>
                <div className="mt-2 text-sm text-pondo-text-secondary">Value R {item.amount.toLocaleString("en-ZA")}</div>
              </button>
            );
          })}
        </div>
      </div>

      <CheckoutTable records={visibleCheckoutRecords} />
      <TxVolumeChart data={liveTxVolumeData} />
    </section>
  );

  const renderManualReview = () => (
    <section className="space-y-8">
      <div className="admin-panel rounded-[30px] p-6 text-white">
        <SectionHeader
          eyebrow="Manual Review Queue"
          title="Analyst queue and case backlog"
          description="This page isolates manual review workload only, so the analyst can focus on open, assigned, and resolved case pressure without checkout noise."
          badge={`Updated ${formatGeneratedAt(dashboard?.generatedAt)}`}
        />

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <StatCard label="Open" value={(dashboard?.manualReview.open ?? 0).toLocaleString("en-ZA")} hint="Cases waiting for analyst attention" />
          <StatCard label="Assigned" value={(dashboard?.manualReview.assigned ?? 0).toLocaleString("en-ZA")} hint="Cases actively owned by an analyst" />
          <StatCard label="Resolved" value={(dashboard?.manualReview.resolved ?? 0).toLocaleString("en-ZA")} hint="Approved, declined, or cancelled" />
          <StatCard
            label="Latest Backlog"
            value={dashboard?.manualReview.latestOpenedAt ? new Date(dashboard.manualReview.latestOpenedAt).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false }) : "--:--"}
            hint="Most recent open queue case"
          />
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {["ALL", "OPEN", "ASSIGNED"].map((status) => {
            const active = selectedQueueStatus === status;
            return (
              <button
                key={status}
                onClick={() => setSelectedQueueStatus(status)}
                className={[
                  "rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] transition",
                  active
                    ? "border-[#f5b642] bg-[linear-gradient(135deg,#ea6a3f,#d64534)] text-white"
                    : "border-[rgba(157,194,242,0.14)] bg-white/5 text-pondo-text-secondary hover:bg-white/8 hover:text-white",
                ].join(" ")}
              >
                {status}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4">
        {visibleQueueItems.length > 0 ? (
          visibleQueueItems.map((item) => (
            <article key={item.id} className="admin-panel rounded-[26px] p-5 text-white">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-pondo-sky-300">
                    {item.id} | {item.queue} | {item.status.toUpperCase()}
                  </div>
                  <h2 className="mt-2 text-2xl font-bold text-white">{item.customer}</h2>
                  <p className="mt-2 text-sm leading-7 text-pondo-text-secondary">{item.reason}</p>
                </div>
                <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-right">
                  <div className="text-xs uppercase tracking-[0.2em] text-amber-200">Basket Value</div>
                  <div className="mt-2 text-2xl font-black text-white">R {item.amount.toLocaleString("en-ZA")}</div>
                  <div className="mt-1 text-sm text-amber-100/80">{item.product}</div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-3 text-sm text-pondo-text-secondary">
                <span className="rounded-full border border-[rgba(157,194,242,0.12)] bg-white/4 px-3 py-2">Decision: {item.riskDecision}</span>
                <span className="rounded-full border border-[rgba(157,194,242,0.12)] bg-white/4 px-3 py-2">
                  Opened: {new Date(item.openedAt).toLocaleString("en-ZA", { hour12: false })}
                </span>
              </div>
            </article>
          ))
        ) : (
          <div className="admin-panel rounded-[26px] p-6 text-sm text-pondo-text-secondary">No manual review cases match the current filter.</div>
        )}
      </div>
    </section>
  );

  const renderRisk = () => (
    <section className="space-y-8">
      <div className="admin-panel rounded-[30px] p-6 text-white">
        <SectionHeader
          eyebrow="Risk / KYC / Vetting"
          title="Compliance and verification visibility"
          description="This page isolates risk scoring, ITC status, KYC state, fraud vetting, and review outcomes for compliance and operational analysts."
          badge="Backed by risk_assessments, credit_checks, kyc_checks, fraud_checks"
        />

        <div className="mt-6 grid gap-8 xl:grid-cols-[2fr_1fr]">
          <KYCTrendChart data={liveKycTrendData} />
          <KYCPieChart data={liveKycPieData} />
        </div>
      </div>

      <KYCPanel records={liveKycAuditRecords} />
    </section>
  );

  const renderPowerBi = () => (
    <section className="space-y-8">
      <div className="admin-panel rounded-[30px] p-6 text-white">
        <SectionHeader
          eyebrow="Power BI Extracts"
          title="SQL report pack aligned to the admin dashboard"
          description="This page maps the dashboard sections to the SQL scripts in `api/db/admin_reports` so operations and BI can work off the same `pondo_core` transaction model."
          badge="Reporting pack ready for DBeaver / Power BI"
        />

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {powerBiReports.map((report) => (
            <article key={report.id} className="rounded-[24px] border border-[rgba(157,194,242,0.12)] bg-white/4 p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-pondo-sky-300">{report.file}</div>
              <h2 className="mt-3 text-2xl font-bold text-white">{report.title}</h2>
              <div className="mt-3 text-sm text-pondo-text-secondary">Grain: {report.grain}</div>
              <p className="mt-3 text-sm leading-7 text-pondo-text-secondary">{report.purpose}</p>
            </article>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Schema Focus" value="pondo_core" hint="Real transaction, risk, payment, and review tables" />
        <StatCard label="Reporting Scope" value="5 packs" hint="Overview, checkout, queue, risk, wide extracts" />
        <StatCard label="Last Admin API Refresh" value={formatGeneratedAt(dashboard?.generatedAt)} hint="Dashboard source aligned to operational data" />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Vercel Target" value="Always available" hint="Server-rendered admin surface with daily refresh support" />
        <StatCard label="Daily Refresh" value={dashboard?.automation.refreshAnchor ?? "06:00 SAST"} hint={dashboard?.automation.refreshCadence ?? "Daily reporting cadence"} />
        <StatCard label="Analyst Trigger" value="Queue Digest" hint={dashboard?.automation.analystDigestSuggestion ?? "Open and ageing review summary"} />
      </div>
    </section>
  );

  const renderedSection =
    selectedSection === "overview_kpis"
      ? renderOverview()
      : selectedSection === "checkout_transactions"
        ? renderCheckouts()
        : selectedSection === "manual_review_queue"
          ? renderManualReview()
          : selectedSection === "risk_kyc_vetting"
            ? renderRisk()
            : renderPowerBi();

  return (
    <AdminShell
      admin={selectedAdmin}
      admins={adminUsers}
      onSelectAdmin={setSelectedAdminId}
      activeSection={selectedSection}
      onSelectSection={setSelectedSection}
    >
      <div className="space-y-8">
        {renderControlBar()}
        {renderedSection}
      </div>
    </AdminShell>
  );
}
