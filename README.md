# 🍊 CimessFruit — Architecture Overview

CimessFruit is a fresh-fruit e-commerce platform built for the Nigerian market. It consists of two main applications that share a single backend API: a **React Native mobile app** for customers and an **admin web dashboard** for store operators.

---

## Monorepo Layout

```
cimessfruit/
├── api/              # Next.js 16 — REST API + Admin web dashboard
├── mobile/           # Expo 58 / React Native 0.88 — Customer mobile app
└── deploy/           # Deployment scripts & Oracle cloud config
```

---

## 1. API (`/api`)

### Technology

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| Runtime | Node.js (Vercel Edge-compatible) |
| Database ORM | Prisma 7 + `@prisma/adapter-pg` |
| Database | PostgreSQL (Neon serverless) |
| Auth | NextAuth v5 — Google OAuth + custom email/password |
| Cache | Upstash Redis via `ioredis` |
| Email | Resend |
| Payments | Paystack |
| Product images | **Cloudinary** (public CDN, permanent URLs) |
| Evidence files | **Cloudflare R2** (private, streamed via authenticated proxy) |
| Push notifications | Expo Push + QStash worker queue |
| Deployment | Vercel |

### Directory Structure

```
api/
├── app/                        # Next.js App Router pages & API routes
│   ├── api/                    # All REST endpoints
│   │   ├── account/            # Profile management
│   │   ├── account-deletion/   # GDPR-style account removal
│   │   ├── admin/              # Admin-only endpoints (products, orders, disputes, users)
│   │   ├── auth/               # NextAuth sign-in/out/callback
│   │   ├── checkout/           # Order creation + Paystack payment initiation
│   │   ├── cron/               # Scheduled maintenance (cleanup uploads, notifications)
│   │   ├── delivery-zones/     # Delivery area lookup
│   │   ├── disputes/           # Customer dispute filing & admin resolution
│   │   ├── events/             # Server-Sent Events (SSE) realtime pilot
│   │   ├── health/             # Health check endpoint
│   │   ├── me/                 # Authenticated user info
│   │   ├── mobile/             # Mobile auth grant exchange
│   │   ├── notifications/      # Push notification delivery & receipt handling
│   │   ├── orders/             # Order list & detail for customers
│   │   ├── products/           # Public product catalogue (ETag-cached)
│   │   ├── profile/            # Address & preference updates
│   │   ├── recovery/           # Password reset flow
│   │   ├── returns/            # Return credits & refund management
│   │   ├── support/            # Support contact number + dispute tracking
│   │   ├── uploads/            # Image upload lifecycle (evidence + products)
│   │   └── v1/                 # External / webhook endpoints
│   ├── admin/                  # Admin web dashboard pages
│   ├── shop/                   # Public-facing storefront (web)
│   ├── checkout/               # Web checkout flow
│   ├── orders/                 # Web order history
│   └── ...                     # Auth pages, account, policies
│
├── server/                     # Infrastructure layer (server-only)
│   ├── auth/                   # Session resolution, proxy policy (rate limits, auth guards)
│   ├── cache/                  # Redis client + per-route cache helpers
│   ├── composition/            # Dependency wiring (DB + storage + auth per request)
│   ├── database/               # Connection pool, Prisma client factory
│   ├── email/                  # Resend email client & templates
│   └── notifications/          # Expo push token management & QStash worker
│
├── features/                   # Business logic modules
│   ├── chat/                   # Conversation & dispute message threading
│   ├── maintenance/            # Upload GC, orphan cleanup cron jobs
│   ├── realtime/               # SSE signal store (pilot)
│   ├── returns/                # Return credit ledger, allocation, refund transfer
│   └── uploads/                # Storage abstraction (Cloudinary/R2), file lifecycle
│
├── controllers/                # Thin HTTP handlers delegating to features
├── domain/                     # Shared domain types (SessionUser, etc.)
├── validation/                 # Zod schemas for request bodies
├── lib/                        # Shared utilities (rate limiter, idempotency, etc.)
├── db/                         # Raw DB helper utilities
├── types/                      # Global TypeScript augmentations
├── prisma/
│   └── schema.prisma           # Single source-of-truth for all DB models
└── generated/
    └── prisma/                 # Auto-generated Prisma client (never edited)
```

### Key Architectural Decisions

#### Authentication — Dual-Mode (Web + Mobile)
- **Web**: Standard NextAuth session cookies (Google OAuth + email/password via bcrypt).
- **Mobile**: Short-lived `MobileAuthGrant` code issued after web sign-in; the mobile app exchanges it for a durable `mobile_<hex64>` bearer token stored in `expo-secure-store`.
- Tokens are rotated on each request through the proxy middleware.

#### Request Proxy (`proxy.ts`)
Every API request passes through `proxy.ts` before reaching any route handler. It enforces:
- Auth guard (bearer token validation or session cookie check)
- Role-based access (admin-only routes)
- Rate limiting (per-user or per-IP using Redis sliding window)
- Request size limits

#### Upload Lifecycle — Hybrid Storage
Files go through a two-phase commit pattern to survive crashes:

```
Client picks file
  → POST /api/uploads/evidence   (creates UploadAsset record in DB, state=UPLOADING)
  → Stored to Cloudinary or R2
  → DB record updated to state=READY
  → expiresAt = now + 24h (draft TTL)

Dispute submitted
  → UploadAsset.state → ATTACHED, expiresAt cleared

Cron (every 10 min)
  → Deletes orphaned UPLOADING/READY assets past expiresAt from storage + DB
```

- **Product images** → Cloudinary (public CDN, permanent URL like `res.cloudinary.com/…`)
- **Evidence files** → Cloudflare R2 private bucket; served only via `/api/uploads/:id/content` with ownership + role check

#### Money — All Integer Kobo
All monetary values in the database and API are `Int` representing **Nigerian Kobo** (1 NGN = 100 kobo). Float naira values are never stored or computed. Conversion to display naira happens only in the UI layer.

#### Return Credits Ledger
The `ReturnCredit` model acts as a mini-ledger with atomic columns:

| Column | Meaning |
|---|---|
| `balance` | Total approved amount |
| `reserved` | Amount held for a pending checkout |
| `spent` | Amount permanently consumed by an order |
| `locked` | Amount locked pending a bank transfer |
| `refunded` | Amount successfully sent to the customer's bank |

---

## 2. Mobile App (`/mobile`)

### Technology

| Layer | Choice |
|---|---|
| Framework | Expo 58 / React Native 0.88 |
| Language | TypeScript 6 |
| Router | Expo Router (file-based, like Next.js App Router) |
| Styling | NativeWind 4 (Tailwind CSS for React Native) |
| Data fetching | TanStack React Query v5 |
| Forms | React Hook Form + Zod |
| State (global) | Zustand 5 |
| Animations | React Native Reanimated 4 |
| Maps | `react-native-maps` |
| Icons | `@expo/vector-icons` (Ionicons) |
| Auth storage | `expo-secure-store` (AES-encrypted, device-only keychain) |
| File uploads | `expo-file-system/legacy` `uploadAsync` (native multipart) |
| Push notifications | `expo-notifications` + server QStash worker |

### Directory Structure

```
mobile/src/
├── app/                        # Expo Router screens (file = route)
│   ├── _layout.tsx             # Root layout — auth gate, tab bar, session bootstrap
│   ├── index.tsx               # Splash / redirect
│   ├── shop/                   # Product catalogue + detail + WhatsApp negotiate
│   ├── checkout/               # Delivery zone picker → payment → confirmation
│   ├── orders/                 # Order list screen
│   ├── order/                  # Single order detail + delivery tracking
│   ├── account/                # Profile, address, preferences
│   ├── support/                # Support hub (WhatsApp chat + Dispute filing)
│   ├── auth/                   # Auth callback handler
│   ├── login/ signup/ recover/ # Auth screens
│   ├── delete-account/         # Account deletion confirmation
│   ├── policies/ privacy/      # Legal screens
│   ├── diagnostics.tsx         # Developer network diagnostics
│   └── component/              # Shared layout components (NavBar, etc.)
│
├── features/                   # Feature-scoped logic & UI components
│   ├── auth/                   # Session management, token storage, auth hooks
│   ├── cart/                   # Cart state (Zustand store)
│   ├── chat/                   # WhatsApp deep-link utility + dispute form
│   ├── delivery/               # Delivery zone picker, address form
│   ├── diagnostics/            # Request performance metrics (dev only)
│   ├── legal/                  # Policy document renderer
│   ├── notifications/          # Push token registration & permission flow
│   ├── order/                  # Order detail component, status badge
│   ├── realtime/               # SSE client (pilot, feature-flagged)
│   ├── returns/                # Return credit balance display
│   ├── shop/                   # Product card, catalogue list, image carousel
│   ├── support/                # Support Hub screen (WhatsApp + Log Dispute tabs)
│   ├── ui/                     # Reusable primitive components
│   ├── uploads/                # ImageUpload component + draft management
│   └── user/                   # User profile hooks and helpers
│
└── lib/
    ├── api.ts                  # Configured API client instance
    └── api-client.ts           # Core HTTP client (auth, ETag cache, retry logic)
```

### Key Architectural Decisions

#### API Client (`lib/api-client.ts`)
A single typed `apiRequest<T>` function handles all server communication:
- Reads the bearer token from `expo-secure-store` before every request
- Detects 401 → clears session → triggers re-login
- Maintains a 32-slot ETag response cache for the product catalogue (avoids re-downloading unchanged listings)
- All token reads/writes are serialised through a mutex queue to prevent concurrent session corruption

#### Support Hub — WhatsApp-First
Customer communication is intentionally simple:
- **Chat** tab → `openWhatsApp()` deep-links directly to the admin's WhatsApp number with a pre-filled message. No in-app messaging backend needed.
- **Dispute** tab → structured form (order selector, reason, photo evidence) that submits to `/api/disputes` and stores evidence on Cloudflare R2.

#### Evidence Upload — Native Multipart
React Native's Hermes engine cannot construct `Blob` objects from `ArrayBuffer`/`Uint8Array`. The evidence upload bypasses all JS-level binary handling by using `FileSystem.uploadAsync` from `expo-file-system/legacy`:
```
file:// URI  →  native OS multipart  →  /api/uploads/evidence
```
The auth bearer token is injected into the `Authorization` header manually before the upload.

#### Draft Management (`features/uploads/drafts.ts`)
Selected-but-not-yet-uploaded photos are saved to a per-user sandboxed directory on device. If the app is killed mid-flow, the draft directory is scanned on next launch and the pending picker result is recovered automatically via `ImagePicker.getPendingResultAsync()`.

---

## 3. Database Schema — Entity Overview

```
User
 ├── Account[]            OAuth provider links
 ├── Session[]            Active sessions (web + mobile token)
 ├── PushInstallation[]   Device push tokens (per session)
 ├── Order[]
 │    ├── OrderItem[]
 │    ├── Payment
 │    ├── ReturnCredit[]
 │    │    ├── ReturnedItem[]
 │    │    ├── CreditAllocation[]
 │    │    └── RefundTransfer[]
 │    └── Dispute[]
 │         └── Conversation
 │              └── ConversationMessage[]
 ├── Dispute[]
 ├── UploadAsset[]        Tracked file lifecycle (evidence + products)
 └── ReturnCredit[]

Product
 └── ProductOption[]      SMALL / MEDIUM / BIG sizes with stock & price

DeliveryZone             Named delivery areas with fee & ETA bounds

NotificationEvent        Fan-out event (order status, etc.)
 └── NotificationDelivery[]  Per-device delivery attempt tracking

RealtimeSignal           Lightweight SSE event log (pilot)
SubmissionReceipt        Idempotency receipts for critical mutations
AuthRateLimit            Sliding-window counters for auth endpoints
MobileAuthGrant          Short-lived code for web-to-mobile credential handoff
```

---

## 4. Data Flow — Order Lifecycle

```
Customer (Mobile)
  1. Browses /api/products  (ETag-cached, public)
  2. Adds to cart  (Zustand, device only — no server state)
  3. Selects delivery zone  <- /api/delivery-zones
  4. POST /api/checkout     <- idempotency key prevents double-charge
        → creates Order (PENDING) + Payment record
        → returns Paystack authorization URL
  5. Opens Paystack in WebView / browser
  6. Paystack webhook → /api/v1/paystack/webhook
        → verifies signature
        → marks Payment SUCCESS
        → Order status → PAID
        → triggers QStash push notification job
  7. Admin dispatches order
        → PATCH /api/admin/orders/:id/status → DISPATCHED
        → customer receives push "Your order is on the way"
  8. Admin marks delivered → DELIVERED
```

---

## 5. Data Flow — Dispute Lifecycle

```
Customer
  1. Selects order in dispute form
  2. Selects affected items + reason
  3. (Optional) Picks evidence photos
     → FileSystem.uploadAsync → /api/uploads/evidence
     → File stored in Cloudflare R2 (private)
     → UploadAsset record created (state=READY, expires in 24h)
  4. Submits dispute → POST /api/disputes
     → Dispute created (status=OPEN)
     → UploadAsset.state → ATTACHED (never auto-deleted)
     → Conversation + first ConversationMessage created

Admin
  5. Reviews dispute in admin dashboard
  6. Fetches evidence → GET /api/uploads/:id/content
     → Ownership check (admin + ATTACHED state)
     → Streams bytes from R2 private bucket
  7. Approves/rejects → PATCH /api/admin/disputes/:id
     → If approved: ReturnCredit created + credited to balance
     → Customer notified via push
```

---

## 6. Infrastructure & Deployment

| Service | Purpose |
|---|---|
| **Vercel** | API + admin web hosting (serverless, edge-compatible) |
| **Neon PostgreSQL** | Serverless Postgres with connection pooler |
| **Upstash Redis** | Rate limiting & response caching |
| **Upstash QStash** | Durable background job queue (push notifications) |
| **Cloudinary** | Product photo CDN (public, permanent) |
| **Cloudflare R2** | Private dispute evidence object storage |
| **Resend** | Transactional email (verification, password reset) |
| **Paystack** | Nigerian payment gateway (card, bank transfer) |
| **Expo EAS** | Mobile build & OTA update distribution |
| **Expo Push** | Managed push notification delivery (APNs + FCM) |

### Environment Variables Summary

**API (`.env`)**
```
DATABASE_URL              Neon pooled connection string
AUTH_SECRET               NextAuth signing secret
AUTH_GOOGLE_ID/SECRET     Google OAuth credentials
RESEND_API_KEY            Email delivery
CLOUDINARY_CLOUD_NAME     Product image storage
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
R2_ACCOUNT_ID             Private evidence storage (Cloudflare R2)
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_EVIDENCE_BUCKET
APP_URL                   Canonical API origin (used in evidence URLs)
REDIS_URL                 Upstash Redis TLS URL
CRON_SECRET               Vercel Cron authorization
QSTASH_TOKEN              Background job queue
QSTASH_URL
QSTASH_CURRENT_SIGNING_KEY
QSTASH_NEXT_SIGNING_KEY
```

**Mobile (`.env.local`)**
```
EXPO_PUBLIC_API_URL       Base URL of the API server
```

---

## 7. Security Notes

- **All money is integer kobo** — no float arithmetic anywhere in the codebase.
- **Evidence files are never publicly accessible** — stored in a private R2 bucket and served exclusively through an authenticated proxy endpoint that verifies ownership and attachment state.
- **Bearer tokens** for mobile are 64-byte hex strings stored in the device keychain with `WHEN_UNLOCKED_THIS_DEVICE_ONLY` access policy.
- **Password hashing** uses `bcryptjs` (cost factor 10+).
- **Idempotency keys** on checkout prevent duplicate orders from network retries.
- **Timing-safe comparison** is used for all secret/token validation (`timingSafeEqual` from `node:crypto`).
- **Rate limiting** is applied to auth, upload, and checkout endpoints via a Redis sliding-window counter.
# cimessfruit
