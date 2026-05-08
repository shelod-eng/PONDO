import { NextResponse } from "next/server";
import { runPondoPreflight } from "@/server/pondo/preflight";

export const runtime = "nodejs";

export async function GET() {
  try {
    const status = await runPondoPreflight();
    return NextResponse.json(status, { status: status.ok ? 200 : 503 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "preflight_failed",
      },
      { status: 503 },
    );
  }
}
