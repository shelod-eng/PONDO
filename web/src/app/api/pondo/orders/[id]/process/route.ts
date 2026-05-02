import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/server/pondo/auth";
import { getDeliveryProcess } from "@/server/pondo/service";

export const runtime = "nodejs";

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireUser(req, ["customer", "sponsor"]);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: 401 });
  const { id } = await context.params;
  const out = await getDeliveryProcess(id);
  if (!out) return NextResponse.json({ error: "process_not_started" }, { status: 404 });
  return NextResponse.json(out);
}
