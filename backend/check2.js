const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.sale.findMany({ where: { cfdiUuid: { not: null } } }).then(res => {
  const map = new Map();
  for (const s of res) {
    if (!map.has(s.cfdiUuid)) { map.set(s.cfdiUuid, 0); }
    map.set(s.cfdiUuid, map.get(s.cfdiUuid) + 1);
  }
  console.log('Unique invoices:', map.size);
  console.log('Invoices and ticket counts:');
  for (const [k, v] of map.entries()) {
    console.log(k, '->', v, 'tickets');
  }
  prisma.$disconnect();
});
