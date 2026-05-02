import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/server/pondo/auth";
import { sponsorSummary } from "@/server/pondo/service";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = requireUser(req, ["sponsor"]);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: 401 });
  return NextResponse.json(await sponsorSummary());
}
