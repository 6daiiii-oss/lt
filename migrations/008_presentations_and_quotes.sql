ALTER TABLE products ADD COLUMN presentations jsonb NOT NULL DEFAULT '[]';
ALTER TABLE products ADD COLUMN quote_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE inventory ADD COLUMN pack_stock jsonb NOT NULL DEFAULT '{}';
CREATE TABLE special_quotes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), buyer_id uuid NOT NULL REFERENCES organizations,
 brand_id uuid NOT NULL REFERENCES brands, created_by uuid NOT NULL REFERENCES users,
 status text NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','offered','accepted','declined','cancelled')),
 version integer NOT NULL DEFAULT 0, request_items jsonb NOT NULL, destination jsonb NOT NULL,
 buyer_note text NOT NULL DEFAULT '', seller_note text NOT NULL DEFAULT '', offer jsonb,
 expires_at timestamptz, accepted_at timestamptz, checkout_id uuid REFERENCES checkouts,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quotes_buyer ON special_quotes(buyer_id,created_at DESC);
CREATE INDEX quotes_brand ON special_quotes(brand_id,created_at DESC);
ALTER TABLE cart_items ADD COLUMN presentation_key text NOT NULL DEFAULT '';
ALTER TABLE cart_items ADD COLUMN pack_quantity integer CHECK(pack_quantity>0);
ALTER TABLE cart_items ADD COLUMN assortment_note text NOT NULL DEFAULT '';
ALTER TABLE cart_items ADD COLUMN offer_id uuid REFERENCES special_quotes;
ALTER TABLE inventory_reservations ADD COLUMN inventory_key text NOT NULL DEFAULT '';
ALTER TABLE order_items ADD COLUMN line_total_cents integer;
UPDATE order_items SET line_total_cents=quantity*unit_price_cents;
ALTER TABLE order_items ALTER COLUMN line_total_cents SET NOT NULL;
ALTER TABLE order_items ADD CONSTRAINT positive_line_total CHECK(line_total_cents>0);

ALTER TABLE inventory_movements ADD COLUMN inventory_key text NOT NULL DEFAULT '';
