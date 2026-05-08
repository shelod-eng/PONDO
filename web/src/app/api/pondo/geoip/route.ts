import { NextRequest, NextResponse } from "next/server";
import { extractClientIp, lookupIpGeo } from "@/server/pondo/risk";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const ip = extractClientIp(req);
    const geo = await lookupIpGeo(ip);
    return NextResponse.json({ geo: { ip, ...geo } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "geoip_lookup_failed" }, { status: 400 });
  }
}
