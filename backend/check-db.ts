import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const ret = await prisma.sale.findUnique({
    where: { id: 199 }
  });
  console.log(ret ? "Found return: " + JSON.stringify(ret) : "Return not found in local DB");
}
main().catch(console.error).finally(() => prisma.$disconnect());
