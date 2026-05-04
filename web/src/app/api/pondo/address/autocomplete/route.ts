import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { autocompleteAddress, isGoogleMapsConfigured } from "@/server/googleMaps";

export const runtime = "nodejs";

const schema = z.object({
  input: z.string().trim().min(3).max(200),
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
    const suggestions = await autocompleteAddress(parsed.data.input, parsed.data.sessionToken);
    return NextResponse.json({ suggestions });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "address_autocomplete_failed" }, { status: 400 });
  }
}
