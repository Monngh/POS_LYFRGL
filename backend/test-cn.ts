import { PrismaClient } from '@prisma/client';
import { getCustomerInvoices } from './src/services/customer.service';

const prisma = new PrismaClient();

async function main() {
  const sale = await prisma.sale.findFirst({
    where: { invoiceNumber: "V-454437722" }
  });
  if (!sale) return;

  const result = await getCustomerInvoices(sale.customerId!);
  const invoice = result.find(i => i.invoiceNumber === "V-454437722");
  
  console.log(JSON.stringify(invoice, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
