import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, invalidRequest } from "@/server/apiErrors";
import { createOtpRequest } from "@/server/pondo/service";

export const runtime = "nodejs";

const schema = z.object({
  sessionId: z.string().min(4),
  channel: z.enum(["sms", "email"]),
  destination: z.string().min(4),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return invalidRequest(parsed.error);
  try {
    const out = await createOtpRequest(parsed.data.sessionId, parsed.data.channel, parsed.data.destination);
    return NextResponse.json(out);
  } catch (error) {
    return apiErrorResponse(error, "otp_send_failed");
  }
}
