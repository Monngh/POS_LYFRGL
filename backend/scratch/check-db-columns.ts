import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  try {
    console.log("Checking User table columns in DB...");
    const userColumns: any[] = await prisma.$queryRawUnsafe(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'User'"
    );
    console.log("User columns found in database:", userColumns.map(c => c.COLUMN_NAME));

    console.log("\nChecking Customer table columns in DB...");
    const customerColumns: any[] = await prisma.$queryRawUnsafe(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Customer'"
    );
    console.log("Customer columns found in database:", customerColumns.map(c => c.COLUMN_NAME));
  } catch (e) {
    console.error("Error checking columns:", e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
