import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, invalidRequest } from "@/server/apiErrors";
import { requireUser } from "@/server/pondo/auth";
import { resolveManualReview } from "@/server/pondo/service";

export const runtime = "nodejs";

const schema = z.object({
  decision: z.enum(["approved", "declined"]),
});

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireUser(req, ["customer", "sponsor"]);
  if ("error" in auth) return apiErrorResponse(new Error(auth.error || "invalid_auth"), auth.error || "invalid_auth");
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return invalidRequest(parsed.error);
  const { id } = await context.params;
  try {
    const out = await resolveManualReview({
      actor: auth.user.sub,
      transactionId: id,
      decision: parsed.data.decision,
    });
    return NextResponse.json(out);
  } catch (error) {
    return apiErrorResponse(error, "manual_review_resolve_failed");
  }
}
