import { Prisma } from "@prisma/client";
import { prisma } from "../app";
import { AppError } from "../utils/AppError";

const findActiveSession = (userId: number, branchId: number) =>
  prisma.cashSession.findFirst({
    where: { userId, branchId, status: "ABIERTA", closedAt: null },
  });

// Aggregates sale totals by payment method — logic shared across close/stats/partialCut.
const aggregateSalesByMethod = (sales: any[]) => {
  let salesCount = 0;
  let netTotal = 0;
  let totalRefunds = 0;
  let cashTotal = 0;
  let creditCardTotal = 0;
  let debitCardTotal = 0;
  let mercadoPagoTotal = 0;

  for (const sale of sales) {
    const amount = Number(sale.totalAmount);
    if (sale.status === "CANCELADA") {
      totalRefunds += amount;
    } else if (sale.status === "COMPLETADA") {
      salesCount++;
      netTotal += amount;
      if (sale.paymentMethod === "EFECTIVO") {
        cashTotal += amount;
      } else if (sale.paymentMethod === "TARJETA") {
        if (sale.cardType === "CREDITO") {
          creditCardTotal += amount;
        } else {
          debitCardTotal += amount;
        }
      } else if (sale.paymentMethod === "QR_MERCADOPAGO") {
        mercadoPagoTotal += amount;
      } else if (sale.paymentMethod === "MIXTO") {
        const cashPortion = Number(sale.cashReceived || 0) - Number(sale.changeGiven || 0);
        const cardPortion = amount - cashPortion;
        cashTotal += Math.max(0, cashPortion);
        if (sale.cardType === "CREDITO") {
          creditCardTotal += Math.max(0, cardPortion);
        } else {
          debitCardTotal += Math.max(0, cardPortion);
        }
      }
    }
  }

  return { salesCount, netTotal, totalRefunds, cashTotal, creditCardTotal, debitCardTotal, mercadoPagoTotal };
};

export const getSessionStatus = async (userId: number, branchId: number) =>
  findActiveSession(userId, branchId);

// Contains the Serializable transaction exactly as in the original controller —
// no logic changes, only moved here to keep the controller thin.
export const openCashSession = async (
  userId: number,
  branchId: number,
  initialAmount: number,
  deviceId: string | null
) => {
  return prisma.$transaction(
    async (tx) => {
      const existingSession = await tx.cashSession.findFirst({
        where: { userId, status: "ABIERTA", closedAt: null },
      });

      if (existingSession) {
        const isSameDevice = !existingSession.deviceId || existingSession.deviceId === deviceId;
        const conflictError: any = new Error(
          isSameDevice
            ? "Ya existe una sesión de caja abierta para este usuario."
            : "Este usuario ya tiene una caja abierta en OTRO equipo. Cierre el turno en ese equipo o solicite a un administrador el cierre forzado de la sesión."
        );
        conflictError.isSessionConflict = true;
        throw conflictError;
      }

      return tx.cashSession.create({
        data: {
          branchId,
          userId,
          initialAmount,
          expectedAmount: initialAmount,
          status: "ABIERTA",
          deviceId,
        },
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10000,
      timeout: 15000,
    }
  );
};

export const closeCashSession = async (
  userId: number,
  branchId: number,
  declaredAmount: number
) => {
  const activeSession = await findActiveSession(userId, branchId);
  if (!activeSession) {
    throw new AppError("No hay ninguna sesión de caja abierta para este usuario.", 400);
  }

  const decInitial = Number(activeSession.initialAmount);
  const decCashIn = Number(activeSession.cashIn);
  const decCashOut = Number(activeSession.cashOut);
  const decExpected = decInitial + decCashIn - decCashOut;
  const decDifference = declaredAmount - decExpected;

  const sales = await prisma.sale.findMany({ where: { cashSessionId: activeSession.id } });
  const { salesCount, netTotal, totalRefunds, cashTotal, creditCardTotal, debitCardTotal, mercadoPagoTotal } =
    aggregateSalesByMethod(sales);

  const totalSalesAmount = netTotal + totalRefunds;

  const sessionReturns = await prisma.return.findMany({ where: { cashSessionId: activeSession.id } });
  const totalReturnsAmount = sessionReturns.reduce((acc, curr) => acc + Number(curr.totalRefunded), 0);
  const returnsCount = sessionReturns.length;

  const closedSession = await prisma.$transaction(async (tx) =>
    tx.cashSession.update({
      where: { id: activeSession.id },
      data: {
        closedAt: new Date(),
        declaredAmount,
        expectedAmount: decExpected,
        difference: decDifference,
        status: "CERRADA",
      },
      include: {
        user: { select: { name: true } },
        branch: { select: { name: true } },
      },
    })
  );

  return {
    session: closedSession,
    stats: {
      session: closedSession,
      salesCount,
      totalSalesAmount,
      totalRefunds,
      totalReturnsAmount,
      returnsCount,
      netTotal: netTotal - totalReturnsAmount,
      initialAmount: decInitial,
      cashIn: decCashIn,
      cashOut: decCashOut,
      expectedAmount: decExpected,
      creditCardTotal,
      debitCardTotal,
      cashTotal,
      mercadoPagoTotal,
      declaredAmount,
      difference: decDifference,
    },
  };
};

export const getSessionStats = async (userId: number, branchId: number) => {
  const activeSession = await findActiveSession(userId, branchId);
  if (!activeSession) {
    throw new AppError("No hay ninguna sesión de caja abierta activa.", 400);
  }

  const sales = await prisma.sale.findMany({ where: { cashSessionId: activeSession.id } });
  const { salesCount, netTotal, totalRefunds, cashTotal, creditCardTotal, debitCardTotal, mercadoPagoTotal } =
    aggregateSalesByMethod(sales);

  const totalSalesAmount = netTotal + totalRefunds;

  const qrRefundedSales = await prisma.sale.findMany({
    where: {
      cashSessionId: activeSession.id,
      status: "CANCELADA",
      paymentMethod: "QR_MERCADOPAGO",
      refundStatus: { not: null },
    },
  });
  const refundedSalesCount = qrRefundedSales.length;
  const refundedAmount = qrRefundedSales.reduce(
    (acc, curr) => acc + (curr.refundAmount ? Number(curr.refundAmount) : 0),
    0
  );
  const pendingRefundsCount = qrRefundedSales.filter((s) => s.refundStatus === "PENDING").length;

  const deposits = await prisma.bankDeposit.findMany({ where: { cashSessionId: activeSession.id } });
  const pendingDeposits = deposits
    .filter((d) => d.status === "PENDING")
    .reduce((acc, curr) => acc + Number(curr.amount), 0);
  const confirmedDeposits = deposits
    .filter((d) => d.status === "COMPLETED")
    .reduce((acc, curr) => acc + Number(curr.amount), 0);
  const cancelledDeposits = deposits
    .filter((d) => d.status === "CANCELLED")
    .reduce((acc, curr) => acc + Number(curr.amount), 0);

  const sessionReturns = await prisma.return.findMany({ where: { cashSessionId: activeSession.id } });
  const totalReturnsAmount = sessionReturns.reduce((acc, curr) => acc + Number(curr.totalRefunded), 0);
  const returnsCount = sessionReturns.length;

  return {
    session: activeSession,
    salesCount,
    totalSalesAmount,
    totalRefunds,
    totalReturnsAmount,
    returnsCount,
    netTotal: netTotal - totalReturnsAmount,
    initialAmount: Number(activeSession.initialAmount),
    cashIn: Number(activeSession.cashIn),
    cashOut: Number(activeSession.cashOut),
    expectedAmount: Number(activeSession.initialAmount) + Number(activeSession.cashIn) - Number(activeSession.cashOut),
    pendingDeposits,
    confirmedDeposits,
    cancelledDeposits,
    refundedSalesCount,
    refundedAmount,
    pendingRefundsCount,
    depositsDetails: deposits,
    creditCardTotal,
    debitCardTotal,
    cashTotal,
    mercadoPagoTotal,
  };
};

export const createPartialCut = async (userId: number, branchId: number) => {
  const activeSession = await findActiveSession(userId, branchId);
  if (!activeSession) {
    throw new AppError("No hay ninguna sesión de caja abierta activa.", 400);
  }

  const sales = await prisma.sale.findMany({ where: { cashSessionId: activeSession.id } });
  const { netTotal: totalSales, totalRefunds, cashTotal: totalCash, creditCardTotal, debitCardTotal, mercadoPagoTotal } =
    aggregateSalesByMethod(sales);

  const totalSalesSum = totalSales + totalRefunds;

  const sessionReturns = await prisma.return.findMany({ where: { cashSessionId: activeSession.id } });
  const totalReturnsAmount = sessionReturns.reduce((acc, curr) => acc + Number(curr.totalRefunded), 0);

  const newCut = await prisma.$transaction(async (tx) => {
    const cutsCount = await tx.cashCut.count({ where: { cashSessionId: activeSession.id } });
    return tx.cashCut.create({
      data: {
        cashSessionId: activeSession.id,
        totalSales: totalSalesSum,
        totalCash,
        totalCreditCard: creditCardTotal,
        totalDebitCard: debitCardTotal,
        totalRefunds,
        netTotal: totalSales,
        cutNumber: cutsCount + 1,
      },
    });
  });

  return {
    ...newCut,
    totalReturns: totalReturnsAmount,
    netTotal: Number(newCut.netTotal) - totalReturnsAmount,
    totalMercadoPago: mercadoPagoTotal,
  };
};

export const getPartialCuts = async (userId: number, branchId: number) => {
  const activeSession = await findActiveSession(userId, branchId);
  if (!activeSession) {
    throw new AppError("No hay ninguna sesión de caja abierta activa.", 400);
  }

  const cuts = await prisma.cashCut.findMany({
    where: { cashSessionId: activeSession.id },
    orderBy: { cutNumber: "asc" },
  });

  const cutsWithReturns = [];
  for (const cut of cuts) {
    const returnsBeforeCut = await prisma.return.findMany({
      where: { cashSessionId: activeSession.id, createdAt: { lte: cut.createdAt } },
    });
    const totalReturns = returnsBeforeCut.reduce((acc, curr) => acc + Number(curr.totalRefunded), 0);

    const salesBeforeCut = await prisma.sale.findMany({
      where: {
        cashSessionId: activeSession.id,
        createdAt: { lte: cut.createdAt },
        status: "COMPLETADA",
        paymentMethod: "QR_MERCADOPAGO",
      },
    });
    const totalMercadoPago = salesBeforeCut.reduce((acc, curr) => acc + Number(curr.totalAmount), 0);

    cutsWithReturns.push({
      ...cut,
      totalReturns,
      netTotal: Number(cut.netTotal) - totalReturns,
      totalMercadoPago,
    });
  }

  return cutsWithReturns;
};
