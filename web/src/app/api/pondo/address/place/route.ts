import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, invalidRequest } from "@/server/apiErrors";
import { getPlaceAddress, isGoogleMapsConfigured } from "@/server/googleMaps";

export const runtime = "nodejs";

const schema = z.object({
  placeId: z.string().trim().min(4),
  sessionToken: z.string().trim().min(8).max(120).optional(),
});

export async function POST(req: NextRequest) {
  if (!isGoogleMapsConfigured()) {
    return apiErrorResponse(new Error("google_maps_not_configured"), "address_place_lookup_failed");
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return invalidRequest(parsed.error);

  try {
    const place = await getPlaceAddress(parsed.data.placeId, parsed.data.sessionToken);
    return NextResponse.json({ place });
  } catch (error) {
    return apiErrorResponse(error, "address_place_lookup_failed");
  }
}
