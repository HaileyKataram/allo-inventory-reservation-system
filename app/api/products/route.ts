import { NextResponse } from "next/server";
import { cleanupExpiredReservations } from "@/lib/cleanup-service";
import { listProductsWithAvailability } from "@/lib/inventory-service";

export async function GET() {
  await cleanupExpiredReservations();
  const products = await listProductsWithAvailability();
  return NextResponse.json({ products });
}
