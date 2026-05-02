import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyOtpRequest } from "@/server/pondo/service";

export const runtime = "nodejs";

const schema = z.object({
  requestId: z.string().min(6),
  code: z.string().min(3),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 400 });
  try {
    const out = await verifyOtpRequest(parsed.data.requestId, parsed.data.code);
    return NextResponse.json(out);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "otp_verify_failed" }, { status: 400 });
  }
}
