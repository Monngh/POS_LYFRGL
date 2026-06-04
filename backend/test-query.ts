import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  try {
    const product = await prisma.product.findFirst({
      include: {
        productTaxes: {
          include: { taxType: true }
        }
      }
    });
    console.log("Product with taxes:", JSON.stringify(product, null, 2));

    // Test what createSale does
    const prod = await prisma.product.findUnique({
      where: { id: 1 },
      include: {
        inventories: { where: { branchId: 1 } },
        productTaxes: { include: { taxType: true } },
      },
    });
    console.log("\nProduct 1 full:", JSON.stringify(prod, null, 2));
  } catch (e) {
    console.error("ERROR:", e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
