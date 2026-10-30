-- Additive negotiation and conversations; historical purchases remain intact.
CREATE TABLE conversations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL REFERENCES brands,
 buyer_id uuid NOT NULL REFERENCES organizations, product_id uuid REFERENCES products,
 order_id uuid UNIQUE REFERENCES orders, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX conversations_participants ON conversations(buyer_id,brand_id);
CREATE TABLE conversation_messages (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, conversation_id uuid NOT NULL REFERENCES conversations,
 user_id uuid NOT NULL REFERENCES users, organization_id uuid REFERENCES organizations,
 message text NOT NULL CHECK(length(message) BETWEEN 1 AND 4000), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX conversation_message_history ON conversation_messages(conversation_id,id);
CREATE TABLE conversation_reads (
 conversation_id uuid NOT NULL REFERENCES conversations, user_id uuid NOT NULL REFERENCES users,
 last_message_id bigint NOT NULL DEFAULT 0, PRIMARY KEY(conversation_id,user_id)
);
CREATE TABLE order_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL REFERENCES brands,
 buyer_id uuid NOT NULL REFERENCES organizations, conversation_id uuid NOT NULL UNIQUE REFERENCES conversations,
 address_id uuid REFERENCES addresses, destination jsonb NOT NULL, requested_items jsonb NOT NULL,
 state text NOT NULL DEFAULT 'requested' CHECK(state IN ('requested','offered','accepted','cancelled')),
 version integer NOT NULL DEFAULT 0 CHECK(version>=0), accepted_version integer,
 order_id uuid UNIQUE REFERENCES orders, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_requests_buyer ON order_requests(buyer_id,created_at DESC);
CREATE INDEX order_requests_brand ON order_requests(brand_id,created_at DESC);
CREATE TABLE request_quotes (
 request_id uuid NOT NULL REFERENCES order_requests, version integer NOT NULL CHECK(version>0),
 author_id uuid NOT NULL REFERENCES users, items jsonb NOT NULL,
 subtotal_cents integer NOT NULL CHECK(subtotal_cents>0), discount_cents integer NOT NULL CHECK(discount_cents>=0 AND discount_cents<subtotal_cents),
 shipping_cents integer CHECK(shipping_cents>=0), total_cents integer,
 dispatch_date date NOT NULL, arrival_from date NOT NULL, arrival_to date NOT NULL,
 delivery_mode text NOT NULL CHECK(delivery_mode IN ('agency','home')),
 delivery_details text NOT NULL, note text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(request_id,version), CHECK(arrival_from>=dispatch_date AND arrival_to>=arrival_from),
 CHECK((shipping_cents IS NULL AND total_cents IS NULL) OR (shipping_cents IS NOT NULL AND total_cents IS NOT NULL AND total_cents=subtotal_cents-discount_cents+shipping_cents))
);
ALTER TABLE order_requests ADD FOREIGN KEY(id,accepted_version) REFERENCES request_quotes(request_id,version);
CREATE TABLE request_acceptances (
 request_id uuid NOT NULL, version integer NOT NULL, user_id uuid NOT NULL REFERENCES users,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(request_id,version),
 FOREIGN KEY(request_id,version) REFERENCES request_quotes(request_id,version)
);
CREATE TABLE request_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, request_id uuid NOT NULL REFERENCES order_requests,
 user_id uuid NOT NULL REFERENCES users, event text NOT NULL, details jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION preserve_negotiation_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION 'El historial de condiciones y mensajes es inmutable';
END $$;
CREATE TRIGGER immutable_quotes BEFORE UPDATE OR DELETE ON request_quotes FOR EACH ROW EXECUTE FUNCTION preserve_negotiation_history();
CREATE TRIGGER immutable_acceptances BEFORE UPDATE OR DELETE ON request_acceptances FOR EACH ROW EXECUTE FUNCTION preserve_negotiation_history();
CREATE TRIGGER immutable_messages BEFORE UPDATE OR DELETE ON conversation_messages FOR EACH ROW EXECUTE FUNCTION preserve_negotiation_history();
ALTER TABLE shipments ADD COLUMN delivery_mode text CHECK(delivery_mode IN ('agency','home'));
ALTER TABLE shipments ADD COLUMN delivery_details text NOT NULL DEFAULT '';
ALTER TABLE shipments ADD COLUMN tracking_url text;
