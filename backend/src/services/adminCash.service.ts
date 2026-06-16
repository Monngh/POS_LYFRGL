import { prisma } from "../app";
import { AppError } from "../utils/AppError";

export const listCashSessions = async (params: {
  branchId?: number;
  status?: string;
  from?: string;
  to?: string;
  userId?: string;
}) => {
  const where: any = {};
  if (params.branchId) where.branchId = params.branchId;
  if (params.status && params.status !== "all") where.status = params.status;
  if (params.userId && !isNaN(Number(params.userId))) where.userId = Number(params.userId);
  if (params.from && params.to) {
    where.openedAt = { gte: new Date(params.from), lte: new Date(params.to + "T23:59:59") };
  }

  const sessions = await prisma.cashSession.findMany({
    where,
    take: 100,
    orderBy: { openedAt: "desc" },
    include: {
      branch: { select: { name: true } },
      user: { select: { name: true } },
      _count: { select: { sales: true } },
    },
  });

  return sessions.map((s) => {
    const expected = Number(s.initialAmount) + Number(s.cashIn) - Number(s.cashOut);
    return {
      id: s.id,
      branch: s.branch.name,
      cajero: s.user.name,
      openedAt: s.openedAt,
      closedAt: s.closedAt,
      initialAmount: Number(s.initialAmount),
      cashIn: Number(s.cashIn),
      cashOut: Number(s.cashOut),
      expectedAmount: s.status === "CERRADA" ? Number(s.expectedAmount) : expected,
      declaredAmount: s.declaredAmount !== null ? Number(s.declaredAmount) : null,
      difference: s.difference !== null ? Number(s.difference) : null,
      salesCount: s._count.sales,
      status: s.status,
    };
  });
};

export const getCashSessionDetail = async (
  sessionId: number,
  requester?: { role: string; branchId: number }
) => {
  const session = await prisma.cashSession.findUnique({
    where: { id: sessionId },
    include: {
      branch: { select: { name: true } },
      user: { select: { name: true } },
      sales: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true, invoiceNumber: true, createdAt: true, totalAmount: true,
          paymentMethod: true, cardType: true, cashReceived: true, changeGiven: true, status: true,
        },
      },
      bankDeposits: {
        orderBy: { createdAt: "asc" },
        select: { id: true, createdAt: true, amount: true, targetName: true, status: true },
      },
    },
  });

  if (!session) return null;

  if (requester?.role === "GERENTE" && session.branchId !== requester.branchId) {
    throw new AppError("Acceso denegado. Esta sesión pertenece a otra sucursal.", 403);
  }

  let efectivo = 0, tarjetaCredito = 0, tarjetaDebito = 0, mercadoPago = 0, totalVentas = 0;

  for (const sale of session.sales) {
    if (sale.status !== "COMPLETADA") continue;
    const amount = Number(sale.totalAmount);
    totalVentas += amount;
    if (sale.paymentMethod === "EFECTIVO") {
      efectivo += amount;
    } else if (sale.paymentMethod === "TARJETA") {
      if (sale.cardType === "CREDITO") tarjetaCredito += amount;
      else tarjetaDebito += amount;
    } else if (sale.paymentMethod === "QR_MERCADOPAGO") {
      mercadoPago += amount;
    } else if (sale.paymentMethod === "MIXTO") {
      const cashPortion = Number(sale.cashReceived || 0) - Number(sale.changeGiven || 0);
      const cardPortion = amount - cashPortion;
      efectivo += Math.max(0, cashPortion);
      if (sale.cardType === "CREDITO") tarjetaCredito += Math.max(0, cardPortion);
      else tarjetaDebito += Math.max(0, cardPortion);
    }
  }

  type RawMov = { date: Date; type: string; description: string; amount: number };
  const rawMovements: RawMov[] = [];

  for (const sale of session.sales) {
    const amount = Number(sale.totalAmount);
    rawMovements.push({
      date: sale.createdAt,
      type: sale.status === "CANCELADA" ? "CANCELACIÓN" : "VENTA",
      description: sale.invoiceNumber,
      amount: sale.status === "CANCELADA" ? -amount : amount,
    });
  }

  for (const dep of session.bankDeposits) {
    rawMovements.push({
      date: dep.createdAt,
      type: "DEPÓSITO",
      description: dep.targetName,
      amount: -Number(dep.amount),
    });
  }

  rawMovements.sort((a, b) => a.date.getTime() - b.date.getTime());

  let runningBalance = Number(session.initialAmount);
  const allWithBalance = rawMovements.map((m) => {
    runningBalance += m.amount;
    return { ...m, balance: runningBalance };
  });

  const movements = allWithBalance.slice(-20).map((m, i) => ({
    id: i,
    date: m.date.toISOString(),
    type: m.type,
    description: m.description,
    amount: m.amount,
    balance: m.balance,
  }));

  const expected = Number(session.initialAmount) + Number(session.cashIn) - Number(session.cashOut);
  const s = session as any;

  return {
    session: {
      id: session.id,
      branch: session.branch.name,
      cajero: session.user.name,
      openedAt: session.openedAt,
      closedAt: session.closedAt,
      initialAmount: Number(session.initialAmount),
      cashIn: Number(session.cashIn),
      cashOut: Number(session.cashOut),
      expectedAmount: session.status === "CERRADA" ? Number(session.expectedAmount) : expected,
      declaredAmount: session.declaredAmount !== null ? Number(session.declaredAmount) : null,
      difference: session.difference !== null ? Number(session.difference) : null,
      salesCount: session.sales.filter((sale) => sale.status === "COMPLETADA").length,
      status: session.status,
      forceCloseReason: s.forceCloseReason ?? null,
    },
    payBreakdown: { efectivo, tarjetaCredito, tarjetaDebito, mercadoPago, totalVentas },
    movements,
  };
};

export const forceCloseCashSession = async (
  sessionId: number,
  reason: string,
  forcedBy?: number,
  requester?: { role: string; branchId: number }
) => {
  const session = await prisma.cashSession.findUnique({
    where: { id: sessionId },
    include: {
      sales: {
        select: {
          id: true, totalAmount: true, paymentMethod: true, cardType: true,
          cashReceived: true, changeGiven: true, status: true,
        },
      },
    },
  });

  if (!session) throw new AppError("Sesión de caja no encontrada.", 404);

  if (requester?.role === "GERENTE" && session.branchId !== requester.branchId) {
    throw new AppError("Acceso denegado. Solo puede cerrar sesiones de su sucursal.", 403);
  }

  if (session.status !== "ABIERTA") throw new AppError("La sesión ya se encuentra cerrada.", 400);

  let totalSales = 0, totalRefunds = 0, totalCash = 0, totalCreditCard = 0, totalDebitCard = 0, totalMercadoPago = 0;

  for (const sale of session.sales) {
    const amount = Number(sale.totalAmount);
    if (sale.status === "CANCELADA") {
      totalRefunds += amount;
    } else if (sale.status === "COMPLETADA") {
      totalSales += amount;
      if (sale.paymentMethod === "EFECTIVO") {
        totalCash += amount;
      } else if (sale.paymentMethod === "TARJETA") {
        if (sale.cardType === "CREDITO") totalCreditCard += amount;
        else totalDebitCard += amount;
      } else if (sale.paymentMethod === "QR_MERCADOPAGO") {
        totalMercadoPago += amount;
      } else if (sale.paymentMethod === "MIXTO") {
        const cashPortion = Number(sale.cashReceived || 0) - Number(sale.changeGiven || 0);
        const cardPortion = amount - cashPortion;
        totalCash += Math.max(0, cashPortion);
        if (sale.cardType === "CREDITO") totalCreditCard += Math.max(0, cardPortion);
        else totalDebitCard += Math.max(0, cardPortion);
      }
    }
  }

  const expected = Number(session.initialAmount) + Number(session.cashIn) - Number(session.cashOut);
  const cutNumber = (await prisma.cashCut.count({ where: { cashSessionId: sessionId } })) + 1;

  const result = await prisma.$transaction(async (tx) => {
    const cut = await tx.cashCut.create({
      data: {
        cashSessionId: sessionId,
        totalSales: totalSales + totalRefunds,
        totalCash,
        totalCreditCard,
        totalDebitCard,
        totalRefunds,
        netTotal: totalSales,
        cutNumber,
      },
    });

    const closedSession = await tx.cashSession.update({
      where: { id: sessionId },
      data: {
        status: "CERRADA",
        closedAt: new Date(),
        expectedAmount: expected,
        forceCloseReason: reason.trim(),
        forcedByUserId: forcedBy ? Number(forcedBy) : null,
      },
    });

    return { cut, closedSession };
  });

  return { ...result, totalMercadoPago };
};

export const listBankDeposits = async (params: {
  branchId?: number;
  from?: string;
  to?: string;
  account?: string;
}) => {
  const where: any = {};
  if (params.branchId) where.branchId = params.branchId;
  if (params.account) where.accountNumber = String(params.account);

  if (params.from || params.to) {
    where.createdAt = {};
    if (params.from) {
      const fromDate = new Date(String(params.from));
      fromDate.setHours(0, 0, 0, 0);
      where.createdAt.gte = fromDate;
    }
    if (params.to) {
      const toDate = new Date(String(params.to));
      toDate.setHours(23, 59, 59, 999);
      where.createdAt.lte = toDate;
    }
  }

  const deposits = await prisma.bankDeposit.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { branch: { select: { name: true } } },
  });

  return deposits.map((d) => ({
    id: d.id,
    accountMasked: `**** **** **** ${d.accountNumber.slice(-4)}`,
    accountNumber: d.accountNumber,
    targetName: d.targetName,
    amount: Number(d.amount),
    paymentType: d.paymentType,
    comments: d.comments,
    branch: d.branch.name,
    sessionId: d.cashSessionId,
    createdAt: d.createdAt,
    status: d.status,
  }));
};
