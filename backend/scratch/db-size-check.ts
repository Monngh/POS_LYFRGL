import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== DB Size Diagnosis ===");
  try {
    const productsCount = await prisma.product.count();
    const salesCount = await prisma.sale.count();
    const detailsCount = await prisma.saleDetail.count();
    const kardexCount = await prisma.kardex.count();
    const inventoryCount = await prisma.inventory.count();

    console.log("Product count:", productsCount);
    console.log("Sale count:", salesCount);
    console.log("SaleDetail count:", detailsCount);
    console.log("Kardex count:", kardexCount);
    console.log("Inventory count:", inventoryCount);
  } catch (err: any) {
    console.error("Error running query:", err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
