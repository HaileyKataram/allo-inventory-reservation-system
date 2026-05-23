import { NextResponse } from "next/server";
import { isHttpError } from "@/lib/errors";
import { createReservation } from "@/lib/reservation-service";
import { createReservationSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const body = createReservationSchema.parse(await request.json());
    const reservation = await createReservation(body);

    return NextResponse.json({ reservation }, { status: 201 });
  } catch (error) {
    if (isHttpError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: "Invalid reservation request." }, { status: 400 });
  }
}
