import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  try {
    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() - 30);

    const ticket = await prisma.sale.findFirst({
      where: {
        status: "COMPLETADA",
        cfdiUuid: null,
        createdAt: { gte: limitDate }
      },
      orderBy: { createdAt: "desc" }
    });

    if (!ticket) {
      console.log("❌ No se encontró ningún ticket completado, no facturado y vigente en los últimos 30 días.");
      return;
    }

    console.log("✅ Ticket no facturado encontrado:");
    console.log(`👉 Folio: ${ticket.invoiceNumber}`);
    console.log(`👉 Total: ${ticket.totalAmount}`);
    console.log(`👉 Fecha: ${ticket.createdAt}`);
    console.log(`👉 Cliente ID: ${ticket.customerId}`);
  } catch (error) {
    console.error("❌ Error al buscar ticket:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
