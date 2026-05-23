import { prisma } from "@/lib/prisma";

export type ProductWithAvailability = {
  id: string;
  name: string;
  sku: string;
  price: string;
  createdAt: string;
  inventories: Array<{
    id: string;
    warehouseId: string;
    warehouseName: string;
    warehouseLocation: string;
    totalUnits: number;
    reservedUnits: number;
    availableUnits: number;
  }>;
};

export async function listProductsWithAvailability(): Promise<ProductWithAvailability[]> {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      inventories: {
        orderBy: { warehouse: { name: "asc" } },
        include: { warehouse: true }
      }
    }
  });

  return products.map((product) => ({
    id: product.id,
    name: product.name,
    sku: product.sku,
    price: product.price.toString(),
    createdAt: product.createdAt.toISOString(),
    inventories: product.inventories.map((inventory) => ({
      id: inventory.id,
      warehouseId: inventory.warehouseId,
      warehouseName: inventory.warehouse.name,
      warehouseLocation: inventory.warehouse.location,
      totalUnits: inventory.totalUnits,
      reservedUnits: inventory.reservedUnits,
      availableUnits: inventory.totalUnits - inventory.reservedUnits
    }))
  }));
}

export async function listWarehouses() {
  return prisma.warehouse.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      location: true
    }
  });
}
