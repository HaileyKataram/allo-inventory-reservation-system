import { NextResponse } from "next/server";
import { cleanupExpiredReservations } from "@/lib/cleanup-service";

export async function POST() {
  const result = await cleanupExpiredReservations(250);
  return NextResponse.json(result);
}
