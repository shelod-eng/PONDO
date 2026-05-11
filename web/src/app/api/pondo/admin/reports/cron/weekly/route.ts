import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/server/apiErrors";
import { assertCronAuthorized, sendScheduledAdminReport } from "@/server/pondo/adminReports";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    assertCronAuthorized(request);
    return NextResponse.json(await sendScheduledAdminReport("weekly"));
  } catch (error) {
    return apiErrorResponse(error, "admin_weekly_report_failed");
  }
}
