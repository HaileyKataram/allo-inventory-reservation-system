import { cleanupExpiredReservations } from "@/lib/cleanup-service";
import { prisma } from "@/lib/prisma";

async function main() {
  const result = await cleanupExpiredReservations(500);
  console.log(`Expired ${result.expiredCount} reservations.`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
