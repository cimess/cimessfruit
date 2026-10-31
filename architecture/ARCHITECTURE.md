> Historical design, not the current deployment contract. See [STRUCTURE.md](STRUCTURE.md) for the selected Vercel API / Neon PostgreSQL / Upstash Redis architecture.

# 🍎 CimessFruit — Backend Architecture Plan

> **Scope:** Production-ready monolith, PostgreSQL, JWT auth, Paystack/Flutterwave integration.
> **Principle:** Simple, correct, observable. No microservices. No premature abstraction.

---

## 1. SYSTEM OVERVIEW

```
Client (Web/Mobile)
      │
      ▼
 [ API Gateway / Reverse Proxy ]  ← Nginx or Caddy
      │
      ▼
 [ Monolith App Server ]  ← Node.js (Express/Fastify) or Python (FastAPI)
      │
      ├── Controllers  (HTTP layer — input validation, response shaping)
      ├── Services     (Business logic — the brain)
      ├── Repositories (Data access — DB queries only)
      │
      ▼
 [ PostgreSQL ]  ← Primary datastore
      │
      ▼
 [ Redis ]  ← Session cache, idempotency keys, rate limiting
```

---

## 2. ENTITY MODEL & RELATIONSHIPS

### 👤 User
| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| name | VARCHAR(100) | Display name |
| email | VARCHAR(255) | Unique, indexed |
| phone | VARCHAR(20) | Optional, unique |
| password_hash | TEXT | bcrypt, never plaintext |
| role | ENUM(customer, admin) | Default: customer |
| is_active | BOOLEAN | Soft disable support |
| created_at | TIMESTAMPTZ | |

> **Decision:** Use UUID over integer IDs — prevents enumeration attacks (don't expose sequential order counts to competitors).

---

### 🍎 Product (Fruit)
| Field | Type | Notes |
|---|---|---|
| id | UUID | |
| name | VARCHAR(100) | e.g. Apple, Banana |
| description | TEXT | Optional |
| price | NUMERIC(12,2) | Stored in kobo or naira — decide ONE, never mix |
| stock_quantity | INTEGER | Never go negative |
| unit | ENUM(kg, basket, piece) | |
| is_available | BOOLEAN | Admin toggle |
| image_url | TEXT | Optional |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

> ⚠️ **Critical:** `stock_quantity` must have a DB-level CHECK constraint: `stock_quantity >= 0`. Never rely on app-level guards alone.

---

### 🛒 Order
| Field | Type | Notes |
|---|---|---|
| id | UUID | |
| user_id | UUID | FK → User |
| status | ENUM | See status machine below |
| total_price | NUMERIC(12,2) | Calculated & locked at order creation |
| delivery_address_text | TEXT | Human-readable address — snapshot, never link live |
| street_or_close | VARCHAR(150) | Snapshotted delivery field |
| house_number | VARCHAR(80) | Snapshotted delivery field |
| flat_or_block | VARCHAR(120) | Optional delivery field |
| landmark | VARCHAR(180) | Optional delivery field |
| delivery_phone | VARCHAR(30) | Phone for delivery contact |
| delivery_lat | DECIMAL(10,8) | Nullable until map picker is added |
| delivery_lng | DECIMAL(11,8) | Nullable until map picker is added |
| delivery_zone_id | VARCHAR(80) | e.g. `abesan-estate` — derived from address/map validation |
| delivery_fee | NUMERIC(12,2) | Calculated by backend — never trusted from client |
| delivery_status | ENUM | Separate from payment/order status |
| notes | TEXT | Customer notes |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**Order Status Machine:**
```
pending → paid → processing → dispatched → delivered
    └──────────────────────────────────────→ cancelled
```

> **Rule:** Status can only move **forward** or to `cancelled`. Never backwards. Enforce this in the service layer, not just the frontend.

---

### 📦 OrderItem
| Field | Type | Notes |
|---|---|---|
| id | UUID | |
| order_id | UUID | FK → Order |
| product_id | UUID | FK → Product |
| quantity | INTEGER | |
| price_at_purchase | NUMERIC(12,2) | **SNAPSHOT** — never join back to product price |
| subtotal | NUMERIC(12,2) | Computed: quantity × price_at_purchase |

> 🔴 **Non-negotiable:** `price_at_purchase` is set once at order creation and never updated. This is your audit trail and fraud protection.

---

### 💳 Payment
| Field | Type | Notes |
|---|---|---|
| id | UUID | |
| order_id | UUID | FK → Order |
| amount | NUMERIC(12,2) | Must match order total_price exactly |
| status | ENUM(pending, success, failed, refunded) | |
| provider | ENUM(paystack, flutterwave, manual) | |
| provider_reference | VARCHAR(100) | The txn ref from the gateway — UNIQUE, indexed |
| provider_response | JSONB | Raw webhook payload — store everything |
| initiated_at | TIMESTAMPTZ | |
| confirmed_at | TIMESTAMPTZ | NULL until webhook confirms |

> ⚠️ `provider_reference` must be UNIQUE in the DB. This is your idempotency guard against duplicate webhooks.

---

## 3. LAYERED ARCHITECTURE (THE THREE ZONES)

```
┌─────────────────────────────────────────────┐
│               CONTROLLER LAYER               │
│  - Parse & validate incoming HTTP request    │
│  - Call the appropriate Service              │
│  - Shape & return HTTP response              │
│  - No business logic here. Ever.            │
└─────────────────────────┬───────────────────┘
                          │
┌─────────────────────────▼───────────────────┐
│               SERVICE LAYER                  │
│  - All business rules live here              │
│  - Orchestrates multiple repositories        │
│  - Handles DB transactions                  │
│  - Throws typed errors that controllers map  │
└─────────────────────────┬───────────────────┘
                          │
┌─────────────────────────▼───────────────────┐
│             REPOSITORY LAYER                 │
│  - ONLY raw DB queries                       │
│  - No business logic                         │
│  - Returns plain objects / rows              │
│  - Easily swappable (ORM, raw SQL, etc.)     │
└─────────────────────────────────────────────┘
```

---

## 4. CORE FLOWS (DETAILED)

### Flow 1 — Place Order

```
User POST /orders
  │
  ▼
[Controller] Validates request body (product IDs, quantities)
  │
  ▼
[OrderService.createOrder()]
  │
  ├── BEGIN TRANSACTION
  │     │
  │     ├── For each item: SELECT product WHERE id = ? FOR UPDATE
  │     │   (row-lock prevents race condition)
  │     │
  │     ├── Check: stock_quantity >= requested quantity
  │     │   → If NO: throw InsufficientStockError → 409 Conflict
  │     │
  │     ├── Calculate total_price on the backend (NEVER trust client price)
  │     │
  │     ├── INSERT into orders (status = 'pending')
  │     │
  │     ├── INSERT into order_items (with price_at_purchase snapshot)
  │     │
  │     └── DO NOT reduce stock yet (stock reduces only on payment)
  │
  └── COMMIT → Return { order_id, total_price }
```

> **Why not reduce stock now?** User might never pay. You'd have phantom stock holds. Instead, use a **reservation TTL** pattern if needed (Redis-based hold with a 15-min expiry).

---

### Flow 2 — Payment Initiation

```
User POST /payments/initiate  { order_id }
  │
  ▼
[PaymentService]
  ├── Fetch order, verify it belongs to user and is in 'pending' state
  ├── Create Payment record (status = 'pending')
  ├── Generate idempotency key (stored in Redis)
  ├── Call Paystack/Flutterwave initialize API
  └── Return { payment_url } → Frontend redirects user
```

---

### Flow 3 — Payment Webhook (THE CRITICAL PATH)

```
POST /payments/webhook  ← Payment gateway calls this, not the user
  │
  ▼
[WebhookController]
  ├── 1. Verify webhook signature (HMAC secret from gateway)
  │       → If invalid: 401, log it, alert
  │
  ├── 2. Extract provider_reference (txn ref)
  │
  ├── 3. Check idempotency:
  │       SELECT payment WHERE provider_reference = ?
  │       → If already 'success': return 200 immediately (replay protection)
  │
  ├── 4. Verify payment with provider API directly (don't trust payload amount)
  │
  ├── 5. BEGIN TRANSACTION
  │       ├── UPDATE payment SET status = 'success', confirmed_at = NOW()
  │       ├── UPDATE order SET status = 'paid'
  │       └── Reduce stock: UPDATE products SET stock_quantity = stock_quantity - ?
  │           WHERE id = ? AND stock_quantity >= ?
  │           (atomic, safe)
  │
  └── 6. COMMIT → Trigger notification (email/SMS) async
```

> 🔴 **Always return HTTP 200 to the webhook** even if you've already processed it. Gateways will retry on non-200, causing double processing.

---

### Flow 4 — Admin Fulfillment

```
PATCH /orders/:id/status  { status: "dispatched" }
  │
  ▼
[OrderService.advanceStatus()]
  ├── Verify caller is admin (role check middleware)
  ├── Validate status transition (state machine enforcement)
  ├── UPDATE order status
  └── Log status change to audit table (order_status_history)
```

---

## 5. AUTH SYSTEM

```
Register → hash password (bcrypt, cost 12) → store user → return JWT
Login    → verify password → return { access_token, expires_in }
All protected routes → middleware extracts & verifies JWT → attaches user to request
```

**Token Strategy:**
| Token | TTL | Storage |
|---|---|---|
| Access Token | 15 minutes | Memory (JS variable) |
| Refresh Token | 7 days | HttpOnly Cookie |

> **Phase 1:** Ship with access token only. Add refresh tokens in Phase 2 when you have real users. Don't over-engineer auth on day one.

**Role Middleware:**
```
requireAuth       → any logged-in user
requireAdmin      → role === 'admin'
requireOwnership  → resource.user_id === req.user.id
```

---

## 6. API CONTRACT

### Auth
| Method | Route | Access | Description |
|---|---|---|---|
| POST | `/auth/register` | Public | Create account |
| POST | `/auth/login` | Public | Get JWT |
| POST | `/auth/logout` | Auth | Invalidate refresh token |

### Products
| Method | Route | Access | Description |
|---|---|---|---|
| GET | `/products` | Public | List all available products |
| GET | `/products/:id` | Public | Single product detail |
| POST | `/products` | Admin | Create product |
| PATCH | `/products/:id` | Admin | Update price / stock / availability |
| DELETE | `/products/:id` | Admin | Soft delete |

### Orders
| Method | Route | Access | Description |
|---|---|---|---|
| POST | `/orders` | Auth | Place an order |
| GET | `/orders` | Auth | My orders (paginated) |
| GET | `/orders/:id` | Auth + Owner | Order detail |
| GET | `/admin/orders` | Admin | All orders with filters |
| PATCH | `/admin/orders/:id/status` | Admin | Advance order status |

### Payments
| Method | Route | Access | Description |
|---|---|---|---|
| POST | `/payments/initiate` | Auth | Start payment for an order |
| POST | `/payments/webhook` | Gateway (signature-verified) | Receive payment confirmation |
| GET | `/payments/:id` | Auth + Owner | Payment status check |

### Delivery
| Method | Route | Access | Description |
|---|---|---|---|
| GET | `/delivery/zones` | Public | Return available delivery zones; Phase 1 returns Abesan Estate only |
| POST | `/delivery/estimate` | Public | Send address and/or lat/lng → get zone availability + fee |
| GET | `/admin/delivery/zones` | Admin | View delivery zone configuration |
| PATCH | `/admin/delivery/zones/:id` | Admin | Update zone fee, availability, ETA, or polygon |

---

## 7. DATABASE DESIGN DECISIONS

### Why PostgreSQL?
- Native `FOR UPDATE` row locking → solves stock race condition
- `NUMERIC` type → no floating-point errors on money
- `JSONB` → store raw gateway payloads without a separate schema
- Transactions with rollback → data integrity guaranteed
- CHECK constraints → DB-level guardrails

### Key Indexes to Plan From Day One
| Table | Column(s) | Reason |
|---|---|---|
| users | email | Login lookup |
| products | is_available | List page filter |
| orders | user_id | Fetch user's orders |
| orders | status | Admin order queue |
| order_items | order_id | Join for order detail |
| payments | provider_reference | Webhook idempotency |
| payments | order_id | Link payment to order |

### Migration Strategy
- Use a migration tool (Flyway, Liquibase, or `db-migrate`)
- Never modify production DB manually
- Every schema change = a versioned, reviewed migration file
- Keep a `schema.sql` snapshot up to date for onboarding

---

## 8. CRITICAL SAFETY MECHANISMS

### 🚨 Stock Race Condition
**Problem:** Two users buy the last mango simultaneously.

**Solution (SQL level):**
```
SELECT * FROM products WHERE id = ? FOR UPDATE
→ Second request blocks until first commits
→ First commits → stock = 0
→ Second reads stock = 0 → throws InsufficientStockError
```

**Backup (DB constraint):**
```
CHECK (stock_quantity >= 0)
→ Even if your app logic fails, the DB rejects negative stock
```

---

### 🚨 Payment Fraud Prevention
**Threat model:**
- User manipulates frontend to claim "paid" without paying
- Replay of old webhook payload
- Duplicate webhook delivery from gateway

**Defenses:**
1. Always verify via gateway API call on webhook receipt
2. Compare `amount` in verification response to `order.total_price`
3. Check `provider_reference` uniqueness before processing
4. Verify webhook signature (HMAC-SHA512 for Paystack)
5. Never update order status from frontend-initiated calls

---

### 🚨 Price Manipulation
**Threat:** User sends a modified `price` in the order request.

**Rule:** Backend ignores any price sent by client.
```
total = sum(product.price × quantity) for each item
→ Calculated fresh from DB at order creation
→ Snapshotted into order_items.price_at_purchase
```

---

## 9. OBSERVABILITY PLAN

### Metrics to Track (From Day 1)
| Metric | Why |
|---|---|
| Order creation rate | Demand signal |
| Order creation latency (p95) | Performance alarm |
| Payment success rate | Revenue health |
| Payment webhook failure rate | Integration alarm |
| Stock-out events per product | Inventory planning |
| Stock update failures | Data integrity alarm |

### Logging Strategy
```
Every request:     method, route, status, latency, user_id
Every order:       order_id, user_id, total, item count
Every payment:     payment_id, provider_reference, status
Every webhook:     raw payload (sanitized), processing result
Every error:       stack trace, context, user_id if available
```

### Alerting Rules (Future)
- Payment webhook failures > 3 in 5 minutes → page on-call
- Stock quantity hits 0 for any product → slack notify admin
- Order creation p95 latency > 2s → investigate

---

## 10. PHASED DELIVERY PLAN

### Phase 1 — Core (Ship This First)
- [ ] User registration & login (JWT)
- [ ] Product CRUD (admin) + listing (public)
- [ ] Order placement with stock validation
- [ ] Abesan Estate delivery only, with address fields and backend-owned fee
- [ ] Payment initiation + webhook handler (Paystack)
- [ ] Basic admin order status updates

### Phase 2 — Harden
- [ ] Refresh token rotation
- [ ] Idempotency keys for order creation
- [ ] Redis-based stock reservation with TTL
- [ ] Order status history / audit table
- [ ] Email/SMS notifications (async queue)
- [ ] In-app map picker with Abesan Estate zone validation
- [ ] Admin zone management UI

### Phase 3 — Scale
- [ ] Product search & filtering
- [ ] Google Maps Distance Matrix or polygon-based multi-zone expansion
- [ ] Live delivery tracking
- [ ] Admin analytics dashboard
- [ ] Rate limiting per user/IP
- [ ] Background job queue (for webhooks, notifications)

---

## 11. FOLDER STRUCTURE (CONCEPTUAL)

```
src/
├── config/
│   ├── db.js              ← PostgreSQL connection
│   ├── env.js             ← validated env vars
│   └── delivery-zones.js  ← Abesan Estate zone config, fee, ETA, polygon later
├── middleware/            ← auth, role check, error handler, webhook verifier
├── modules/
│   ├── auth/
│   │   ├── auth.controller
│   │   ├── auth.service
│   │   └── auth.repository
│   ├── products/
│   ├── orders/
│   ├── payments/
│   └── delivery/
│       ├── delivery.controller  ← handles /delivery/estimate
│       ├── delivery.service     ← zone availability, fee logic
│       └── delivery.utils       ← address and polygon validation helpers
├── shared/
│   ├── errors/        ← typed error classes
│   ├── utils/         ← pagination, currency formatting
│   └── validators/    ← schema validators (Zod / Joi)
└── app.js             ← entry point, middleware registration, routing
```

> **Rule:** One module = one domain concept. If a file needs to import from 3+ modules, your model is probably wrong.

---

## 12. DECISION REGISTER

| Decision | Choice | Rationale |
|---|---|---|
| Architecture | Monolith | Speed to market, no network overhead, easier debugging |
| Database | PostgreSQL | ACID, row locking, NUMERIC type for money |
| Auth | JWT (access + refresh) | Stateless, mobile-friendly |
| Password hashing | bcrypt (cost 12) | Industry standard, resistant to GPU cracking |
| IDs | UUID v4 | No enumeration, safe for public exposure |
| Currency storage | Integer (kobo/cents) | Zero floating-point risk |
| Payment gateway | Paystack first | Nigerian market fit, solid webhook docs |
| Stock reduction timing | After confirmed payment | No phantom holds, simpler logic |
| Price source of truth | DB at order creation | Fraud prevention, audit trail |
| Delivery pricing model | Single-zone Abesan Estate MVP | Simple, predictable, and matches the current delivery capacity |
| Location source | Manual address fields first; in-app map picker later | Ships now without API keys, upgrades cleanly to exact pin validation |
| Delivery fee trust | Backend calculates, never client | Same fraud-prevention rule as product price |
| Zone validation | Address check now → polygon containment later | Better fit than distance bands while delivery is estate-based |

---

## 13. TRANSPORT / DELIVERY PLAN

### Phase 1 Scope

Delivery starts with one supported zone only:

| Field | Value |
|---|---|
| zone_id | `abesan-estate` |
| name | Abesan Estate |
| area | Ipaja |
| state | Lagos |
| availability | Admin-controlled boolean |
| delivery_fee | Backend-owned flat fee, e.g. ₦500 |
| estimated_time | e.g. 30-60 mins |

> **Decision:** Do not use distance bands for the MVP. The real business rule is "we deliver inside Abesan Estate only." Model that directly.

---

### Customer Checkout Flow

```
Customer adds items to basket
        │
        ▼
Customer opens checkout
        │
        ▼
Frontend shows Abesan Estate as the only active delivery zone
        │
        ▼
Customer enters address fields
        │
        ▼
Backend validates zone + calculates delivery fee
        │
        ▼
Customer places order
        │
        ▼
Order is created with delivery snapshot
        │
        ▼
Owner/admin manually processes and delivers the order
```

Required address fields:

| Field | Required | Notes |
|---|---|---|
| delivery_zone_id | Yes | `abesan-estate` for Phase 1 |
| street_or_close | Yes | Estate road, street, or close |
| house_number | Yes | The key delivery locator |
| flat_or_block | No | Useful for blocks/flats/apartments |
| landmark | No | Helps manual delivery |
| delivery_note | No | Extra instructions |
| phone_number | Yes | Driver/owner can call if confused |

> Store the full delivery address as a snapshot on the order. Do not depend on a user's editable saved address after the order is placed.

---

### Map Picker Plan

The app can support maps in two stages:

**Stage 1 — UI placeholder**
- Show `Use map location` in checkout.
- It explains that map selection will later pin the location and validate Abesan Estate.
- Manual address entry remains the source of truth.

**Stage 2 — In-app map picker**
- Add an in-app map screen using `react-native-maps`.
- User drops a pin or uses current location.
- App captures `{ lat, lng, formatted_address }`.
- Backend checks whether the coordinate is inside the Abesan Estate polygon.

**Stage 3 — Expansion**
- Add more delivery zones as rows/records.
- Each zone gets a polygon, fee, ETA, and availability toggle.
- The same checkout flow works for additional places.

```
User taps "Use map location"
        │
        ▼
In-app map opens
        │
        ▼
User pins exact location
        │
        ▼
POST /delivery/estimate { lat, lng, address_text }
        │
        ▼
Backend checks coordinate inside active zone polygon
        │
        ├── inside Abesan Estate → return available + fee
        └── outside zone → return unavailable + reason
```

> Opening Google Maps externally is useful for directions, but it is not enough for checkout validation because it does not reliably return the selected address to the app. Use an in-app map picker for the real order flow.

---

### Delivery Data Model

#### DeliveryZone

| Field | Type | Notes |
|---|---|---|
| id | VARCHAR(80) | e.g. `abesan-estate` |
| name | VARCHAR(100) | Abesan Estate |
| area | VARCHAR(100) | Ipaja |
| state | VARCHAR(100) | Lagos |
| delivery_fee | NUMERIC(12,2) | Backend source of truth |
| estimated_minutes_min | INTEGER | Lower ETA bound |
| estimated_minutes_max | INTEGER | Upper ETA bound |
| is_available | BOOLEAN | Admin can pause delivery |
| polygon | JSONB / GEOGRAPHY | Phase 2 map validation |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

#### Order Delivery Snapshot

| Field | Type | Set By | Notes |
|---|---|---|---|
| delivery_zone_id | VARCHAR(80) | Backend | `abesan-estate` in Phase 1 |
| delivery_address_text | TEXT | Backend | Built from submitted address fields |
| street_or_close | VARCHAR(150) | Client | Snapshotted |
| house_number | VARCHAR(80) | Client | Snapshotted |
| flat_or_block | VARCHAR(120) | Client | Optional snapshot |
| landmark | VARCHAR(180) | Client | Optional snapshot |
| delivery_note | TEXT | Client | Optional snapshot |
| delivery_phone | VARCHAR(30) | Client | Snapshotted |
| delivery_lat | DECIMAL(10,8) | Client/map, nullable | Phase 2 |
| delivery_lng | DECIMAL(11,8) | Client/map, nullable | Phase 2 |
| delivery_fee | NUMERIC(12,2) | **Backend only** | Never trust client value |
| delivery_status | ENUM | Backend/admin | See status machine below |

---

### Delivery Status Machine

Keep delivery status separate from payment status.

```
pending_confirmation → preparing → out_for_delivery → delivered
          └──────────────────────────────→ cancelled
```

Phase 1 assignment:

| Field | Value |
|---|---|
| delivery_assigned_to_type | `owner` |
| delivery_assigned_to_id | nullable until rider accounts exist |
| assigned_at | set when owner/admin accepts the order |

> Since delivery is handled manually by the owner for now, do not build complex rider dispatch yet. Leave the data model open for riders later.

---

### Admin Surfaces

Do not put an admin route inside the customer mobile app.

Recommended surfaces:

| Surface | Purpose |
|---|---|
| Admin web dashboard | Full management: orders, products, zones, reports |
| Admin mobile app later | Lightweight alerts: new order ring, accept, update status |
| Customer app | Shop, cart, checkout, order tracking only |

Backend is the source of truth. Admin web/mobile clients only read orders and send allowed status updates.

---

### Transport API Endpoints

| Method | Route | Payload | Returns |
|---|---|---|---|
| `GET` | `/delivery/zones` | — | Active zones; Phase 1 returns Abesan Estate |
| `POST` | `/delivery/estimate` | `{ zone_id, address_fields }` or `{ lat, lng }` | `{ available, zone_id, delivery_fee, eta, reason? }` |
| Updated `POST` | `/orders` | `{ items, delivery_address, map_location? }` | Order with backend-calculated delivery fee |
| `GET` | `/admin/delivery/zones` | — | Zone configuration |
| `PATCH` | `/admin/delivery/zones/:id` | `{ fee, eta, is_available, polygon? }` | Updated zone |
| `PATCH` | `/admin/orders/:id/delivery-status` | `{ status }` | Updated order delivery status |

> Backend recalculates delivery fee on `POST /orders`. The frontend can display an estimate, but the backend locks the final delivery fee.

---

### Zone Validation Rules

Phase 1:
- Accept only `zone_id = abesan-estate`.
- Require `street_or_close`, `house_number`, and `phone_number`.
- Admin/owner manually confirms that the address is in Abesan Estate before dispatch.

Phase 2:
- Store Abesan Estate as a polygon.
- Validate map coordinates with point-in-polygon.
- If outside polygon, return:

```
{
  "available": false,
  "reason": "We currently deliver inside Abesan Estate only."
}
```

---

### Security: Fake Location Risk

**Threat:** Customer drops a wrong pin or chooses a supported zone while typing an unsupported address.

**Mitigation at this scale:**
- Backend controls the fee and availability.
- Owner/admin sees the address before delivery.
- If the address looks wrong for Abesan Estate, call the customer.
- Store both typed address and map coordinates when maps are added.
- In Phase 2, reject coordinates outside the zone polygon.

> For the MVP, manual confirmation is acceptable because delivery is limited to one estate and handled directly by the owner.

---

### Paystack Fee Clarification (Confirmed)

| Fee Type | Amount | Applies To |
|---|---|---|
| Collection (customer paying you) | 1.5% + ₦100 | ALL channels: card, bank transfer, USSD |
| ₦100 waived | On transactions under ₦2,500 | ✅ Good for small fruit orders |
| Fee cap | ₦2,000 max | On large orders |
| Payout (you sending to bank) | ₦10 – ₦50 flat | When withdrawing your Paystack balance |

> The 1.5% + ₦100 applies to **all payment channels** — there is no cheaper bank-transfer-specific rate on the collection side. Pass the fee to customers as a "payment processing charge" line item, or absorb it from your delivery fee. Mom's product price stays untouched either way.
