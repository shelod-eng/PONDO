import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/server/apiErrors";
import { getAdminReportHistory } from "@/server/pondo/adminReportHistory";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(20, Math.max(1, Number(searchParams.get("limit") || 8)));
    return NextResponse.json({ items: await getAdminReportHistory(limit) });
  } catch (error) {
    return apiErrorResponse(error, "admin_report_history_failed");
  }
}
