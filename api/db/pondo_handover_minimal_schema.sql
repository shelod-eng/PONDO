CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  display_name text NOT NULL,
  api_base_url text NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  full_name text NULL,
  id_number text NULL,
  phone text NULL,
  address_line text NULL,
  city text NULL,
  province text NULL,
  postal_code text NULL,
  country text NOT NULL DEFAULT 'South Africa',
  monthly_income numeric(14,2) NULL,
  affordability_band text NULL,
  source_partner_code text NULL,
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id text PRIMARY KEY,
  category text NULL,
  brand text NOT NULL,
  name text NOT NULL,
  description text NULL,
  price_cents integer NOT NULL DEFAULT 0,
  discount_pct numeric(5,2) NOT NULL DEFAULT 0,
  rating numeric(3,2) NOT NULL DEFAULT 0,
  stock_quantity integer NOT NULL DEFAULT 0,
  merchant_name text NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NULL,
  session_code text NULL UNIQUE,
  status text NOT NULL DEFAULT 'active',
  currency text NOT NULL DEFAULT 'ZAR',
  subtotal_cents integer NOT NULL DEFAULT 0,
  delivery_cents integer NOT NULL DEFAULT 0,
  total_cents integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL,
  product_id text NOT NULL,
  product_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  quantity integer NOT NULL DEFAULT 1,
  unit_price_cents integer NOT NULL DEFAULT 0,
  discount_pct numeric(5,2) NOT NULL DEFAULT 0,
  line_total_cents integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS checkout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_code text NOT NULL UNIQUE,
  customer_id uuid NULL,
  partner_id uuid NULL,
  partner_code text NULL,
  partner_email text NULL,
  cart_id uuid NULL,
  current_step text NOT NULL DEFAULT 'press_buy',
  status text NOT NULL DEFAULT 'active',
  customer_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  locked_cart_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  partner_product_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  geolocation_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  terms_accepted boolean NOT NULL DEFAULT false,
  terms_accepted_at timestamptz NULL,
  otp_verified_at timestamptz NULL,
  expires_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS otp_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_session_id uuid NULL,
  request_code text NOT NULL UNIQUE,
  channel text NOT NULL,
  destination text NOT NULL,
  otp_code text NULL,
  otp_hash text NULL,
  status text NOT NULL DEFAULT 'sent',
  sent_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz NULL,
  expires_at timestamptz NULL,
  failure_reason text NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  checkout_session_id uuid NULL,
  customer_id uuid NULL,
  partner_id uuid NULL,
  partner_code text NULL,
  delivery_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  subtotal_cents integer NOT NULL DEFAULT 0,
  delivery_cents integer NOT NULL DEFAULT 0,
  total_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'ZAR',
  status text NOT NULL DEFAULT 'created',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  product_id text NULL,
  product_name text NOT NULL,
  brand text NULL,
  product_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  quantity integer NOT NULL DEFAULT 1,
  unit_price_cents integer NOT NULL DEFAULT 0,
  discount_pct numeric(5,2) NOT NULL DEFAULT 0,
  line_total_cents integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NULL,
  checkout_session_id uuid NULL,
  external_ref text NULL,
  customer_id text NOT NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'ZAR',
  payment_method text NOT NULL,
  gateway text NOT NULL,
  gateway_status text NOT NULL,
  credit_tier text NULL,
  qr_payload text NOT NULL,
  status text NOT NULL,
  qr_scanned_at timestamptz NULL,
  reconciled_at timestamptz NULL,
  settled_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NULL,
  settlement_bank text NOT NULL,
  bank_label text NOT NULL,
  account_ref text NOT NULL,
  amount_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'ZAR',
  settled_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NULL,
  channel text NOT NULL,
  destination text NOT NULL,
  status text NOT NULL DEFAULT 'sent',
  message text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS risk_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NULL,
  checkout_session_id uuid NULL,
  customer_id uuid NULL,
  check_type text NOT NULL,
  provider text NULL,
  sa_id text NULL,
  bureau text NULL,
  score integer NULL,
  tier text NULL,
  approved boolean NULL,
  status text NOT NULL DEFAULT 'pending',
  response_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL
);

CREATE TABLE IF NOT EXISTS delivery_processes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NULL,
  transaction_id uuid NULL,
  status text NOT NULL DEFAULT 'pending',
  progress_pct integer NOT NULL DEFAULT 0,
  active_step integer NULL,
  started_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL
);

CREATE TABLE IF NOT EXISTS delivery_process_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_process_id uuid NULL,
  step_index integer NOT NULL,
  title text NOT NULL,
  detail text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  completed_at timestamptz NULL
);

CREATE TABLE IF NOT EXISTS wallet_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NULL UNIQUE,
  balance_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'ZAR',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallet_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_account_id uuid NULL,
  transaction_id uuid NULL,
  entry_type text NOT NULL,
  amount_cents integer NOT NULL,
  balance_after_cents integer NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_entries (
  id bigserial PRIMARY KEY,
  transaction_id uuid NULL,
  checkout_session_id uuid NULL,
  order_id uuid NULL,
  at timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL,
  action text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_carts_customer_id ON carts(customer_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id ON cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_customer_id ON checkout_sessions(customer_id);
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_partner_code ON checkout_sessions(partner_code);
CREATE INDEX IF NOT EXISTS idx_otp_requests_checkout_session_id ON otp_requests(checkout_session_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_order_id ON transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_transactions_checkout_session_id ON transactions(checkout_session_id);
CREATE INDEX IF NOT EXISTS idx_transactions_customer_id ON transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_audit_entries_transaction_id ON audit_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_risk_checks_transaction_id ON risk_checks(transaction_id);
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

INSERT INTO products (id, category, brand, name, price_cents, discount_pct, rating, stock_quantity, merchant_name)
VALUES
  ('samsung-65-qled', 'Electronics', 'Samsung', '65" QLED 4K Smart TV', 1899900, 0, 4.8, 16, 'TechHub SA'),
  ('samsung-s24', 'Electronics', 'Samsung', 'Galaxy S24 Ultra (256GB)', 2799900, 10, 4.7, 12, 'TechHub SA'),
  ('apple-iphone-16', 'Electronics', 'Apple', 'iPhone 16 Pro (256GB)', 3399900, 0, 4.8, 7, 'TechHub SA'),
  ('nike-airmax', 'Fashion', 'Nike', 'Air Max 90 Sneakers', 249990, 15, 4.4, 25, 'StyleHub SA'),
  ('adidas-ultraboost', 'Fashion', 'Adidas', 'Ultraboost Running Shoes', 299990, 5, 4.5, 18, 'StyleHub SA')
ON CONFLICT (id) DO NOTHING;
