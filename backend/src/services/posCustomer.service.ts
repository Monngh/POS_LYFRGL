import { prisma } from "../app";
import { AppError } from "../utils/AppError";

export const searchCustomers = async (query: string) => {
  if (!query) return [];

  return prisma.customer.findMany({
    where: {
      OR: [{ name: { contains: query } }, { phone: { contains: query } }],
    },
    orderBy: { name: "asc" },
    take: 10,
    select: { id: true, name: true, phone: true, email: true, points: true },
  });
};

export const registerCustomerFromPos = async (
  name: string,
  phone: string,
  email?: string
) => {
  const existing = await prisma.customer.findFirst({ where: { phone } });
  if (existing) throw new AppError("Ya existe un cliente registrado con ese número de teléfono.", 400);

  return prisma.customer.create({
    data: {
      name,
      phone,
      email: email || null,
      points: 0,
      creditLimit: 0,
    },
    select: { id: true, name: true, phone: true, email: true, points: true },
  });
};
