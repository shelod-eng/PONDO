import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, invalidRequest } from "@/server/apiErrors";
import { confirmCheckoutDetails } from "@/server/pondo/service";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1),
  idNumber: z.string().min(13).max(13),
  phone: z.string().min(5),
  address: z.string().min(1),
  city: z.string().trim().optional().default(""),
  province: z.string().trim().optional().default(""),
  postalCode: z.string().trim().optional().default(""),
  geoLocation: z.string().trim().optional().default(""),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  tapToPayConfirmed: z.boolean(),
  termsAccepted: z.literal(true),
});

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return invalidRequest(parsed.error);
  const { id } = await context.params;
  try {
    const out = await confirmCheckoutDetails({ sessionId: id, ...parsed.data });
    return NextResponse.json(out);
  } catch (error) {
    return apiErrorResponse(error, "confirm_details_failed");
  }
}
