import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/pondo/auth";
import { extractClientIp } from "@/server/pondo/risk";
import { createOrder } from "@/server/pondo/service";

export const runtime = "nodejs";

const schema = z.object({
  customerId: z.string().min(1),
  sessionId: z.string().min(4).optional(),
  items: z.array(z.object({ productId: z.string().min(1), qty: z.number().int().positive() })).min(1),
  delivery: z.object({
    fullName: z.string().min(1),
    phone: z.string().min(5),
    address1: z.string().min(1),
    city: z.string().trim().optional().default(""),
    province: z.string().trim().optional().default(""),
    postalCode: z.string().trim().optional().default(""),
    deliveryDate: z.string().trim().optional(),
    deliveryWindow: z.string().trim().optional(),
  }),
  paymentMethod: z.enum(["card", "card_3ds", "debit_card", "eft", "payfast", "bnpl", "speedpoint", "ussd", "evoucher_wallet"]),
  riskContext: z.object({
    idNumber: z.string().trim().optional(),
    deviceFingerprint: z.string().trim().optional(),
    clientGeo: z.object({
      ip: z.string().trim().optional(),
      city: z.string().trim().optional(),
      province: z.string().trim().optional(),
      country: z.string().trim().optional(),
      postalCode: z.string().trim().optional(),
      latitude: z.number().nullable().optional(),
      longitude: z.number().nullable().optional(),
      source: z.string().trim().optional(),
    }).optional(),
    validatedAddress: z.object({
      city: z.string().trim().optional(),
      province: z.string().trim().optional(),
      postalCode: z.string().trim().optional(),
      latitude: z.number().nullable().optional(),
      longitude: z.number().nullable().optional(),
    }).optional(),
    otpVerified: z.boolean().optional(),
    saidVerified: z.boolean().optional(),
  }).optional(),
});

export async function POST(req: NextRequest) {
  const auth = requireUser(req, ["customer", "sponsor"]);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 400 });
  try {
    const out = await createOrder({
      actor: auth.user.sub,
      customerEmail: parsed.data.customerId,
      sessionId: parsed.data.sessionId,
      items: parsed.data.items,
      delivery: parsed.data.delivery,
      paymentMethod: parsed.data.paymentMethod,
      riskContext: parsed.data.riskContext,
      requestIp: extractClientIp(req),
    });
    return NextResponse.json(out);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "create_order_failed" }, { status: 400 });
  }
}
