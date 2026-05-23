import { Suspense } from "react";
import { ReservationCheckout } from "@/components/reservation-checkout";
import { Skeleton } from "@/components/ui/skeleton";
import { cleanupExpiredReservations } from "@/lib/cleanup-service";
import { listProductsWithAvailability } from "@/lib/inventory-service";

export const dynamic = "force-dynamic";

export default async function ReservationsPage() {
  await cleanupExpiredReservations();
  const products = await listProductsWithAvailability();

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <section className="mb-8">
        <p className="text-sm font-medium uppercase tracking-wide text-teal-700">Checkout</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">Hold inventory before payment capture.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
          The UI is optimistic, but the server is authoritative: a simultaneous last-unit reservation produces one
          success and one HTTP 409.
        </p>
      </section>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <ReservationCheckout initialProducts={products} />
      </Suspense>
    </main>
  );
}
