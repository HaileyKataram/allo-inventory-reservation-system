"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, RefreshCcw, ShoppingBag, XCircle } from "lucide-react";
import { Countdown } from "@/components/countdown";
import { ToastStack, type ToastMessage } from "@/components/toast-stack";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ReservationStatusBadge } from "@/components/ui/status-badge";
import type { ProductWithAvailability } from "@/lib/inventory-service";
import type { ReservationDto } from "@/lib/reservation-service";

type ProductsResponse = {
  products: ProductWithAvailability[];
};

type ActionState = "reserve" | "confirm" | "release" | "refresh" | null;

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
  const [action, setAction] = useState<ActionState>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isPending, startTransition] = useTransition();
  const isBusy = isPending || action !== null;

  const pushToast = useCallback((toast: Omit<ToastMessage, "id">) => {
    const id = crypto.randomUUID();
    setToasts((current) => [...current.slice(-2), { id, ...toast }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 4500);
  }, []);

  const refreshProducts = useCallback(
    async (options: { quiet?: boolean } = {}) => {
      if (!options.quiet) {
        setAction("refresh");
      }

      try {
        const response = await fetch("/api/products", { cache: "no-store" });

        if (!response.ok) {
          throw new Error("Availability could not be refreshed.");
        }

        const data = (await response.json()) as ProductsResponse;
        setProducts(data.products);
      } catch (error) {
        const description = error instanceof Error ? error.message : "Unexpected inventory API failure.";
        setMessage({ type: "error", text: description });
        pushToast({ type: "error", title: "Refresh failed", description });
      } finally {
        if (!options.quiet) {
          setAction(null);
        }
      }
    },
    [pushToast]
  );

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedProductId) ?? products[0],
    [products, selectedProductId]
  );

  const selectedInventory =
    selectedProduct?.inventories.find((inventory) => inventory.warehouseId === selectedWarehouseId) ??
    selectedProduct?.inventories.find((inventory) => inventory.availableUnits > 0) ??
    selectedProduct?.inventories[0];
  const hasProducts = products.length > 0;
  const canReserve = Boolean(selectedProduct && selectedInventory && selectedInventory.availableUnits >= quantity && !isBusy);

  async function reserve() {
    if (!selectedProduct || !selectedInventory) {
      return;
    }

    const previousProducts = products;
    setAction("reserve");
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
      try {
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
          setAction(null);
          const description =
            response.status === 409
              ? "Another checkout beat you to that stock. Please try a different warehouse."
              : data.error ?? "Reservation could not be created.";
          setMessage({
            type: "error",
            text: description
          });
          pushToast({
            type: "error",
            title: response.status === 409 ? "Insufficient stock" : "Reservation failed",
            description
          });
          await refreshProducts({ quiet: true });
          return;
        }

        setReservation(data.reservation);
        setMessage({ type: "success", text: "Stock is reserved. Confirm before the hold expires." });
        pushToast({ type: "success", title: "Reservation created", description: "Stock is held for checkout." });
        setAction(null);
        await refreshProducts({ quiet: true });
        router.refresh();
      } catch (error) {
        const description = error instanceof Error ? error.message : "Unexpected reservation API failure.";
        setProducts(previousProducts);
        setReservation(null);
        setAction(null);
        setMessage({ type: "error", text: description });
        pushToast({ type: "error", title: "Reservation failed", description });
      }
    });
  }

  async function confirm() {
    if (!reservation) {
      return;
    }

    setAction("confirm");
    startTransition(async () => {
      try {
        const response = await fetch(`/api/reservations/${reservation.id}/confirm`, { method: "POST" });
        const data = await response.json();

        if (!response.ok) {
          const description = response.status === 410 ? "This reservation expired before checkout." : data.error ?? "Unable to confirm reservation.";
          setMessage({ type: "error", text: description });
          pushToast({
            type: "error",
            title: response.status === 410 ? "Reservation expired" : "Confirmation failed",
            description
          });
          setAction(null);
          await refreshProducts();
          return;
        }

        setReservation(data.reservation);
        setMessage({ type: "success", text: "Reservation confirmed. Inventory was converted into a sale." });
        pushToast({ type: "success", title: "Reservation confirmed", description: "Inventory has been committed." });
        setAction(null);
        await refreshProducts();
      } catch (error) {
        const description = error instanceof Error ? error.message : "Unexpected confirmation API failure.";
        setMessage({ type: "error", text: description });
        pushToast({ type: "error", title: "Confirmation failed", description });
        setAction(null);
      }
    });
  }

  async function release() {
    if (!reservation) {
      return;
    }

    setAction("release");
    startTransition(async () => {
      try {
        const response = await fetch(`/api/reservations/${reservation.id}/release`, { method: "POST" });
        const data = await response.json();

        if (!response.ok) {
          const description = data.error ?? "Unable to cancel reservation.";
          setMessage({ type: "error", text: description });
          pushToast({ type: "error", title: "Cancel failed", description });
          setAction(null);
          return;
        }

        setReservation(data.reservation);
        setMessage({ type: "success", text: "Reservation released and stock is available again." });
        pushToast({ type: "success", title: "Reservation cancelled", description: "Reserved stock is available again." });
        setAction(null);
        await refreshProducts();
      } catch (error) {
        const description = error instanceof Error ? error.message : "Unexpected cancellation API failure.";
        setMessage({ type: "error", text: description });
        pushToast({ type: "error", title: "Cancel failed", description });
        setAction(null);
      }
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
      <ToastStack toasts={toasts} />
      <Card>
        <CardHeader>
          <CardTitle>Create reservation</CardTitle>
          <CardDescription>Select stock, hold it for checkout, then confirm or release the hold.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {message && (
            <Alert
              className={
                message.type === "error"
                  ? "border-red-200 bg-red-50 text-red-900"
                  : message.type === "info"
                    ? "border-zinc-200 bg-zinc-50 text-zinc-800"
                    : "border-teal-200 bg-teal-50 text-teal-900"
              }
            >
              <div className="flex gap-2">
                {message.type === "error" ? <AlertCircle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                <span>{message.text}</span>
              </div>
            </Alert>
          )}

          {!hasProducts && (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-zinc-500">
              No products are available yet. Run the seed script or add inventory before creating a reservation.
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm font-medium">
              Product
              <select
                className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                value={selectedProduct?.id ?? ""}
                disabled={isBusy || !hasProducts}
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
                disabled={isBusy || !selectedProduct}
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
              disabled={isBusy || !hasProducts}
              onChange={(event) => setQuantity(Number(event.target.value))}
            />
          </label>

          <div
            className={
              selectedInventory?.availableUnits === 0
                ? "rounded-md border border-red-200 bg-red-50 p-4"
                : selectedInventory && selectedInventory.availableUnits <= 2
                  ? "rounded-md border border-orange-200 bg-orange-50 p-4"
                  : "rounded-md border bg-zinc-50 p-4"
            }
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-600">Available now</span>
              <span className="font-mono text-lg font-semibold">{selectedInventory?.availableUnits ?? 0}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm text-zinc-600">
              <span>Reserved in pending carts</span>
              <span className="font-mono">{selectedInventory?.reservedUnits ?? 0}</span>
            </div>
            {selectedInventory?.availableUnits === 0 && (
              <Badge className="mt-3 border-red-200 bg-white text-red-800">Out of Stock</Badge>
            )}
            {selectedInventory && selectedInventory.availableUnits > 0 && selectedInventory.availableUnits <= 2 && (
              <Badge className="mt-3 border-orange-200 bg-white text-orange-800">Low Stock</Badge>
            )}
          </div>

          <Button
            className="w-full"
            disabled={!canReserve}
            aria-busy={action === "reserve"}
            onClick={reserve}
          >
            {action === "reserve" ? <Spinner /> : <ShoppingBag className="h-4 w-4" />}
            {action === "reserve" ? "Reserving..." : selectedInventory?.availableUnits === 0 ? "Out of stock" : "Reserve stock"}
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
            {reservation && <ReservationStatusBadge status={reservation.status} />}
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {!reservation ? (
            <div className="min-h-48 rounded-md border border-dashed p-8 text-center text-sm text-zinc-500">
              No active reservation yet. Create a hold to see its countdown and status here.
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
                    onExpire={() => {
                      setReservation((current) => (current ? { ...current, status: "EXPIRED" } : current));
                      setMessage({ type: "error", text: "Reservation expired. Availability has been refreshed." });
                      pushToast({
                        type: "error",
                        title: "Reservation expired",
                        description: "The hold timed out before confirmation."
                      });
                      void refreshProducts({ quiet: true });
                      router.refresh();
                    }}
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Button disabled={isBusy || reservation.status !== "PENDING"} aria-busy={action === "confirm"} onClick={confirm}>
                  {action === "confirm" ? <Spinner /> : <CheckCircle2 className="h-4 w-4" />}
                  {action === "confirm" ? "Confirming..." : "Confirm"}
                </Button>
                <Button variant="outline" disabled={isBusy || reservation.status !== "PENDING"} aria-busy={action === "release"} onClick={release}>
                  {action === "release" ? <Spinner /> : <XCircle className="h-4 w-4" />}
                  {action === "release" ? "Cancelling..." : "Cancel"}
                </Button>
              </div>
            </>
          )}

          <Button variant="secondary" className="w-full" onClick={() => refreshProducts()} disabled={isBusy} aria-busy={action === "refresh"}>
            {action === "refresh" ? <Spinner /> : <RefreshCcw className="h-4 w-4" />}
            {action === "refresh" ? "Refreshing..." : "Refresh availability"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
