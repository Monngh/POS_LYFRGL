import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../app";
import { getRequestDeviceId } from "../middlewares/device.middleware";
import { comparePassword } from "../utils/auth";

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

    // Indicar si la sesión pertenece al equipo que consulta (sesiones sin
    // dispositivo vinculado se consideran propias por compatibilidad)
    const requestDeviceId = getRequestDeviceId(req);
    const isOwnedByThisDevice = activeSession
      ? !activeSession.deviceId || activeSession.deviceId === requestDeviceId
      : null;

    res.status(200).json({
      isOpen: !!activeSession,
      session: activeSession,
      isOwnedByThisDevice,
    });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al obtener estado de caja." });
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

  const { initialAmount, pinCode } = req.body;

  if (initialAmount === undefined || initialAmount === null || isNaN(Number(initialAmount))) {
    res.status(400).json({ message: "El monto del fondo inicial es requerido y debe ser numérico." });
    return;
  }

  // ── Filtro de seguridad: la apertura debe ser confirmada con el PIN de un
  // usuario autorizado (admin, gerente o cajero) activo. No se crea ninguna
  // tabla: se valida contra el pinCode ya existente en User.
  if (!pinCode || typeof pinCode !== "string" || !pinCode.trim()) {
    res.status(400).json({
      code: "PIN_REQUERIDO",
      message: "Ingrese el PIN de autorización para abrir la caja.",
    });
    return;
  }

  let approverName = "";
  try {
    const staff = await prisma.user.findMany({
      where: { role: { in: ["ADMIN", "GERENTE", "CAJERO"] }, active: true },
      select: { name: true, pinCode: true },
    });
    let approver: { name: string } | null = null;
    for (const s of staff) {
      if (s.pinCode && (await comparePassword(pinCode.trim(), s.pinCode))) {
        approver = { name: s.name };
        break;
      }
    }
    if (!approver) {
      // 403 (no 401) a propósito: un PIN incorrecto NO es sesión expirada y no
      // debe cerrar la sesión del cajero desde el interceptor del frontend.
      res.status(403).json({
        code: "PIN_INVALIDO",
        message: "PIN de autorización incorrecto. Verifique e intente de nuevo.",
      });
      return;
    }
    approverName = approver.name;
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al validar el PIN de autorización." });
    return;
  }

  const deviceId = getRequestDeviceId(req);
  const userId = req.user.userId;
  const branchId = req.user.branchId;

  try {
    // Verificación + creación dentro de una transacción SERIALIZABLE para evitar
    // la condición de carrera: dos peticiones simultáneas (ej. desde dos
    // computadoras) no pueden pasar ambas la validación y crear cajas duplicadas.
    const newSession = await prisma.$transaction(async (tx) => {
      // Una sola caja abierta por empleado, sin importar la sucursal o el equipo
      const existingSession = await tx.cashSession.findFirst({
        where: {
          userId,
          status: "ABIERTA",
          closedAt: null,
        },
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
          initialAmount: Number(initialAmount),
          expectedAmount: Number(initialAmount),
          status: "ABIERTA",
          deviceId,
        },
      });
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10000,
      timeout: 15000,
    });

    res.status(201).json({
      message: "Caja abierta exitosamente.",
      session: newSession,
      authorizedBy: approverName,
    });
  } catch (error: any) {
    if (error.isSessionConflict) {
      res.status(409).json({ code: "CAJA_YA_ABIERTA", message: "Ya tienes una sesión de caja activa. Verifica el estado de tu turno antes de abrir una nueva." });
      return;
    }
    // Deadlock/conflicto de serialización: otra apertura simultánea ganó la transacción
    if (error.code === "P2034" || /deadlock/i.test(error.message || "")) {
      res.status(409).json({
        code: "CAJA_YA_ABIERTA",
        message: "Se detectó otra apertura de caja en curso para este usuario. Verifique el estado de su turno antes de reintentar.",
      });
      return;
    }
    res.status(500).json({ message: "Error al abrir la caja." });
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
        mercadoPagoTotal,
        declaredAmount: decDeclared,
        difference: decDifference,
      }
    });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al cerrar la caja." });
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
    console.error(error);
    res.status(500).json({ message: "Error al cargar estadísticas de turno." });
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
    let mercadoPagoTotal = 0;

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
        } else if (sale.paymentMethod === "QR_MERCADOPAGO") {
          mercadoPagoTotal += amount;
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
        totalMercadoPago: mercadoPagoTotal,
      },
    });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al generar corte parcial." });
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

      const salesBeforeCut = await prisma.sale.findMany({
        where: {
          cashSessionId: activeSession.id,
          createdAt: {
            lte: cut.createdAt,
          },
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

    res.status(200).json({ cuts: cutsWithReturns });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al cargar historial de cortes." });
  }
};

