# PONDO Integration Guide

## Purpose

This guide defines the partner integration process for connecting PONDO into external checkout environments such as Amazon South Africa and Takealot.

PONDO provides a compliant, audit-ready checkout layer with API contracts, SDK patterns, sandbox testing, webhook callbacks, and operational controls. The goal is to let partner engineering teams integrate PONDO with minimal checkout changes while giving product, security, risk, and compliance teams a clear approval path.

## Integration Overview

PONDO acts as a trusted checkout orchestration layer between the partner cart, payment authorization, customer verification, Payment Enabled Delivery, sponsor reporting, and reconciliation.

Recommended integration flow:

1. Partner creates a PONDO payment intent for an order.
2. PONDO returns an intent token and hosted or embedded checkout state.
3. Customer confirms payment, consent, and delivery details.
4. Partner receives synchronous confirmation for the checkout session.
5. PONDO sends asynchronous webhook updates for settlement, delivery, refund, and reconciliation events.
6. Partner stores the PONDO transaction reference against its internal order ID.

## Environments

| Environment | Purpose | Base URL |
| --- | --- | --- |
| Sandbox | Partner engineering, QA, fake payments, webhook testing | `https://sandbox-api.pondo.example.com` |
| Preview | Vercel preview deployments for review builds | Use the active Vercel preview URL |
| Production | Live checkout traffic | `https://api.pondo.example.com` |

Replace the example URLs above with the confirmed Vercel/API domains before partner handover.

## Partner Onboarding Checklist

Before Amazon SA or Takealot starts development, PONDO should provide:

- Partner ID and display name.
- Sandbox API key or OAuth2 client credentials.
- Webhook signing secret.
- Allowed callback URLs.
- Allowed webhook URLs.
- IP allowlist requirements, if used.
- Sandbox test cards and test customer profiles.
- Contact channel for integration support.
- Escalation contact for payment, compliance, and incident issues.

Partner teams should provide:

- Checkout architecture owner.
- Backend integration owner.
- Security/risk reviewer.
- Webhook endpoint URL.
- Order ID format and refund rules.
- Production traffic estimate.
- Go-live and rollback window.

## API Contract

PONDO should publish an OpenAPI 3.1 contract under:

```text
api/openapi/pondo-checkout.v1.yaml
```

The contract should define stable request and response schemas for:

- `CreatePaymentIntent`
- `ConfirmPayment`
- `Refund`
- `GetPaymentStatus`
- `Webhook`

### Authentication

Sandbox can start with API keys:

```http
Authorization: Bearer pondo_sandbox_xxx
X-PONDO-Partner-Id: amazon-sa
Idempotency-Key: order-12345-create-payment-intent
```

Production should support either:

- OAuth2 client credentials for server-to-server traffic, or
- signed API keys with rotation, expiry, and partner-level permissions.

Never expose secret API keys in browser code. Browser integrations must call a partner backend, which then calls PONDO.

### Create Payment Intent

```http
POST /v1/payment-intents
Authorization: Bearer <api_key_or_access_token>
Content-Type: application/json
Idempotency-Key: <stable_unique_key>
```

Example request:

```json
{
  "partner": "takealot",
  "orderId": "TAK-10004567",
  "amount": 18999.00,
  "currency": "ZAR",
  "customer": {
    "id": "cust_123",
    "email": "customer@example.com",
    "phone": "+27821234567"
  },
  "items": [
    {
      "sku": "SAMSUNG-65-QLED",
      "name": "Samsung 65 QLED TV",
      "quantity": 1,
      "unitAmount": 18999.00
    }
  ],
  "redirectUrls": {
    "success": "https://partner.example.com/checkout/success",
    "cancel": "https://partner.example.com/checkout/cancel"
  },
  "metadata": {
    "cartId": "cart_789",
    "channel": "web"
  }
}
```

Example response:

```json
{
  "id": "pi_01HTZPONDO123",
  "status": "requires_confirmation",
  "token": "pit_01HTZSECURETOKEN",
  "checkoutUrl": "https://checkout.pondo.example.com/intents/pi_01HTZPONDO123",
  "expiresAt": "2026-04-30T18:00:00Z"
}
```

### Confirm Payment

```http
POST /v1/payment-intents/{intentId}/confirm
```

Example request:

```json
{
  "token": "pit_01HTZSECURETOKEN",
  "consent": {
    "popiaAccepted": true,
    "termsAccepted": true,
    "acceptedAt": "2026-04-30T14:50:00Z"
  },
  "delivery": {
    "method": "ped",
    "addressId": "addr_123"
  }
}
```

Example response:

```json
{
  "id": "pi_01HTZPONDO123",
  "orderId": "TAK-10004567",
  "status": "authorized",
  "pondoReference": "PONDO-20260430-000123",
  "qrPayload": "pondo://payment/PONDO-20260430-000123",
  "nextAction": null
}
```

### Refund

```http
POST /v1/refunds
```

Example request:

```json
{
  "paymentIntentId": "pi_01HTZPONDO123",
  "amount": 18999.00,
  "reason": "customer_return",
  "metadata": {
    "returnId": "RET-123"
  }
}
```

Example response:

```json
{
  "id": "rf_01HTZREFUND123",
  "paymentIntentId": "pi_01HTZPONDO123",
  "status": "processing",
  "amount": 18999.00,
  "currency": "ZAR"
}
```

### Payment Status

```http
GET /v1/payment-intents/{intentId}
```

Common statuses:

| Status | Meaning |
| --- | --- |
| `requires_confirmation` | Intent created, customer has not completed PONDO confirmation |
| `authorized` | Payment authorized and order can continue |
| `processing` | Payment/delivery/reconciliation workflow is active |
| `settled` | Payment settled |
| `reconciled` | Sponsor and partner reporting completed |
| `cancelled` | Customer or partner cancelled before authorization |
| `failed` | Payment, KYC, risk, or system failure |
| `refunded` | Full refund completed |
| `partially_refunded` | Partial refund completed |

## Webhooks

Partners should expose a webhook endpoint to receive asynchronous state changes:

```http
POST https://partner.example.com/webhooks/pondo
X-PONDO-Signature: t=1714488600,v1=<hmac_sha256>
X-PONDO-Event-Id: evt_01HTZEVENT123
Content-Type: application/json
```

Example event:

```json
{
  "id": "evt_01HTZEVENT123",
  "type": "payment_intent.authorized",
  "createdAt": "2026-04-30T14:50:00Z",
  "data": {
    "paymentIntentId": "pi_01HTZPONDO123",
    "orderId": "TAK-10004567",
    "status": "authorized",
    "pondoReference": "PONDO-20260430-000123"
  }
}
```

Webhook requirements:

- Verify `X-PONDO-Signature` before processing.
- Return `2xx` only after the event is safely stored.
- Treat events as at-least-once delivery.
- Use `X-PONDO-Event-Id` for idempotency.
- Handle events arriving out of order by checking the payment intent status.

Recommended events:

| Event | Purpose |
| --- | --- |
| `payment_intent.created` | Intent accepted by PONDO |
| `payment_intent.authorized` | Partner may complete order placement |
| `payment_intent.failed` | Partner should show failure or alternate payment route |
| `payment_intent.settled` | Funds settlement completed |
| `payment_intent.reconciled` | Sponsor/partner reconciliation completed |
| `refund.created` | Refund request accepted |
| `refund.succeeded` | Refund completed |
| `refund.failed` | Refund failed or requires manual review |

## Error Model

All API errors should use a predictable response:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Amount must be greater than zero.",
    "requestId": "req_01HTZREQUEST123",
    "details": {
      "field": "amount"
    }
  }
}
```

Common error codes:

| Code | HTTP | Meaning |
| --- | --- | --- |
| `invalid_request` | 400 | Missing or invalid field |
| `unauthorized` | 401 | Missing or invalid credentials |
| `forbidden` | 403 | Partner is not allowed to perform this action |
| `not_found` | 404 | Intent, refund, or order not found |
| `idempotency_conflict` | 409 | Same idempotency key used with different payload |
| `risk_declined` | 402 | KYC, credit, fraud, or payment risk declined |
| `rate_limited` | 429 | Partner exceeded allowed request rate |
| `internal_error` | 500 | Unexpected PONDO service error |
| `service_unavailable` | 503 | Temporary outage or maintenance |

## JavaScript/TypeScript SDK

Recommended package name:

```text
@pondo/checkout-sdk
```

Install:

```bash
npm install @pondo/checkout-sdk
```

Server-side example:

```typescript
import { Pondo } from "@pondo/checkout-sdk";

const pondo = new Pondo({
  apiKey: process.env.PONDO_API_KEY!,
  environment: "sandbox",
  partnerId: "takealot"
});

const intent = await pondo.createPaymentIntent({
  orderId: "TAK-10004567",
  amount: 18999.0,
  currency: "ZAR",
  customer: {
    id: "cust_123",
    email: "customer@example.com"
  },
  items: [
    {
      sku: "SAMSUNG-65-QLED",
      name: "Samsung 65 QLED TV",
      quantity: 1,
      unitAmount: 18999.0
    }
  ]
});

return intent.checkoutUrl;
```

Browser handoff example:

```typescript
window.location.href = intent.checkoutUrl;
```

Do not initialize the SDK with a secret key in the browser. Browser code should request a payment intent from the partner backend.

## React Checkout Example

```tsx
import { useState } from "react";

export function PondoCheckoutButton({ orderId }: { orderId: string }) {
  const [loading, setLoading] = useState(false);

  async function startCheckout() {
    setLoading(true);
    try {
      const response = await fetch("/api/checkout/pondo-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId })
      });

      const intent = await response.json();
      window.location.href = intent.checkoutUrl;
    } finally {
      setLoading(false);
    }
  }

  return (
    <button onClick={startCheckout} disabled={loading}>
      {loading ? "Starting PONDO..." : "Pay with PONDO"}
    </button>
  );
}
```

## Node.js Backend Example

```typescript
import express from "express";
import { Pondo } from "@pondo/checkout-sdk";

const router = express.Router();
const pondo = new Pondo({
  apiKey: process.env.PONDO_API_KEY!,
  partnerId: "amazon-sa",
  environment: process.env.PONDO_ENV === "production" ? "production" : "sandbox"
});

router.post("/checkout/pondo-intent", async (req, res, next) => {
  try {
    const order = await loadOrder(req.body.orderId);
    const intent = await pondo.createPaymentIntent({
      orderId: order.id,
      amount: order.total,
      currency: "ZAR",
      customer: order.customer,
      items: order.items
    });

    res.json(intent);
  } catch (error) {
    next(error);
  }
});

export default router;
```

## PHP Backend Example

```php
<?php

$payload = [
  "partner" => "takealot",
  "orderId" => $orderId,
  "amount" => $amount,
  "currency" => "ZAR",
  "customer" => [
    "id" => $customerId,
    "email" => $email
  ],
  "items" => $items
];

$ch = curl_init("https://sandbox-api.pondo.example.com/v1/payment-intents");
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
  "Authorization: Bearer " . getenv("PONDO_API_KEY"),
  "Content-Type: application/json",
  "Idempotency-Key: " . $orderId . "-pondo-intent"
]);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

$response = curl_exec($ch);
$intent = json_decode($response, true);
header("Location: " . $intent["checkoutUrl"]);
exit;
```

## Sandbox Testing

Sandbox should support:

- Fake cards and fake payment rails.
- Fixed OTP values for test flows.
- Simulated KYC, affordability, and fraud outcomes.
- Webhook replay from the sponsor/admin console.
- Refund simulation.
- Partner-specific test carts for Amazon SA and Takealot.

Suggested test cards:

| Scenario | Card Number | Result |
| --- | --- | --- |
| Successful authorization | `4111111111111111` | `authorized` |
| Insufficient funds | `4000000000009995` | `failed` |
| 3DS required | `4000000000003220` | `requires_action` |
| Refund path | `4242424242424242` | `settled`, then `refunded` |

Suggested test identities:

| Scenario | Email Pattern | Result |
| --- | --- | --- |
| Standard approval | `approved+*@example.com` | KYC and risk pass |
| KYC review | `review+*@example.com` | Manual review |
| Risk decline | `decline+*@example.com` | Fraud/risk decline |

## Compliance and Security Notes

PONDO should provide a short compliance pack for partner risk teams:

- PCI DSS alignment statement.
- POPIA data processing note.
- Encryption in transit using TLS 1.2+.
- Encryption at rest for sensitive records.
- Tokenization of payment references and QR payloads.
- No raw card data stored by PONDO unless a PCI DSS certified vault is in scope.
- Signed webhook delivery.
- API key rotation and revocation process.
- Audit logs for payment, delivery, refund, and sponsor events.
- Data retention and deletion policy.
- Incident response contact and SLA.

### PCI DSS Positioning

Recommended partner-facing statement:

PONDO is designed as a tokenized checkout orchestration layer. Partner systems should submit order, customer, and item metadata to PONDO, while sensitive cardholder data should be handled only by PCI DSS compliant payment processors or hosted payment fields. PONDO does not require partners to expose raw card data to their own frontend or backend during the standard integration flow.

### POPIA Positioning

PONDO requires explicit customer consent before processing personal information for checkout, identity verification, delivery, sponsor reporting, and reconciliation. Partner integrations must pass only the minimum customer data required for the transaction and must provide customers with the correct consent, terms, and privacy notices.

## Operational Requirements

Production integrations should include:

- Idempotency keys for all create and refund requests.
- Partner-side order locking during payment confirmation.
- Webhook retry handling.
- Monitoring for failed authorization and webhook delivery rates.
- Alerting for reconciliation delays.
- Runbook for refund, failed delivery, and customer support cases.
- Release notes for API/SDK changes.

## CI/CD and Versioning

Recommended repository structure:

```text
api/
  openapi/
    pondo-checkout.v1.yaml
sdk/
  js/
    package.json
    src/
docs/
  compliance/
    pci-dss-note.md
    popia-note.md
INTEGRATION_GUIDE.md
CHANGELOG.md
```

Recommended GitHub Actions:

- Validate OpenAPI contract on pull requests.
- Build and test SDK on pull requests.
- Publish SDK package on version tags.
- Publish API documentation to GitHub Pages or the PONDO docs site.
- Deploy sandbox/preview to Vercel after merge.

Versioning:

- Use semantic versions: `v1.0.0`, `v1.1.0`, `v2.0.0`.
- Partners should pin SDK major versions.
- Breaking API changes require a new major version and a migration window.
- Maintain a `CHANGELOG.md` with API, SDK, compliance, and webhook changes.

## Amazon SA and Takealot Integration Path

### Phase 1: Technical Discovery

- Confirm checkout architecture.
- Confirm backend language and deployment model.
- Confirm where PONDO button or payment option appears.
- Confirm order state transitions.
- Confirm refund and cancellation rules.

### Phase 2: Sandbox Build

- Issue sandbox credentials.
- Partner creates payment intent from backend.
- Partner redirects customer to PONDO checkout or embeds the approved PONDO component.
- Partner receives webhook updates.
- Partner maps PONDO reference to partner order ID.

### Phase 3: Compliance Review

- Review PCI DSS positioning.
- Review POPIA processing and consent.
- Review webhook signing.
- Review audit log and reconciliation model.
- Confirm support and incident response process.

### Phase 4: Production Readiness

- Exchange production credentials.
- Configure production webhook URL.
- Run a small-value live transaction.
- Test refund.
- Confirm monitoring dashboards.
- Confirm rollback plan.

### Phase 5: Launch

- Enable PONDO for limited traffic.
- Monitor authorization, failure, webhook, and refund rates.
- Expand traffic once KPIs are stable.
- Schedule post-launch reconciliation review.

## Acceptance Criteria

An integration is ready for production when:

- Partner can create and confirm payment intents in sandbox.
- Partner can process signed webhooks idempotently.
- Partner can handle payment success, failure, cancellation, and refund states.
- Partner can reconcile PONDO references against internal order IDs.
- Compliance review is signed off.
- Production credentials are rotated out of sandbox.
- Monitoring and incident contacts are active.

## Partner-Facing Narrative

PONDO provides a compliant, audit-ready checkout layer with SDKs, API specs, sandbox testing, webhook callbacks, and operational controls. Integration requires minimal partner checkout changes and supports PCI DSS aligned, POPIA-aware payment and delivery workflows. The repository includes the integration guide, API contract plan, demo portal, and CI/CD recommendations needed for frictionless partner adoption.
