# PONDO Database Workflow

For the target production-grade schema and rollout plan, see:

- [PONDO_FINTECH_SCHEMA_BLUEPRINT.md](C:/Users/mpeta/Desktop/PONDO_Portal/PONDO_FINTECH_SCHEMA_BLUEPRINT.md)

## What the codebase does today

The live PONDO demo is split between:

- `web/src/app/PondoDemo/shop/page.tsx`: product discovery and cart entry.
- `web/src/app/PondoDemo/cart/page.tsx`: cart review and quantity changes.
- `web/src/app/PondoDemo/checkout/page.tsx`: partner fetch, detail confirmation, OTP, credit/KYC simulation, payment, and delivery tracking.
- `web/src/app/PondoDemo/confirmation/[id]/page.tsx`: order confirmation and QR display.
- `web/src/app/sponsor/page.tsx`: sponsor transaction monitoring and reconciliation.
- `web/src/app/PondoAdmin/page.tsx`: mostly presentation data today, but intended for admin reporting.
- `api/src/index.js`: the API surface for catalog, partner bootstrap, OTP, order creation, payment, reconciliation, and sponsor views.
- `api/src/pondoDemo/orders.js`: the real workflow orchestration for create order, credit vet, settlement, wallet top-up, and delivery process.

## Important finding from the current implementation

The current backend persists only:

- `transactions`
- `audit_entries`

Everything else is currently in memory or browser storage:

- partner bootstrap session
- customer details snapshot
- OTP requests
- cart state
- delivery process state
- wallet balances

That is why `api/db/pondo_full_postgres_schema.sql` adds the missing persistence layer needed for a proper PostgreSQL setup.

## Entry points and the tables they need

### 1. Shop

Used by:

- `GET /api/pondo/catalog/products`
- `web/src/app/PondoDemo/shop/page.tsx`

Tables:

- `product_categories`
- `products`

Optional later:

- `carts`
- `cart_items`

### 2. Cart

Used by:

- `web/src/app/PondoDemo/cart/page.tsx`

Tables:

- `carts`
- `cart_items`
- `products`

Note:

The current code keeps the cart in `localStorage` via `web/src/lib/pondoCart.ts`. The schema lets you move that into PostgreSQL when ready.

### 3. Press Buy / Partner fetch

Used by:

- `POST /api/pondo/fetch-cart`
- `api/src/pondoDemo/partners.js`

Tables:

- `partners`
- `customers`
- `partner_customer_profiles`
- `checkout_sessions`

Purpose:

This stores the imported partner user snapshot, the partner selected, and the cart snapshot locked for checkout.

### 4. Confirm Details

Used by:

- checkout step 2 in `web/src/app/PondoDemo/checkout/page.tsx`

Tables:

- `customers`
- `customer_addresses`
- `checkout_sessions`

Purpose:

This stores edited customer identity, phone, address, geolocation, and POPIA acceptance for the active checkout session.

### 5. OTP Verification

Used by:

- `POST /api/pondo/send-otp`
- `POST /api/pondo/verify-otp`

Tables:

- `otp_requests`
- `checkout_sessions`
- `audit_entries`

Purpose:

This gives every OTP request its own lifecycle: sent, verified, expired, or failed.

### 6. Credit / KYC / Fraud / Affordability

Used by:

- `POST /api/pondo/credit/simulate`
- `POST /api/pondo/orders/:id/bnpl-vet`
- logic in `api/src/pondoDemo/orders.js`

Tables:

- `risk_checks`
- `transactions`
- `audit_entries`

Purpose:

The current app simulates these results. The schema makes them first-class records so you can store bureau, score, tier, approval, and provider responses.

### 7. Payment and settlement

Used by:

- `POST /api/pondo/orders`
- `POST /api/pondo/orders/:id/pay`
- `POST /api/reconcile/run`

Tables:

- `orders`
- `order_items`
- `transactions`
- `payment_settlements`
- `payment_notifications`
- `audit_entries`

Purpose:

This is the core money trail: order, line items, gateway transaction, settlement bank, and notification history.

### 8. Delivery tracking

Used by:

- `GET /api/pondo/orders/:id/process`
- in-memory flow from `api/src/pondoDemo/orders.js`

Tables:

- `delivery_processes`
- `delivery_process_steps`
- `audit_entries`

Purpose:

This stores the 5-step live delivery tracker now shown only in runtime memory.

### 9. Wallet top-up

Used by:

- `POST /api/pondo/wallet/top-up`
- `GET /api/pondo/wallet/:customerId`

Tables:

- `wallet_accounts`
- `wallet_ledger`
- `transactions`

Purpose:

This replaces the in-memory wallet balance map with an auditable wallet ledger.

### 10. Sponsor and admin reporting

Used by:

- `GET /api/pondo/sponsor/orders`
- `GET /api/pondo/sponsor/summary`
- `GET /api/sponsor/transactions`
- `GET /api/sponsor/transactions/:id`

Tables:

- `transactions`
- `orders`
- `payment_settlements`
- `risk_checks`
- `delivery_processes`
- `audit_entries`

Purpose:

These tables are enough to drive sponsor dashboards and a real admin portal without relying on hardcoded demo data.

## Recommended creation order in DBeaver

Run `api/db/pondo_full_postgres_schema.sql` in this order:

1. enums and extension
2. users, customers, addresses
3. partners and partner profiles
4. catalog tables
5. carts and checkout sessions
6. OTP and risk tables
7. orders, order_items, transactions
8. settlements, notifications
9. delivery tables
10. wallet tables
11. audit and outbox

## Minimum vs full schema

If you only want to match the current API exactly, the minimum is still:

- `transactions`
- `audit_entries`

If you want the database to support the full PONDO workflow shown in the UI, use the new full schema file instead:

- [api/db/pondo_full_postgres_schema.sql](C:/Users/mpeta/Desktop/PONDO_Portal/api/db/pondo_full_postgres_schema.sql)
