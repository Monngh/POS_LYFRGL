import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  try {
    const branches = await prisma.branch.findMany({
      select: { id: true, name: true, active: true }
    });
    console.log("BRANCHES IN DATABASE:", branches);
  } catch (error) {
    console.error("Error querying branches:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
