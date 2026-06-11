const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.sale.findMany({ where: { cfdiUuid: { not: null } } }).then(res => {
  console.log('Total sales with cfdiUuid:', res.length);
  prisma.$disconnect();
});
