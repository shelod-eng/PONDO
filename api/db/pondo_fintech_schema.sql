-- ============================================================
-- PONDO Fintech Core Schema
-- Target: PostgreSQL / Supabase
-- Notes:
-- - Uses a dedicated schema so it can coexist with transitional tables.
-- - Financial amounts are stored as bigint cents.
-- - Sensitive operational tables have RLS enabled.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE SCHEMA IF NOT EXISTS pondo_core;

SET search_path TO pondo_core, public;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role' AND typnamespace = 'pondo_core'::regnamespace) THEN
    CREATE TYPE app_role AS ENUM ('customer', 'sponsor', 'admin', 'fraud_analyst', 'driver', 'system');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'customer_status' AND typnamespace = 'pondo_core'::regnamespace) THEN
    CREATE TYPE customer_status AS ENUM ('active', 'pending_verification', 'restricted', 'blocked', 'closed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contact_type_enum' AND typnamespace = 'pondo_core'::regnamespace) THEN
    CREATE TYPE contact_type_enum AS ENUM ('email', 'phone');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'consent_type_enum' AND typnamespace = 'pondo_core'::regnamespace) THEN
    CREATE TYPE consent_type_enum AS ENUM ('terms_and_conditions', 'popia', 'marketing', 'credit_check', 'location_capture');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'address_validation_status' AND typnamespace = 'pondo_core'::regnamespace) THEN
    CREATE TYPE address_validation_status AS ENUM ('unverified', 'validated', 'needs_confirmation', 'failed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'device_trust_level' AND typnamespace = 'pondo_core'::regnamespace) THEN
    CREATE TYPE device_trust_level AS ENUM ('unknown', 'trusted', 'watchlist', 'blocked');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'partner_status' AND typnamespace = 'pondo_core'::regnamespace) THEN
    CREATE TYPE partner_status AS ENUM ('active', 'inactive', 'suspended');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'partner_store_status' AND typnamespace = 'pondo_core'::regnamespace) THEN
    CREATE TYPE partner_store_status AS ENUM ('active', 'inactive');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cart_status' AND typnamespace = 'pondo_core'::regnamespace) THEN
    CREATE TYPE cart_status AS ENUM ('active', 'locked', 'converted', 'abandoned', 'expired');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'risk_profile_code' AND typnamespace = 'pondo_core'::regnamespace) THEN
    CREATE TYPE risk_profile_code AS ENUM ('high_risk_male', 'low_risk_female', 'elderly', 'standard', 'manual_review_only');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'verification_route' AND typnamespace = 'pondo_core'::regnamespace) THEN
    CREATE TYPE verification_route AS ENUM ('otp_only', 'otp_plus_risk', 'full_kyc', 'manual_review');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'source_channel_enum' AND typnamespace = 'pondo_core'::regnamespace) THEN
    CREATE TYPE source_channel_enum AS ENUM ('web', 'mobile', 'partner_import', 'admin');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'checkout_step' AND typnamespace = 'pondo_core'::regnamespace) THEN
    CREATE TYPE checkout_step AS ENUM ('cart', 'press_buy', 'confirm_details', 'otp_verification', 'risk_checks', 'payment', 'delivery_tracking', 'completed', 'cancelled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'checkout_status' AND typnamespace = 'pondo_core'::regnamespace) THEN
    CREATE TYPE checkout_status AS ENUM ('active', 'otp_pending', 'otp_verified', 'risk_pending', 'risk_approved', 'risk_failed', 'payment_pending', 'paid', 'completed', 'expired', 'cancelled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'actor_type_enum' AND typnamespace = 'pondo_core'::regnamespace) THEN
    CREATE TYPE actor_type_enum AS ENUM ('customer', 'system', 'admin', 'sponsor', 'fraud_analyst', 'partner', 'gateway');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status' AND typnamespace = 'pondo_core'::regnamespace) THEN
    CREATE TYPE order_status AS ENUM ('created', 'payment_pending', 'paid', 'processing', 'fulfilled', 'cancelled', 'refunded');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'otp_channel' AND typnamespace = 'pondo_core'::regnamespace) THEN
    CREATE TYPE otp_channel AS ENUM ('sms', 'email');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'otp_status' AND typnamespace = 'pondo_core'::regnamespace) THEN
    CREATE TYPE otp_status AS ENUM ('sent', 'verified', 'expired', 'failed', 'locked');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'verification_case_status' AND typnamespace = 'pondo_core'::regnamespace) THEN
    CREATE TYPE verification_case_status AS ENUM ('open', 'approved', 'declined', 'manual_review', 'cancelled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'verification_step_code' AND typnamespace = 'pondo_core'::regnamespace) THEN
    CREATE TYPE verification_step_code AS ENUM ('otp', 'id_scan', 'kyc', 'credit', 'affordability', 'fraud', 'manual_review');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'verification_step_status' AND typnamespace = 'pondo_core'::regnamespace) THEN
    CREATE TYPE verification_step_status AS ENUM ('pending', 'running', 'approved', 'declined', 'error', 'skipped');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'risk_decision' AND typnamespace = 'pondo_core'::regnamespace) THEN
    CREATE TYPE risk_decision AS ENUM ('auto_approve', 'manual_review', 'rejected');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'risk_band_enum' AND typnamespace = 'pondo_core'::regnamespace) THEN
    CREATE TYPE risk_band_enum AS ENUM ('low', 'medium', 'high', 'critical');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'verification_status' AND typnamespace = 'pondo_core'::regnamespace) THEN
    CREATE TYPE verification_status AS ENUM ('pending', 'otp_verified', 'kyc_and_id_verified', 'failed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'provider_check_status' AND typnamespace = 'pondo_core'::regnamespace) THEN
    CREATE TYPE provider_check_status AS ENUM ('pending', 'approved', 'declined', 'error');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method_code' AND typnamespace = 'pondo_core'::regnamespace) THEN
    CREATE TYPE payment_method_code AS ENUM ('card', 'card_3ds', 'debit_card', 'eft', 'payfast', 'bnpl', 'speedpoint', 'ussd', 'evoucher_wallet');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gateway_code' AND typnamespace = 'pondo_core'::regnamespace) THEN
    CREATE TYPE gateway_code AS ENUM ('peach', 'payfast', 'ozow', 'payflex', 'speedpoint', 'ussd', 'wallet');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_txn_status' AND typnamespace = 'pondo_core'::regnamespace) THEN
    CREATE TYPE payment_txn_status AS ENUM ('initiated', 'authorized', 'processing', 'reconciled', 'failed', 'cancelled', 'refunded');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gateway_status_code' AND typnamespace = 'pondo_core'::regnamespace) THEN
    CREATE TYPE gateway_status_code AS ENUM ('initiated', 'credit_checked', 'authorized', 'settled', 'declined', 'failed', 'refunded');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'settlement_batch_status' AND typnamespace = 'pondo_core'::regnamespace) THEN
    CREATE TYPE settlement_batch_status AS ENUM ('open', 'processing', 'settled', 'failed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'refund_status' AND typnamespace = 'pondo_core'::regnamespace) THEN
    CREATE TYPE refund_status AS ENUM ('requested', 'processing', 'completed', 'failed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chargeback_status' AND typnamespace = 'pondo_core'::regnamespace) THEN
    CREATE TYPE chargeback_status AS ENUM ('opened', 'disputed', 'lost', 'won', 'closed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wallet_status' AND typnamespace = 'pondo_core'::regnamespace) THEN
    CREATE TYPE wallet_status AS ENUM ('active', 'suspended', 'closed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wallet_entry_type' AND typnamespace = 'pondo_core'::regnamespace) THEN
    CREATE TYPE wallet_entry_type AS ENUM ('topup', 'purchase', 'refund', 'adjustment');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ledger_direction' AND typnamespace = 'pondo_core'::regnamespace) THEN
    CREATE TYPE ledger_direction AS ENUM ('debit', 'credit');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'manual_review_status' AND typnamespace = 'pondo_core'::regnamespace) THEN
    CREATE TYPE manual_review_status AS ENUM ('open', 'assigned', 'approved', 'declined', 'cancelled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'delivery_status' AND typnamespace = 'pondo_core'::regnamespace) THEN
    CREATE TYPE delivery_status AS ENUM ('pending', 'active', 'completed', 'failed', 'cancelled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'delivery_step_code' AND typnamespace = 'pondo_core'::regnamespace) THEN
    CREATE TYPE delivery_step_code AS ENUM ('dispatch_initiation', 'active_tracking', 'driver_assignment', 'onsite_verification', 'conclusion');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_channel' AND typnamespace = 'pondo_core'::regnamespace) THEN
    CREATE TYPE notification_channel AS ENUM ('sms', 'email', 'push', 'whatsapp');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_status' AND typnamespace = 'pondo_core'::regnamespace) THEN
    CREATE TYPE notification_status AS ENUM ('queued', 'sent', 'delivered', 'failed', 'cancelled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_attempt_status' AND typnamespace = 'pondo_core'::regnamespace) THEN
    CREATE TYPE notification_attempt_status AS ENUM ('sent', 'delivered', 'failed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_event_category' AND typnamespace = 'pondo_core'::regnamespace) THEN
    CREATE TYPE audit_event_category AS ENUM ('auth', 'checkout', 'verification', 'risk', 'payment', 'wallet', 'delivery', 'admin', 'data_access');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'outbox_status' AND typnamespace = 'pondo_core'::regnamespace) THEN
    CREATE TYPE outbox_status AS ENUM ('pending', 'published', 'failed');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS risk_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code risk_profile_code NOT NULL UNIQUE,
  display_name text NOT NULL,
  description text NULL,
  default_verification_route verification_route NOT NULL,
  risk_band smallint NOT NULL CHECK (risk_band >= 0 AND risk_band <= 200),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  role app_role NOT NULL DEFAULT 'customer',
  password_hash text NULL,
  is_active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  display_name text NOT NULL,
  status partner_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS partner_stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  store_code text NOT NULL,
  store_name text NOT NULL,
  api_base_url text NULL,
  status partner_store_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, store_code)
);

CREATE TABLE IF NOT EXISTS customer_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NULL UNIQUE REFERENCES auth_users(id) ON DELETE SET NULL,
  external_customer_ref text NULL UNIQUE,
  first_name text NULL,
  last_name text NULL,
  full_name text NULL,
  date_of_birth date NULL,
  id_number_enc bytea NULL,
  id_number_hash text NULL UNIQUE,
  nationality text NULL,
  risk_profile_id uuid NULL REFERENCES risk_profiles(id) ON DELETE SET NULL,
  current_status customer_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_contact_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
  contact_type contact_type_enum NOT NULL,
  contact_value text NOT NULL,
  contact_value_hash text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  is_verified boolean NOT NULL DEFAULT false,
  verified_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, contact_type, contact_value_hash)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_primary_contact_per_type
  ON customer_contact_methods(customer_id, contact_type)
  WHERE is_primary = true;

CREATE TABLE IF NOT EXISTS customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
  label text NULL,
  address_line_1 text NOT NULL,
  address_line_2 text NULL,
  suburb text NULL,
  city text NOT NULL,
  province text NOT NULL,
  postal_code text NOT NULL,
  country_code char(2) NOT NULL DEFAULT 'ZA',
  latitude numeric(10,7) NULL,
  longitude numeric(10,7) NULL,
  google_place_id text NULL,
  validation_status address_validation_status NOT NULL DEFAULT 'unverified',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_default_address
  ON customer_addresses(customer_id)
  WHERE is_default = true;

CREATE TABLE IF NOT EXISTS customer_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
  fingerprint_hash text NOT NULL,
  device_label text NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  trust_level device_trust_level NOT NULL DEFAULT 'unknown',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, fingerprint_hash)
);

CREATE TABLE IF NOT EXISTS customer_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
  consent_type consent_type_enum NOT NULL,
  consent_version text NOT NULL,
  accepted boolean NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip_address inet NULL,
  user_agent text NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS partner_customer_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
  partner_customer_ref text NULL,
  partner_email_hash text NULL,
  profile_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  imported_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, customer_id)
);

CREATE TABLE IF NOT EXISTS product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL UNIQUE,
  category_id uuid NULL REFERENCES product_categories(id) ON DELETE SET NULL,
  brand text NOT NULL,
  name text NOT NULL,
  description text NULL,
  merchant_name text NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  currency char(3) NOT NULL DEFAULT 'ZAR',
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  discount_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (discount_pct >= 0),
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz NULL
);

CREATE TABLE IF NOT EXISTS carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
  status cart_status NOT NULL DEFAULT 'active',
  currency char(3) NOT NULL DEFAULT 'ZAR',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_cents bigint NOT NULL CHECK (unit_price_cents >= 0),
  discount_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (discount_pct >= 0),
  line_total_cents bigint NOT NULL CHECK (line_total_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cart_id, product_id)
);

CREATE TABLE IF NOT EXISTS checkout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_code text NOT NULL UNIQUE,
  customer_id uuid NOT NULL REFERENCES customer_profiles(id) ON DELETE RESTRICT,
  partner_id uuid NULL REFERENCES partners(id) ON DELETE SET NULL,
  partner_store_id uuid NULL REFERENCES partner_stores(id) ON DELETE SET NULL,
  cart_id uuid NULL REFERENCES carts(id) ON DELETE SET NULL,
  risk_profile_id uuid NULL REFERENCES risk_profiles(id) ON DELETE SET NULL,
  delivery_address_id uuid NULL REFERENCES customer_addresses(id) ON DELETE SET NULL,
  current_step checkout_step NOT NULL DEFAULT 'press_buy',
  status checkout_status NOT NULL DEFAULT 'active',
  verification_route verification_route NOT NULL,
  source_channel source_channel_enum NOT NULL DEFAULT 'web',
  ip_address inet NULL,
  ip_city text NULL,
  ip_region text NULL,
  ip_country text NULL,
  ip_latitude numeric(10,7) NULL,
  ip_longitude numeric(10,7) NULL,
  device_fingerprint_hash text NULL,
  locked_cart_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  customer_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  partner_snapshot jsonb NULL,
  terms_consent_id uuid NULL REFERENCES customer_consents(id) ON DELETE SET NULL,
  otp_verified_at timestamptz NULL,
  risk_completed_at timestamptz NULL,
  payment_completed_at timestamptz NULL,
  expires_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS checkout_session_events (
  id bigserial PRIMARY KEY,
  checkout_session_id uuid NOT NULL REFERENCES checkout_sessions(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_type actor_type_enum NOT NULL,
  actor_id text NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_session_id uuid NULL UNIQUE REFERENCES checkout_sessions(id) ON DELETE SET NULL,
  customer_id uuid NOT NULL REFERENCES customer_profiles(id) ON DELETE RESTRICT,
  partner_id uuid NULL REFERENCES partners(id) ON DELETE SET NULL,
  delivery_address_id uuid NULL REFERENCES customer_addresses(id) ON DELETE SET NULL,
  order_number text NOT NULL UNIQUE,
  subtotal_cents bigint NOT NULL CHECK (subtotal_cents >= 0),
  delivery_cents bigint NOT NULL DEFAULT 0 CHECK (delivery_cents >= 0),
  total_cents bigint NOT NULL CHECK (total_cents >= 0),
  currency char(3) NOT NULL DEFAULT 'ZAR',
  status order_status NOT NULL DEFAULT 'created',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid NULL REFERENCES products(id) ON DELETE SET NULL,
  sku text NULL,
  product_name text NOT NULL,
  brand text NULL,
  product_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_cents bigint NOT NULL CHECK (unit_price_cents >= 0),
  discount_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (discount_pct >= 0),
  line_total_cents bigint NOT NULL CHECK (line_total_cents >= 0)
);

CREATE TABLE IF NOT EXISTS order_status_history (
  id bigserial PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status order_status NULL,
  to_status order_status NOT NULL,
  reason text NULL,
  changed_by text NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS otp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_session_id uuid NOT NULL REFERENCES checkout_sessions(id) ON DELETE CASCADE,
  channel otp_channel NOT NULL,
  destination_hash text NOT NULL,
  otp_hash text NOT NULL,
  provider text NULL,
  provider_request_ref text NULL,
  status otp_status NOT NULL DEFAULT 'sent',
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  expires_at timestamptz NOT NULL,
  verified_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS verification_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_session_id uuid NOT NULL REFERENCES checkout_sessions(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customer_profiles(id) ON DELETE RESTRICT,
  route verification_route NOT NULL,
  status verification_case_status NOT NULL DEFAULT 'open',
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz NULL
);

CREATE TABLE IF NOT EXISTS verification_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_case_id uuid NOT NULL REFERENCES verification_cases(id) ON DELETE CASCADE,
  step_code verification_step_code NOT NULL,
  status verification_step_status NOT NULL DEFAULT 'pending',
  provider text NULL,
  provider_ref text NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  UNIQUE (verification_case_id, step_code)
);

CREATE TABLE IF NOT EXISTS risk_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_session_id uuid NOT NULL REFERENCES checkout_sessions(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customer_profiles(id) ON DELETE RESTRICT,
  order_id uuid NULL REFERENCES orders(id) ON DELETE SET NULL,
  assessment_version text NOT NULL,
  score smallint NOT NULL CHECK (score >= 0 AND score <= 200),
  decision risk_decision NOT NULL,
  band risk_band_enum NOT NULL,
  verification_status verification_status NOT NULL DEFAULT 'pending',
  requires_manual_review boolean NOT NULL DEFAULT false,
  ruleset_version text NULL,
  model_version text NULL,
  decision_reason text NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  assessed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS risk_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_assessment_id uuid NOT NULL REFERENCES risk_assessments(id) ON DELETE CASCADE,
  signal_code text NOT NULL,
  source_system text NULL,
  points_assigned smallint NOT NULL,
  signal_value text NULL,
  detail text NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kyc_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_case_id uuid NOT NULL REFERENCES verification_cases(id) ON DELETE CASCADE,
  checkout_session_id uuid NOT NULL REFERENCES checkout_sessions(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_ref text NULL,
  id_document_type text NULL,
  result_status provider_check_status NOT NULL,
  response_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credit_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_case_id uuid NOT NULL REFERENCES verification_cases(id) ON DELETE CASCADE,
  checkout_session_id uuid NOT NULL REFERENCES checkout_sessions(id) ON DELETE CASCADE,
  provider text NOT NULL,
  bureau text NOT NULL,
  score integer NULL,
  tier text NULL,
  approved boolean NULL,
  response_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fraud_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_case_id uuid NOT NULL REFERENCES verification_cases(id) ON DELETE CASCADE,
  checkout_session_id uuid NOT NULL REFERENCES checkout_sessions(id) ON DELETE CASCADE,
  provider text NOT NULL,
  fraud_score numeric(8,4) NULL,
  result_status provider_check_status NOT NULL,
  response_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS affordability_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_case_id uuid NOT NULL REFERENCES verification_cases(id) ON DELETE CASCADE,
  checkout_session_id uuid NOT NULL REFERENCES checkout_sessions(id) ON DELETE CASCADE,
  provider text NOT NULL,
  declared_income_cents bigint NULL,
  verified_income_cents bigint NULL,
  approved boolean NULL,
  response_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS manual_review_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_case_id uuid NOT NULL UNIQUE REFERENCES verification_cases(id) ON DELETE CASCADE,
  queue_name text NOT NULL,
  assigned_to uuid NULL REFERENCES auth_users(id) ON DELETE SET NULL,
  status manual_review_status NOT NULL DEFAULT 'open',
  reason text NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL
);

CREATE TABLE IF NOT EXISTS payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code payment_method_code NOT NULL UNIQUE,
  display_name text NOT NULL,
  gateway_code gateway_code NOT NULL,
  requires_credit_vet boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  checkout_session_id uuid NULL REFERENCES checkout_sessions(id) ON DELETE SET NULL,
  customer_id uuid NOT NULL REFERENCES customer_profiles(id) ON DELETE RESTRICT,
  payment_method_id uuid NOT NULL REFERENCES payment_methods(id) ON DELETE RESTRICT,
  gateway_code gateway_code NOT NULL,
  external_ref text NULL UNIQUE,
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  currency char(3) NOT NULL DEFAULT 'ZAR',
  status payment_txn_status NOT NULL DEFAULT 'initiated',
  gateway_status gateway_status_code NOT NULL DEFAULT 'initiated',
  authorization_code text NULL,
  reconciled_at timestamptz NULL,
  settled_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_events (
  id bigserial PRIMARY KEY,
  payment_transaction_id uuid NOT NULL REFERENCES payment_transactions(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  gateway_ref text NULL,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settlement_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_reference text NOT NULL UNIQUE,
  processor_name text NOT NULL,
  settlement_date date NOT NULL,
  status settlement_batch_status NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_transaction_id uuid NOT NULL UNIQUE REFERENCES payment_transactions(id) ON DELETE CASCADE,
  settlement_batch_id uuid NULL REFERENCES settlement_batches(id) ON DELETE SET NULL,
  settlement_bank text NOT NULL,
  bank_account_ref text NOT NULL,
  gross_amount_cents bigint NOT NULL CHECK (gross_amount_cents >= 0),
  fee_amount_cents bigint NOT NULL DEFAULT 0 CHECK (fee_amount_cents >= 0),
  net_amount_cents bigint NOT NULL CHECK (net_amount_cents >= 0),
  currency char(3) NOT NULL DEFAULT 'ZAR',
  settled_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_transaction_id uuid NOT NULL REFERENCES payment_transactions(id) ON DELETE RESTRICT,
  refund_reference text NOT NULL UNIQUE,
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  status refund_status NOT NULL DEFAULT 'requested',
  reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chargebacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_transaction_id uuid NOT NULL REFERENCES payment_transactions(id) ON DELETE RESTRICT,
  chargeback_reference text NOT NULL UNIQUE,
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  status chargeback_status NOT NULL DEFAULT 'opened',
  reason_code text NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz NULL
);

CREATE TABLE IF NOT EXISTS wallet_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL UNIQUE REFERENCES customer_profiles(id) ON DELETE CASCADE,
  currency char(3) NOT NULL DEFAULT 'ZAR',
  status wallet_status NOT NULL DEFAULT 'active',
  available_balance_cents bigint NOT NULL DEFAULT 0,
  ledger_version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallet_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_account_id uuid NOT NULL REFERENCES wallet_accounts(id) ON DELETE CASCADE,
  payment_transaction_id uuid NULL REFERENCES payment_transactions(id) ON DELETE SET NULL,
  entry_type wallet_entry_type NOT NULL,
  direction ledger_direction NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  balance_after_cents bigint NOT NULL CHECK (balance_after_cents >= 0),
  reference_type text NULL,
  reference_id uuid NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delivery_processes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  payment_transaction_id uuid NULL UNIQUE REFERENCES payment_transactions(id) ON DELETE SET NULL,
  status delivery_status NOT NULL DEFAULT 'pending',
  progress_pct integer NOT NULL DEFAULT 0 CHECK (progress_pct >= 0 AND progress_pct <= 100),
  active_step integer NULL,
  started_at timestamptz NULL,
  completed_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delivery_process_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_process_id uuid NOT NULL REFERENCES delivery_processes(id) ON DELETE CASCADE,
  step_index integer NOT NULL CHECK (step_index > 0),
  step_code delivery_step_code NOT NULL,
  title text NOT NULL,
  detail text NOT NULL,
  status delivery_status NOT NULL DEFAULT 'pending',
  completed_at timestamptz NULL,
  UNIQUE (delivery_process_id, step_index)
);

CREATE TABLE IF NOT EXISTS shipment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_process_id uuid NOT NULL REFERENCES delivery_processes(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  location_text text NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
  order_id uuid NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_transaction_id uuid NULL REFERENCES payment_transactions(id) ON DELETE CASCADE,
  channel notification_channel NOT NULL,
  template_code text NOT NULL,
  destination_hash text NOT NULL,
  status notification_status NOT NULL DEFAULT 'queued',
  message_subject text NULL,
  message_body_redacted text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_ref text NULL,
  attempt_no integer NOT NULL CHECK (attempt_no > 0),
  status notification_attempt_status NOT NULL,
  response_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id bigserial PRIMARY KEY,
  event_category audit_event_category NOT NULL,
  actor_type actor_type_enum NOT NULL,
  actor_id text NULL,
  customer_id uuid NULL REFERENCES customer_profiles(id) ON DELETE SET NULL,
  checkout_session_id uuid NULL REFERENCES checkout_sessions(id) ON DELETE SET NULL,
  order_id uuid NULL REFERENCES orders(id) ON DELETE SET NULL,
  payment_transaction_id uuid NULL REFERENCES payment_transactions(id) ON DELETE SET NULL,
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  action text NOT NULL,
  before_state jsonb NULL,
  after_state jsonb NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS data_access_logs (
  id bigserial PRIMARY KEY,
  actor_id text NOT NULL,
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  access_purpose text NOT NULL,
  ip_address inet NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status outbox_status NOT NULL DEFAULT 'pending',
  available_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz NULL,
  retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  request_hash text NOT NULL,
  response_code integer NULL,
  response_body jsonb NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS integration_credentials_meta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_name text NOT NULL UNIQUE,
  credential_scope text NOT NULL,
  last_rotated_at timestamptz NULL,
  expires_at timestamptz NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS schema_migrations_meta (
  id bigserial PRIMARY KEY,
  migration_name text NOT NULL UNIQUE,
  applied_at timestamptz NOT NULL DEFAULT now(),
  applied_by text NULL,
  notes text NULL
);

CREATE INDEX IF NOT EXISTS idx_customer_profiles_auth_user_id ON customer_profiles(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_customer_profiles_id_number_hash ON customer_profiles(id_number_hash);
CREATE INDEX IF NOT EXISTS idx_customer_contact_methods_hash ON customer_contact_methods(contact_value_hash);
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_session_code ON checkout_sessions(session_code);
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_customer_created ON checkout_sessions(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_status_created ON checkout_sessions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_customer_created ON orders(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_order_id ON payment_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_customer_created ON payment_transactions(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status_created ON payment_transactions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_session_assessed ON risk_assessments(checkout_session_id, assessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_score_assessed ON risk_assessments(score DESC, assessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_signals_assessment_id ON risk_signals(risk_assessment_id);
CREATE INDEX IF NOT EXISTS idx_otp_challenges_session_created ON otp_challenges(checkout_session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_entries_wallet_created ON wallet_ledger_entries(wallet_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_checkout_occurred ON audit_events(checkout_session_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_order_occurred ON audit_events(order_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_manual_review_cases_open ON manual_review_cases(status, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_outbox_events_status_available ON outbox_events(status, available_at ASC);

ALTER TABLE auth_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_contact_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_customer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkout_session_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE fraud_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE affordability_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_review_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE chargebacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_process_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_credentials_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_migrations_meta ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_all_auth_users ON auth_users FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY service_all_customer_profiles ON customer_profiles FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY service_all_customer_contact_methods ON customer_contact_methods FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY service_all_customer_addresses ON customer_addresses FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY service_all_customer_devices ON customer_devices FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY service_all_customer_consents ON customer_consents FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY service_all_partner_customer_profiles ON partner_customer_profiles FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY service_all_carts ON carts FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY service_all_cart_items ON cart_items FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY service_all_checkout_sessions ON checkout_sessions FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY service_all_checkout_session_events ON checkout_session_events FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY service_all_orders ON orders FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY service_all_order_items ON order_items FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY service_all_order_status_history ON order_status_history FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY service_all_otp_challenges ON otp_challenges FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY service_all_verification_cases ON verification_cases FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY service_all_verification_steps ON verification_steps FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY service_all_risk_assessments ON risk_assessments FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY service_all_risk_signals ON risk_signals FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY service_all_kyc_checks ON kyc_checks FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY service_all_credit_checks ON credit_checks FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY service_all_fraud_checks ON fraud_checks FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY service_all_affordability_checks ON affordability_checks FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY service_all_manual_review_cases ON manual_review_cases FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY service_all_payment_transactions ON payment_transactions FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY service_all_payment_events ON payment_events FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY service_all_payment_settlements ON payment_settlements FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY service_all_refunds ON refunds FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY service_all_chargebacks ON chargebacks FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY service_all_wallet_accounts ON wallet_accounts FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY service_all_wallet_ledger_entries ON wallet_ledger_entries FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY service_all_delivery_processes ON delivery_processes FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY service_all_delivery_process_steps ON delivery_process_steps FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY service_all_shipment_events ON shipment_events FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY service_all_notifications ON notifications FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY service_all_notification_attempts ON notification_attempts FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY service_all_audit_events ON audit_events FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY service_all_data_access_logs ON data_access_logs FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY service_all_outbox_events ON outbox_events FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY service_all_idempotency_keys ON idempotency_keys FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY service_all_integration_credentials_meta ON integration_credentials_meta FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY service_all_schema_migrations_meta ON schema_migrations_meta FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
