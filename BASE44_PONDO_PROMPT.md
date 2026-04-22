# Base44 Build Prompt - PONDO Trust Checkout

Use this prompt in Base44 to generate a technical specification and aligned prototype.

## Prompt

Build a sponsor-ready prototype called **PONDO Trust Commerce**.

### Primary Goal
Create a **5-step trust-locked payment checkout journey** for customers redirected from partner eCommerce platforms.

### Visual Direction
- Match the look and feel of the provided PONDO screenshot reference.
- Dark navy background, deep blue cards, orange section labels, red primary CTA buttons, white typography.
- Right sidebar must include:
  - PONDO Trust Guarantee list
  - Live API Activity Log panel
  - Partner Integration chips (Amazon, Temu, Takealot, Shopify, WooCommerce, TransUnion, Experian, Twilio, SendGrid)

### Required 5-Step Flow
1. Press Buy
- Select partner eCommerce site.
- Fetch customer + product details from mocked partner API.

2. Confirm Details
- Auto-populate full name, SA ID, phone, email, address, geo-location.
- Send OTP via Twilio SMS / SendGrid email (sandbox).
- Verify OTP.
- Enforce mandatory POPIA T&C checkbox before proceeding.

3. Credit & KYC
- Run TransUnion ITC check.
- Run KYC verification.
- Run Experian affordability check.
- Run Python fraud score.
- Show pass/fail status card and decision banner.

4. Confirm Route
- Show cost split (merchant share, customer share).
- Assign PED driver and route details (driver, badge, vehicle, ETA).

5. Completed
- Clear transaction and show transaction ID.
- Trigger mocked partner webhook + customer notification events.

### Tech Stack Constraints
- Frontend: Next.js (App Router)
- Backend: Node.js (Express or Fastify)
- DB: PostgreSQL (Supabase-compatible schema)
- Fraud service: Python microservice endpoint contract
- CI/CD target: GitHub Actions -> Vercel + Supabase

### API Contracts to Include
- POST `/api/pondo/fetch-cart`
- POST `/api/pondo/register`
- POST `/api/pondo/send-otp`
- POST `/api/pondo/verify-otp`
- POST `/api/pondo/kyc-check`
- POST `/api/pondo/fraud-score`
- POST `/api/pondo/confirm-route`
- POST `/api/pondo/complete`
- GET `/api/pondo/orders`
- GET `/api/pondo/audit`

### Data + Compliance
- South African context
- POPIA consent and audit logging for each sensitive action
- Encrypt SA ID and PII fields at rest
- Include role model: admin/user/driver

### Demo Data
Seed at least 3 users and include Samsung 65" QLED TV at around R18,999.

### Output Required
1. Full technical specification (architecture, schema, APIs, security, CI/CD).
2. Running prototype UI with the 5-step flow and realistic mock integrations.
3. Local run instructions for VSCode and PyCharm workflows.
