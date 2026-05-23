import { Prisma, ReservationStatus } from "@prisma/client";
import { HttpError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

const DEFAULT_RESERVATION_TTL_MS = 10 * 60 * 1000;

type InventoryLockRow = {
  id: string;
  productId: string;
  warehouseId: string;
  totalUnits: number;
  reservedUnits: number;
};

type ReservationLockRow = {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  status: ReservationStatus;
  expiresAt: Date;
};

export type ReservationDto = {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  status: ReservationStatus;
  expiresAt: string;
  createdAt: string;
  confirmedAt: string | null;
};

export function toReservationDto(reservation: {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  status: ReservationStatus;
  expiresAt: Date;
  createdAt: Date;
  confirmedAt: Date | null;
}): ReservationDto {
  return {
    id: reservation.id,
    productId: reservation.productId,
    warehouseId: reservation.warehouseId,
    quantity: reservation.quantity,
    status: reservation.status,
    expiresAt: reservation.expiresAt.toISOString(),
    createdAt: reservation.createdAt.toISOString(),
    confirmedAt: reservation.confirmedAt?.toISOString() ?? null
  };
}

export async function createReservation(input: {
  productId: string;
  warehouseId: string;
  quantity: number;
  ttlMs?: number;
}) {
  const ttlMs = input.ttlMs ?? DEFAULT_RESERVATION_TTL_MS;

  return prisma.$transaction(
    async (tx) => {
      const [inventory] = await tx.$queryRaw<InventoryLockRow[]>`
        SELECT id, "productId", "warehouseId", "totalUnits", "reservedUnits"
        FROM "Inventory"
        WHERE "productId" = ${input.productId} AND "warehouseId" = ${input.warehouseId}
        FOR UPDATE
      `;

      if (!inventory) {
        throw new HttpError(404, "Inventory was not found for this product and warehouse.");
      }

      const availableUnits = inventory.totalUnits - inventory.reservedUnits;

      if (availableUnits < input.quantity) {
        throw new HttpError(409, "Insufficient stock for this reservation.");
      }

      const reservation = await tx.reservation.create({
        data: {
          productId: input.productId,
          warehouseId: input.warehouseId,
          quantity: input.quantity,
          expiresAt: new Date(Date.now() + ttlMs)
        }
      });

      await tx.inventory.update({
        where: { id: inventory.id },
        data: {
          reservedUnits: { increment: input.quantity }
        }
      });

      return toReservationDto(reservation);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
  );
}

export async function confirmReservation(id: string) {
  const result = await prisma.$transaction(
    async (tx) => {
      const [reservation] = await tx.$queryRaw<ReservationLockRow[]>`
        SELECT id, "productId", "warehouseId", quantity, status, "expiresAt"
        FROM "Reservation"
        WHERE id = ${id}
        FOR UPDATE
      `;

      if (!reservation) {
        throw new HttpError(404, "Reservation was not found.");
      }

      if (reservation.status !== ReservationStatus.PENDING) {
        throw new HttpError(409, `Reservation is already ${reservation.status.toLowerCase()}.`);
      }

      if (reservation.expiresAt <= new Date()) {
        const expired = await expireLockedReservation(tx, reservation);
        return { reservation: toReservationDto(expired), expired: true };
      }

      const [inventory] = await tx.$queryRaw<InventoryLockRow[]>`
        SELECT id, "productId", "warehouseId", "totalUnits", "reservedUnits"
        FROM "Inventory"
        WHERE "productId" = ${reservation.productId} AND "warehouseId" = ${reservation.warehouseId}
        FOR UPDATE
      `;

      if (!inventory) {
        throw new HttpError(404, "Inventory was not found for this reservation.");
      }

      if (inventory.reservedUnits < reservation.quantity || inventory.totalUnits < reservation.quantity) {
        throw new HttpError(409, "Inventory is inconsistent for this reservation.");
      }

      const confirmed = await tx.reservation.update({
        where: { id },
        data: {
          status: ReservationStatus.CONFIRMED,
          confirmedAt: new Date()
        }
      });

      await tx.inventory.update({
        where: { id: inventory.id },
        data: {
          totalUnits: { decrement: reservation.quantity },
          reservedUnits: { decrement: reservation.quantity }
        }
      });

      return { reservation: toReservationDto(confirmed), expired: false };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
  );

  if (result.expired) {
    throw new HttpError(410, "Reservation has expired.");
  }

  return result.reservation;
}

export async function releaseReservation(id: string) {
  return prisma.$transaction(
    async (tx) => {
      const [reservation] = await tx.$queryRaw<ReservationLockRow[]>`
        SELECT id, "productId", "warehouseId", quantity, status, "expiresAt"
        FROM "Reservation"
        WHERE id = ${id}
        FOR UPDATE
      `;

      if (!reservation) {
        throw new HttpError(404, "Reservation was not found.");
      }

      if (reservation.status === ReservationStatus.RELEASED) {
        const released = await tx.reservation.findUniqueOrThrow({ where: { id } });
        return toReservationDto(released);
      }

      if (reservation.status !== ReservationStatus.PENDING) {
        throw new HttpError(409, `Reservation cannot be released from ${reservation.status.toLowerCase()} state.`);
      }

      const [inventory] = await tx.$queryRaw<InventoryLockRow[]>`
        SELECT id, "productId", "warehouseId", "totalUnits", "reservedUnits"
        FROM "Inventory"
        WHERE "productId" = ${reservation.productId} AND "warehouseId" = ${reservation.warehouseId}
        FOR UPDATE
      `;

      if (!inventory) {
        throw new HttpError(404, "Inventory was not found for this reservation.");
      }

      const released = await tx.reservation.update({
        where: { id },
        data: { status: ReservationStatus.RELEASED }
      });

      await tx.inventory.update({
        where: { id: inventory.id },
        data: {
          reservedUnits: { decrement: reservation.quantity }
        }
      });

      return toReservationDto(released);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
  );
}

async function expireLockedReservation(
  tx: Prisma.TransactionClient,
  reservation: Pick<ReservationLockRow, "id" | "productId" | "warehouseId" | "quantity">
) {
  const [inventory] = await tx.$queryRaw<InventoryLockRow[]>`
    SELECT id, "productId", "warehouseId", "totalUnits", "reservedUnits"
    FROM "Inventory"
    WHERE "productId" = ${reservation.productId} AND "warehouseId" = ${reservation.warehouseId}
    FOR UPDATE
  `;

  if (!inventory) {
    throw new HttpError(404, "Inventory was not found for this reservation.");
  }

  const expired = await tx.reservation.update({
    where: { id: reservation.id },
    data: { status: ReservationStatus.EXPIRED }
  });

  await tx.inventory.update({
    where: { id: inventory.id },
    data: {
      reservedUnits: { decrement: reservation.quantity }
    }
  });

  return expired;
}
