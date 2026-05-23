import { NextResponse } from "next/server";
import { listWarehouses } from "@/lib/inventory-service";

export async function GET() {
  const warehouses = await listWarehouses();
  return NextResponse.json({ warehouses });
}
