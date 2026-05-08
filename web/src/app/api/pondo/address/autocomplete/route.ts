import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, invalidRequest } from "@/server/apiErrors";
import { autocompleteAddress, isGoogleMapsConfigured } from "@/server/googleMaps";

export const runtime = "nodejs";

const schema = z.object({
  input: z.string().trim().min(3).max(200),
  sessionToken: z.string().trim().min(8).max(120).optional(),
});

export async function POST(req: NextRequest) {
  if (!isGoogleMapsConfigured()) {
    return apiErrorResponse(new Error("google_maps_not_configured"), "address_autocomplete_failed");
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return invalidRequest(parsed.error);

  try {
    const suggestions = await autocompleteAddress(parsed.data.input, parsed.data.sessionToken);
    return NextResponse.json({ suggestions });
  } catch (error) {
    return apiErrorResponse(error, "address_autocomplete_failed");
  }
}
