import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
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
  if (!parsed.success) return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 400 });
  try {
    const out = await createOtpRequest(parsed.data.sessionId, parsed.data.channel, parsed.data.destination);
    return NextResponse.json(out);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "otp_send_failed" }, { status: 400 });
  }
}
