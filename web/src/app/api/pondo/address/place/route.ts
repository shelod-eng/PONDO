import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPlaceAddress, isGoogleMapsConfigured } from "@/server/googleMaps";

export const runtime = "nodejs";

const schema = z.object({
  placeId: z.string().trim().min(4),
  sessionToken: z.string().trim().min(8).max(120).optional(),
});

export async function POST(req: NextRequest) {
  if (!isGoogleMapsConfigured()) {
    return NextResponse.json({ error: "google_maps_not_configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 400 });

  try {
    const place = await getPlaceAddress(parsed.data.placeId, parsed.data.sessionToken);
    return NextResponse.json({ place });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "address_place_lookup_failed" }, { status: 400 });
  }
}
