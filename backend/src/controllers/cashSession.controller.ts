import { Request, Response } from "express";
import { prisma } from "../app";

/**
 * Consultar si el cajero tiene un turno activo en la sucursal actual
 */
export const getSessionStatus = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }

  try {
    const activeSession = await prisma.cashSession.findFirst({
      where: {
        userId: req.user.userId,
        branchId: req.user.branchId,
        status: "ABIERTA",
        closedAt: null,
      },
    });

    res.status(200).json({
      isOpen: !!activeSession,
      session: activeSession,
    });
  } catch (error: any) {
    res.status(500).json({ message: "Error al obtener estado de caja.", error: error.message });
  }
};

/**
 * Abrir caja chica con un fondo inicial
 */
export const openSession = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }

  const { initialAmount } = req.body;

  if (initialAmount === undefined || initialAmount === null || isNaN(Number(initialAmount))) {
    res.status(400).json({ message: "El monto del fondo inicial es requerido y debe ser numérico." });
    return;
  }

  try {
    // Verificar si ya tiene una sesión abierta
    const existingSession = await prisma.cashSession.findFirst({
      where: {
        userId: req.user.userId,
        branchId: req.user.branchId,
        status: "ABIERTA",
        closedAt: null,
      },
    });

    if (existingSession) {
      res.status(400).json({ message: "Ya existe una sesión de caja abierta para este usuario en esta sucursal." });
      return;
    }

    const newSession = await prisma.cashSession.create({
      data: {
        branchId: req.user.branchId,
        userId: req.user.userId,
        initialAmount: Number(initialAmount),
        expectedAmount: Number(initialAmount),
        status: "ABIERTA",
      },
    });

    res.status(201).json({
      message: "Caja abierta exitosamente.",
      session: newSession,
    });
  } catch (error: any) {
    res.status(500).json({ message: "Error al abrir la caja.", error: error.message });
  }
};

/**
 * Cerrar la caja y realizar el arqueo final (Cierre de turno)
 */
export const closeSession = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }

  const { declaredAmount } = req.body;

  if (declaredAmount === undefined || declaredAmount === null || isNaN(Number(declaredAmount))) {
    res.status(400).json({ message: "El monto de efectivo declarado/contado es requerido y debe ser numérico." });
    return;
  }

  try {
    // Buscar la sesión abierta activa
    const activeSession = await prisma.cashSession.findFirst({
      where: {
        userId: req.user.userId,
        branchId: req.user.branchId,
        status: "ABIERTA",
        closedAt: null,
      },
    });

    if (!activeSession) {
      res.status(400).json({ message: "No hay ninguna sesión de caja abierta para este usuario." });
      return;
    }

    // Calcular el monto total esperado: inicial + entradas - salidas
    // expectedAmount ya se va actualizando en base de datos con cada venta/entrada/salida,
    // pero por seguridad realizaremos el cálculo matemático explícito
    const decInitial = Number(activeSession.initialAmount);
    const decCashIn = Number(activeSession.cashIn);
    const decCashOut = Number(activeSession.cashOut);
    const decExpected = decInitial + decCashIn - decCashOut;

    const decDeclared = Number(declaredAmount);
    const decDifference = decDeclared - decExpected;

    // Consultar todas las ventas de la sesión
    const sales = await prisma.sale.findMany({
      where: {
        cashSessionId: activeSession.id,
      },
    });

    let salesCount = 0;
    let totalSalesAmount = 0; // Completadas + Canceladas
    let totalRefunds = 0; // Canceladas
    let netTotal = 0; // Completadas
    let creditCardTotal = 0;
    let debitCardTotal = 0;
    let cashTotal = 0;

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

    totalSalesAmount = netTotal + totalRefunds;

    // Consultar devoluciones de la sesión
    const sessionReturns = await prisma.return.findMany({
      where: {
        cashSessionId: activeSession.id,
      },
    });
    const totalReturnsAmount = sessionReturns.reduce((acc, curr) => acc + Number(curr.totalRefunded), 0);
    const returnsCount = sessionReturns.length;

    const closedSession = await prisma.cashSession.update({
      where: { id: activeSession.id },
      data: {
        closedAt: new Date(),
        declaredAmount: decDeclared,
        expectedAmount: decExpected,
        difference: decDifference,
        status: "CERRADA",
      },
      include: {
        user: {
          select: {
            name: true,
          }
        },
        branch: {
          select: {
            name: true,
          }
        }
      }
    });

    res.status(200).json({
      message: "Caja cerrada y arqueada exitosamente.",
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
        declaredAmount: decDeclared,
        difference: decDifference,
      }
    });
  } catch (error: any) {
    res.status(500).json({ message: "Error al cerrar la caja.", error: error.message });
  }
};

/**
 * Obtener estadísticas financieras consolidadas del turno del cajero
 */
export const getSessionStats = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }

  try {
    const activeSession = await prisma.cashSession.findFirst({
      where: {
        userId: req.user.userId,
        branchId: req.user.branchId,
        status: "ABIERTA",
        closedAt: null,
      },
    });

    if (!activeSession) {
      res.status(400).json({ message: "No hay ninguna sesión de caja abierta activa.", hasActive: false });
      return;
    }

    // Consultar todas las ventas de la sesión
    const sales = await prisma.sale.findMany({
      where: {
        cashSessionId: activeSession.id,
      },
    });

    // Obtener ventas canceladas con QR_MERCADOPAGO de este turno
    const qrRefundedSales = await prisma.sale.findMany({
      where: {
        cashSessionId: activeSession.id,
        status: "CANCELADA",
        paymentMethod: "QR_MERCADOPAGO",
        refundStatus: { not: null }
      }
    });

    const refundedSalesCount = qrRefundedSales.length;
    const refundedAmount = qrRefundedSales.reduce((acc, curr) => acc + (curr.refundAmount ? Number(curr.refundAmount) : 0), 0);
    const pendingRefundsCount = qrRefundedSales.filter(s => s.refundStatus === "PENDING").length;

    // Recuperar depósitos
    const deposits = await prisma.bankDeposit.findMany({
      where: {
        cashSessionId: activeSession.id
      }
    });

    const pendingDeposits = deposits.filter(d => d.status === 'PENDING').reduce((acc, curr) => acc + Number(curr.amount), 0);
    const confirmedDeposits = deposits.filter(d => d.status === 'COMPLETED').reduce((acc, curr) => acc + Number(curr.amount), 0);
    const cancelledDeposits = deposits.filter(d => d.status === 'CANCELLED').reduce((acc, curr) => acc + Number(curr.amount), 0);

    let salesCount = 0;
    let totalSalesAmount = 0; // Completadas + Canceladas
    let totalRefunds = 0; // Canceladas
    let netTotal = 0; // Completadas
    let creditCardTotal = 0;
    let debitCardTotal = 0;
    let cashTotal = 0;
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

    totalSalesAmount = netTotal + totalRefunds;

    // Consultar devoluciones de la sesión
    const sessionReturns = await prisma.return.findMany({
      where: {
        cashSessionId: activeSession.id,
      },
    });
    const totalReturnsAmount = sessionReturns.reduce((acc, curr) => acc + Number(curr.totalRefunded), 0);
    const returnsCount = sessionReturns.length;

    res.status(200).json({
      hasActive: true,
      stats: {
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
      }
    });
  } catch (error: any) {
    res.status(500).json({ message: "Error al cargar estadísticas de turno.", error: error.message });
  }
};

/**
 * Generar un corte de caja parcial (Cut)
 */
export const createPartialCut = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }

  try {
    const activeSession = await prisma.cashSession.findFirst({
      where: {
        userId: req.user.userId,
        branchId: req.user.branchId,
        status: "ABIERTA",
        closedAt: null,
      },
    });

    if (!activeSession) {
      res.status(400).json({ message: "No hay ninguna sesión de caja abierta activa." });
      return;
    }

    // Consultar todas las ventas de la sesión
    const sales = await prisma.sale.findMany({
      where: {
        cashSessionId: activeSession.id,
      },
    });

    let totalSales = 0; // Completadas + Canceladas
    let totalRefunds = 0; // Canceladas
    let totalCash = 0; // Efectivo en ventas completadas
    let creditCardTotal = 0; // Tarjeta crédito en completadas
    let debitCardTotal = 0; // Tarjeta débito en completadas

    for (const sale of sales) {
      const amount = Number(sale.totalAmount);
      if (sale.status === "CANCELADA") {
        totalRefunds += amount;
      } else if (sale.status === "COMPLETADA") {
        totalSales += amount;
        if (sale.paymentMethod === "EFECTIVO") {
          totalCash += amount;
        } else if (sale.paymentMethod === "TARJETA") {
          if (sale.cardType === "CREDITO") {
            creditCardTotal += amount;
          } else {
            debitCardTotal += amount;
          }
        } else if (sale.paymentMethod === "MIXTO") {
          const cashPortion = Number(sale.cashReceived || 0) - Number(sale.changeGiven || 0);
          const cardPortion = amount - cashPortion;
          totalCash += Math.max(0, cashPortion);
          if (sale.cardType === "CREDITO") {
            creditCardTotal += Math.max(0, cardPortion);
          } else {
            debitCardTotal += Math.max(0, cardPortion);
          }
        }
      }
    }

    const totalSalesSum = totalSales + totalRefunds;
    const netTotal = totalSales; // Equivale al neto de ventas completadas

    // Consultar devoluciones de la sesión
    const sessionReturns = await prisma.return.findMany({
      where: {
        cashSessionId: activeSession.id,
      },
    });
    const totalReturnsAmount = sessionReturns.reduce((acc, curr) => acc + Number(curr.totalRefunded), 0);

    // Obtener el número de corte actual
    const cutsCount = await prisma.cashCut.count({
      where: {
        cashSessionId: activeSession.id,
      },
    });
    const cutNumber = cutsCount + 1;

    // Crear el registro de corte parcial
    const newCut = await prisma.cashCut.create({
      data: {
        cashSessionId: activeSession.id,
        totalSales: totalSalesSum,
        totalCash,
        totalCreditCard: creditCardTotal,
        totalDebitCard: debitCardTotal,
        totalRefunds,
        netTotal,
        cutNumber,
      },
    });

    res.status(201).json({
      message: "Corte parcial registrado exitosamente.",
      cut: {
        ...newCut,
        totalReturns: totalReturnsAmount,
        netTotal: Number(newCut.netTotal) - totalReturnsAmount,
      },
    });
  } catch (error: any) {
    res.status(500).json({ message: "Error al generar corte parcial.", error: error.message });
  }
};

/**
 * Obtener todos los cortes parciales de la sesión activa
 */
export const getPartialCuts = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }

  try {
    const activeSession = await prisma.cashSession.findFirst({
      where: {
        userId: req.user.userId,
        branchId: req.user.branchId,
        status: "ABIERTA",
        closedAt: null,
      },
    });

    if (!activeSession) {
      res.status(400).json({ message: "No hay ninguna sesión de caja abierta activa." });
      return;
    }

    const cuts = await prisma.cashCut.findMany({
      where: {
        cashSessionId: activeSession.id,
      },
      orderBy: {
        cutNumber: "asc",
      },
    });

    const cutsWithReturns = [];
    for (const cut of cuts) {
      const returnsBeforeCut = await prisma.return.findMany({
        where: {
          cashSessionId: activeSession.id,
          createdAt: {
            lte: cut.createdAt,
          },
        },
      });
      const totalReturns = returnsBeforeCut.reduce((acc, curr) => acc + Number(curr.totalRefunded), 0);
      cutsWithReturns.push({
        ...cut,
        totalReturns,
        netTotal: Number(cut.netTotal) - totalReturns,
      });
    }

    res.status(200).json({ cuts: cutsWithReturns });
  } catch (error: any) {
    res.status(500).json({ message: "Error al cargar historial de cortes.", error: error.message });
  }
};

