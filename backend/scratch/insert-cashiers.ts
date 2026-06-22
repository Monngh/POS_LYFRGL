import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const cashiers = [
  { name: "Gael", email: "gael.cajero@fmb.com", branchId: 1 },
  { name: "Fernanda", email: "fernanda.cajero@fmb.com", branchId: 1 },
  { name: "Yair", email: "yair.cajero@fmb.com", branchId: 2 },
  { name: "Roxana", email: "roxana.cajero@fmb.com", branchId: 2 },
  { name: "Luz", email: "luz.cajero@fmb.com", branchId: 3 },
  { name: "Vite", email: "vite.cajero@fmb.com", branchId: 3 },
];

async function main() {
  try {
    const pinHash = await bcrypt.hash("1234", 10);
    const passwordHash = await bcrypt.hash("Cajero1234#", 10);

    for (const cashier of cashiers) {
      console.log(`Processing cashier: ${cashier.name} (${cashier.email})`);
      
      // Check if email already exists
      const existing = await prisma.user.findUnique({
        where: { email: cashier.email }
      });

      if (existing) {
        console.log(`  -> Cashier already exists (ID: ${existing.id}). Updating PIN and branch...`);
        await prisma.user.update({
          where: { id: existing.id },
          data: {
            name: cashier.name.toUpperCase(),
            pinCode: pinHash,
            branchId: cashier.branchId,
            role: "CAJERO",
            active: true
          }
        });
      } else {
        console.log(`  -> Creating new cashier...`);
        const created = await prisma.user.create({
          data: {
            name: cashier.name.toUpperCase(),
            email: cashier.email.toLowerCase(),
            passwordHash: passwordHash,
            pinCode: pinHash,
            role: "CAJERO",
            active: true,
            branchId: cashier.branchId
          }
        });
        console.log(`  -> Created cashier with ID: ${created.id}`);
      }
    }
    console.log("ALL CASHIERS PROCESSED SUCCESSFULLY!");
  } catch (error) {
    console.error("Error inserting cashiers:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
