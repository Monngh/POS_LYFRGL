import { prisma } from "../app";
import { AppError } from "../utils/AppError";

const normalizePhoneDigits = (value: string | null | undefined): string =>
  (value || "").replace(/\D/g, "");

export const searchCustomers = async (query: string) => {
  const phoneDigits = normalizePhoneDigits(query);
  if (!phoneDigits || phoneDigits.length < 10 || phoneDigits.length > 15) return [];

  const candidates = await prisma.customer.findMany({
    where: { phone: { contains: phoneDigits.slice(-4) } },
    orderBy: { name: "asc" },
    take: 25,
    select: { id: true, name: true, phone: true, email: true, points: true },
  });

  return candidates
    .filter((c) => normalizePhoneDigits(c.phone) === phoneDigits)
    .slice(0, 1);
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
