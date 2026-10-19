CREATE TABLE users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE CHECK(email=lower(email)),
 name text NOT NULL, password_hash text NOT NULL, verified_at timestamptz, is_admin boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 csrf_token text NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE account_tokens (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 purpose text NOT NULL CHECK(purpose IN ('verify','reset')), expires_at timestamptz NOT NULL, used_at timestamptz
);
CREATE TABLE organizations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL CHECK(kind IN ('buyer','seller')),
 name text NOT NULL, legal_name text NOT NULL DEFAULT '', tax_id text NOT NULL DEFAULT '', business_type text NOT NULL DEFAULT '',
 contact_email text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '', origin_address text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','suspended')),
 status_reason text NOT NULL DEFAULT '', payout_encrypted text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE memberships (
 user_id uuid NOT NULL REFERENCES users, organization_id uuid NOT NULL REFERENCES organizations,
 role text NOT NULL CHECK(role IN ('owner','member')), PRIMARY KEY(user_id,organization_id)
);
CREATE TABLE business_verifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','correction')),
 notes text NOT NULL DEFAULT '', reason text NOT NULL DEFAULT '', reviewed_by uuid REFERENCES users,
 created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz
);
CREATE UNIQUE INDEX one_pending_verification ON business_verifications(organization_id) WHERE status='pending';
CREATE TABLE addresses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations,
 recipient text NOT NULL, line1 text NOT NULL, district text NOT NULL, region text NOT NULL,
 country text NOT NULL DEFAULT 'PE' CHECK(country='PE'), phone text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE brands (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL UNIQUE REFERENCES organizations,
 name text NOT NULL, story text NOT NULL DEFAULT '', location text NOT NULL DEFAULT '',
 min_order_cents integer NOT NULL DEFAULT 0 CHECK(min_order_cents>=0), shipping_cents integer NOT NULL DEFAULT 0 CHECK(shipping_cents>=0),
 shipping_regions text[] NOT NULL DEFAULT '{}', preparation_days integer NOT NULL DEFAULT 3 CHECK(preparation_days BETWEEN 0 AND 365),
 shipping_policy text NOT NULL DEFAULT '', return_policy text NOT NULL DEFAULT '',
 terms_approved boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE api_keys (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations,
 user_id uuid NOT NULL REFERENCES users, token_hash text NOT NULL UNIQUE, label text NOT NULL,
 expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE categories (
 id text PRIMARY KEY, name text NOT NULL, parent_id text REFERENCES categories
);
INSERT INTO categories(id,name) VALUES
 ('hogar','Hogar y cocina'),('belleza','Belleza y cuidado'),('moda','Moda y accesorios'),
 ('tecnologia','Tecnología'),('regalos','Regalos y papelería'),('juguetes','Juguetes y hobbies');
CREATE TABLE products (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL REFERENCES brands,
 category_id text NOT NULL REFERENCES categories, name text NOT NULL, description text NOT NULL DEFAULT '',
 sku text NOT NULL, variant text NOT NULL DEFAULT '', specifications jsonb NOT NULL DEFAULT '{}',
 wholesale_cents integer NOT NULL CHECK(wholesale_cents>0), retail_cents integer CHECK(retail_cents>0), same_tax_basis boolean NOT NULL DEFAULT false,
 moq integer NOT NULL CHECK(moq>0), pack_multiple integer NOT NULL DEFAULT 1 CHECK(pack_multiple>0),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending','published','blocked','archived')),
 review_reason text NOT NULL DEFAULT '', published_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(moq % pack_multiple=0), UNIQUE(brand_id,sku)
);
CREATE INDEX products_catalog ON products(status,category_id,published_at DESC);
CREATE TABLE product_images (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES products ON DELETE CASCADE,
 url text NOT NULL, alt text NOT NULL, position integer NOT NULL DEFAULT 0
);
CREATE TABLE inventory (
 product_id uuid PRIMARY KEY REFERENCES products ON DELETE CASCADE,
 total integer NOT NULL DEFAULT 0 CHECK(total>=0), reserved integer NOT NULL DEFAULT 0 CHECK(reserved>=0 AND reserved<=total),
 source_updated_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE favorites (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations,
 product_id uuid REFERENCES products, brand_id uuid REFERENCES brands, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((product_id IS NOT NULL)::int+(brand_id IS NOT NULL)::int=1)
);
CREATE UNIQUE INDEX favorites_product ON favorites(organization_id,product_id) WHERE product_id IS NOT NULL;
CREATE UNIQUE INDEX favorites_brand ON favorites(organization_id,brand_id) WHERE brand_id IS NOT NULL;
CREATE TABLE carts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL UNIQUE REFERENCES organizations,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE cart_items (
 cart_id uuid NOT NULL REFERENCES carts ON DELETE CASCADE, product_id uuid NOT NULL REFERENCES products,
 quantity integer NOT NULL CHECK(quantity>0), quoted_price_cents integer NOT NULL CHECK(quoted_price_cents>0),
 PRIMARY KEY(cart_id,product_id)
);
CREATE TABLE checkouts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations,
 user_id uuid NOT NULL REFERENCES users, idempotency_key text NOT NULL, request_hash text NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','approved','failed','expired','exception','refunded','partially_refunded')),
 total_cents integer NOT NULL CHECK(total_cents>0), address_snapshot jsonb NOT NULL, receipt_snapshot jsonb NOT NULL,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,idempotency_key)
);
CREATE TABLE inventory_reservations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), checkout_id uuid NOT NULL REFERENCES checkouts,
 product_id uuid NOT NULL REFERENCES products, quantity integer NOT NULL CHECK(quantity>0),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','consumed','released')),
 expires_at timestamptz NOT NULL, UNIQUE(checkout_id,product_id)
);
CREATE INDEX reservations_pending ON inventory_reservations(expires_at) WHERE state='pending';
CREATE TABLE inventory_movements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES products,
 checkout_id uuid REFERENCES checkouts, kind text NOT NULL, quantity integer NOT NULL, reference text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE purchases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), checkout_id uuid NOT NULL UNIQUE REFERENCES checkouts,
 organization_id uuid NOT NULL REFERENCES organizations, total_cents integer NOT NULL CHECK(total_cents>0),
 payment_state text NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE commission_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid REFERENCES brands,
 basis_points integer NOT NULL CHECK(basis_points BETWEEN 0 AND 10000), effective_at timestamptz NOT NULL,
 approved_by uuid NOT NULL REFERENCES users, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), purchase_id uuid NOT NULL REFERENCES purchases,
 brand_id uuid NOT NULL REFERENCES brands, buyer_id uuid NOT NULL REFERENCES organizations,
 subtotal_cents integer NOT NULL CHECK(subtotal_cents>=0), shipping_cents integer NOT NULL CHECK(shipping_cents>=0),
 commission_bps integer NOT NULL CHECK(commission_bps BETWEEN 0 AND 10000), commission_cents integer NOT NULL CHECK(commission_cents>=0),
 total_cents integer NOT NULL CHECK(total_cents=subtotal_cents+shipping_cents), refunded_cents integer NOT NULL DEFAULT 0 CHECK(refunded_cents BETWEEN 0 AND total_cents),
 state text NOT NULL DEFAULT 'awaiting_payment' CHECK(state IN ('awaiting_payment','confirmed','preparing','shipped','delivered','cancelled','payment_exception')),
 policy_snapshot jsonb NOT NULL, sandbox boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(purchase_id,brand_id)
);
CREATE INDEX orders_buyer ON orders(buyer_id,created_at DESC);
CREATE INDEX orders_brand ON orders(brand_id,created_at DESC);
CREATE TABLE order_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders,
 product_id uuid NOT NULL REFERENCES products, quantity integer NOT NULL CHECK(quantity>0),
 unit_price_cents integer NOT NULL CHECK(unit_price_cents>0), snapshot jsonb NOT NULL,
 UNIQUE(order_id,product_id)
);
CREATE TABLE order_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders,
 actor_id uuid REFERENCES users, event text NOT NULL, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE shipments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL UNIQUE REFERENCES orders,
 carrier text NOT NULL, tracking_code text NOT NULL, shipped_at timestamptz NOT NULL DEFAULT now(), delivered_at timestamptz,
 delivery_reference text
);
CREATE TABLE payment_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), checkout_id uuid NOT NULL UNIQUE REFERENCES checkouts,
 provider text NOT NULL CHECK(provider='sandbox'), amount_cents integer NOT NULL CHECK(amount_cents>0),
 state text NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE payment_events (
 provider text NOT NULL, event_id text NOT NULL, attempt_id uuid NOT NULL REFERENCES payment_attempts,
 kind text NOT NULL, occurred_at timestamptz NOT NULL, payload_hash text NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(provider,event_id)
);
CREATE TABLE ledger_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders,
 kind text NOT NULL CHECK(kind IN ('products','shipping','commission','refund','adjustment')),
 amount_cents integer NOT NULL, reference text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE settlements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL REFERENCES brands,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','eligible','scheduled','paid')),
 amount_cents integer NOT NULL CHECK(amount_cents>=0), payment_reference text, evidence_note text,
 created_at timestamptz NOT NULL DEFAULT now(), paid_at timestamptz,
 CHECK(state<>'paid' OR (length(payment_reference)>5 AND length(evidence_note)>5))
);
CREATE TABLE settlement_orders (
 settlement_id uuid NOT NULL REFERENCES settlements, order_id uuid NOT NULL UNIQUE REFERENCES orders,
 PRIMARY KEY(settlement_id,order_id)
);
CREATE TABLE incidents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders,
 created_by uuid NOT NULL REFERENCES users, reason text NOT NULL, description text NOT NULL,
 state text NOT NULL DEFAULT 'open' CHECK(state IN ('open','in_review','resolved','rejected')),
 assigned_to uuid REFERENCES users, resolution text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE incident_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), incident_id uuid NOT NULL REFERENCES incidents,
 user_id uuid NOT NULL REFERENCES users, message text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_item_id uuid NOT NULL UNIQUE REFERENCES order_items,
 buyer_id uuid NOT NULL REFERENCES organizations, rating integer NOT NULL CHECK(rating BETWEEN 1 AND 5),
 body text NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','hidden')),
 moderation_reason text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE import_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL REFERENCES brands, created_by uuid REFERENCES users,
 state text NOT NULL DEFAULT 'staged' CHECK(state IN ('staged','invalid','applied')), row_count integer NOT NULL,
 source_id uuid, created_at timestamptz NOT NULL DEFAULT now(), applied_at timestamptz
);
CREATE TABLE import_rows (
 job_id uuid NOT NULL REFERENCES import_jobs ON DELETE CASCADE, row_number integer NOT NULL,
 data jsonb NOT NULL, errors jsonb NOT NULL DEFAULT '[]', PRIMARY KEY(job_id,row_number)
);
CREATE TABLE catalog_sources (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL REFERENCES brands,
 url text NOT NULL, credential_env text, approved boolean NOT NULL DEFAULT false, enabled boolean NOT NULL DEFAULT false,
 interval_minutes integer NOT NULL DEFAULT 60 CHECK(interval_minutes BETWEEN 5 AND 10080),
 next_run_at timestamptz NOT NULL DEFAULT now(), last_run_at timestamptz, last_error text,
 failures integer NOT NULL DEFAULT 0, lease_until timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE import_jobs ADD CONSTRAINT import_source_fk FOREIGN KEY(source_id) REFERENCES catalog_sources;
CREATE TABLE source_products (
 source_id uuid NOT NULL REFERENCES catalog_sources, external_id text NOT NULL, product_id uuid NOT NULL REFERENCES products,
 updated_at timestamptz NOT NULL, PRIMARY KEY(source_id,external_id)
);
CREATE TABLE sync_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_id uuid NOT NULL REFERENCES catalog_sources,
 state text NOT NULL CHECK(state IN ('running','succeeded','failed')), message text NOT NULL DEFAULT '',
 row_count integer NOT NULL DEFAULT 0, started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz
);
CREATE TABLE notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES users, organization_id uuid REFERENCES organizations,
 kind text NOT NULL, title text NOT NULL, link text NOT NULL, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(user_id IS NOT NULL OR organization_id IS NOT NULL)
);
CREATE TABLE mail_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users, subject text NOT NULL,
 body text NOT NULL, state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sent','failed','sandbox')),
 attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(), last_error text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE attachments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations,
 incident_id uuid REFERENCES incidents, file_key text NOT NULL UNIQUE, mime text NOT NULL, size integer NOT NULL CHECK(size>0),
 public boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE audit_logs (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_id uuid REFERENCES users,
 organization_id uuid REFERENCES organizations, action text NOT NULL, resource_id text NOT NULL,
 details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE platform_settings (
 key text PRIMARY KEY, value jsonb NOT NULL, updated_by uuid REFERENCES users, updated_at timestamptz NOT NULL DEFAULT now()
);
