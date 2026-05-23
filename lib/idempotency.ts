import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type IdempotentResponse = {
  body: Prisma.InputJsonValue;
  statusCode: number;
};

type IdempotentHandler = (tx: Prisma.TransactionClient) => Promise<IdempotentResponse>;

export function getIdempotencyKey(request: Request) {
  const key = request.headers.get("Idempotency-Key")?.trim();
  return key && key.length > 0 ? key : null;
}

export async function withIdempotency(request: Request, endpoint: string, handler: IdempotentHandler) {
  const key = getIdempotencyKey(request);

  const result = await prisma.$transaction(
    async (tx) => {
      if (!key) {
        return handler(tx);
      }

      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))
      `;

      const existing = await tx.idempotencyKey.findUnique({
        where: { key }
      });

      if (existing) {
        return {
          body: existing.response as Prisma.InputJsonValue,
          statusCode: existing.statusCode
        };
      }

      const response = await handler(tx);

      await tx.idempotencyKey.create({
        data: {
          key,
          endpoint,
          response: response.body,
          statusCode: response.statusCode
        }
      });

      return response;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
  );

  return NextResponse.json(result.body, { status: result.statusCode });
}

// TODO: add a scheduled TTL cleanup job once retention policy is decided.
export async function deleteIdempotencyKeysOlderThan(cutoff: Date) {
  return prisma.idempotencyKey.deleteMany({
    where: {
      createdAt: {
        lt: cutoff
      }
    }
  });
}
