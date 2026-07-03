import { prisma } from "../app";
import { AppError } from "../utils/AppError";
import bcrypt from "bcryptjs";
import { emitSecurityEvent } from "../utils/securityEvents";
import { createMercadoPagoCashPayment, syncMercadoPagoDepositStatus } from "./mercadopago.service";

const mapDeposit = (d: any) => ({
  id: d.id,
  accountNumber: d.accountNumber,
  targetName: d.targetName,
  amount: Number(d.amount),
  paymentType: d.paymentType,
  comments: d.comments,
  reference: d.reference,
  status: d.status,
  createdAt: d.createdAt,
  confirmedAt: d.confirmedAt,
  cancelledAt: d.cancelledAt,
  cancelReason: d.cancelReason,
  sessionId: d.cashSessionId,
  userName: d.user?.name || "Desconocido",
});

export const createBankDeposit = async (params: {
  userId: number;
  branchId: number;
  accountNumber?: string;
  targetName?: string;
  amount: number;
  paymentType: string;
  comments?: string;
}) => {
  const { userId, branchId, amount, paymentType, comments } = params;
  const isMercadoPago = paymentType.startsWith("MERCADOPAGO_");

  let mpPaymentMethodId = "";
  let mpProviderName = "";
  if (isMercadoPago) {
    if (paymentType === "MERCADOPAGO_OXXO") { mpPaymentMethodId = "oxxo"; mpProviderName = "OXXO"; }
    else if (paymentType === "MERCADOPAGO_BBVA") { mpPaymentMethodId = "bancomer"; mpProviderName = "BBVA Bancomer"; }
    else if (paymentType === "MERCADOPAGO_SANTANDER") { mpPaymentMethodId = "serfin"; mpProviderName = "Santander"; }
    else if (paymentType === "MERCADOPAGO_CITIBANAMEX") { mpPaymentMethodId = "banamex"; mpProviderName = "Citibanamex"; }
    else if (paymentType === "MERCADOPAGO_7ELEVEN") { mpPaymentMethodId = "paycash"; mpProviderName = "7-Eleven"; }
    else throw new AppError(`Método de pago de Mercado Pago no soportado: ${paymentType}`, 400);
  }

  const activeSession = await prisma.cashSession.findFirst({
    where: { userId, branchId, status: "ABIERTA", closedAt: null },
  });
  if (!activeSession) throw new AppError("Debe tener una caja abierta para procesar depósitos.", 400);

  const inBox = Number(activeSession.initialAmount) + Number(activeSession.cashIn) - Number(activeSession.cashOut);
  if (inBox < amount) {
    throw new AppError(`Efectivo insuficiente en caja chica. Disponible: $${inBox.toFixed(2)}. Requerido: $${amount.toFixed(2)}.`, 400);
  }

  const today = new Date();
  const dateString = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
  const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
  const todayCount = await prisma.bankDeposit.count({
    where: { createdAt: { gte: startOfToday, lte: endOfToday } },
  });
  const reference = `DEP-${dateString}-${String(todayCount + 1).padStart(4, "0")}`;

  let mpResult = null;
  let finalAccountNumber = params.accountNumber || "";
  let finalTargetName = params.targetName || "";
  let finalStatus = "COMPLETED";
  let finalComments = comments || "Sin comentarios";

  if (isMercadoPago) {
    const mpResponse = await createMercadoPagoCashPayment(amount, mpPaymentMethodId, `Depósito de resguardo POS a ${mpProviderName}`);
    if (!mpResponse.success) throw new AppError(mpResponse.message || "Error al generar la referencia en Mercado Pago.", 400);
    mpResult = mpResponse;
    finalAccountNumber = mpResponse.reference || "PENDIENTE";
    finalTargetName = mpProviderName;
    finalStatus = "PENDING";
    finalComments = JSON.stringify({
      convenio: mpResponse.convenio,
      barcode: mpResponse.barcode,
      expirationDate: mpResponse.expirationDate,
      ticketUrl: mpResponse.ticketUrl,
      userComments: comments || "",
    });
  }

  const result = await prisma.$transaction(async (tx) => {
    const deposit = await tx.bankDeposit.create({
      data: {
        accountNumber: finalAccountNumber,
        targetName: finalTargetName,
        amount,
        paymentType,
        comments: finalComments,
        cashSessionId: activeSession.id,
        userId,
        branchId,
        reference,
        status: finalStatus,
        mercadoPagoPaymentId: mpResult?.paymentId || null,
        mercadoPagoStatus: mpResult?.status || null,
        ticketUrl: mpResult?.ticketUrl || null,
      },
      include: { user: { select: { name: true } } },
    });

    await tx.cashSession.update({
      where: { id: activeSession.id },
      data: { cashOut: { increment: amount } },
    });

    return deposit;
  });

  return {
    id: result.id,
    accountNumber: result.accountNumber,
    targetName: result.targetName,
    amount: Number(result.amount),
    paymentType: result.paymentType,
    comments: result.comments,
    reference: result.reference,
    status: result.status,
    createdAt: result.createdAt,
    sessionId: result.cashSessionId,
    userName: result.user.name,
    ticketUrl: result.ticketUrl,
    mercadoPagoPaymentId: result.mercadoPagoPaymentId,
    mercadoPagoStatus: result.mercadoPagoStatus,
  };
};

export const getRecentDeposits = async (branchId: number) => {
  const deposits = await prisma.bankDeposit.findMany({
    where: { branchId },
    include: { user: { select: { name: true } } },
    take: 10,
    orderBy: { createdAt: "desc" },
  });
  return deposits.map(mapDeposit);
};

export const searchDeposits = async (
  branchId: number,
  filters: { reference?: string; userId?: string; status?: string; dateFrom?: string; dateTo?: string }
) => {
  const whereClause: any = { branchId };

  if (filters.reference) whereClause.reference = { contains: String(filters.reference) };
  if (filters.userId) {
    const uId = parseInt(String(filters.userId), 10);
    if (!isNaN(uId)) whereClause.userId = uId;
  }
  if (filters.status && filters.status !== "ALL") whereClause.status = String(filters.status);
  if (filters.dateFrom || filters.dateTo) {
    whereClause.createdAt = {};
    if (filters.dateFrom) whereClause.createdAt.gte = new Date(`${filters.dateFrom}T00:00:00`);
    if (filters.dateTo) whereClause.createdAt.lte = new Date(`${filters.dateTo}T23:59:59.999`);
  }

  const deposits = await prisma.bankDeposit.findMany({
    where: whereClause,
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return deposits.map(mapDeposit);
};

export const getDepositById = async (depositId: number) => {
  const deposit = await prisma.bankDeposit.findUnique({
    where: { id: depositId },
    include: { user: { select: { name: true } } },
  });
  if (!deposit) throw new AppError("Depósito no encontrado.", 404);
  return {
    id: deposit.id,
    accountNumber: deposit.accountNumber,
    targetName: deposit.targetName,
    amount: Number(deposit.amount),
    paymentType: deposit.paymentType,
    comments: deposit.comments,
    reference: deposit.reference,
    status: deposit.status,
    createdAt: deposit.createdAt,
    confirmedAt: deposit.confirmedAt,
    cancelledAt: deposit.cancelledAt,
    cancelReason: deposit.cancelReason,
    sessionId: deposit.cashSessionId,
    userName: deposit.user?.name || "Desconocido",
  };
};

export const confirmDeposit = async (depositId: number) => {
  const deposit = await prisma.bankDeposit.findUnique({ where: { id: depositId } });
  if (!deposit) throw new AppError("Depósito no encontrado.", 404);
  if (deposit.status !== "PENDING") {
    throw new AppError(`El depósito no se puede confirmar porque está en estado: ${deposit.status}`, 400);
  }
  return prisma.bankDeposit.update({
    where: { id: depositId },
    data: { status: "COMPLETED", confirmedAt: new Date() },
  });
};

export const cancelDeposit = async (
  depositId: number,
  pinCode: string,
  reason: string,
  requesterContext: { userId: number; ipAddress: string; deviceId: string | null }
) => {
  const deposit = await prisma.bankDeposit.findUnique({ where: { id: depositId } });
  if (!deposit) throw new AppError("Depósito no encontrado.", 404);
  if (deposit.status === "CANCELLED") throw new AppError("Este depósito ya fue cancelado anteriormente.", 400);

  const managers = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "GERENTE"] }, active: true, branchId: deposit.branchId },
  });

  let approver = null;
  for (const m of managers) {
    if (m.pinCode) {
      const isMatch = await bcrypt.compare(pinCode, m.pinCode);
      if (isMatch) { approver = m; break; }
    }
  }
  if (!approver) {
    try {
      await prisma.failedPinAttempt.create({
        data: {
          userId: requesterContext.userId,
          branchId: deposit.branchId,
          action: "CANCEL_DEPOSIT",
          ipAddress: requesterContext.ipAddress,
          deviceId: requesterContext.deviceId,
        },
      });
      emitSecurityEvent("failed-pin");
    } catch (logErr) {
      console.error("[FailedPinAttempt] Error al registrar intento fallido:", logErr);
    }
    throw new AppError("PIN de autorización incorrecto o el usuario no cuenta con privilegios de Administrador/Gerente.", 401);
  }

  const depositSession = await prisma.cashSession.findUnique({ where: { id: deposit.cashSessionId } });
  if (depositSession?.status === "CERRADA") {
    throw new AppError("No se puede cancelar un depósito de una sesión de caja ya cerrada.", 400);
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.bankDeposit.update({
      where: { id: depositId },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelReason: `Autorizó: ${approver!.name}. Motivo: ${reason}`,
      },
    });

    if (deposit.status === "COMPLETED" || deposit.status === "PENDING") {
      await tx.cashSession.update({
        where: { id: deposit.cashSessionId },
        data: { cashOut: { decrement: Number(deposit.amount) } },
      });
    }

    return updated;
  });
};

export const syncDepositStatus = async (depositId: number) => {
  return syncMercadoPagoDepositStatus(depositId);
};
