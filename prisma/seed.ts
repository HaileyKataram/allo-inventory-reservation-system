import "dotenv/config";
import { prisma } from "../lib/prisma";

async function main() {
  await prisma.reservation.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warehouse.deleteMany();

  const [east, west] = await Promise.all([
    prisma.warehouse.create({
      data: { name: "East Fulfillment", location: "Newark, NJ" }
    }),
    prisma.warehouse.create({
      data: { name: "West Fulfillment", location: "Reno, NV" }
    })
  ]);

  const products = await Promise.all([
    prisma.product.create({
      data: { name: "Meridian Pack", sku: "ALLO-BAG-001", price: 129 }
    }),
    prisma.product.create({
      data: { name: "Harbor Jacket", sku: "ALLO-JKT-014", price: 249 }
    }),
    prisma.product.create({
      data: { name: "Signal Sneaker", sku: "ALLO-SHOE-022", price: 162 }
    })
  ]);

  await prisma.inventory.createMany({
    data: [
      { productId: products[0].id, warehouseId: east.id, totalUnits: 1, reservedUnits: 0 },
      { productId: products[0].id, warehouseId: west.id, totalUnits: 4, reservedUnits: 0 },
      { productId: products[1].id, warehouseId: east.id, totalUnits: 7, reservedUnits: 0 },
      { productId: products[1].id, warehouseId: west.id, totalUnits: 2, reservedUnits: 0 },
      { productId: products[2].id, warehouseId: east.id, totalUnits: 11, reservedUnits: 0 },
      { productId: products[2].id, warehouseId: west.id, totalUnits: 5, reservedUnits: 0 }
    ]
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
