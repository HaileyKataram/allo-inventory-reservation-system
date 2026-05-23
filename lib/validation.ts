import { z } from "zod";

export const createReservationSchema = z.object({
  productId: z.string().min(1),
  warehouseId: z.string().min(1),
  quantity: z.coerce.number().int().positive().max(25)
});

export const reservationIdSchema = z.object({
  id: z.string().min(1)
});
