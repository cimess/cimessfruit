# API v1

> For the implemented Next.js product endpoints under `/api`, see
> [PRODUCTS_API.md](./PRODUCTS_API.md). The `/api/v1` contract below is an older
> design and does not describe the current product routes or enum casing.

Base path `/api/v1`. JSON request bodies require `Content-Type: application/json`. Protected requests require `Authorization: Bearer <accessToken>`. All currency fields are integer NGN kobo. IDs are UUIDs except zone IDs and product option IDs.

Successful responses:

```json
{"data": {}, "requestId": "uuid"}
```

Failures:

```json
{"error":{"code":"VALIDATION_ERROR","message":"Invalid request","details":[{"path":"items","message":"..."}]},"requestId":"uuid"}
```

Statuses: 200 success; 201 register/product/order creation (including idempotent order replay); 204 CORS preflight; 400 malformed JSON; 401 missing/invalid auth; 403 forbidden; 404 resource not found; 409 conflicts/business rule violations; 413 oversized body; 415 content type; 422 validation; 429 rate limit (`Retry-After`); 500 internal error; 502 provider error; 503 payments unconfigured. JSON body limit is 64 KiB; webhook limit is 256 KiB. Unknown input fields are rejected.

List endpoints return `data: {items, page, limit}`. `page` defaults to 1, maximum 10000; `limit` defaults to 20, maximum 100. Stop paging on a short/empty page. Sorting uses creation time descending with ID tiebreaker; product options sort by price.

## Routes

| Method | Path | Access | Body / query |
| --- | --- | --- | --- |
| GET | `/health` | Public | DB readiness, API version and money unit |
| POST | `/auth/register` | Public | `name,email,phoneNumber,password,deliveryAddress?` |
| POST | `/auth/login` | Public | `emailOrPhone,password` |
| POST | `/auth/refresh` | Refresh token | `refreshToken` |
| POST | `/auth/logout` | Signed in | No body |
| GET | `/auth/me` | Signed in | Current profile |
| POST | `/auth/password` | Signed in | `currentPassword,newPassword`; signs out all sessions |
| GET | `/users/me` | Signed in | Current profile |
| PATCH | `/users/me` | Signed in | Any of `name,phoneNumber,deliveryAddress,notificationsEnabled` |
| GET | `/products` | Public | `page,limit,category,search`; available products only |
| GET | `/products/:id` | Public | Available product + options |
| POST | `/products` | Admin | Product schema below |
| PATCH | `/products/:id` | Admin | Partial product schema; supplied options are upserted |
| DELETE | `/products/:id` | Admin | Soft-disable product |
| GET | `/delivery/zones` | Public | Available zones |
| POST | `/delivery/estimate` | Public | Address object directly |
| POST | `/orders` | Signed in | `items,deliveryAddress`; required `Idempotency-Key` header |
| GET | `/orders` | Signed in | Own orders; `page,limit,status` |
| GET | `/orders/:id` | Owner/admin | Order + snapshot items |
| POST | `/orders/:id/cancel` | Owner/admin | Pending order only; no body |
| POST | `/payments/initiate` | Owner | `orderId`; returns hosted payment URL |
| GET | `/payments/:id` | Owner/admin | Persisted payment status; does not contact provider |
| POST | `/payments/webhook` | Paystack signature | Raw provider event; `x-paystack-signature` header |
| GET | `/admin/products` | Admin | Includes disabled products; same filters as public list |
| GET | `/admin/orders` | Admin | All orders; `page,limit,status` |
| PATCH | `/admin/orders/:id/status` | Admin | `status`: next fulfillment step or pending cancellation |
| PATCH | `/admin/orders/:id/delivery-status` | Admin | `status`: `preparing,out_for_delivery,delivered,cancelled` |
| GET | `/admin/delivery/zones` | Admin | Includes paused zones |
| PATCH | `/admin/delivery/zones/:id` | Admin | `deliveryFee?,estimatedMinutesMin?,estimatedMinutesMax?,isAvailable?` |
| GET | `/admin/users` | Admin | `page,limit`; safe user fields |
| PATCH | `/admin/users/:id` | Admin | `isActive`; customer accounts only; disabling revokes sessions |
| GET | `/admin/audit` | Admin | `page,limit`; newest audit records first |

OPTIONS is available for CORS preflight. No HTTP endpoint can promote a user to admin. Use the operator CLI.

## Auth example

```sh
curl http://localhost:3000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"Customer","email":"customer@example.com","phoneNumber":"08012345678","password":"use-a-long-unique-password"}'
```

`data` contains `user`, `accessToken`, `refreshToken`, `tokenType: "Bearer"`, and `expiresIn: 900`. `user` includes `id,name,email,phoneNumber,role,deliveryAddress,notificationsEnabled`. Refresh returns the same structure, with newly rotated credentials. The old access token becomes invalid after refresh. Store neither passwords nor tokens in logs.

## Delivery address

```json
{
  "zoneId": "abesan-estate",
  "streetOrClose": "32 Road",
  "houseNumber": "House 15",
  "flatOrBlock": "",
  "landmark": "Near the mini market",
  "note": "Call on arrival",
  "phoneNumber": "08012345678"
}
```

`zoneId,streetOrClose,houseNumber,phoneNumber` are required. Other strings default to empty. Submit this object directly to `/delivery/estimate` or nest it as `deliveryAddress` in registration/profile/order requests.

Estimate response data:

```json
{"available":true,"zoneId":"abesan-estate","deliveryFee":50000,"estimatedDeliveryTime":"30-60 mins","requiresManualConfirmation":true}
```

Paused zone returns 409; unsupported zone/coordinate payload returns 422. Estimating does not reserve a fee: the order recalculates it.

## Product creation

```json
{
  "name": "Red Apple",
  "description": "Fresh apples",
  "category": "fruit",
  "imageUrl": "https://cdn.example.com/apple.webp",
  "isAvailable": true,
  "options": [
    {"id":"small","label":"Small","detail":"One apple","price":150000,"stock":50},
    {"id":"medium","label":"Medium","detail":"Three apples","price":400000,"stock":20}
  ]
}
```

Categories: `fruit,plantain,smoothie`. Option IDs: `small,medium,big`, unique within a product. Price > 0; stock >= 0. At most 3 options. Product response adds `id,createdAt,updatedAt`. Stock is per option, not a shared stock pool across sizes. Bundles/ready-made smoothies can be configured as ordinary products/options; custom blend fees and negotiation are not supported.

## Place order

```sh
curl http://localhost:3000/api/v1/orders \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: checkout-unique-request-001' \
  -d '{"items":[{"productId":"REPLACE_WITH_PRODUCT_UUID","optionId":"small","quantity":2}],"deliveryAddress":{"zoneId":"abesan-estate","streetOrClose":"32 Road","houseNumber":"15","phoneNumber":"08012345678"}}'
```

Keys must be 8–128 letters/digits/underscores/hyphens. Retry the same checkout with the same key. At most 50 distinct product/option lines, quantity 1–100 each. No duplicate product/option lines. No client prices, totals, fees, or statuses.

Returned order includes `id,userId,status,paymentStatus,deliveryStatus,deliveryAddress,deliveryZoneId,deliveryFee,itemSubtotal,total,estimatedDeliveryTime,idempotencyKey,createdAt,updatedAt,items`. Each item contains `id,orderId,productId,optionId,name,optionLabel,optionDetail,imageUrl,quantity,unitPrice,subtotal`.

## Payment and fulfillment

Submit `{"orderId":"uuid"}` to `/payments/initiate`. Response data is `id,orderId,amount,status,provider,reference,paymentUrl`. Follow `paymentUrl` in a future client integration. The provider callback/redirect is not proof of payment. Poll `/payments/:id` or retrieve the order to observe webhook-confirmed status.

Payment statuses are `pending,success,review_required`. A `review_required` payment means the provider confirmed money but fulfillment could not safely proceed; it must be reviewed/refunded by the operator. Customer input cannot mark a payment successful.

An administrator advances a verified paid order using `{"status":"processing"}`, then `dispatched`, then `delivered`. Skipping steps, going backwards, or marking pending orders paid returns 409. Delivery-status updates enforce the same state machine.

## Future mobile/web adaptation

The current mobile app is still mocked and remains unchanged. Before connecting it:

- Convert display values from kobo to naira; never send its existing calculated totals as authoritative input.
- Use UUID catalog IDs and remote `imageUrl` values instead of bundled image handles and hard-coded IDs.
- Send only the order request schema above; add idempotency keys.
- Handle `paid` in order status and the backend payment statuses, replacing the mock's automatic paid result.
- Manage access/refresh tokens and single-flight rotation appropriately for the client platform.
- Handle validation errors, 401 sign-in, 409 stock/payment conflicts, and 429 retry delays.

This work does not change any mobile services, screens, stores, or frontend integration.
