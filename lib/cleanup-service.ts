import { Prisma, ReservationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type ExpiredReservationRow = {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
};

export async function cleanupExpiredReservations(limit = 100) {
  return prisma.$transaction(
    async (tx) => {
      const expiredReservations = await tx.$queryRaw<ExpiredReservationRow[]>`
        SELECT id, "productId", "warehouseId", quantity
        FROM "Reservation"
        WHERE status = 'PENDING'::"ReservationStatus" AND "expiresAt" <= NOW()
        ORDER BY "expiresAt" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      `;

      for (const reservation of expiredReservations) {
        await tx.$queryRaw`
          SELECT id
          FROM "Inventory"
          WHERE "productId" = ${reservation.productId}
            AND "warehouseId" = ${reservation.warehouseId}
          FOR UPDATE
        `;

        await tx.reservation.update({
          where: { id: reservation.id },
          data: { status: ReservationStatus.EXPIRED }
        });

        await tx.inventory.update({
          where: {
            productId_warehouseId: {
              productId: reservation.productId,
              warehouseId: reservation.warehouseId
            }
          },
          data: {
            reservedUnits: { decrement: reservation.quantity }
          }
        });
      }

      return { expiredCount: expiredReservations.length };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
  );
}
