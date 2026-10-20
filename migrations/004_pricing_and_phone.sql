-- Preserve historical orders; existing carts must explicitly accept the new price.
ALTER TABLE products ADD COLUMN supplier_cents integer;
UPDATE products SET supplier_cents=wholesale_cents,
  wholesale_cents=wholesale_cents+floor((wholesale_cents::bigint*1000+5000)/10000)::integer;
ALTER TABLE products ALTER COLUMN supplier_cents SET NOT NULL;
ALTER TABLE products ADD CONSTRAINT supplier_price_positive CHECK(supplier_cents>0);

ALTER TABLE users ADD COLUMN phone text;
ALTER TABLE users ADD COLUMN phone_verified_at timestamptz;
CREATE UNIQUE INDEX verified_user_phone ON users(phone) WHERE phone_verified_at IS NOT NULL;
CREATE TABLE phone_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone text NOT NULL,
  provider text NOT NULL CHECK(provider IN ('sandbox','twilio')),
  provider_sid text,
  code_hash text,
  sandbox_code_encrypted text,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes',
  used_at timestamptz
);
CREATE INDEX phone_verification_user_date ON phone_verifications(user_id,created_at);
CREATE INDEX phone_verification_phone_date ON phone_verifications(phone,created_at);
