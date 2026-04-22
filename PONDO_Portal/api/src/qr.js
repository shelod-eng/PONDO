import crypto from "crypto";

export function createSignedPayload({ transactionId, amountCents, currency, customerId }, secret) {
  const issuedAt = new Date().toISOString();
  const base = {
    transactionId,
    amountCents,
    currency,
    customerId,
    issuedAt,
  };

  const canonical = JSON.stringify(base);
  const signature = crypto.createHmac("sha256", secret).update(canonical, "utf8").digest("hex");
  return JSON.stringify({ ...base, signature });
}

export function verifySignedPayload(payloadString, secret) {
  const parsed = JSON.parse(payloadString);
  const { signature, ...base } = parsed;
  const canonical = JSON.stringify(base);
  const expected = crypto.createHmac("sha256", secret).update(canonical, "utf8").digest("hex");
  return { ok: expected === signature, payload: parsed };
}

