import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: 3 }
    });

    if (!customer) {
      console.log("❌ Cliente con ID 3 no existe en la base de datos.");
      return;
    }

    console.log("ℹ️ Cliente encontrado:", customer);

    // Buscar ventas del cliente 3
    const sales = await prisma.sale.findMany({
      where: { customerId: 3 }
    });

    console.log(`ℹ️ El cliente tiene ${sales.length} ventas asociadas.`);

    if (sales.length > 0) {
      sales.forEach(s => {
        console.log(`👉 Venta encontrada - Folio: ${s.invoiceNumber}, Total: ${s.totalAmount}`);
      });
    } else {
      console.log("ℹ️ Buscando la última venta completada para asociar al cliente 3...");
      const latestSale = await prisma.sale.findFirst({
        where: { status: "COMPLETADA" },
        orderBy: { createdAt: "desc" }
      });

      if (!latestSale) {
        console.log("❌ No se encontraron ventas completadas en la base de datos.");
        return;
      }

      console.log(`ℹ️ Última venta encontrada: ID ${latestSale.id}, Folio: ${latestSale.invoiceNumber}`);
      
      const updatedSale = await prisma.sale.update({
        where: { id: latestSale.id },
        data: { customerId: 3 }
      });

      console.log("✅ Venta asociada con éxito al cliente 3!");
      console.log(`👉 Utiliza el Folio: ${updatedSale.invoiceNumber} y Teléfono: ${customer.phone} para el registro.`);
    }
  } catch (error) {
    console.error("❌ Error en script:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
