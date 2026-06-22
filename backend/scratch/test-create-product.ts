import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  try {
    const sku = `TEST-PROD-PRISMA-${Date.now()}`;
    console.log("Creating product with SKU:", sku);
    const product = await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          sku: sku,
          barcode: `BARCODE-${Date.now()}`,
          name: "Test Product Prisma",
          description: "Created directly with prisma to find errors",
          costPrice: 10.00,
          sellPrice: 12.34,
          active: true,
          isReturnable: true,
          returnWindowDays: 30,
          trackingType: "NONE",
          satProductKey: "01010101",
          satUnitKey: "H87",
        }
      });

      const branches = await tx.branch.findMany({ select: { id: true } });
      for (const branch of branches) {
        await tx.inventory.create({
          data: {
            productId: product.id,
            branchId: branch.id,
            quantity: 0,
            minStock: 10,
            maxStock: 400
          }
        });
      }
      return product;
    });
    console.log("Success! Created product:", product);
  } catch (e) {
    console.error("ERROR DURING CREATE:", e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
