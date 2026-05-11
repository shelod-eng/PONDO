import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/server/apiErrors";
import { getAdminDashboard } from "@/server/pondo/service";
import type { AdminDashboardPeriod } from "@/types/admin";

export const runtime = "nodejs";

const validPeriods: AdminDashboardPeriod[] = ["today", "this_week", "this_month", "last_month"];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedPeriod = searchParams.get("period");
    const period: AdminDashboardPeriod = validPeriods.includes(requestedPeriod as AdminDashboardPeriod)
      ? (requestedPeriod as AdminDashboardPeriod)
      : "this_month";
    return NextResponse.json(await getAdminDashboard({ period }));
  } catch (error) {
    return apiErrorResponse(error, "admin_dashboard_failed");
  }
}
