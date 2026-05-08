import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, invalidRequest } from "@/server/apiErrors";
import { isGoogleMapsConfigured, validateAddress } from "@/server/googleMaps";

export const runtime = "nodejs";

const schema = z.object({
  address: z.string().trim().min(5).max(280),
  sessionToken: z.string().trim().min(8).max(120).optional(),
});

export async function POST(req: NextRequest) {
  if (!isGoogleMapsConfigured()) {
    return apiErrorResponse(new Error("google_maps_not_configured"), "address_validation_failed");
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return invalidRequest(parsed.error);

  try {
    const validation = await validateAddress(parsed.data.address, parsed.data.sessionToken);
    return NextResponse.json({ validation });
  } catch (error) {
    return apiErrorResponse(error, "address_validation_failed");
  }
}
