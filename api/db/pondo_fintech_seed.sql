-- ============================================================
-- PONDO Fintech Core Seed Data
-- Run after pondo_fintech_schema.sql
-- ============================================================

SET search_path TO pondo_core, public;

INSERT INTO risk_profiles (code, display_name, description, default_verification_route, risk_band)
VALUES
  ('high_risk_male', 'High Risk Male', 'Higher-risk profile routed to full KYC and credit checks.', 'full_kyc', 70),
  ('low_risk_female', 'Low Risk Female', 'Lower-risk profile routed to OTP-only or OTP-plus-risk.', 'otp_only', 20),
  ('elderly', 'Elderly', 'Trusted elderly profile routed to OTP fast-track unless other signals escalate.', 'otp_only', 15),
  ('standard', 'Standard', 'Default profile for general customers.', 'otp_plus_risk', 35),
  ('manual_review_only', 'Manual Review Only', 'Always route to analyst review.', 'manual_review', 90)
ON CONFLICT (code) DO UPDATE
SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  default_verification_route = EXCLUDED.default_verification_route,
  risk_band = EXCLUDED.risk_band,
  updated_at = now();

INSERT INTO partners (code, display_name, status)
VALUES
  ('amazon', 'Amazon SA', 'active'),
  ('temu', 'Temu', 'active'),
  ('takealot', 'Takealot', 'active'),
  ('woocommerce', 'WooCommerce', 'active'),
  ('shopify', 'Shopify', 'active')
ON CONFLICT (code) DO UPDATE
SET
  display_name = EXCLUDED.display_name,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO partner_stores (partner_id, store_code, store_name, api_base_url, status)
SELECT p.id, seed.store_code, seed.store_name, seed.api_base_url, seed.status::partner_store_status
FROM partners p
JOIN (
  VALUES
    ('amazon', 'amazon-sa-main', 'Amazon SA Main Store', NULL, 'active'),
    ('temu', 'temu-sa-main', 'Temu South Africa', NULL, 'active'),
    ('takealot', 'takealot-main', 'Takealot Main Store', NULL, 'active'),
    ('woocommerce', 'woo-default', 'WooCommerce Default Store', NULL, 'active'),
    ('shopify', 'shopify-default', 'Shopify Default Store', NULL, 'active')
) AS seed(partner_code, store_code, store_name, api_base_url, status)
  ON p.code = seed.partner_code
ON CONFLICT (partner_id, store_code) DO UPDATE
SET
  store_name = EXCLUDED.store_name,
  api_base_url = EXCLUDED.api_base_url,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO payment_methods (code, display_name, gateway_code, requires_credit_vet)
VALUES
  ('card', 'Bank Card', 'peach', false),
  ('card_3ds', '3DS Card', 'peach', false),
  ('debit_card', 'Debit Card', 'peach', false),
  ('eft', 'EFT', 'ozow', false),
  ('payfast', 'PayFast', 'payfast', false),
  ('bnpl', 'Buy Now Pay Later', 'payflex', true),
  ('speedpoint', 'Speedpoint', 'speedpoint', false),
  ('ussd', 'USSD', 'ussd', false),
  ('evoucher_wallet', 'eVoucher Wallet', 'wallet', false)
ON CONFLICT (code) DO NOTHING;

INSERT INTO product_categories (name)
VALUES
  ('Electronics'),
  ('Fashion')
ON CONFLICT (name) DO NOTHING;

INSERT INTO products (sku, category_id, brand, name, description, merchant_name, is_active)
SELECT
  seed.sku,
  pc.id,
  seed.brand,
  seed.name,
  seed.description,
  seed.merchant_name,
  true
FROM (
  VALUES
    ('samsung-65-qled', 'Electronics', 'Samsung', '65" QLED 4K Smart TV', 'Premium QLED television for demo checkout flows.', 'TechHub SA'),
    ('samsung-s24', 'Electronics', 'Samsung', 'Galaxy S24 Ultra (256GB)', 'Flagship smartphone product used in PONDO demos.', 'TechHub SA'),
    ('apple-iphone-16', 'Electronics', 'Apple', 'iPhone 16 Pro (256GB)', 'High-value electronics item used in risk scoring flows.', 'TechHub SA'),
    ('nike-airmax', 'Fashion', 'Nike', 'Air Max 90 Sneakers', 'Footwear SKU for lower-value basket demos.', 'StyleHub SA'),
    ('adidas-ultraboost', 'Fashion', 'Adidas', 'Ultraboost Running Shoes', 'Fashion SKU for basket and settlement demos.', 'StyleHub SA')
) AS seed(sku, category_name, brand, name, description, merchant_name)
JOIN product_categories pc
  ON pc.name = seed.category_name
ON CONFLICT (sku) DO UPDATE
SET
  category_id = EXCLUDED.category_id,
  brand = EXCLUDED.brand,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  merchant_name = EXCLUDED.merchant_name,
  is_active = EXCLUDED.is_active,
  updated_at = now();

INSERT INTO product_prices (product_id, currency, amount_cents, discount_pct, effective_from)
SELECT p.id, 'ZAR', seed.amount_cents, seed.discount_pct, now()
FROM products p
JOIN (
  VALUES
    ('samsung-65-qled', 1899900::bigint, 0.00::numeric),
    ('samsung-s24', 2799900::bigint, 10.00::numeric),
    ('apple-iphone-16', 3399900::bigint, 0.00::numeric),
    ('nike-airmax', 249990::bigint, 15.00::numeric),
    ('adidas-ultraboost', 299990::bigint, 5.00::numeric)
) AS seed(sku, amount_cents, discount_pct)
  ON p.sku = seed.sku
WHERE NOT EXISTS (
  SELECT 1
  FROM product_prices pp
  WHERE pp.product_id = p.id
    AND pp.currency = 'ZAR'
    AND pp.effective_to IS NULL
);
