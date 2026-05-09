import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, invalidRequest } from "@/server/apiErrors";
import { requireUser } from "@/server/pondo/auth";
import { recordRiskAssessment } from "@/server/pondo/service";

export const runtime = "nodejs";

const schema = z.object({
  saId: z.string().min(13).max(13),
  bureau: z.enum(["transunion", "experian"]),
  screeningMode: z.enum(["full", "skip"]),
  transunionScore: z.number().int().nullable(),
  transunionApproved: z.boolean(),
  kycIdentityVerified: z.boolean(),
  experianIncome: z.number().nonnegative().nullable().optional(),
  fraudScore: z.number().nonnegative(),
  approved: z.boolean(),
  documentContext: z.object({
    identityDocumentType: z.enum(["sa_id", "drivers_licence"]).optional(),
    identityDocumentUploaded: z.boolean().optional(),
    identityDocumentFileName: z.string().trim().optional(),
    proofOfAddressRequired: z.boolean().optional(),
    proofOfAddressUploaded: z.boolean().optional(),
    proofOfAddressFileName: z.string().trim().optional(),
  }).optional(),
  city: z.string().trim().optional(),
  province: z.string().trim().optional(),
  postalCode: z.string().trim().optional(),
});

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireUser(req, ["customer", "sponsor"]);
  if ("error" in auth) return apiErrorResponse(new Error(auth.error || "invalid_auth"), auth.error || "invalid_auth");
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return invalidRequest(parsed.error);
  const { id } = await context.params;
  try {
    const out = await recordRiskAssessment({ actor: auth.user.sub, sessionId: id, ...parsed.data });
    return NextResponse.json(out);
  } catch (error) {
    return apiErrorResponse(error, "risk_assessment_failed");
  }
}
