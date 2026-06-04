import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const branches = await prisma.branch.findMany({ orderBy: { id: "asc" } });

  for (const b of branches) {
    const users    = await prisma.user.count({ where: { branchId: b.id } });
    const sales    = await prisma.sale.count({ where: { branchId: b.id } });
    const sessions = await prisma.cashSession.count({ where: { branchId: b.id } });
    console.log(`ID:${b.id} | ${b.name} | users:${users} | sales:${sales} | sessions:${sessions}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
