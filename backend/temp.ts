import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
prisma.sale.findUnique({
  where: { invoiceNumber: 'V-595273763' },
  include: { customer: true }
}).then(s => console.log("UUID IS:", s?.cfdiUuid, "CUSTOMER:", s?.customer?.name)).finally(() => prisma.$disconnect());
