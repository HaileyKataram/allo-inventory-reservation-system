# Allo Inventory Reservations

A production-style ecommerce reservation system built with Next.js App Router, TypeScript, Prisma, PostgreSQL, TailwindCSS, shadcn-style UI primitives, and Zod.

The main goal is concurrency correctness: when two shoppers try to reserve the final unit at the same time, exactly one request succeeds and the other receives HTTP 409.

## Architecture

- `app/api/products` and `app/api/warehouses` expose read endpoints for the frontend.
- `app/api/reservations` creates checkout holds.
- `app/api/reservations/[id]/confirm` converts a pending reservation into a sale.
- `app/api/reservations/[id]/release` cancels a pending hold.
- `lib/reservation-service.ts` owns transaction-safe reservation, confirmation, and release logic.
- `lib/inventory-service.ts` owns inventory read models.
- `lib/cleanup-service.ts` owns lazy and cron-compatible expiry.
- `prisma/schema.prisma` defines the product, warehouse, inventory, and reservation model.

Business rules live in service modules rather than route handlers so the API layer stays thin and the transaction boundaries are easy to audit.

## Concurrency Strategy

The reservation flow uses a Prisma interactive transaction plus PostgreSQL row-level locking:

1. `SELECT ... FROM "Inventory" ... FOR UPDATE`
2. Compute `available = totalUnits - reservedUnits`
3. Return HTTP 409 if the requested quantity is not available
4. Create a `PENDING` reservation
5. Increment `Inventory.reservedUnits`
6. Commit

The lock is held until commit, so concurrent attempts for the same product and warehouse serialize on the inventory row. There is no naive read-then-update window where two requests can both observe the same final unit.

## Reservation Lifecycle

- `PENDING`: stock is held temporarily and included in `reservedUnits`.
- `CONFIRMED`: stock becomes sold; confirmation decrements both `totalUnits` and `reservedUnits`.
- `RELEASED`: shopper cancels; release decrements `reservedUnits`.
- `EXPIRED`: hold times out; cleanup decrements `reservedUnits`.

Confirm also locks the reservation row and inventory row. If the reservation has expired, it is marked `EXPIRED`, reserved stock is released, and the endpoint returns HTTP 410.

## Expiry Mechanism

The app uses a hybrid expiry strategy:

- Lazy cleanup runs before product availability reads, keeping shopper-facing stock fresh.
- `POST /api/cron/expire-reservations` is suitable for a scheduled Vercel Cron job.
- `npm run cleanup:expired` runs the same cleanup utility from the command line.

Cleanup uses `FOR UPDATE SKIP LOCKED`, which lets multiple cleanup workers safely process expired reservations without fighting over the same rows.

## Setup

Create `.env`:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require"
```

For local Postgres, omit `sslmode=require` if your database does not use TLS.

Install dependencies:

```bash
npm install
```

Create tables and seed data:

```bash
npm run prisma:migrate
npm run prisma:seed
```

Start the app:

```bash
npm run dev
```

Open `http://localhost:3000/products`.

## Testing the Race Condition

Seed data includes one product with a single unit in the East warehouse. Send two concurrent requests for that same product and warehouse:

```bash
curl -X POST http://localhost:3000/api/reservations \
  -H "Content-Type: application/json" \
  -d '{"productId":"PRODUCT_ID","warehouseId":"WAREHOUSE_ID","quantity":1}'
```

Run the command twice in parallel. One request should return `201`, and the other should return `409`.

## Deployment

This project is compatible with Supabase Postgres and Vercel:

- Set `DATABASE_URL` in Vercel project settings.
- Run migrations during deployment or from CI with `prisma migrate deploy`.
- Configure Vercel Cron to call `POST /api/cron/expire-reservations`.
- Keep Prisma Client generation in the build script.

## Tradeoffs

- The inventory model stores `reservedUnits` for fast reads and simple availability checks. This is denormalized, so all reservation state transitions must update it transactionally.
- Row-level locks are intentionally scoped to one inventory row. That keeps contention localized to a product and warehouse pair.
- The demo does not include user accounts or payment capture, but the reservation lifecycle is designed to sit before payment authorization.

## Future Improvements

- Add automated concurrency tests with a real Postgres test container.
- Add idempotency keys for reservation creation and confirmation.
- Add payment intent integration and order records.
- Add admin inventory adjustment workflows.
- Emit domain events for analytics and warehouse operations.
