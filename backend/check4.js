const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.sale.findFirst({ where: { cfdiUuid: { contains: '65dd987d' } } }).then(res => { 
  console.log(res ? res.cfdiUuid : 'Not found'); 
  prisma.$disconnect(); 
});
