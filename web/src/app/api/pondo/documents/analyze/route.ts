import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/pondo/auth";
import { analyzeManualReviewDocuments } from "@/server/pondo/documentIntelligence";

export const runtime = "nodejs";

const uploadSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  base64Data: z.string().min(1),
});

const bodySchema = z.object({
  identityDocumentType: z.enum(["sa_id", "drivers_licence"]),
  fullName: z.string().min(1),
  enteredIdNumber: z.string().min(1),
  deliveryAddress: z.object({
    address1: z.string(),
    city: z.string(),
    province: z.string(),
    postalCode: z.string(),
  }),
  clientGeo: z
    .object({
      city: z.string().optional(),
      province: z.string().optional(),
      country: z.string().optional(),
    })
    .optional(),
  orderValueCents: z.number().int().nonnegative(),
  identityDocument: uploadSchema,
  proofOfAddressDocument: uploadSchema.nullish(),
});

export async function POST(req: NextRequest) {
  const auth = requireUser(req, ["customer", "sponsor"]);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: 401 });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_document_analysis_request", details: { formErrors: ["Request body could not be parsed as JSON."] } }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_document_analysis_request", details: parsed.error.flatten() }, { status: 400 });
  }

  const result = await analyzeManualReviewDocuments(parsed.data);
  return NextResponse.json(result);
}
