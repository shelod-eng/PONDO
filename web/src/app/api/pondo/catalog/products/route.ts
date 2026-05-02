import { NextRequest, NextResponse } from "next/server";
import { listProducts } from "@/server/pondo/service";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || undefined;
  const category = req.nextUrl.searchParams.get("category") || undefined;
  const out = await listProducts(q, category);
  return NextResponse.json(out);
}
