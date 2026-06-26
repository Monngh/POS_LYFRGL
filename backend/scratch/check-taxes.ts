import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  try {
    const taxTypes = await prisma.taxType.findMany();
    console.log("Tax types in DB:", JSON.stringify(taxTypes, null, 2));
  } catch (e) {
    console.error("Error reading tax types:", e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
