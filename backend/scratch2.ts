import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const promo = await prisma.promotion.findUnique({ where: { id: 5 } });
  console.log(JSON.stringify(promo, null, 2));
}

run().finally(() => prisma.$disconnect());
