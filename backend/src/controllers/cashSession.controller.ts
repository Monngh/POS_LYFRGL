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

    const closedSession = await prisma.cashSession.update({
      where: { id: activeSession.id },
      data: {
        closedAt: new Date(),
        declaredAmount: decDeclared,
        expectedAmount: decExpected,
        difference: decDifference,
        status: "CERRADA",
      },
    });

    res.status(200).json({
      message: "Caja cerrada y arqueada exitosamente.",
      session: closedSession,
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

    // Contar cantidad de ventas de esta sesión
    const salesCount = await prisma.sale.count({
      where: {
        cashSessionId: activeSession.id,
        status: "COMPLETADA",
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

    res.status(200).json({
      hasActive: true,
      stats: {
        session: activeSession,
        salesCount,
        totalSalesAmount: Number(activeSession.cashIn), // En nuestro sistema cashIn registra el acumulado de ventas
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
        depositsDetails: deposits
      }
    });
  } catch (error: any) {
    res.status(500).json({ message: "Error al cargar estadísticas de turno.", error: error.message });
  }
};
