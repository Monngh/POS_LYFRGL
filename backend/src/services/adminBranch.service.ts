import { prisma } from "../app";
import { AppError } from "../utils/AppError";

export const listBranches = async (search?: string) => {
  const where: any = {};
  if (search) where.OR = [{ name: { contains: search } }, { address: { contains: search } }];

  const branches = await prisma.branch.findMany({
    where,
    orderBy: { id: "asc" },
    include: { _count: { select: { users: true, sales: true } } },
  });

  return branches.map((b) => ({
    id: b.id,
    name: b.name,
    address: b.address,
    phone: b.phone,
    active: b.active,
    employees: b._count.users,
    sales: b._count.sales,
    createdAt: b.createdAt,
  }));
};

export const createBranch = async (
  name: string,
  address: string,
  phone: string,
  active: boolean
) => {
  return prisma.branch.create({ data: { name, address, phone, active } });
};

export const updateBranch = async (
  id: number,
  name: string,
  address: string,
  phone: string,
  active: boolean
) => {
  if (active === false) {
    const existing = await prisma.branch.findUnique({ where: { id }, select: { active: true } });
    if (existing?.active === true) {
      const activeUsers = await prisma.user.count({ where: { branchId: id, active: true } });
      if (activeUsers > 0) {
        throw new AppError(
          `No se puede desactivar la sucursal. Hay ${activeUsers} empleado(s) activo(s) asignado(s). Reasígnalos o desactívalos primero.`,
          400
        );
      }
    }
  }

  return prisma.branch.update({ where: { id }, data: { name, address, phone, active } });
};
