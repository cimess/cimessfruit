# Product API

These are the implemented Next.js endpoints under `/api` (not the older
`/api/v1` design in API.md). No database migration is needed: they use the
existing Product and ProductOption models.

| Method | Path | Access | Result |
| --- | --- | --- | --- |
| GET | `/api/products` | Public | Available products with options |
| GET | `/api/products/:id` | Public | Available product, or 404 |
| GET | `/api/admin/products` | Admin | All products, including disabled |
| GET | `/api/admin/products/:id` | Admin | Product, including disabled |
| POST | `/api/admin/products` | Admin | Create product and options, 201 |
| PATCH | `/api/admin/products/:id` | Admin | Update supplied fields, 200 |
| DELETE | `/api/admin/products/:id` | Admin | Disable product, 204 |

POST, PATCH, and DELETE are also available at `/api/products` and
`/api/products/:id`, with identical admin checks. Writes require an active ADMIN
browser session or native bearer session. Browser writes must be same-origin;
cross-origin browser access is not enabled. Admin activation is available to
authenticated customers with the server-configured authorization key; see ADMIN_WEBSITE.md.

Lists return `{ items, page, limit }`. Query parameters: `page` (default 1,
maximum 10000), `limit` (default 20, maximum 100), `category` (`FRUIT`, `PLANTAIN`,
`SMOOTHIE`), and `search` (case-insensitive name/description search, max 100 chars).
Unknown/duplicate parameters are rejected. Products sort newest first with an
ID tiebreaker; options sort by price then ID. Stop on a short/empty page.
Out-of-stock options remain visible; product visibility uses `isAvailable`.

Creation example (JSON body, `Content-Type: application/json`):

```json
{
  "name": "Red Apple",
  "description": "Fresh apples",
  "category": "FRUIT",
  "imageUrl": "https://cdn.example.com/apple.webp",
  "isAvailable": true,
  "options": [
    { "size": "SMALL", "label": "One apple", "detail": "", "price": 150000, "stock": 50 },
    { "size": "BIG", "label": "Basket", "detail": "Six apples", "price": 800000, "stock": 10 }
  ]
}
```

Prices are positive integer **NGN kobo**; stock is a nonnegative integer.
Both are capped at 2147483647. Each product needs 1–3 unique sizes (`SMALL`,
`MEDIUM`, `BIG`). Names are 1–150 characters, labels 1–100, descriptions up to
2000, and option details up to 500. Image URLs must use HTTPS without credentials
or be null. Images are referenced by URL; file uploads are not part of this API.
Description defaults to empty, imageUrl to null, availability to true, and option
detail to empty. Stock must be supplied. The JSON request body limit is 8 KiB.

Create/detail/update return `{ product }`, including generated UUIDs and timestamps.
PATCH accepts any nonempty subset of product fields. Supplied options are complete
option objects upserted by size; omitted sizes remain unchanged. Existing option
UUIDs are preserved for carts and order references. Set stock to zero to stop
selling an option. DELETE sets `isAvailable=false`, retaining options and order
history; PATCH `{ "isAvailable": true }` restores visibility.

Errors use `{ error, details? }`: 400 invalid input, 401 unauthenticated,
403 non-admin or forbidden browser origin, 404 missing/hidden product,
409 conflicting write, 500 unexpected server failure. Responses are not cached.

```sh
curl 'http://localhost:3000/api/products?category=FRUIT&limit=20'
```

Validation: `npm run lint`, `npm run typecheck`, `npm test`. Set
`TEST_DATABASE_URL` to a migrated disposable PostgreSQL database to run the
product lifecycle integration test; otherwise it is skipped.

### Fixed catalogue images and current stock photos

Apply the new migration with `npm run db:deploy` before running this version.
Products now accept optional `productType` (a key from `lib/product-images.ts`)
and `imageUploadedAt` (an ISO 8601 timestamp with timezone, or null).
The website uses bundled images for product cards; `imageUrl` is the separate
current-stock photo link, fetched again when a customer opens the photo viewer.

In the admin editor, select the fixed fruit image, paste the Oracle Storage HTTPS
URL, and enter its actual upload time. Oracle upload automation is not connected.
Leave the link and timestamp blank until ready. Unknown timestamps are displayed
as unknown, never inferred from product edits. Changing a URL through the API
without a timestamp clears its old timestamp; unrelated edits preserve it.
Use a new object URL for each uploaded photo so browser/CDN caching cannot show an
older object. Signed URLs are used unchanged and must still be valid for customers.

### Populate the permanent catalogue
Run `npm run db:deploy`, then `npm run db:seed` from `api`.
The seed adds all bundled fruit types, plantain and smoothie as real editable
products. It preserves existing prices, stock, photos, names and archived status,
and matches existing fruit products before inserting missing entries.
New entries have no prices or stock until configured in Admin; customers see
"Coming soon" and cannot add them to their bag.

Add products using **Admin → Add product**, selecting the matching fixed image.
To extend the code catalogue, add a key/label/image to `lib/product-images.ts`,
copy its WebP into `public/store`, and run `npm run db:seed` again.
