"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, RefreshCcw, ShoppingBag, XCircle } from "lucide-react";
import { Countdown } from "@/components/countdown";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProductWithAvailability } from "@/lib/inventory-service";
import type { ReservationDto } from "@/lib/reservation-service";

type ProductsResponse = {
  products: ProductWithAvailability[];
};

export function ReservationCheckout({ initialProducts }: { initialProducts: ProductWithAvailability[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialProductId = searchParams.get("productId");
  const [products, setProducts] = useState<ProductWithAvailability[]>(initialProducts);
  const [selectedProductId, setSelectedProductId] = useState(initialProductId ?? "");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [reservation, setReservation] = useState<ReservationDto | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  const refreshProducts = useCallback(async () => {
    setIsLoading(true);
    const response = await fetch("/api/products", { cache: "no-store" });
    const data = (await response.json()) as ProductsResponse;
    setProducts(data.products);
    setIsLoading(false);
  }, []);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedProductId) ?? products[0],
    [products, selectedProductId]
  );

  const selectedInventory =
    selectedProduct?.inventories.find((inventory) => inventory.warehouseId === selectedWarehouseId) ??
    selectedProduct?.inventories.find((inventory) => inventory.availableUnits > 0) ??
    selectedProduct?.inventories[0];

  async function reserve() {
    if (!selectedProduct || !selectedInventory) {
      return;
    }

    const previousProducts = products;
    setMessage({ type: "info", text: "Holding stock while the database lock verifies availability." });
    setProducts((current) =>
      current.map((product) =>
        product.id !== selectedProduct.id
          ? product
          : {
              ...product,
              inventories: product.inventories.map((inventory) =>
                inventory.warehouseId === selectedInventory.warehouseId
                  ? { ...inventory, availableUnits: Math.max(0, inventory.availableUnits - quantity) }
                  : inventory
              )
            }
      )
    );

    startTransition(async () => {
      const response = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selectedProduct.id,
          warehouseId: selectedInventory.warehouseId,
          quantity
        })
      });

      const data = await response.json();

      if (!response.ok) {
        setProducts(previousProducts);
        setReservation(null);
        setMessage({
          type: "error",
          text: response.status === 409 ? "Another checkout beat you to that stock. Please try a different warehouse." : data.error
        });
        return;
      }

      setReservation(data.reservation);
      setMessage({ type: "success", text: "Stock is reserved. Confirm before the hold expires." });
      router.refresh();
    });
  }

  async function confirm() {
    if (!reservation) {
      return;
    }

    startTransition(async () => {
      const response = await fetch(`/api/reservations/${reservation.id}/confirm`, { method: "POST" });
      const data = await response.json();

      if (!response.ok) {
        setMessage({ type: "error", text: response.status === 410 ? "This reservation expired before checkout." : data.error });
        await refreshProducts();
        return;
      }

      setReservation(data.reservation);
      setMessage({ type: "success", text: "Reservation confirmed. Inventory was converted into a sale." });
      await refreshProducts();
    });
  }

  async function release() {
    if (!reservation) {
      return;
    }

    startTransition(async () => {
      const response = await fetch(`/api/reservations/${reservation.id}/release`, { method: "POST" });
      const data = await response.json();

      if (!response.ok) {
        setMessage({ type: "error", text: data.error });
        return;
      }

      setReservation(data.reservation);
      setMessage({ type: "success", text: "Reservation released and stock is available again." });
      await refreshProducts();
    });
  }

  if (isLoading) {
    return (
      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
      <Card>
        <CardHeader>
          <CardTitle>Create reservation</CardTitle>
          <CardDescription>Select stock, hold it for checkout, then confirm or release the hold.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {message && (
            <Alert className={message.type === "error" ? "border-red-200 bg-red-50 text-red-900" : "border-teal-200 bg-teal-50 text-teal-900"}>
              <div className="flex gap-2">
                {message.type === "error" ? <AlertCircle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                <span>{message.text}</span>
              </div>
            </Alert>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm font-medium">
              Product
              <select
                className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                value={selectedProduct?.id ?? ""}
                onChange={(event) => {
                  setSelectedProductId(event.target.value);
                  setSelectedWarehouseId("");
                  setReservation(null);
                }}
              >
                {products.map((product) => (
                  <option value={product.id} key={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm font-medium">
              Warehouse
              <select
                className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                value={selectedInventory?.warehouseId ?? ""}
                onChange={(event) => {
                  setSelectedWarehouseId(event.target.value);
                  setReservation(null);
                }}
              >
                {selectedProduct?.inventories.map((inventory) => (
                  <option value={inventory.warehouseId} key={inventory.warehouseId}>
                    {inventory.warehouseName} - {inventory.availableUnits} available
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block space-y-2 text-sm font-medium">
            Quantity
            <Input
              min={1}
              max={25}
              type="number"
              value={quantity}
              onChange={(event) => setQuantity(Number(event.target.value))}
            />
          </label>

          <div className="rounded-md border bg-zinc-50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-600">Available now</span>
              <span className="font-mono text-lg font-semibold">{selectedInventory?.availableUnits ?? 0}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm text-zinc-600">
              <span>Reserved in pending carts</span>
              <span className="font-mono">{selectedInventory?.reservedUnits ?? 0}</span>
            </div>
          </div>

          <Button
            className="w-full"
            disabled={isPending || !selectedInventory || selectedInventory.availableUnits < quantity}
            onClick={reserve}
          >
            <ShoppingBag className="h-4 w-4" />
            {isPending ? "Working..." : "Reserve stock"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Checkout hold</CardTitle>
              <CardDescription>Pending stock is temporary until confirmed.</CardDescription>
            </div>
            {reservation && <Badge className="bg-white">{reservation.status}</Badge>}
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {!reservation ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-zinc-500">
              No active reservation yet.
            </div>
          ) : (
            <>
              <div className="grid gap-3 rounded-md bg-zinc-50 p-4 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-zinc-500">Reservation</span>
                  <span className="font-mono">{reservation.id.slice(0, 12)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-zinc-500">Quantity</span>
                  <span>{reservation.quantity}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-zinc-500">Expires in</span>
                  <Countdown
                    expiresAt={reservation.expiresAt}
                    onExpire={() => setMessage({ type: "error", text: "Reservation timer reached zero. Confirm will now return 410." })}
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Button disabled={isPending || reservation.status !== "PENDING"} onClick={confirm}>
                  <CheckCircle2 className="h-4 w-4" />
                  Confirm
                </Button>
                <Button variant="outline" disabled={isPending || reservation.status !== "PENDING"} onClick={release}>
                  <XCircle className="h-4 w-4" />
                  Release
                </Button>
              </div>
            </>
          )}

          <Button variant="secondary" className="w-full" onClick={refreshProducts} disabled={isPending}>
            <RefreshCcw className="h-4 w-4" />
            Refresh availability
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
