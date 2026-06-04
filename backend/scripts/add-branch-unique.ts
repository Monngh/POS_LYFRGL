import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  try {
    await prisma.$executeRawUnsafe(
      "CREATE UNIQUE INDEX [Branch_name_key] ON [dbo].[Branch]([name])"
    );
    console.log("✅ Unique index on Branch.name created successfully.");
  } catch (e: any) {
    if (e.message?.includes("already exists") || e.message?.includes("duplicate")) {
      console.log("ℹ️  Index already exists, skipping.");
    } else {
      throw e;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
