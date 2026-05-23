"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle, PackageCheck, ShieldCheck, ShoppingCart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProductWithAvailability } from "@/lib/inventory-service";

export function ProductGrid({ products }: { products: ProductWithAvailability[] }) {
  const router = useRouter();

  if (products.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-white p-10 text-center">
        <h2 className="text-lg font-semibold">No inventory is available</h2>
        <p className="mt-2 text-sm text-zinc-600">
          Seed the database or add products and warehouse stock before testing reservations.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {products.map((product) => {
        const totalAvailable = product.inventories.reduce((sum, inventory) => sum + inventory.availableUnits, 0);
        const isLowStock = totalAvailable > 0 && totalAvailable <= 2;

        return (
          <Card key={product.id} className={isLowStock ? "overflow-hidden border-orange-200" : "overflow-hidden"}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>{product.name}</CardTitle>
                  <CardDescription>{product.sku}</CardDescription>
                </div>
                <Badge
                  className={
                    totalAvailable === 0
                      ? "border-red-200 bg-red-50 text-red-800"
                      : isLowStock
                        ? "border-orange-200 bg-orange-50 text-orange-800"
                        : "border-teal-200 bg-teal-50 text-teal-800"
                  }
                >
                  {totalAvailable === 0 ? "Out of Stock" : isLowStock ? `${totalAvailable} low stock` : `${totalAvailable} available`}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-3xl font-semibold">${product.price}</div>
              <div className="space-y-2">
                {product.inventories.map((inventory) => (
                  <div
                    key={inventory.id}
                    className={
                      inventory.availableUnits === 0
                        ? "flex items-center justify-between rounded-md bg-red-50 px-3 py-2 text-sm"
                        : inventory.availableUnits <= 2
                          ? "flex items-center justify-between rounded-md bg-orange-50 px-3 py-2 text-sm"
                          : "flex items-center justify-between rounded-md bg-zinc-50 px-3 py-2 text-sm"
                    }
                  >
                    <div>
                      <div className="font-medium">{inventory.warehouseName}</div>
                      <div className="text-xs text-zinc-500">{inventory.warehouseLocation}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono">{inventory.availableUnits}</div>
                      <div className="text-xs text-zinc-500">{inventory.availableUnits === 0 ? "sold out" : "free"}</div>
                    </div>
                  </div>
                ))}
              </div>
              {isLowStock && (
                <div className="flex items-center gap-2 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900">
                  <AlertTriangle className="h-4 w-4" />
                  Limited availability across warehouses.
                </div>
              )}
              <div className="grid gap-2 text-sm text-zinc-600">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-teal-700" />
                  Row-locked reservations
                </div>
                <div className="flex items-center gap-2">
                  <PackageCheck className="h-4 w-4 text-teal-700" />
                  Multi-warehouse stock
                </div>
              </div>
              <Button
                className="w-full"
                disabled={totalAvailable === 0}
                onClick={() => router.push(`/reservations?productId=${product.id}`)}
              >
                <ShoppingCart className="h-4 w-4" />
                Reserve
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
