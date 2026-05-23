import { ProductGrid } from "@/components/product-grid";
import { cleanupExpiredReservations } from "@/lib/cleanup-service";
import { listProductsWithAvailability } from "@/lib/inventory-service";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  await cleanupExpiredReservations();
  const products = await listProductsWithAvailability();

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <section className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-teal-700">Inventory reservation system</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">Reserve scarce stock without overselling.</h1>
        </div>
        <p className="max-w-xl text-sm leading-6 text-zinc-600">
          Every checkout hold locks the inventory row, validates availability, creates a reservation, and increments
          reserved units inside one database transaction.
        </p>
      </section>
      <ProductGrid products={products} />
    </main>
  );
}
