import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const sale = await prisma.sale.findFirst({
    where: { invoiceNumber: 'V-341016289' },
    include: { saleDetails: true }
  });
  console.log(JSON.stringify(sale, null, 2));
}

run().finally(() => prisma.$disconnect());
