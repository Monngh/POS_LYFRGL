import { prisma } from "../app";
import { AppError } from "../utils/AppError";
import bcrypt from "bcryptjs";

export interface UpdateEmployeeInput {
  name?: string;
  email?: string;
  phone?: string | null;
  baseSalary?: number | null;
  commissionRate?: number | null;
  role?: string;
  branchId?: number;
  active?: boolean;
  newPin?: string;
}

export const listEmployees = async (branchId?: number, role?: string, search?: string) => {
  const where: any = {};
  if (branchId) where.branchId = branchId;
  if (role && role !== "all") where.role = role;
  if (search) where.OR = [{ name: { contains: search } }, { email: { contains: search } }];

  const users = await prisma.user.findMany({
    where,
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: {
      id: true, name: true, email: true, role: true, active: true, phone: true,
      baseSalary: true, commissionRate: true, createdAt: true, branchId: true,
      branch: { select: { name: true } },
    },
  });

  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active,
    phone: u.phone,
    baseSalary: u.baseSalary !== null ? Number(u.baseSalary) : null,
    commissionRate: u.commissionRate !== null ? Number(u.commissionRate) : null,
    branchId: u.branchId,
    branch: u.branch.name,
    createdAt: u.createdAt,
  }));
};

export const createEmployee = async (data: {
  name: string;
  email: string;
  password: string;
  role: string;
  branchId: number;
  pinCode?: string | null;
  phone?: string | null;
  baseSalary?: number | null;
  commissionRate?: number | null;
}) => {
  const branch = await prisma.branch.findUnique({ where: { id: data.branchId } });
  if (!branch) throw new AppError("La sucursal seleccionada no existe.", 404);

  const passwordHash = await bcrypt.hash(String(data.password), 10);
  const pinHash = data.pinCode ? await bcrypt.hash(String(data.pinCode), 10) : null;

  const user = await prisma.user.create({
    data: {
      name: data.name.trim().toUpperCase(),
      email: data.email.trim().toLowerCase(),
      passwordHash,
      pinCode: pinHash,
      role: data.role.toUpperCase(),
      active: true,
      branchId: data.branchId,
      phone: data.phone ? String(data.phone).trim() : null,
      baseSalary: data.baseSalary ?? null,
      commissionRate: data.commissionRate ?? null,
    },
  });

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
    branch: branch.name,
    createdAt: user.createdAt,
  };
};

export const updateEmployee = async (
  userId: number,
  data: UpdateEmployeeInput,
  requester?: { role: string; branchId: number }
) => {
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) throw new AppError("Empleado no encontrado.", 404);

  if (requester?.role === "GERENTE") {
    if (existing.branchId !== requester.branchId) {
      throw new AppError("Acceso denegado. Este empleado pertenece a otra sucursal.", 403);
    }
    if (data.branchId && data.branchId !== requester.branchId) {
      throw new AppError("Acceso denegado. No puede transferir un empleado a otra sucursal.", 403);
    }
  }

  if (data.email && data.email !== existing.email) {
    const emailExists = await prisma.user.findUnique({ where: { email: data.email } });
    if (emailExists) throw new AppError("El correo ya está registrado en otro empleado.", 409);
  }

  let pinHash: string | undefined;
  if (data.newPin) {
    pinHash = await bcrypt.hash(String(data.newPin), 10);
  }

  return prisma.user.update({
    where: { id: userId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.email !== undefined && { email: data.email }),
      ...(data.phone !== undefined && { phone: data.phone }),
      ...(data.baseSalary !== undefined && { baseSalary: data.baseSalary }),
      ...(data.commissionRate !== undefined && { commissionRate: data.commissionRate }),
      ...(data.role !== undefined && { role: data.role }),
      ...(data.branchId !== undefined && { branchId: data.branchId }),
      ...(data.active !== undefined && { active: data.active }),
      ...(pinHash !== undefined && { pinCode: pinHash }),
    },
    include: { branch: { select: { name: true } } },
  });
};

export const getEmployeeOperations = async (
  employeeId: number,
  requester?: { role: string; branchId: number }
) => {
  const user = await prisma.user.findUnique({
    where: { id: employeeId },
    select: {
      id: true, name: true, email: true, role: true, active: true,
      commissionRate: true, branchId: true, branch: { select: { name: true } },
    },
  });
  if (!user) return null;

  if (requester?.role === "GERENTE" && user.branchId !== requester.branchId) {
    throw new AppError("Acceso denegado. Este empleado pertenece a otra sucursal.", 403);
  }

  const [salesAgg, cancelledCount, recentSales, sessions] = await Promise.all([
    prisma.sale.aggregate({ where: { userId: employeeId, status: "COMPLETADA" }, _sum: { totalAmount: true }, _count: { _all: true } }),
    prisma.sale.count({ where: { userId: employeeId, status: "CANCELADA" } }),
    prisma.sale.findMany({
      where: { userId: employeeId },
      take: 10,
      orderBy: { createdAt: "desc" },
      select: { id: true, invoiceNumber: true, createdAt: true, totalAmount: true, paymentMethod: true, status: true },
    }),
    prisma.cashSession.findMany({
      where: { userId: employeeId },
      take: 10,
      orderBy: { openedAt: "desc" },
      select: { id: true, openedAt: true, closedAt: true, initialAmount: true, difference: true, status: true },
    }),
  ]);

  const sessionIds = (await prisma.cashSession.findMany({ where: { userId: employeeId }, select: { id: true } })).map((s) => s.id);
  const depositsAgg = sessionIds.length > 0
    ? await prisma.bankDeposit.aggregate({ where: { cashSessionId: { in: sessionIds } }, _sum: { amount: true }, _count: { _all: true } })
    : { _sum: { amount: null }, _count: { _all: 0 } };

  const openSessions = sessions.filter((s) => s.status === "ABIERTA").length;
  const totalSales = salesAgg._count._all;
  const totalSalesAmount = Number(salesAgg._sum.totalAmount ?? 0);
  const avgPerTicket = totalSales > 0 ? Math.round((totalSalesAmount / totalSales) * 100) / 100 : 0;
  const estimatedCommission = user.commissionRate
    ? Math.round((totalSalesAmount * Number(user.commissionRate)) / 100 * 100) / 100
    : 0;

  return {
    employee: { id: user.id, name: user.name, email: user.email, role: user.role, active: user.active, branch: user.branch.name },
    summary: {
      salesCount: totalSales,
      salesTotal: totalSalesAmount,
      cancelledCount,
      sessionsCount: sessions.length,
      openSessions,
      depositsCount: depositsAgg._count._all,
      depositsTotal: Number(depositsAgg._sum.amount ?? 0),
      avgPerTicket,
      estimatedCommission,
    },
    recentSales: recentSales.map((s) => ({
      id: s.id,
      invoiceNumber: s.invoiceNumber,
      createdAt: s.createdAt,
      totalAmount: Number(s.totalAmount),
      paymentMethod: s.paymentMethod,
      status: s.status,
    })),
    recentSessions: sessions.map((s) => ({
      id: s.id,
      openedAt: s.openedAt,
      closedAt: s.closedAt,
      initialAmount: Number(s.initialAmount),
      difference: s.difference !== null ? Number(s.difference) : null,
      status: s.status,
    })),
  };
};
