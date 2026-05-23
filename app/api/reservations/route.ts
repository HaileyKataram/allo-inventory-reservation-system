import { NextResponse } from "next/server";
import { isHttpError } from "@/lib/errors";
import { withIdempotency } from "@/lib/idempotency";
import { createReservationInTransaction } from "@/lib/reservation-service";
import { createReservationSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const body = createReservationSchema.parse(await request.json());

    return withIdempotency(request, "POST /api/reservations", async (tx) => {
      try {
        const reservation = await createReservationInTransaction(tx, body);
        return { body: { reservation }, statusCode: 201 };
      } catch (error) {
        if (isHttpError(error)) {
          return { body: { error: error.message }, statusCode: error.status };
        }

        throw error;
      }
    });
  } catch (error) {
    if (isHttpError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: "Invalid reservation request." }, { status: 400 });
  }
}
