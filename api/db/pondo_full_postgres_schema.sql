CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE app_role AS ENUM ('customer', 'sponsor', 'admin', 'driver', 'system');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'partner_code') THEN
    CREATE TYPE partner_code AS ENUM ('amazon', 'temu', 'takealot', 'woocommerce', 'shopify');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'checkout_step') THEN
    CREATE TYPE checkout_step AS ENUM ('cart', 'press_buy', 'confirm_details', 'otp_verification', 'risk_checks', 'payment', 'delivery_tracking', 'completed', 'cancelled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'checkout_status') THEN
    CREATE TYPE checkout_status AS ENUM ('active', 'otp_pending', 'otp_verified', 'risk_pending', 'risk_approved', 'risk_failed', 'payment_pending', 'paid', 'expired', 'cancelled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method_code') THEN
    CREATE TYPE payment_method_code AS ENUM ('card', 'card_3ds', 'debit_card', 'eft', 'payfast', 'bnpl', 'speedpoint', 'ussd', 'evoucher_wallet');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gateway_code') THEN
    CREATE TYPE gateway_code AS ENUM ('peach', 'payfast', 'ozow', 'payflex', 'speedpoint', 'ussd', 'wallet');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_status') THEN
    CREATE TYPE transaction_status AS ENUM ('initiated', 'processing', 'reconciled', 'failed', 'cancelled', 'refunded');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gateway_status_code') THEN
    CREATE TYPE gateway_status_code AS ENUM ('initiated', 'credit_checked', 'authorized', 'settled', 'declined', 'failed', 'refunded');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'otp_channel') THEN
    CREATE TYPE otp_channel AS ENUM ('sms', 'email');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'otp_status') THEN
    CREATE TYPE otp_status AS ENUM ('sent', 'verified', 'expired', 'failed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'risk_check_type') THEN
    CREATE TYPE risk_check_type AS ENUM ('kyc', 'credit', 'fraud', 'affordability', 'identity_document');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'risk_check_status') THEN
    CREATE TYPE risk_check_status AS ENUM ('pending', 'approved', 'declined', 'manual_review', 'error');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'delivery_status') THEN
    CREATE TYPE delivery_status AS ENUM ('pending', 'active', 'completed', 'failed', 'cancelled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wallet_entry_type') THEN
    CREATE TYPE wallet_entry_type AS ENUM ('topup', 'purchase', 'refund', 'adjustment');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NULL,
  role app_role NOT NULL DEFAULT 'customer',
  full_name text NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL UNIQUE REFERENCES app_users(id) ON DELETE SET NULL,
  external_customer_ref text NULL,
  id_number text NULL,
  phone text NULL,
  monthly_income numeric(14,2) NULL,
  affordability_band text NULL,
  default_city text NULL,
  default_province text NULL,
  default_country text NOT NULL DEFAULT 'South Africa',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_customers_id_number UNIQUE (id_number)
);

CREATE TABLE IF NOT EXISTS customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label text NULL,
  address1 text NOT NULL,
  address2 text NULL,
  city text NOT NULL,
  province text NOT NULL,
  postal_code text NOT NULL,
  country text NOT NULL DEFAULT 'South Africa',
  latitude numeric(10,7) NULL,
  longitude numeric(10,7) NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code partner_code NOT NULL UNIQUE,
  display_name text NOT NULL,
  api_base_url text NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS partner_customer_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  partner_email text NOT NULL,
  partner_customer_ref text NULL,
  full_name text NULL,
  id_number text NULL,
  phone text NULL,
  address text NULL,
  geo_location text NULL,
  monthly_income numeric(14,2) NULL,
  affordability_band text NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, partner_email)
);

CREATE TABLE IF NOT EXISTS product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id text PRIMARY KEY,
  category_id uuid NULL REFERENCES product_categories(id) ON DELETE SET NULL,
  brand text NOT NULL,
  name text NOT NULL,
  description text NULL,
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  discount_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (discount_pct >= 0),
  rating numeric(3,2) NOT NULL DEFAULT 0 CHECK (rating >= 0),
  stock_quantity integer NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  merchant_name text NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0),
  discount_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (discount_pct >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cart_id, product_id)
);

CREATE TABLE IF NOT EXISTS checkout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_code text NOT NULL UNIQUE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE RESTRICT,
  cart_id uuid NULL REFERENCES carts(id) ON DELETE SET NULL,
  current_step checkout_step NOT NULL DEFAULT 'press_buy',
  status checkout_status NOT NULL DEFAULT 'active',
  partner_email text NOT NULL,
  locked_cart_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  partner_product_snapshot jsonb NULL,
  customer_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  geolocation_snapshot jsonb NULL,
  terms_accepted boolean NOT NULL DEFAULT false,
  terms_accepted_at timestamptz NULL,
  otp_verified_at timestamptz NULL,
  expires_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS otp_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_session_id uuid NOT NULL REFERENCES checkout_sessions(id) ON DELETE CASCADE,
  request_code text NOT NULL UNIQUE,
  channel otp_channel NOT NULL,
  destination text NOT NULL,
  otp_hash text NOT NULL,
  status otp_status NOT NULL DEFAULT 'sent',
  sent_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz NULL,
  expires_at timestamptz NOT NULL,
  failure_reason text NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_session_id uuid NULL UNIQUE REFERENCES checkout_sessions(id) ON DELETE SET NULL,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  partner_id uuid NULL REFERENCES partners(id) ON DELETE SET NULL,
  delivery_address_id uuid NULL REFERENCES customer_addresses(id) ON DELETE SET NULL,
  order_number text NOT NULL UNIQUE,
  subtotal_cents integer NOT NULL CHECK (subtotal_cents >= 0),
  delivery_cents integer NOT NULL DEFAULT 0 CHECK (delivery_cents >= 0),
  total_cents integer NOT NULL CHECK (total_cents >= 0),
  currency text NOT NULL DEFAULT 'ZAR',
  status text NOT NULL DEFAULT 'created',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_name text NOT NULL,
  brand text NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0),
  discount_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (discount_pct >= 0),
  line_total_cents integer NOT NULL CHECK (line_total_cents >= 0)
);

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY,
  order_id uuid NULL REFERENCES orders(id) ON DELETE SET NULL,
  checkout_session_id uuid NULL REFERENCES checkout_sessions(id) ON DELETE SET NULL,
  external_ref text NULL,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'ZAR',
  payment_method payment_method_code NOT NULL,
  gateway gateway_code NOT NULL,
  gateway_status gateway_status_code NOT NULL,
  credit_tier text NULL,
  qr_payload text NOT NULL,
  status transaction_status NOT NULL,
  qr_scanned_at timestamptz NULL,
  reconciled_at timestamptz NULL,
  settled_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL UNIQUE REFERENCES transactions(id) ON DELETE CASCADE,
  settlement_bank text NOT NULL,
  bank_label text NOT NULL,
  account_ref text NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  currency text NOT NULL DEFAULT 'ZAR',
  settled_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  channel otp_channel NOT NULL,
  destination text NOT NULL,
  status text NOT NULL DEFAULT 'sent',
  message text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS risk_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NULL REFERENCES transactions(id) ON DELETE CASCADE,
  checkout_session_id uuid NULL REFERENCES checkout_sessions(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  check_type risk_check_type NOT NULL,
  provider text NULL,
  sa_id text NULL,
  bureau text NULL,
  score integer NULL,
  tier text NULL,
  status risk_check_status NOT NULL DEFAULT 'pending',
  approved boolean NULL,
  response_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL
);

CREATE TABLE IF NOT EXISTS delivery_processes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  transaction_id uuid NULL UNIQUE REFERENCES transactions(id) ON DELETE CASCADE,
  status delivery_status NOT NULL DEFAULT 'pending',
  progress_pct integer NOT NULL DEFAULT 0 CHECK (progress_pct >= 0 AND progress_pct <= 100),
  active_step integer NULL,
  started_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL
);

CREATE TABLE IF NOT EXISTS delivery_process_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_process_id uuid NOT NULL REFERENCES delivery_processes(id) ON DELETE CASCADE,
  step_index integer NOT NULL CHECK (step_index > 0),
  title text NOT NULL,
  detail text NOT NULL,
  status delivery_status NOT NULL DEFAULT 'pending',
  completed_at timestamptz NULL,
  UNIQUE (delivery_process_id, step_index)
);

CREATE TABLE IF NOT EXISTS wallet_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
  balance_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'ZAR',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallet_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_account_id uuid NOT NULL REFERENCES wallet_accounts(id) ON DELETE CASCADE,
  transaction_id uuid NULL REFERENCES transactions(id) ON DELETE SET NULL,
  entry_type wallet_entry_type NOT NULL,
  amount_cents integer NOT NULL,
  balance_after_cents integer NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_entries (
  id bigserial PRIMARY KEY,
  transaction_id uuid NULL REFERENCES transactions(id) ON DELETE CASCADE,
  checkout_session_id uuid NULL REFERENCES checkout_sessions(id) ON DELETE CASCADE,
  order_id uuid NULL REFERENCES orders(id) ON DELETE CASCADE,
  at timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL,
  action text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS event_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_app_users_role ON app_users(role);
CREATE INDEX IF NOT EXISTS idx_customers_user_id ON customers(user_id);
CREATE INDEX IF NOT EXISTS idx_partner_customer_profiles_customer_id ON partner_customer_profiles(customer_id);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_carts_customer_id ON carts(customer_id);
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_customer_id ON checkout_sessions(customer_id);
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_partner_id ON checkout_sessions(partner_id);
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_status ON checkout_sessions(status);
CREATE INDEX IF NOT EXISTS idx_otp_requests_checkout_session_id ON otp_requests(checkout_session_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_partner_id ON orders(partner_id);
CREATE INDEX IF NOT EXISTS idx_transactions_order_id ON transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_transactions_checkout_session_id ON transactions(checkout_session_id);
CREATE INDEX IF NOT EXISTS idx_transactions_customer_id ON transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_gateway_status ON transactions(gateway_status);
CREATE INDEX IF NOT EXISTS idx_audit_entries_transaction_id ON audit_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_audit_entries_checkout_session_id ON audit_entries(checkout_session_id);
CREATE INDEX IF NOT EXISTS idx_audit_entries_order_id ON audit_entries(order_id);
CREATE INDEX IF NOT EXISTS idx_risk_checks_transaction_id ON risk_checks(transaction_id);
CREATE INDEX IF NOT EXISTS idx_risk_checks_checkout_session_id ON risk_checks(checkout_session_id);
CREATE INDEX IF NOT EXISTS idx_delivery_process_steps_delivery_process_id ON delivery_process_steps(delivery_process_id);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_wallet_account_id ON wallet_ledger(wallet_account_id);

INSERT INTO partners (code, display_name)
VALUES
  ('amazon', 'Amazon SA'),
  ('temu', 'Temu'),
  ('takealot', 'Takealot'),
  ('woocommerce', 'WooCommerce'),
  ('shopify', 'Shopify')
ON CONFLICT (code) DO NOTHING;

INSERT INTO product_categories (name)
VALUES
  ('Electronics'),
  ('Fashion'),
  ('Home'),
  ('Toys')
ON CONFLICT (name) DO NOTHING;
