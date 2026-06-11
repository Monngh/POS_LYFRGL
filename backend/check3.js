const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const billedSales = await prisma.sale.findMany({
    where: { cfdiUuid: { not: null } },
    orderBy: { updatedAt: 'desc' },
    take: 500
  });
  const historyMap = new Map();
  for (const sale of billedSales) {
    const uuidStr = sale.cfdiUuid;
    let actualUuid = uuidStr;
    if (uuidStr.startsWith("GLOBAL:")) {
      actualUuid = uuidStr.split(":")[1];
    } else {
      actualUuid = uuidStr.split(":")[0];
    }
    if (!historyMap.has(uuidStr)) {
      historyMap.set(uuidStr, { uuid: actualUuid, cfdiUuid: uuidStr });
    }
  }
  const arr = Array.from(historyMap.values());
  console.log("Total unique in map:", arr.length);
  const uniqueKeys = new Set(arr.map(x => x.uuid));
  console.log("Unique actualUuids (React keys):", uniqueKeys.size);
  console.log("Array:");
  console.log(arr.slice(0, 10)); // just print 10
}
main().finally(() => prisma.$disconnect());
