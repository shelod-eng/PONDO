import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { simulateCredit } from "@/server/pondo/service";

export const runtime = "nodejs";

const schema = z.object({
  saId: z.string().min(13).max(13),
  bureau: z.enum(["transunion", "experian"]),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 400 });
  return NextResponse.json({ result: simulateCredit(parsed.data.saId, parsed.data.bureau) });
}
