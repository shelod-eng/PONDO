import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, invalidRequest } from "@/server/apiErrors";
import { verifyOtpRequest } from "@/server/pondo/service";

export const runtime = "nodejs";

const schema = z.object({
  requestId: z.string().min(6),
  code: z.string().min(3),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return invalidRequest(parsed.error);
  try {
    const out = await verifyOtpRequest(parsed.data.requestId, parsed.data.code);
    return NextResponse.json(out);
  } catch (error) {
    return apiErrorResponse(error, "otp_verify_failed");
  }
}
