import { readFile } from "fs/promises";
import path from "path";
import type { AdminDashboardPeriod } from "@/types/admin";
import { getAdminDashboard } from "./service";

type ReportCadence = "daily" | "weekly" | "monthly";

type ReportPack = {
  title: string;
  period: AdminDashboardPeriod;
  recipientLabel: string;
  subjectPrefix: string;
  scripts: string[];
  dashboardPath: string;
};

type EmailAttachment = {
  filename: string;
  content: string;
  contentType: string;
};

const reportPacks: Record<ReportCadence, ReportPack> = {
  daily: {
    title: "Daily Admin Operations Report",
    period: "today",
    recipientLabel: "Admin and analyst morning summary",
    subjectPrefix: "Daily Admin Report",
    scripts: [
      "01_overview_kpis.sql",
      "02_checkout_transactions.sql",
      "03_manual_review_queue.sql",
      "04_risk_kyc_vetting.sql",
      "05_settlement_reconciliation.sql",
    ],
    dashboardPath: "/PondoAdmin?period=today",
  },
  weekly: {
    title: "Weekly Analyst and Operations Report",
    period: "this_week",
    recipientLabel: "Weekly analyst workload and operational trends",
    subjectPrefix: "Weekly Analyst Report",
    scripts: [
      "01_overview_kpis.sql",
      "03_manual_review_queue.sql",
      "04_risk_kyc_vetting.sql",
      "06_fulfilment_operations.sql",
      "07_partner_performance.sql",
    ],
    dashboardPath: "/PondoAdmin?period=this_week",
  },
  monthly: {
    title: "Monthly Executive Admin Report",
    period: "this_month",
    recipientLabel: "Monthly finance, settlement, and BI review",
    subjectPrefix: "Monthly Admin Report",
    scripts: [
      "01_overview_kpis.sql",
      "05_settlement_reconciliation.sql",
      "07_partner_performance.sql",
      "08_powerbi_extracts.sql",
    ],
    dashboardPath: "/PondoAdmin?period=this_month",
  },
};

function getRecipients() {
  return String(process.env.ADMIN_REPORT_RECIPIENTS || "admin@pondo-pay.online")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name.toLowerCase()}_missing`);
  return value;
}

function getDashboardUrl(pathname: string) {
  const baseUrl = process.env.PONDO_ADMIN_BASE_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || "";
  if (!baseUrl) return null;
  return `${baseUrl.replace(/\/$/, "")}${pathname}`;
}

function formatMoney(amount: string) {
  return amount;
}

function formatMetricList(items: Array<{ label: string; value: string; hint: string }>) {
  return items
    .map(
      (item) => `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-weight:600;color:#0f172a;">${item.label}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#111827;">${item.value}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#475569;">${item.hint}</td>
        </tr>`,
    )
    .join("");
}

async function loadSqlAttachments(files: string[]): Promise<EmailAttachment[]> {
  const root = path.join(process.cwd(), "api", "db", "admin_reports");
  const attachments: EmailAttachment[] = [];

  for (const file of files) {
    const content = await readFile(path.join(root, file), "utf8");
    attachments.push({
      filename: file,
      content: Buffer.from(content, "utf8").toString("base64"),
      contentType: "text/sql; charset=utf-8",
    });
  }

  return attachments;
}

async function sendEmail(input: {
  to: string[];
  subject: string;
  html: string;
  attachments: EmailAttachment[];
}) {
  const apiKey = requireEnv("RESEND_API_KEY");
  const from = requireEnv("RESEND_FROM_EMAIL");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      attachments: input.attachments,
    }),
  });

  if (!response.ok) {
    throw new Error(`report_email_failed_${response.status}`);
  }

  return response.json();
}

export function assertCronAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) throw new Error("cron_secret_missing");
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    throw new Error("invalid_cron_secret");
  }
}

export async function sendScheduledAdminReport(cadence: ReportCadence) {
  const pack = reportPacks[cadence];
  const dashboard = await getAdminDashboard({ period: pack.period });
  const recipients = getRecipients();
  const dashboardUrl = getDashboardUrl(pack.dashboardPath);
  const attachments = await loadSqlAttachments(pack.scripts);
  const subject = `${pack.subjectPrefix} | ${dashboard.window.label} | ${new Date(dashboard.generatedAt).toLocaleDateString("en-ZA")}`;

  const html = `
    <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px;color:#0f172a;">
      <div style="max-width:900px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
        <div style="padding:24px 28px;background:linear-gradient(135deg,#102743,#1d4f91);color:#ffffff;">
          <div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;opacity:0.84;">PONDO Admin Reporting</div>
          <h1 style="margin:12px 0 8px;font-size:30px;line-height:1.2;">${pack.title}</h1>
          <p style="margin:0;font-size:15px;line-height:1.7;opacity:0.92;">${pack.recipientLabel}. This summary is built from the live PONDO operational dataset for ${dashboard.window.label.toLowerCase()}.</p>
        </div>
        <div style="padding:24px 28px;">
          <p style="margin:0 0 16px;color:#334155;"><strong>Reporting window:</strong> ${dashboard.window.label} | ${new Date(dashboard.window.dateFrom).toLocaleString("en-ZA")} to ${new Date(dashboard.window.dateTo).toLocaleString("en-ZA")}</p>
          <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
            <thead>
              <tr>
                <th style="text-align:left;padding:10px 12px;background:#eff6ff;color:#1d4f91;">Metric</th>
                <th style="text-align:left;padding:10px 12px;background:#eff6ff;color:#1d4f91;">Value</th>
                <th style="text-align:left;padding:10px 12px;background:#eff6ff;color:#1d4f91;">Context</th>
              </tr>
            </thead>
            <tbody>
              ${formatMetricList(dashboard.kpis)}
            </tbody>
          </table>
          <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-bottom:18px;">
            <div style="padding:16px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;">
              <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#1d4f91;">Settlement Snapshot</div>
              <div style="margin-top:10px;color:#334155;line-height:1.7;">
                Settled Net: <strong>${formatMoney(dashboard.kpis[0]?.value || "R 0")}</strong><br />
                Reconciled Gross: <strong>R ${dashboard.settlement.reconciledGross.toLocaleString("en-ZA")}</strong><br />
                Pending Pipeline: <strong>R ${dashboard.settlement.pendingGross.toLocaleString("en-ZA")}</strong>
              </div>
            </div>
            <div style="padding:16px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;">
              <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#1d4f91;">Analyst Queue</div>
              <div style="margin-top:10px;color:#334155;line-height:1.7;">
                Open: <strong>${dashboard.manualReview.open.toLocaleString("en-ZA")}</strong><br />
                Assigned: <strong>${dashboard.manualReview.assigned.toLocaleString("en-ZA")}</strong><br />
                Resolved: <strong>${dashboard.manualReview.resolved.toLocaleString("en-ZA")}</strong>
              </div>
            </div>
          </div>
          <div style="padding:16px;border:1px solid #e2e8f0;border-radius:12px;background:#fff7ed;margin-bottom:18px;">
            <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#c2410c;">SQL Report Pack Attached</div>
            <p style="margin:10px 0 0;color:#7c2d12;line-height:1.7;">The attached SQL files are the source pack aligned to this cadence: ${pack.scripts.join(", ")}.</p>
          </div>
          ${
            dashboardUrl
              ? `<p style="margin:0;color:#334155;">Open the interactive dashboard: <a href="${dashboardUrl}" style="color:#1d4f91;">${dashboardUrl}</a></p>`
              : `<p style="margin:0;color:#64748b;">Set \`PONDO_ADMIN_BASE_URL\` in Vercel to include a direct dashboard link in future report emails.</p>`
          }
        </div>
      </div>
    </div>`;

  const emailResult = await sendEmail({
    to: recipients,
    subject,
    html,
    attachments,
  });

  return {
    cadence,
    recipients,
    subject,
    attachedScripts: pack.scripts,
    dashboardWindow: dashboard.window,
    emailResult,
  };
}
