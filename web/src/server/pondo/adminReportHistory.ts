import type { AdminDashboardPeriod, AdminReportRun } from "@/types/admin";
import { getPool } from "./db";

export async function ensureAdminReportHistoryTable() {
  await getPool().query(`
    create schema if not exists pondo_core;
    create table if not exists pondo_core.admin_report_runs (
      id bigserial primary key,
      cadence text not null,
      period text not null,
      subject text not null,
      recipients text[] not null default '{}',
      status text not null,
      dashboard_label text not null,
      dashboard_url text null,
      error_message text null,
      created_at timestamptz not null default now(),
      completed_at timestamptz null
    )
  `);
}

export async function createReportRun(input: {
  cadence: "daily" | "weekly" | "monthly";
  period: AdminDashboardPeriod;
  subject: string;
  recipients: string[];
  dashboardLabel: string;
  dashboardUrl: string | null;
}) {
  await ensureAdminReportHistoryTable();
  const row = await getPool().query<{ id: string | number }>(
    `insert into pondo_core.admin_report_runs
      (cadence, period, subject, recipients, status, dashboard_label, dashboard_url)
     values ($1,$2,$3,$4,'queued',$5,$6)
     returning id`,
    [input.cadence, input.period, input.subject, input.recipients, input.dashboardLabel, input.dashboardUrl],
  );
  return String(row.rows[0]?.id || "");
}

export async function finishReportRun(id: string, input: { status: "sent" | "failed"; errorMessage?: string | null }) {
  await ensureAdminReportHistoryTable();
  await getPool().query(
    `update pondo_core.admin_report_runs
     set status = $2,
         error_message = $3,
         completed_at = now()
     where id = $1`,
    [id, input.status, input.errorMessage || null],
  );
}

export async function getAdminReportHistory(limit = 8): Promise<AdminReportRun[]> {
  await ensureAdminReportHistoryTable();
  const result = await getPool().query<{
    id: string | number;
    cadence: "daily" | "weekly" | "monthly";
    period: AdminDashboardPeriod;
    subject: string;
    recipients: string[];
    status: "queued" | "sent" | "failed";
    dashboard_label: string;
    dashboard_url: string | null;
    created_at: string;
    completed_at: string | null;
    error_message: string | null;
  }>(
    `select id, cadence, period, subject, recipients, status, dashboard_label, dashboard_url, created_at, completed_at, error_message
     from pondo_core.admin_report_runs
     order by created_at desc
     limit $1`,
    [limit],
  );

  return result.rows.map((row) => ({
    id: String(row.id),
    cadence: row.cadence,
    period: row.period,
    subject: row.subject,
    recipients: row.recipients || [],
    status: row.status,
    dashboardLabel: row.dashboard_label,
    dashboardUrl: row.dashboard_url,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    errorMessage: row.error_message,
  }));
}
