import { NextResponse } from "next/server";
import { isHttpError } from "@/lib/errors";
import { withIdempotency } from "@/lib/idempotency";
import { confirmReservationInTransaction } from "@/lib/reservation-service";
import { reservationIdSchema } from "@/lib/validation";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = reservationIdSchema.parse(await params);

    return withIdempotency(_request, "POST /api/reservations/[id]/confirm", async (tx) => {
      try {
        const result = await confirmReservationInTransaction(tx, id);

        if (result.expired) {
          return { body: { error: "Reservation has expired." }, statusCode: 410 };
        }

        return { body: { reservation: result.reservation }, statusCode: 200 };
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

    return NextResponse.json({ error: "Unable to confirm reservation." }, { status: 400 });
  }
}
