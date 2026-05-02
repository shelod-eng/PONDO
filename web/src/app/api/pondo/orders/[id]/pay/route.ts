import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/pondo/auth";
import { settleOrder } from "@/server/pondo/service";

export const runtime = "nodejs";

const schema = z.object({
  paymentMethod: z.enum(["card", "card_3ds", "debit_card", "eft", "payfast", "bnpl", "speedpoint", "ussd", "evoucher_wallet"]),
  settlementBank: z.enum(["absa", "fnb", "standard_bank"]).optional(),
  notifyEmail: z.string().email().optional(),
  notifyChannels: z.array(z.enum(["sms", "email"])).optional(),
});

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireUser(req, ["customer", "sponsor"]);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 400 });
  const { id } = await context.params;
  try {
    const out = await settleOrder({ actor: auth.user.sub, id, ...parsed.data });
    return NextResponse.json(out);
  } catch (error) {
    const message = error instanceof Error ? error.message : "payment_failed";
    return NextResponse.json({ error: message }, { status: message === "payment_declined" ? 402 : 400 });
  }
}
