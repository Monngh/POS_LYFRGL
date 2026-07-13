import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.sale.updateMany({
    where: {
      customerId: 3, // María Gómez
      createdAt: {
        gte: new Date("2026-07-06T00:00:00.000Z"),
        lt: new Date("2026-07-07T00:00:00.000Z"),
      }
    },
    data: {
      customerId: null
    }
  });
  console.log("Cleanup result:", result);
}

main().catch(console.error).finally(() => prisma.$disconnect());
