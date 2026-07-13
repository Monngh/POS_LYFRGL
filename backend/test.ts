import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const custs = await prisma.customer.findMany({
    where: { taxId: "HEMG060325555" }
  });
  console.log("Customers with RFC HEMG060325555:");
  console.dir(custs, { depth: null });
}

main().catch(console.error).finally(() => prisma.$disconnect());
