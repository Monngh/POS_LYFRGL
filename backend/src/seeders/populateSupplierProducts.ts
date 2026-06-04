import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔄 Iniciando migración de SupplierProduct desde PurchaseOrder...");

  try {
    const purchases = await prisma.purchaseOrder.findMany({
      include: { details: true },
    });

    let created = 0;
    let skipped = 0;

    for (const purchase of purchases) {
      for (const detail of purchase.details) {
        const existing = await prisma.supplierProduct.findUnique({
          where: {
            supplierId_productId: {
              supplierId: purchase.supplierId,
              productId: detail.productId,
            },
          },
        });

        if (!existing) {
          await prisma.supplierProduct.create({
            data: {
              supplierId: purchase.supplierId,
              productId: detail.productId,
            },
          });
          created++;
        } else {
          skipped++;
        }
      }
    }

    console.log("✅ Migración completada!");
    console.log(`   - Nuevos registros: ${created}`);
    console.log(`   - Ya existentes:    ${skipped}`);
  } catch (error) {
    console.error("❌ Error durante migración:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
