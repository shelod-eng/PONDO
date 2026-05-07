# PONDO Fintech Schema Blueprint

## Purpose

This document defines the target PostgreSQL or Supabase schema for PONDO as a fintech-grade commerce, risk, verification, and settlement platform.

It is designed to support the real persisted checkout lifecycle:

`Press Buy -> confirmed details -> OTP verified -> risk assessment stored -> order created -> settlement recorded -> delivery tracking started`

This blueprint is the target architecture to replace the transitional demo-oriented schema and align PONDO with stronger fintech data modeling, auditability, access control, and operational resilience.

## Design principles

- Separate customer identity, commerce, payments, and risk concerns.
- Use immutable financial and audit records wherever possible.
- Use normalized foreign keys for source-of-truth entities.
- Use JSONB only for evidence, snapshots, and provider payloads.
- Store enough denormalized data for reporting, but never let it replace source-of-truth tables.
- Minimize direct exposure of PII and support field-level access control through role separation and RLS.
- Keep status fields enum-backed and lifecycle-driven.
- Make all critical decisions traceable: who, what, why, when, and from which provider or ruleset.

## Target ERD structure

### 1. Identity and access domain

- `auth_users`
- `customer_profiles`
- `customer_contact_methods`
- `customer_addresses`
- `customer_devices`
- `customer_consents`

### 2. Partner and catalog domain

- `partners`
- `partner_stores`
- `partner_customer_profiles`
- `product_categories`
- `products`
- `product_prices`

### 3. Checkout and order domain

- `carts`
- `cart_items`
- `checkout_sessions`
- `checkout_session_events`
- `orders`
- `order_items`
- `order_status_history`

### 4. Verification and risk domain

- `risk_profiles`
- `risk_assessments`
- `risk_signals`
- `verification_cases`
- `verification_steps`
- `otp_challenges`
- `kyc_checks`
- `credit_checks`
- `fraud_checks`
- `affordability_checks`
- `manual_review_cases`

### 5. Payments and settlement domain

- `payment_transactions`
- `payment_events`
- `payment_methods`
- `payment_settlements`
- `settlement_batches`
- `refunds`
- `chargebacks`
- `wallet_accounts`
- `wallet_ledger_entries`

### 6. Fulfilment and notifications domain

- `delivery_processes`
- `delivery_process_steps`
- `shipment_events`
- `notifications`
- `notification_attempts`

### 7. Governance and platform domain

- `audit_events`
- `data_access_logs`
- `outbox_events`
- `idempotency_keys`
- `integration_credentials_meta`
- `schema_migrations_meta`

## Recommended ERD relationships

### Identity

- `auth_users 1 -> 0..1 customer_profiles`
- `customer_profiles 1 -> N customer_contact_methods`
- `customer_profiles 1 -> N customer_addresses`
- `customer_profiles 1 -> N customer_devices`
- `customer_profiles 1 -> N customer_consents`

### Commerce

- `partners 1 -> N partner_stores`
- `partners 1 -> N partner_customer_profiles`
- `customer_profiles 1 -> N carts`
- `carts 1 -> N cart_items`
- `customer_profiles 1 -> N checkout_sessions`
- `checkout_sessions 1 -> N checkout_session_events`
- `checkout_sessions 1 -> 0..1 orders`
- `orders 1 -> N order_items`
- `orders 1 -> N order_status_history`

### Risk and verification

- `risk_profiles 1 -> N checkout_sessions`
- `checkout_sessions 1 -> N risk_assessments`
- `risk_assessments 1 -> N risk_signals`
- `checkout_sessions 1 -> N verification_cases`
- `verification_cases 1 -> N verification_steps`
- `checkout_sessions 1 -> N otp_challenges`
- `verification_cases 1 -> N kyc_checks`
- `verification_cases 1 -> N credit_checks`
- `verification_cases 1 -> N fraud_checks`
- `verification_cases 1 -> N affordability_checks`
- `verification_cases 1 -> 0..1 manual_review_cases`

### Payments

- `orders 1 -> N payment_transactions`
- `payment_transactions 1 -> N payment_events`
- `payment_transactions 1 -> 0..1 payment_settlements`
- `payment_settlements N -> 1 settlement_batches`
- `payment_transactions 1 -> N refunds`
- `payment_transactions 1 -> N chargebacks`
- `customer_profiles 1 -> 0..1 wallet_accounts`
- `wallet_accounts 1 -> N wallet_ledger_entries`

### Fulfilment and governance

- `orders 1 -> 0..1 delivery_processes`
- `delivery_processes 1 -> N delivery_process_steps`
- `delivery_processes 1 -> N shipment_events`
- `orders 1 -> N notifications`
- `notifications 1 -> N notification_attempts`
- `checkout_sessions 1 -> N audit_events`
- `orders 1 -> N audit_events`
- `payment_transactions 1 -> N audit_events`

## Final table list

### A. Identity and customer tables

#### `auth_users`
Purpose:
Application user identity and role anchor.

Core columns:
- `id uuid pk`
- `email citext not null unique`
- `role app_role not null`
- `password_hash text null`
- `is_active boolean not null default true`
- `last_login_at timestamptz null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

#### `customer_profiles`
Purpose:
Customer master record for one real person.

Core columns:
- `id uuid pk`
- `auth_user_id uuid unique null fk -> auth_users.id`
- `external_customer_ref text null unique`
- `first_name text null`
- `last_name text null`
- `full_name text generated or persisted`
- `date_of_birth date null`
- `id_number_enc bytea null`
- `id_number_hash text null unique`
- `nationality text null`
- `risk_profile_id uuid null fk -> risk_profiles.id`
- `current_status customer_status not null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

#### `customer_contact_methods`
Purpose:
Phone and email channels with verification status.

Core columns:
- `id uuid pk`
- `customer_id uuid not null fk`
- `contact_type contact_type_enum not null`
- `contact_value text not null`
- `contact_value_hash text not null`
- `is_primary boolean not null default false`
- `is_verified boolean not null default false`
- `verified_at timestamptz null`
- `created_at timestamptz not null`

Constraints:
- unique on `(customer_id, contact_type, contact_value_hash)`
- partial unique on primary method per type

#### `customer_addresses`
Purpose:
Normalized address store with validation metadata.

Core columns:
- `id uuid pk`
- `customer_id uuid not null fk`
- `label text null`
- `address_line_1 text not null`
- `address_line_2 text null`
- `suburb text null`
- `city text not null`
- `province text not null`
- `postal_code text not null`
- `country_code char(2) not null default 'ZA'`
- `latitude numeric(10,7) null`
- `longitude numeric(10,7) null`
- `google_place_id text null`
- `validation_status address_validation_status not null`
- `is_default boolean not null default false`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

#### `customer_devices`
Purpose:
Known devices and fingerprints for fraud analysis.

Core columns:
- `id uuid pk`
- `customer_id uuid not null fk`
- `fingerprint_hash text not null`
- `device_label text null`
- `first_seen_at timestamptz not null`
- `last_seen_at timestamptz not null`
- `trust_level device_trust_level not null`

#### `customer_consents`
Purpose:
Legal evidence for POPIA and terms acceptance.

Core columns:
- `id uuid pk`
- `customer_id uuid not null fk`
- `consent_type consent_type_enum not null`
- `consent_version text not null`
- `accepted boolean not null`
- `accepted_at timestamptz not null`
- `ip_address inet null`
- `user_agent text null`
- `evidence jsonb not null default '{}'::jsonb`

### B. Partner and product tables

#### `partners`
- `id uuid pk`
- `code text unique not null`
- `display_name text not null`
- `status partner_status not null`
- `created_at timestamptz not null`

#### `partner_stores`
- `id uuid pk`
- `partner_id uuid not null fk`
- `store_code text not null`
- `store_name text not null`
- `api_base_url text null`
- `status partner_store_status not null`
- unique `(partner_id, store_code)`

#### `partner_customer_profiles`
- `id uuid pk`
- `partner_id uuid not null fk`
- `customer_id uuid not null fk`
- `partner_customer_ref text null`
- `partner_email_hash text null`
- `profile_snapshot jsonb not null`
- `imported_at timestamptz not null`
- unique `(partner_id, customer_id)`

#### `product_categories`
- `id uuid pk`
- `name text unique not null`
- `created_at timestamptz not null`

#### `products`
- `id uuid pk`
- `sku text unique not null`
- `category_id uuid null fk`
- `brand text not null`
- `name text not null`
- `description text null`
- `merchant_name text null`
- `is_active boolean not null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

#### `product_prices`
- `id uuid pk`
- `product_id uuid not null fk`
- `currency char(3) not null`
- `amount_cents bigint not null`
- `discount_pct numeric(5,2) not null default 0`
- `effective_from timestamptz not null`
- `effective_to timestamptz null`

### C. Checkout and order tables

#### `carts`
- `id uuid pk`
- `customer_id uuid not null fk`
- `status cart_status not null`
- `currency char(3) not null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

#### `cart_items`
- `id uuid pk`
- `cart_id uuid not null fk`
- `product_id uuid not null fk`
- `quantity integer not null check (quantity > 0)`
- `unit_price_cents bigint not null`
- `discount_pct numeric(5,2) not null default 0`
- `line_total_cents bigint not null`
- unique `(cart_id, product_id)`

#### `risk_profiles`
Purpose:
Lookup table for routing policy, not customer identity.

Core columns:
- `id uuid pk`
- `code risk_profile_code unique not null`
- `display_name text not null`
- `description text null`
- `default_verification_route verification_route not null`
- `risk_band smallint not null`
- `is_active boolean not null default true`

#### `checkout_sessions`
Purpose:
Anchor record for the entire checkout lifecycle.

Core columns:
- `id uuid pk`
- `session_code text not null unique`
- `customer_id uuid not null fk`
- `partner_id uuid null fk`
- `partner_store_id uuid null fk`
- `cart_id uuid null fk`
- `risk_profile_id uuid null fk`
- `delivery_address_id uuid null fk`
- `current_step checkout_step not null`
- `status checkout_status not null`
- `verification_route verification_route not null`
- `source_channel source_channel_enum not null`
- `ip_address inet null`
- `ip_city text null`
- `ip_region text null`
- `ip_country text null`
- `ip_latitude numeric(10,7) null`
- `ip_longitude numeric(10,7) null`
- `device_fingerprint_hash text null`
- `locked_cart_snapshot jsonb not null default '[]'::jsonb`
- `customer_snapshot jsonb not null default '{}'::jsonb`
- `partner_snapshot jsonb null`
- `terms_consent_id uuid null fk -> customer_consents.id`
- `otp_verified_at timestamptz null`
- `risk_completed_at timestamptz null`
- `payment_completed_at timestamptz null`
- `expires_at timestamptz null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

#### `checkout_session_events`
Purpose:
Append-only lifecycle trail for the session.

Core columns:
- `id bigserial pk`
- `checkout_session_id uuid not null fk`
- `event_type text not null`
- `actor_type actor_type_enum not null`
- `actor_id text null`
- `payload jsonb not null default '{}'::jsonb`
- `occurred_at timestamptz not null`

#### `orders`
- `id uuid pk`
- `checkout_session_id uuid unique null fk`
- `customer_id uuid not null fk`
- `partner_id uuid null fk`
- `delivery_address_id uuid null fk`
- `order_number text unique not null`
- `subtotal_cents bigint not null`
- `delivery_cents bigint not null default 0`
- `total_cents bigint not null`
- `currency char(3) not null default 'ZAR'`
- `status order_status not null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

#### `order_items`
- `id uuid pk`
- `order_id uuid not null fk`
- `product_id uuid null fk`
- `sku text null`
- `product_name text not null`
- `brand text null`
- `product_snapshot jsonb not null`
- `quantity integer not null check (quantity > 0)`
- `unit_price_cents bigint not null`
- `discount_pct numeric(5,2) not null default 0`
- `line_total_cents bigint not null`

#### `order_status_history`
- `id bigserial pk`
- `order_id uuid not null fk`
- `from_status order_status null`
- `to_status order_status not null`
- `reason text null`
- `changed_by text null`
- `changed_at timestamptz not null`

### D. Verification and risk tables

#### `otp_challenges`
- `id uuid pk`
- `checkout_session_id uuid not null fk`
- `channel otp_channel not null`
- `destination_hash text not null`
- `otp_hash text not null`
- `provider text null`
- `provider_request_ref text null`
- `status otp_status not null`
- `attempt_count integer not null default 0`
- `max_attempts integer not null default 3`
- `expires_at timestamptz not null`
- `verified_at timestamptz null`
- `created_at timestamptz not null`

#### `verification_cases`
- `id uuid pk`
- `checkout_session_id uuid not null fk`
- `customer_id uuid not null fk`
- `route verification_route not null`
- `status verification_case_status not null`
- `opened_at timestamptz not null`
- `closed_at timestamptz null`

#### `verification_steps`
- `id uuid pk`
- `verification_case_id uuid not null fk`
- `step_code verification_step_code not null`
- `status verification_step_status not null`
- `provider text null`
- `provider_ref text null`
- `started_at timestamptz not null`
- `completed_at timestamptz null`
- unique `(verification_case_id, step_code)`

#### `risk_assessments`
Purpose:
One aggregate risk outcome per scoring run.

Core columns:
- `id uuid pk`
- `checkout_session_id uuid not null fk`
- `customer_id uuid not null fk`
- `order_id uuid null fk`
- `assessment_version text not null`
- `score smallint not null check (score between 0 and 200)`
- `decision risk_decision not null`
- `band risk_band_enum not null`
- `verification_status verification_status not null`
- `requires_manual_review boolean not null`
- `ruleset_version text null`
- `model_version text null`
- `decision_reason text null`
- `payload jsonb not null default '{}'::jsonb`
- `assessed_at timestamptz not null`

#### `risk_signals`
Purpose:
Append-only scoring evidence per factor.

Core columns:
- `id uuid pk`
- `risk_assessment_id uuid not null fk`
- `signal_code text not null`
- `source_system text null`
- `points_assigned smallint not null`
- `signal_value text null`
- `detail text null`
- `evidence jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null`

Indexes:
- `(risk_assessment_id)`
- `(signal_code)`

#### `kyc_checks`
- `id uuid pk`
- `verification_case_id uuid not null fk`
- `checkout_session_id uuid not null fk`
- `provider text not null`
- `provider_ref text null`
- `id_document_type text null`
- `result_status provider_check_status not null`
- `response_payload jsonb not null`
- `checked_at timestamptz not null`

#### `credit_checks`
- `id uuid pk`
- `verification_case_id uuid not null fk`
- `checkout_session_id uuid not null fk`
- `provider text not null`
- `bureau text not null`
- `score integer null`
- `tier text null`
- `approved boolean null`
- `response_payload jsonb not null`
- `checked_at timestamptz not null`

#### `fraud_checks`
- `id uuid pk`
- `verification_case_id uuid not null fk`
- `checkout_session_id uuid not null fk`
- `provider text not null`
- `fraud_score numeric(8,4) null`
- `result_status provider_check_status not null`
- `response_payload jsonb not null`
- `checked_at timestamptz not null`

#### `affordability_checks`
- `id uuid pk`
- `verification_case_id uuid not null fk`
- `checkout_session_id uuid not null fk`
- `provider text not null`
- `declared_income_cents bigint null`
- `verified_income_cents bigint null`
- `approved boolean null`
- `response_payload jsonb not null`
- `checked_at timestamptz not null`

#### `manual_review_cases`
- `id uuid pk`
- `verification_case_id uuid not null unique fk`
- `queue_name text not null`
- `assigned_to uuid null fk -> auth_users.id`
- `status manual_review_status not null`
- `reason text not null`
- `opened_at timestamptz not null`
- `resolved_at timestamptz null`

### E. Payments and settlement tables

#### `payment_methods`
- `id uuid pk`
- `code payment_method_code unique not null`
- `display_name text not null`
- `gateway_code gateway_code not null`
- `requires_credit_vet boolean not null`

#### `payment_transactions`
Purpose:
Immutable money movement intent and final payment outcome.

Core columns:
- `id uuid pk`
- `order_id uuid not null fk`
- `checkout_session_id uuid null fk`
- `customer_id uuid not null fk`
- `payment_method_id uuid not null fk`
- `gateway_code gateway_code not null`
- `external_ref text null unique`
- `amount_cents bigint not null check (amount_cents >= 0)`
- `currency char(3) not null default 'ZAR'`
- `status payment_txn_status not null`
- `gateway_status gateway_status_code not null`
- `authorization_code text null`
- `reconciled_at timestamptz null`
- `settled_at timestamptz null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

#### `payment_events`
- `id bigserial pk`
- `payment_transaction_id uuid not null fk`
- `event_type text not null`
- `gateway_ref text null`
- `raw_payload jsonb not null`
- `recorded_at timestamptz not null`

#### `settlement_batches`
- `id uuid pk`
- `batch_reference text unique not null`
- `processor_name text not null`
- `settlement_date date not null`
- `status settlement_batch_status not null`
- `created_at timestamptz not null`

#### `payment_settlements`
- `id uuid pk`
- `payment_transaction_id uuid not null unique fk`
- `settlement_batch_id uuid null fk`
- `settlement_bank text not null`
- `bank_account_ref text not null`
- `gross_amount_cents bigint not null`
- `fee_amount_cents bigint not null default 0`
- `net_amount_cents bigint not null`
- `currency char(3) not null`
- `settled_at timestamptz not null`
- `created_at timestamptz not null`

#### `refunds`
- `id uuid pk`
- `payment_transaction_id uuid not null fk`
- `refund_reference text unique not null`
- `amount_cents bigint not null`
- `status refund_status not null`
- `reason text null`
- `created_at timestamptz not null`

#### `chargebacks`
- `id uuid pk`
- `payment_transaction_id uuid not null fk`
- `chargeback_reference text unique not null`
- `amount_cents bigint not null`
- `status chargeback_status not null`
- `reason_code text null`
- `opened_at timestamptz not null`
- `closed_at timestamptz null`

#### `wallet_accounts`
- `id uuid pk`
- `customer_id uuid not null unique fk`
- `currency char(3) not null`
- `status wallet_status not null`
- `available_balance_cents bigint not null default 0`
- `ledger_version bigint not null default 0`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

#### `wallet_ledger_entries`
Purpose:
Append-only wallet movements.

Core columns:
- `id uuid pk`
- `wallet_account_id uuid not null fk`
- `payment_transaction_id uuid null fk`
- `entry_type wallet_entry_type not null`
- `direction ledger_direction not null`
- `amount_cents bigint not null`
- `balance_after_cents bigint not null`
- `reference_type text null`
- `reference_id uuid null`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null`

### F. Fulfilment and notifications tables

#### `delivery_processes`
- `id uuid pk`
- `order_id uuid not null unique fk`
- `payment_transaction_id uuid null unique fk`
- `status delivery_status not null`
- `progress_pct integer not null check (progress_pct between 0 and 100)`
- `active_step integer null`
- `started_at timestamptz null`
- `completed_at timestamptz null`
- `updated_at timestamptz not null`

#### `delivery_process_steps`
- `id uuid pk`
- `delivery_process_id uuid not null fk`
- `step_index integer not null`
- `step_code delivery_step_code not null`
- `title text not null`
- `detail text not null`
- `status delivery_status not null`
- `completed_at timestamptz null`
- unique `(delivery_process_id, step_index)`

#### `shipment_events`
- `id uuid pk`
- `delivery_process_id uuid not null fk`
- `event_type text not null`
- `location_text text null`
- `payload jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null`

#### `notifications`
- `id uuid pk`
- `customer_id uuid not null fk`
- `order_id uuid null fk`
- `payment_transaction_id uuid null fk`
- `channel notification_channel not null`
- `template_code text not null`
- `destination_hash text not null`
- `status notification_status not null`
- `message_subject text null`
- `message_body_redacted text null`
- `created_at timestamptz not null`

#### `notification_attempts`
- `id uuid pk`
- `notification_id uuid not null fk`
- `provider text not null`
- `provider_ref text null`
- `attempt_no integer not null`
- `status notification_attempt_status not null`
- `response_payload jsonb not null`
- `attempted_at timestamptz not null`

### G. Governance tables

#### `audit_events`
Purpose:
Append-only compliance trail for all sensitive operations.

Core columns:
- `id bigserial pk`
- `event_category audit_event_category not null`
- `actor_type actor_type_enum not null`
- `actor_id text null`
- `customer_id uuid null fk`
- `checkout_session_id uuid null fk`
- `order_id uuid null fk`
- `payment_transaction_id uuid null fk`
- `resource_type text not null`
- `resource_id text not null`
- `action text not null`
- `before_state jsonb null`
- `after_state jsonb null`
- `metadata jsonb not null default '{}'::jsonb`
- `occurred_at timestamptz not null`

#### `data_access_logs`
Purpose:
Trace reads of highly sensitive PII or financial data.

Core columns:
- `id bigserial pk`
- `actor_id text not null`
- `resource_type text not null`
- `resource_id text not null`
- `access_purpose text not null`
- `ip_address inet null`
- `occurred_at timestamptz not null`

#### `outbox_events`
Purpose:
Reliable event publication for async integrations.

Core columns:
- `id uuid pk`
- `aggregate_type text not null`
- `aggregate_id text not null`
- `event_type text not null`
- `payload jsonb not null`
- `status outbox_status not null default 'pending'`
- `available_at timestamptz not null`
- `published_at timestamptz null`
- `retry_count integer not null default 0`

#### `idempotency_keys`
- `id uuid pk`
- `idempotency_key text unique not null`
- `request_hash text not null`
- `response_code integer null`
- `response_body jsonb null`
- `expires_at timestamptz not null`
- `created_at timestamptz not null`

## Key constraints and validation rules

### Primary key strategy

- Use UUID primary keys for all business tables.
- Use `bigserial` only for append-only log tables where sequence ordering is useful.

### PII handling

- `email` should use `citext` where direct lookup is required.
- `id_number` should not be stored as plain searchable text in primary business tables.
- Prefer:
  - encrypted value column such as `id_number_enc`
  - hash column such as `id_number_hash`
- Notification destinations should be stored as hashes in operational tables where raw values are not necessary.

### Monetary amounts

- Store all transactional amounts as `bigint` cents.
- Avoid `numeric` for primary money movement tables unless required by external settlement reconciliation precision.

### Status enforcement

- Use enums for:
  - verification route
  - checkout step and status
  - OTP status
  - order status
  - payment status
  - gateway status
  - risk decision
  - delivery status

### Immutable ledger pattern

- `wallet_ledger_entries`, `payment_events`, `audit_events`, `risk_signals`, `checkout_session_events`, and `order_status_history` are append-only.
- No updates except for operational metadata fields in retry scenarios.

### Idempotency

- All write endpoints affecting payment, OTP, order creation, or verification should require an idempotency key.
- Enforce unique `idempotency_key`.

### OTP controls

- Store OTP as hash only.
- Track attempt count and max attempts.
- Expire challenges strictly using `expires_at`.

### Address validation

- Store Google and MaxMind evidence separately in JSONB payloads.
- Keep normalized address fields in `customer_addresses` and evidence in the session or risk tables.

### Referential integrity

- `orders.checkout_session_id` should be unique where present.
- `payment_transactions.order_id` must always exist.
- `payment_settlements.payment_transaction_id` should be unique.
- `delivery_processes.order_id` should be unique.

## RLS strategy

RLS should be enabled on every table that contains customer, transaction, risk, or notification data.

### Baseline model

- `service_role`
  Full database access for backend-only trusted services.
- `customer_app`
  Read only to the customer's own records where explicitly allowed.
- `sponsor_app`
  Read to sponsor-approved reporting views only, not raw sensitive tables.
- `admin_ops`
  Operational access to selected tables and masked PII views.
- `fraud_analyst`
  Access to risk and review tables, with controlled PII visibility.

### Recommended approach

- Direct application writes should come from trusted backend services only.
- Frontend clients should not write directly to raw transactional tables.
- Expose views or RPC functions for any customer-facing or sponsor-facing reporting.

### RLS patterns

#### Customer tables

- Customer can read only rows where `customer_id = auth.uid()` mapping is satisfied via `auth_users`.
- Customer cannot read other customers' risk or payment data.

#### Risk tables

- `fraud_analyst` can read `risk_assessments`, `risk_signals`, and review cases.
- Analysts should use masked views for PII unless elevated access is granted.

#### Sponsor tables

- Sponsor should read from reporting views only:
  - `vw_sponsor_orders`
  - `vw_sponsor_settlements`
  - `vw_sponsor_risk_summary`

#### Governance tables

- `audit_events` and `data_access_logs` should be service and compliance only.
- No direct frontend exposure.

### Supabase-specific note

- Keep raw tables locked.
- Use:
  - backend service role
  - secure views
  - RPC endpoints
  - Edge Functions or server-side route handlers

## Audit and compliance fields

Every sensitive domain table should include some combination of:

- `created_at`
- `updated_at`
- `created_by`
- `updated_by`
- `source_system`
- `provider_ref`
- `trace_id`
- `correlation_id`
- `request_id`

### Required compliance evidence

#### POPIA

- consent type
- consent version
- accepted timestamp
- source IP
- actor or session reference

#### Verification

- provider name
- provider reference
- response payload
- result code
- performed timestamp

#### Risk engine

- ruleset version
- model version
- signal list
- final score
- final decision
- manual override reason if applicable

#### Payments

- gateway reference
- authorization code
- settlement reference
- payment events timeline

#### Admin access

- who accessed the record
- what they accessed
- why they accessed it
- when they accessed it

## Indexing strategy

### High priority indexes

- `customer_profiles(auth_user_id)`
- `customer_profiles(id_number_hash)`
- `customer_contact_methods(contact_value_hash)`
- `checkout_sessions(session_code)`
- `checkout_sessions(customer_id, created_at desc)`
- `checkout_sessions(status, created_at desc)`
- `orders(order_number)`
- `orders(customer_id, created_at desc)`
- `payment_transactions(order_id)`
- `payment_transactions(customer_id, created_at desc)`
- `payment_transactions(status, created_at desc)`
- `risk_assessments(checkout_session_id, assessed_at desc)`
- `risk_assessments(score desc, assessed_at desc)`
- `risk_signals(risk_assessment_id)`
- `otp_challenges(checkout_session_id, created_at desc)`
- `wallet_ledger_entries(wallet_account_id, created_at desc)`
- `audit_events(checkout_session_id, occurred_at desc)`
- `audit_events(order_id, occurred_at desc)`

### Optional specialized indexes

- GIN index on JSONB evidence tables where filtered often.
- Partial index on open manual review cases.
- Partial index on unreconciled payment transactions.

## Recommended enum set

- `app_role`
- `customer_status`
- `contact_type_enum`
- `consent_type_enum`
- `partner_status`
- `partner_store_status`
- `cart_status`
- `checkout_step`
- `checkout_status`
- `verification_route`
- `verification_case_status`
- `verification_step_code`
- `verification_step_status`
- `otp_channel`
- `otp_status`
- `risk_profile_code`
- `risk_decision`
- `risk_band_enum`
- `verification_status`
- `provider_check_status`
- `order_status`
- `payment_method_code`
- `payment_txn_status`
- `gateway_code`
- `gateway_status_code`
- `settlement_batch_status`
- `refund_status`
- `chargeback_status`
- `wallet_status`
- `wallet_entry_type`
- `ledger_direction`
- `delivery_status`
- `delivery_step_code`
- `notification_channel`
- `notification_status`
- `notification_attempt_status`
- `actor_type_enum`
- `audit_event_category`
- `outbox_status`

## Replacement SQL DDL plan

This should replace the transitional schema in phases rather than one destructive cutover.

### Phase 0. Foundation

Create first:

1. extensions
2. enums
3. helper domains such as `citext`
4. core security roles
5. base metadata tables

Output:
- `auth_users`
- `risk_profiles`
- `partners`
- `product_categories`
- `products`
- `product_prices`

### Phase 1. Identity and consent layer

Create:

1. `customer_profiles`
2. `customer_contact_methods`
3. `customer_addresses`
4. `customer_devices`
5. `customer_consents`

Then:

- backfill customer email and phone from transitional `customers`
- hash and encrypt ID fields before inserting into final tables

### Phase 2. Checkout layer

Create:

1. `carts`
2. `cart_items`
3. `checkout_sessions`
4. `checkout_session_events`

Then update application writes so `Press Buy` and `Confirm Details` land here first.

### Phase 3. Verification and risk layer

Create:

1. `otp_challenges`
2. `verification_cases`
3. `verification_steps`
4. `risk_assessments`
5. `risk_signals`
6. `kyc_checks`
7. `credit_checks`
8. `fraud_checks`
9. `affordability_checks`
10. `manual_review_cases`

Then:

- route OTP, credit, KYC, fraud, affordability, and manual review writes into these tables
- treat current `risk_checks` as a temporary compatibility table or migration source

### Phase 4. Order and payment layer

Create:

1. `orders`
2. `order_items`
3. `order_status_history`
4. `payment_methods`
5. `payment_transactions`
6. `payment_events`
7. `settlement_batches`
8. `payment_settlements`
9. `refunds`
10. `chargebacks`

Then:

- switch order creation to final `orders` and `order_items`
- switch payment writes from transitional `transactions` to `payment_transactions`
- keep read compatibility through a view during migration

### Phase 5. Wallet and fulfilment layer

Create:

1. `wallet_accounts`
2. `wallet_ledger_entries`
3. `delivery_processes`
4. `delivery_process_steps`
5. `shipment_events`
6. `notifications`
7. `notification_attempts`

### Phase 6. Governance and eventing layer

Create:

1. `audit_events`
2. `data_access_logs`
3. `outbox_events`
4. `idempotency_keys`

Then:

- move all business-side logging to append-only governance tables
- publish external side effects through `outbox_events`

### Phase 7. Compatibility views

Create compatibility views so the current application can migrate safely:

- `vw_legacy_customers`
- `vw_legacy_transactions`
- `vw_legacy_risk_checks`
- `vw_legacy_delivery_processes`

This lets the app move incrementally without requiring one large deployment.

### Phase 8. Cutover and decommission

After all writes are moved:

1. freeze writes to transitional tables
2. validate row counts and financial totals
3. validate OTP and risk history parity
4. validate settlement parity
5. archive or drop transitional tables only after sign-off

## Suggested implementation order for the codebase

Use this order in application refactors:

1. move customer identity and consent to final tables
2. move checkout session persistence
3. move OTP and risk persistence
4. move order creation
5. move payment settlement
6. move delivery tracking
7. move wallet ledger
8. move sponsor and admin reporting onto views

## Comparison to the current 3-table risk spec

The image-based design with `profiles`, `transactions`, and `risk_logs` should be preserved conceptually, but embedded into the broader final model like this:

- `profiles` -> `risk_profiles`
- `transactions` -> split across `checkout_sessions`, `orders`, `payment_transactions`, and `risk_assessments`
- `risk_logs` -> `risk_signals`

This keeps the original PONDO risk-engine intent while raising the schema to a stronger fintech-standard architecture.

## Immediate next deliverables

The next concrete artifacts to generate from this blueprint should be:

1. `api/db/pondo_fintech_schema.sql`
2. `api/db/pondo_fintech_seed.sql`
3. `api/db/pondo_migration_plan.sql`
4. reporting views for sponsor and admin use
5. service-layer refactor plan mapping each route to final tables
