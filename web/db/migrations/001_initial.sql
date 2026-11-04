CREATE TABLE users (
 id uuid PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE, phone_number text NOT NULL UNIQUE,
 password_hash text NOT NULL, role text NOT NULL DEFAULT 'customer' CHECK(role IN ('customer','admin')),
 is_active boolean NOT NULL DEFAULT true, delivery_address jsonb, notifications_enabled boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), refresh_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE products (
 id uuid PRIMARY KEY, name text NOT NULL, description text NOT NULL DEFAULT '', category text NOT NULL CHECK(category IN ('fruit','plantain','smoothie')),
 image_url text, is_available boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE product_options (
 product_id uuid NOT NULL REFERENCES products(id), id text NOT NULL CHECK(id IN ('small','medium','big')),
 label text NOT NULL, detail text NOT NULL DEFAULT '', price integer NOT NULL CHECK(price > 0), stock integer NOT NULL CHECK(stock >= 0),
 PRIMARY KEY(product_id,id)
);
CREATE INDEX products_category ON products(category) WHERE is_available;
CREATE TABLE delivery_zones (
 id text PRIMARY KEY, name text NOT NULL, area text NOT NULL, state text NOT NULL,
 delivery_fee integer NOT NULL CHECK(delivery_fee >= 0), estimated_minutes_min integer NOT NULL CHECK(estimated_minutes_min > 0),
 estimated_minutes_max integer NOT NULL CHECK(estimated_minutes_max >= estimated_minutes_min), is_available boolean NOT NULL DEFAULT true
);
INSERT INTO delivery_zones VALUES ('abesan-estate','Abesan Estate','Ipaja','Lagos',50000,30,60,true);
CREATE TABLE orders (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','processing','dispatched','delivered','cancelled')),
 payment_status text NOT NULL DEFAULT 'pending' CHECK(payment_status IN ('pending','success','review_required')),
 delivery_status text NOT NULL DEFAULT 'pending_confirmation' CHECK(delivery_status IN ('pending_confirmation','preparing','out_for_delivery','delivered','cancelled')),
 delivery_address jsonb NOT NULL, delivery_zone_id text NOT NULL REFERENCES delivery_zones(id),
 delivery_fee integer NOT NULL CHECK(delivery_fee >= 0), item_subtotal integer NOT NULL CHECK(item_subtotal > 0),
 total integer NOT NULL CHECK(total = item_subtotal + delivery_fee), estimated_delivery_time text NOT NULL,
 idempotency_key text NOT NULL, request_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,idempotency_key)
);
CREATE INDEX orders_user_created ON orders(user_id,created_at DESC);
CREATE INDEX orders_status_created ON orders(status,created_at DESC);
CREATE TABLE order_items (
 id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES orders(id), product_id uuid NOT NULL, option_id text NOT NULL,
 name text NOT NULL, option_label text NOT NULL, option_detail text NOT NULL, image_url text,
 quantity integer NOT NULL CHECK(quantity > 0), unit_price integer NOT NULL CHECK(unit_price > 0),
 subtotal integer NOT NULL CHECK(subtotal = quantity * unit_price), FOREIGN KEY(product_id,option_id) REFERENCES product_options(product_id,id)
);
CREATE INDEX order_items_order ON order_items(order_id);
CREATE TABLE payments (
 id uuid PRIMARY KEY, order_id uuid NOT NULL UNIQUE REFERENCES orders(id), amount integer NOT NULL CHECK(amount > 0),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','success','review_required')),
 provider text NOT NULL DEFAULT 'paystack', provider_reference text NOT NULL UNIQUE, authorization_url text,
 verified_response jsonb, initiated_at timestamptz NOT NULL DEFAULT now(), confirmed_at timestamptz
);
CREATE TABLE audit_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_id uuid REFERENCES users(id), action text NOT NULL,
 resource_id text NOT NULL, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE rate_limits (key text PRIMARY KEY, hits integer NOT NULL, expires_at timestamptz NOT NULL);
CREATE INDEX rate_limits_expiry ON rate_limits(expires_at);
