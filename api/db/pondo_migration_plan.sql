-- ============================================================
-- PONDO Transitional -> Fintech Core Migration Plan
-- Purpose:
-- - Stage the new schema alongside existing public tables.
-- - Backfill core entities.
-- - Provide compatibility views for reporting and phased app cutover.
-- - Avoid breaking current Vercel-backed flows during migration.
-- ============================================================

BEGIN;

-- 1. Ensure the target schema exists first.
-- Run these manually in order if this is a fresh environment:
--   \i api/db/pondo_fintech_schema.sql
--   \i api/db/pondo_fintech_seed.sql

SET search_path TO public, pondo_core, extensions;

-- ------------------------------------------------------------
-- 2. Backfill customers from the transitional public.customers
-- ------------------------------------------------------------
INSERT INTO pondo_core.customer_profiles (
  external_customer_ref,
  full_name,
  id_number_hash,
  current_status,
  created_at,
  updated_at
)
SELECT
  c.id::text,
  c.full_name,
  CASE
    WHEN c.id_number IS NULL OR trim(c.id_number) = '' THEN NULL
    ELSE encode(extensions.digest(c.id_number::text, 'sha256'::text), 'hex'::text)
  END,
  'active'::pondo_core.customer_status,
  COALESCE(c.created_at, now()),
  COALESCE(c.updated_at, now())
FROM public.customers c
WHERE NOT EXISTS (
  SELECT 1
  FROM pondo_core.customer_profiles cp
  WHERE cp.external_customer_ref = c.id::text
);

INSERT INTO pondo_core.customer_contact_methods (
  customer_id,
  contact_type,
  contact_value,
  contact_value_hash,
  is_primary,
  is_verified,
  verified_at,
  created_at,
  updated_at
)
SELECT
  cp.id,
  'email'::pondo_core.contact_type_enum,
  c.email,
  encode(extensions.digest(lower(trim(c.email))::text, 'sha256'::text), 'hex'::text),
  true,
  true,
  now(),
  COALESCE(c.created_at, now()),
  COALESCE(c.updated_at, now())
FROM public.customers c
JOIN pondo_core.customer_profiles cp
  ON cp.external_customer_ref = c.id::text
WHERE c.email IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM pondo_core.customer_contact_methods cm
    WHERE cm.customer_id = cp.id
      AND cm.contact_type = 'email'
      AND cm.contact_value_hash = encode(extensions.digest(lower(trim(c.email))::text, 'sha256'::text), 'hex'::text)
  );

INSERT INTO pondo_core.customer_contact_methods (
  customer_id,
  contact_type,
  contact_value,
  contact_value_hash,
  is_primary,
  is_verified,
  verified_at,
  created_at,
  updated_at
)
SELECT
  cp.id,
  'phone'::pondo_core.contact_type_enum,
  c.phone,
  encode(extensions.digest(trim(c.phone)::text, 'sha256'::text), 'hex'::text),
  true,
  false,
  NULL,
  COALESCE(c.created_at, now()),
  COALESCE(c.updated_at, now())
FROM public.customers c
JOIN pondo_core.customer_profiles cp
  ON cp.external_customer_ref = c.id::text
WHERE c.phone IS NOT NULL
  AND trim(c.phone) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM pondo_core.customer_contact_methods cm
    WHERE cm.customer_id = cp.id
      AND cm.contact_type = 'phone'
      AND cm.contact_value_hash = encode(extensions.digest(trim(c.phone)::text, 'sha256'::text), 'hex'::text)
  );

INSERT INTO pondo_core.customer_addresses (
  customer_id,
  label,
  address_line_1,
  city,
  province,
  postal_code,
  country_code,
  validation_status,
  is_default,
  created_at,
  updated_at
)
SELECT
  cp.id,
  'Primary',
  COALESCE(NULLIF(c.address_line, ''), 'Unknown'),
  COALESCE(NULLIF(c.city, ''), 'Unknown'),
  COALESCE(NULLIF(c.province, ''), 'Unknown'),
  COALESCE(NULLIF(c.postal_code, ''), '0000'),
  'ZA',
  'unverified'::pondo_core.address_validation_status,
  true,
  COALESCE(c.created_at, now()),
  COALESCE(c.updated_at, now())
FROM public.customers c
JOIN pondo_core.customer_profiles cp
  ON cp.external_customer_ref = c.id::text
WHERE NOT EXISTS (
  SELECT 1
  FROM pondo_core.customer_addresses ca
  WHERE ca.customer_id = cp.id
    AND ca.is_default = true
);

-- ------------------------------------------------------------
-- 3. Backfill partner profile links
-- ------------------------------------------------------------
INSERT INTO pondo_core.partner_customer_profiles (
  partner_id,
  customer_id,
  partner_customer_ref,
  partner_email_hash,
  profile_snapshot,
  imported_at,
  updated_at
)
SELECT
  p.id,
  cp.id,
  c.source_partner_code,
  CASE
    WHEN c.email IS NULL THEN NULL
    ELSE encode(extensions.digest(lower(trim(c.email))::text, 'sha256'::text), 'hex'::text)
  END,
  COALESCE(c.source_payload, '{}'::jsonb),
  COALESCE(c.created_at, now()),
  COALESCE(c.updated_at, now())
FROM public.customers c
JOIN pondo_core.customer_profiles cp
  ON cp.external_customer_ref = c.id::text
JOIN pondo_core.partners p
  ON p.code = COALESCE(NULLIF(c.source_partner_code, ''), 'amazon')
WHERE NOT EXISTS (
  SELECT 1
  FROM pondo_core.partner_customer_profiles pcp
  WHERE pcp.partner_id = p.id
    AND pcp.customer_id = cp.id
);

-- ------------------------------------------------------------
-- 4. Backfill checkout sessions
-- ------------------------------------------------------------
INSERT INTO pondo_core.checkout_sessions (
  session_code,
  customer_id,
  partner_id,
  current_step,
  status,
  verification_route,
  source_channel,
  locked_cart_snapshot,
  customer_snapshot,
  partner_snapshot,
  otp_verified_at,
  expires_at,
  created_at,
  updated_at
)
SELECT
  cs.session_code,
  cp.id,
  p.id,
  COALESCE(cs.current_step, 'press_buy')::pondo_core.checkout_step,
  CASE
    WHEN cs.status IN ('active', 'otp_pending', 'otp_verified', 'risk_pending', 'risk_approved', 'risk_failed', 'payment_pending', 'paid', 'completed', 'expired', 'cancelled')
      THEN cs.status::pondo_core.checkout_status
    ELSE 'active'::pondo_core.checkout_status
  END,
  'otp_plus_risk'::pondo_core.verification_route,
  'web'::pondo_core.source_channel_enum,
  COALESCE(cs.locked_cart_snapshot, '[]'::jsonb),
  COALESCE(cs.customer_snapshot, '{}'::jsonb),
  COALESCE(cs.partner_product_snapshot, '{}'::jsonb),
  cs.otp_verified_at,
  cs.expires_at,
  COALESCE(cs.created_at, now()),
  COALESCE(cs.updated_at, now())
FROM public.checkout_sessions cs
JOIN pondo_core.customer_profiles cp
  ON cp.external_customer_ref = cs.customer_id::text
LEFT JOIN pondo_core.partners p
  ON p.code = COALESCE(cs.partner_code, 'amazon')
WHERE NOT EXISTS (
  SELECT 1
  FROM pondo_core.checkout_sessions ncs
  WHERE ncs.session_code = cs.session_code
);

-- ------------------------------------------------------------
-- 5. Backfill orders and items
-- ------------------------------------------------------------
INSERT INTO pondo_core.orders (
  checkout_session_id,
  customer_id,
  partner_id,
  order_number,
  subtotal_cents,
  delivery_cents,
  total_cents,
  currency,
  status,
  created_at,
  updated_at
)
SELECT
  ncs.id,
  cp.id,
  p.id,
  o.order_number,
  o.subtotal_cents,
  o.delivery_cents,
  o.total_cents,
  COALESCE(o.currency, 'ZAR'),
  CASE
    WHEN o.status IN ('created', 'payment_pending', 'paid', 'processing', 'fulfilled', 'cancelled', 'refunded')
      THEN o.status::pondo_core.order_status
    ELSE 'created'::pondo_core.order_status
  END,
  COALESCE(o.created_at, now()),
  COALESCE(o.updated_at, now())
FROM public.orders o
LEFT JOIN pondo_core.checkout_sessions ncs
  ON ncs.session_code = (
    SELECT pcs.session_code
    FROM public.checkout_sessions pcs
    WHERE pcs.id = o.checkout_session_id
    LIMIT 1
  )
JOIN pondo_core.customer_profiles cp
  ON cp.external_customer_ref = o.customer_id::text
LEFT JOIN pondo_core.partners p
  ON p.code = COALESCE(o.partner_code, 'amazon')
WHERE NOT EXISTS (
  SELECT 1
  FROM pondo_core.orders no
  WHERE no.order_number = o.order_number
);

INSERT INTO pondo_core.order_items (
  order_id,
  sku,
  product_name,
  brand,
  product_snapshot,
  quantity,
  unit_price_cents,
  discount_pct,
  line_total_cents
)
SELECT
  no.id,
  oi.product_id,
  oi.product_name,
  oi.brand,
  COALESCE(oi.product_snapshot, '{}'::jsonb),
  oi.quantity,
  oi.unit_price_cents,
  oi.discount_pct,
  oi.line_total_cents
FROM public.order_items oi
JOIN public.orders o
  ON o.id = oi.order_id
JOIN pondo_core.orders no
  ON no.order_number = o.order_number
WHERE NOT EXISTS (
  SELECT 1
  FROM pondo_core.order_items noi
  WHERE noi.order_id = no.id
    AND noi.product_name = oi.product_name
    AND noi.quantity = oi.quantity
    AND noi.line_total_cents = oi.line_total_cents
);

-- ------------------------------------------------------------
-- 6. Backfill payment transactions
-- ------------------------------------------------------------
INSERT INTO pondo_core.payment_transactions (
  id,
  order_id,
  checkout_session_id,
  customer_id,
  payment_method_id,
  gateway_code,
  external_ref,
  amount_cents,
  currency,
  status,
  gateway_status,
  reconciled_at,
  settled_at,
  created_at,
  updated_at
)
SELECT
  t.id,
  no.id,
  ncs.id,
  cp.id,
  pm.id,
  CASE
    WHEN t.gateway IN ('peach', 'payfast', 'ozow', 'payflex', 'speedpoint', 'ussd', 'wallet')
      THEN t.gateway::pondo_core.gateway_code
    ELSE 'peach'::pondo_core.gateway_code
  END,
  t.external_ref,
  t.amount_cents,
  COALESCE(t.currency, 'ZAR'),
  CASE
    WHEN t.status IN ('initiated', 'authorized', 'processing', 'reconciled', 'failed', 'cancelled', 'refunded')
      THEN t.status::pondo_core.payment_txn_status
    ELSE 'initiated'::pondo_core.payment_txn_status
  END,
  CASE
    WHEN t.gateway_status IN ('initiated', 'credit_checked', 'authorized', 'settled', 'declined', 'failed', 'refunded')
      THEN t.gateway_status::pondo_core.gateway_status_code
    ELSE 'initiated'::pondo_core.gateway_status_code
  END,
  t.reconciled_at,
  t.settled_at,
  COALESCE(t.created_at, now()),
  COALESCE(t.updated_at, now())
FROM public.transactions t
LEFT JOIN public.orders o
  ON o.id = t.order_id
LEFT JOIN pondo_core.orders no
  ON no.order_number = o.order_number
LEFT JOIN public.checkout_sessions cs
  ON cs.id = t.checkout_session_id
LEFT JOIN pondo_core.checkout_sessions ncs
  ON ncs.session_code = cs.session_code
LEFT JOIN public.customers c
  ON c.email = t.customer_id
LEFT JOIN pondo_core.customer_profiles cp
  ON cp.external_customer_ref = c.id::text
LEFT JOIN pondo_core.payment_methods pm
  ON pm.code = CASE
    WHEN t.payment_method IN ('card', 'card_3ds', 'debit_card', 'eft', 'payfast', 'bnpl', 'speedpoint', 'ussd', 'evoucher_wallet')
      THEN t.payment_method::pondo_core.payment_method_code
    ELSE 'card'::pondo_core.payment_method_code
  END
WHERE no.id IS NOT NULL
  AND cp.id IS NOT NULL
  AND pm.id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM pondo_core.payment_transactions npt
    WHERE npt.id = t.id
  );

-- ------------------------------------------------------------
-- 7. Backfill settlements and wallet ledger
-- ------------------------------------------------------------
INSERT INTO pondo_core.payment_settlements (
  payment_transaction_id,
  settlement_bank,
  bank_account_ref,
  gross_amount_cents,
  fee_amount_cents,
  net_amount_cents,
  currency,
  settled_at,
  created_at
)
SELECT
  pt.id,
  ps.settlement_bank,
  ps.account_ref,
  ps.amount_cents,
  0,
  ps.amount_cents,
  COALESCE(ps.currency, 'ZAR'),
  ps.settled_at,
  COALESCE(ps.created_at, now())
FROM public.payment_settlements ps
JOIN pondo_core.payment_transactions pt
  ON pt.id = ps.transaction_id
WHERE NOT EXISTS (
  SELECT 1
  FROM pondo_core.payment_settlements nps
  WHERE nps.payment_transaction_id = pt.id
);

INSERT INTO pondo_core.wallet_accounts (
  customer_id,
  currency,
  status,
  available_balance_cents,
  created_at,
  updated_at
)
SELECT
  cp.id,
  COALESCE(wa.currency, 'ZAR'),
  'active'::pondo_core.wallet_status,
  wa.balance_cents,
  COALESCE(wa.created_at, now()),
  COALESCE(wa.updated_at, now())
FROM public.wallet_accounts wa
JOIN pondo_core.customer_profiles cp
  ON cp.external_customer_ref = wa.customer_id::text
WHERE NOT EXISTS (
  SELECT 1
  FROM pondo_core.wallet_accounts nwa
  WHERE nwa.customer_id = cp.id
);

INSERT INTO pondo_core.wallet_ledger_entries (
  wallet_account_id,
  payment_transaction_id,
  entry_type,
  direction,
  amount_cents,
  balance_after_cents,
  metadata,
  created_at
)
SELECT
  nwa.id,
  pt.id,
  CASE
    WHEN wl.entry_type IN ('topup', 'purchase', 'refund', 'adjustment')
      THEN wl.entry_type::pondo_core.wallet_entry_type
    ELSE 'adjustment'::pondo_core.wallet_entry_type
  END,
  CASE
    WHEN wl.entry_type IN ('purchase') THEN 'debit'::pondo_core.ledger_direction
    ELSE 'credit'::pondo_core.ledger_direction
  END,
  wl.amount_cents,
  wl.balance_after_cents,
  COALESCE(wl.metadata, '{}'::jsonb),
  COALESCE(wl.created_at, now())
FROM public.wallet_ledger wl
JOIN public.wallet_accounts wa
  ON wa.id = wl.wallet_account_id
JOIN pondo_core.customer_profiles cp
  ON cp.external_customer_ref = wa.customer_id::text
JOIN pondo_core.wallet_accounts nwa
  ON nwa.customer_id = cp.id
LEFT JOIN pondo_core.payment_transactions pt
  ON pt.id = wl.transaction_id
WHERE NOT EXISTS (
  SELECT 1
  FROM pondo_core.wallet_ledger_entries nwl
  WHERE nwl.wallet_account_id = nwa.id
    AND nwl.amount_cents = wl.amount_cents
    AND nwl.balance_after_cents = wl.balance_after_cents
    AND nwl.created_at = COALESCE(wl.created_at, now())
);

-- ------------------------------------------------------------
-- 8. Compatibility views for reporting and phased cutover
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_legacy_transactions AS
SELECT
  pt.id,
  o.id AS order_id,
  cs.id AS checkout_session_id,
  pt.external_ref,
  cm.contact_value AS customer_id,
  pt.amount_cents,
  pt.currency,
  pm.code::text AS payment_method,
  pt.gateway_code::text AS gateway,
  pt.gateway_status::text AS gateway_status,
  NULL::text AS credit_tier,
  NULL::text AS qr_payload,
  pt.status::text AS status,
  NULL::timestamptz AS qr_scanned_at,
  pt.reconciled_at,
  pt.settled_at,
  pt.created_at,
  pt.updated_at
FROM pondo_core.payment_transactions pt
JOIN pondo_core.orders o
  ON o.id = pt.order_id
LEFT JOIN pondo_core.checkout_sessions cs
  ON cs.id = pt.checkout_session_id
JOIN pondo_core.payment_methods pm
  ON pm.id = pt.payment_method_id
LEFT JOIN pondo_core.customer_contact_methods cm
  ON cm.customer_id = pt.customer_id
 AND cm.contact_type = 'email'
 AND cm.is_primary = true;

CREATE OR REPLACE VIEW public.vw_legacy_risk_checks AS
SELECT
  ra.id,
  NULL::uuid AS transaction_id,
  ra.checkout_session_id,
  ra.customer_id,
  'aggregate'::text AS check_type,
  ra.ruleset_version AS provider,
  NULL::text AS sa_id,
  NULL::text AS bureau,
  ra.score,
  ra.band::text AS tier,
  CASE WHEN ra.decision = 'auto_approve' THEN true WHEN ra.decision = 'rejected' THEN false ELSE NULL END AS approved,
  CASE
    WHEN ra.decision = 'auto_approve' THEN 'approved'
    WHEN ra.decision = 'rejected' THEN 'declined'
    ELSE 'manual_review'
  END AS status,
  ra.payload AS response_payload,
  ra.assessed_at AS created_at,
  ra.assessed_at AS completed_at
FROM pondo_core.risk_assessments ra;

COMMIT;

-- ------------------------------------------------------------
-- 9. Manual cutover checklist
-- ------------------------------------------------------------
-- a. Switch Next.js and API read paths from public.* tables to pondo_core.*
-- b. Move writes in this order:
--    checkout_sessions -> otp_challenges -> risk_assessments -> orders -> payment_transactions -> delivery_processes
-- c. Compare row counts and money totals between legacy and core views.
-- d. Freeze writes to public transitional tables.
-- e. Archive public transitional tables only after sign-off.
