import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateUser } from "@/server/pondo/auth";

export const runtime = "nodejs";

const schema = z.object({
  username: z.string().email(),
  password: z.string().min(1),
  role: z.enum(["customer", "sponsor"]).default("customer"),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 400 });
  const out = authenticateUser(parsed.data.username, parsed.data.password, parsed.data.role);
  if (!out) return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  if ("forbidden" in out) return NextResponse.json({ error: "forbidden_role" }, { status: 403 });
  return NextResponse.json(out);
}
