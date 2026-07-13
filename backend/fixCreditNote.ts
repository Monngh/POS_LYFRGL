import { PrismaClient } from '@prisma/client';
import { BillingService } from './src/services/billing.service';

const prisma = new PrismaClient();

async function run() {
  try {
    const sale = await prisma.sale.findUnique({
      where: { invoiceNumber: 'V-024096249' },
    });
    const returnRecord = await prisma.return.findFirst({
      where: { saleId: sale?.id },
      include: {
        returnDetails: {
          include: {
            product: true
          }
        }
      }
    });

    if (!sale || !returnRecord) {
      console.log('No sale or return found');
      return;
    }

    const payload = returnRecord.returnDetails.map(d => ({
      name: d.product.name,
      quantity: d.quantity,
      unitPrice: Number(d.unitPrice),
      discountAmount: Number(d.discountAmount || 0)
    }));

    console.log("Generating Credit Note...");
    const res = await BillingService.createCreditNote(sale.id, payload, returnRecord.id);
    console.log("Success:", res);

  } catch (e) {
    console.error("Error:", e);
  } finally {
    await prisma.$disconnect();
  }
}

run();
