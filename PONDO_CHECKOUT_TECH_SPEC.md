# PONDO Payment Checkout - Implementation Tech Spec

This prototype is implemented under:
- `C:\Users\mpeta\Desktop\PONDO_Portal\web`
- `C:\Users\mpeta\Desktop\PONDO_Portal\api`

It follows `PONDO-Payment Checkout System Spec.pdf` and the 5-step trust checkout screenshots.

## Scope Implemented

1. Step 1: Press Buy
- Partner selection (`amazon`, `temu`, `takealot`, `shopify`, `woocommerce`)
- Simulated partner API cart/customer fetch via `POST /api/pondo/fetch-cart`

2. Step 2: Confirm Details
- Auto-populated customer profile and product details
- OTP send + verify simulation
- Mandatory POPIA/T&C checkbox gate before progressing

3. Step 3: Credit & KYC
- TransUnion ITC simulation via `/api/pondo/credit/simulate`
- KYC identity check simulation
- Experian affordability simulation
- Fraud score simulation compatible with future Python service

4. Step 4: Confirm Route
- Cost split and PED delivery assignment
- Driver, badge, vehicle, ETA route confirmation

5. Step 5: Completed
- Transaction creation and settlement through existing order APIs
- Live activity log and sponsor visibility

## API Endpoints Added

- `POST /api/pondo/fetch-cart`
- `POST /api/pondo/send-otp`
- `POST /api/pondo/verify-otp`
- `GET /api/pondo/partners`

## Existing APIs Reused

- `/api/pondo/orders`
- `/api/pondo/orders/:id/bnpl-vet`
- `/api/pondo/orders/:id/pay`
- `/api/pondo/sponsor/orders`
- `/api/pondo/sponsor/summary`
- `/api/pondo/sponsor/stream`

## Data Notes

- Added screenshot-aligned product seed: `samsung-65-qled` at `R18,999`
- Added partner customer seed profiles for demo walkthrough
- OTP is demo-safe (fixed code in sandbox mode)

## Next Production Steps

1. Replace OTP simulation with Twilio + SendGrid providers.
2. Replace credit simulation with TransUnion/Experian secured adapters.
3. Add Python fraud microservice endpoint and signed service-to-service auth.
4. Persist checkout sessions in Postgres/Supabase with strict RLS.
5. Add webhook callbacks to partner commerce sites.
6. Add GitHub Actions CI/CD for Vercel + Supabase migrations.
