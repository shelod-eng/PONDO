CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY,
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

CREATE TABLE IF NOT EXISTS audit_entries (
  id bigserial PRIMARY KEY,
  transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  at timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL,
  action text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_audit_entries_transaction_id ON audit_entries(transaction_id);

