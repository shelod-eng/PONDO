import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, invalidRequest } from "@/server/apiErrors";
import { bootstrapPartnerSession } from "@/server/pondo/service";

export const runtime = "nodejs";

const schema = z.object({
  partner: z.enum(["amazon", "temu", "takealot", "woocommerce", "shopify"]),
  email: z.string().email(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return invalidRequest(parsed.error);
  try {
    const session = await bootstrapPartnerSession(parsed.data.partner, parsed.data.email);
    return NextResponse.json({ session });
  } catch (error) {
    return apiErrorResponse(error, "fetch_cart_failed");
  }
}
