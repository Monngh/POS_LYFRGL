import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const sessions = await prisma.cashSession.findMany({
    where: { status: "ABIERTA" }
  });
  console.log("Active cash sessions:", JSON.stringify(sessions, null, 2));

  const users = await prisma.user.findMany();
  console.log("Users:", JSON.stringify(users.map(u => ({ id: u.id, email: u.email, role: u.role, branchId: u.branchId })), null, 2));
}

main().finally(() => prisma.$disconnect());
