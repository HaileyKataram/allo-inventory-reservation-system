import { NextResponse } from "next/server";
import { isHttpError } from "@/lib/errors";
import { confirmReservation } from "@/lib/reservation-service";
import { reservationIdSchema } from "@/lib/validation";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = reservationIdSchema.parse(await params);
    const reservation = await confirmReservation(id);
    return NextResponse.json({ reservation });
  } catch (error) {
    if (isHttpError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: "Unable to confirm reservation." }, { status: 400 });
  }
}
