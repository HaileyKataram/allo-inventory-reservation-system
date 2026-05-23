import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { HttpError } from "../lib/errors";
import type { createReservation as createReservationFn } from "../lib/reservation-service";

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

describe.runIf(databaseUrl)("reservation concurrency", () => {
  let prisma: PrismaClient;
  let createReservation: typeof createReservationFn;
  let productId: string;
  let warehouseId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;

    const prismaModule = await import("../lib/prisma");
    const reservationModule = await import("../lib/reservation-service");

    prisma = prismaModule.prisma;
    createReservation = reservationModule.createReservation;
  });

  afterAll(async () => {
    if (productId && warehouseId) {
      await prisma.reservation.deleteMany({ where: { productId, warehouseId } });
      await prisma.inventory.deleteMany({ where: { productId, warehouseId } });
      await prisma.product.delete({ where: { id: productId } }).catch(() => undefined);
      await prisma.warehouse.delete({ where: { id: warehouseId } }).catch(() => undefined);
    }

    await prisma.$disconnect();
  });

  it("allows exactly one reservation for the final unit under simultaneous requests", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const product = await prisma.product.create({
      data: {
        name: "Concurrency Test Product",
        sku: `TEST-RACE-${suffix}`,
        price: "10.00"
      }
    });
    const warehouse = await prisma.warehouse.create({
      data: {
        name: `Test Warehouse ${suffix}`,
        location: "Test"
      }
    });

    productId = product.id;
    warehouseId = warehouse.id;

    await prisma.inventory.create({
      data: {
        productId,
        warehouseId,
        totalUnits: 1,
        reservedUnits: 0
      }
    });

    const attempts = await Promise.allSettled([
      createReservation({ productId, warehouseId, quantity: 1 }),
      createReservation({ productId, warehouseId, quantity: 1 })
    ]);

    const successes = attempts.filter((attempt) => attempt.status === "fulfilled");
    const failures = attempts.filter((attempt) => attempt.status === "rejected");
    const conflict = failures[0]?.reason as HttpError | undefined;

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(conflict?.status).toBe(409);

    const inventory = await prisma.inventory.findUniqueOrThrow({
      where: {
        productId_warehouseId: {
          productId,
          warehouseId
        }
      }
    });

    expect(inventory.totalUnits).toBe(1);
    expect(inventory.reservedUnits).toBe(1);
  });
});
