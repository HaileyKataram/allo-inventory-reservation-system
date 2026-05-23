# Allo Inventory Reservations

Race-condition-safe ecommerce inventory reservations built with Next.js App Router, TypeScript, Prisma, PostgreSQL, TailwindCSS, shadcn-style primitives, and Zod.

The core invariant: if two shoppers reserve the last unit at the same time, exactly one succeeds and the other receives HTTP 409.

## Architecture

- `app/api/*`: thin HTTP routes, validation, response shaping.
- `lib/reservation-service.ts`: transactional reservation, confirmation, and release logic.
- `lib/inventory-service.ts`: inventory read models and availability shaping.
- `lib/cleanup-service.ts`: lazy and cron-compatible expiry cleanup.
- `lib/idempotency.ts`: Stripe-style response replay for safe retries.
- `prisma/schema.prisma`: products, warehouses, inventory, reservations, idempotency keys.
- `components/*`: product list, checkout hold, countdown, status badges, toast UI.

## Architecture Diagram

```text
Browser UI
  -> App Router API route
    -> Zod validation
      -> Idempotency wrapper when header is present
        -> Prisma interactive transaction
          -> PostgreSQL row/advisory locks
            -> Inventory + Reservation tables
```

Availability is stored as `totalUnits - reservedUnits`. `reservedUnits` is denormalized intentionally so product listing reads stay simple; every state transition updates it transactionally.

## Concurrency Strategy

Reservation creation uses PostgreSQL row-level locking inside a Prisma transaction:

1. Lock the target inventory row with `SELECT ... FOR UPDATE`.
2. Compute available stock from the locked row.
3. Return HTTP 409 when available stock is insufficient.
4. Create the pending reservation.
5. Increment `reservedUnits`.
6. Commit.

The lock is scoped to one `(productId, warehouseId)` inventory row. Concurrent reservations for different inventory rows do not block each other.

## Concurrency Validation

The integration-style test in `tests/reservation-concurrency.test.ts` creates one inventory unit and runs two simultaneous `createReservation` calls against the real service logic. It asserts:

- exactly one request succeeds
- exactly one request fails
- the failure status is HTTP 409
- inventory ends with `reservedUnits = 1`

The test is skipped unless `TEST_DATABASE_URL` or `DATABASE_URL` points at a real migrated PostgreSQL database.

## Idempotency

Reservation creation and confirmation support the `Idempotency-Key` header. This protects checkout flows where clients retry after a timeout, network loss, browser refresh, or payment handoff.

When a key is present:

1. The API opens a transaction.
2. PostgreSQL takes an advisory transaction lock for the key.
3. Existing keys replay the original JSON response and status code.
4. New keys execute the business operation and store the exact response before commit.

Duplicate create requests do not reserve stock twice. Duplicate confirm requests do not decrement inventory twice. Keys are globally unique, so clients should generate a fresh key per operation.

`deleteIdempotencyKeysOlderThan` exists for future TTL cleanup once retention policy is defined.

## Reservation Lifecycle

- `PENDING`: stock is held and counted in `reservedUnits`.
- `CONFIRMED`: stock is sold; confirmation decrements both `totalUnits` and `reservedUnits`.
- `RELEASED`: shopper cancels; release decrements `reservedUnits`.
- `EXPIRED`: hold times out; cleanup decrements `reservedUnits`.

Confirmation locks the reservation row and inventory row. If the hold has expired, it is marked `EXPIRED`, stock is released, and the endpoint returns HTTP 410.

## Expiry

The system uses a hybrid strategy:

- Lazy cleanup runs before product availability reads.
- `POST /api/cron/expire-reservations` can be called by Vercel Cron.
- `npm run cleanup:expired` runs the same cleanup from the command line.

Cleanup uses `FOR UPDATE SKIP LOCKED` so multiple workers can safely process expired holds without double-releasing inventory.

## Reliability Guarantees

- No overselling for concurrent reservations against the same inventory row.
- Reservation retries with the same idempotency key replay the original response.
- Confirmation retries with the same idempotency key do not double-decrement stock.
- Expired holds release reserved stock exactly once.
- Route handlers remain thin; transaction logic stays in service modules.

## Failure Scenarios Handled

- Insufficient stock returns HTTP 409.
- Expired confirmation returns HTTP 410.
- Duplicate idempotent requests replay the stored response.
- Concurrent expiry workers skip locked rows.
- Missing product/warehouse inventory returns HTTP 404.
- Unexpected API failures surface as user-facing error states and toasts.

## Setup

Create `.env`:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require"
```

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

## Testing Strategy

- `npm run lint`: static lint checks.
- `npm exec tsc -- --noEmit`: TypeScript verification.
- `npm run build`: production Next.js build and Prisma generation.
- `npm run test`: Vitest suite; database-backed tests run when `TEST_DATABASE_URL` or `DATABASE_URL` is set.

For manual race validation, send two parallel `POST /api/reservations` requests for the seeded single-unit product/warehouse. One should return `201`; one should return `409`.

## Production Deployment Notes

- Use Supabase or another managed PostgreSQL instance.
- Run `prisma migrate deploy` from CI/CD before serving traffic.
- Set `DATABASE_URL` in Vercel project settings.
- Configure Vercel Cron to call `POST /api/cron/expire-reservations`.
- Keep Prisma Client generation in the build step.
- Use short retention for idempotency keys once operational retry windows are known.
- Add request fingerprinting before accepting untrusted idempotency reuse across payloads.

## Tradeoffs

- `reservedUnits` is denormalized for fast availability reads; correctness depends on transactional updates.
- Row locks serialize hot inventory rows, which is expected for scarce stock.
- Advisory locks are used only for idempotency replay and do not replace inventory row locks.
- Authentication, payment capture, and order records are outside this take-home scope.

## Future Improvements

- Add request fingerprints to reject accidental key reuse with a different payload.
- Add payment intent and order tables.
- Add admin inventory adjustment workflows.
- Add metrics for conflict rate, expiry volume, and lock wait time.
