import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  try {
    const sales = await prisma.sale.findMany({
      where: {
        paymentMethod: "QR_MERCADOPAGO",
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 10,
      include: {
        returns: true,
      }
    });

    console.log("Recent Mercado Pago Sales:");
    sales.forEach(s => {
      console.log(`ID: ${s.id}, Folio: ${s.invoiceNumber}, Status: ${s.status}, MP_ID: ${s.mercadoPagoPaymentId}, MP_Status: ${s.mercadoPagoStatus}, Total: ${s.totalAmount}`);
    });
  } catch (error) {
    console.error("Error reading database:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
