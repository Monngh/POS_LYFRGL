import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const newHash = await bcrypt.hash("AdminPassword#2026", 10);
  const updated = await prisma.user.update({
    where: { email: "admin@fmb.com" },
    data: { passwordHash: newHash },
  });
  console.log("Updated admin password hash for:", updated.email);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
