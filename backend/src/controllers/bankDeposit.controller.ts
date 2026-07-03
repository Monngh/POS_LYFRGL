import { Request, Response } from "express";
import { validateLuhn } from "../utils/luhn";
import { clientIp } from "../utils/authAudit";
import { getRequestDeviceId } from "../middlewares/device.middleware";
import {
  createBankDeposit as createBankDepositService,
  getRecentDeposits as getRecentDepositsService,
  searchDeposits as searchDepositsService,
  getDepositById as getDepositByIdService,
  confirmDeposit as confirmDepositService,
  cancelDeposit as cancelDepositService,
  syncDepositStatus as syncDepositStatusService,
} from "../services/bankDeposit.service";

export const createBankDeposit = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: "No autenticado." }); return; }
  const { accountNumber, targetName, amount, paymentType, comments } = req.body;
  if (!amount || !paymentType) {
    res.status(400).json({ message: "El monto y el tipo de depósito son requeridos para procesar el resguardo." }); return;
  }
  const isMercadoPago = String(paymentType).startsWith("MERCADOPAGO_");
  if (!isMercadoPago && (!accountNumber || !targetName)) {
    res.status(400).json({ message: "La cuenta de destino y el beneficiario son obligatorios para depósitos manuales." }); return;
  }
  if (!isMercadoPago && !validateLuhn(String(accountNumber))) {
    res.status(400).json({ message: "El número de tarjeta no es válido (Luhn / longitud 15-16)." });
    return;
  }
  if (!isMercadoPago && targetName && String(targetName).length > 100) {
    res.status(400).json({ message: "El nombre del beneficiario no puede exceder los 100 caracteres." });
    return;
  }
  if (comments && String(comments).length > 100) {
    res.status(400).json({ message: "El campo de referencia o comentarios no puede exceder los 100 caracteres." });
    return;
  }
  try {
    const deposit = await createBankDepositService({
      userId: req.user.userId,
      branchId: req.user.branchId,
      accountNumber,
      targetName,
      amount: Number(amount),
      paymentType: String(paymentType),
      comments,
    });
    res.status(201).json({
      message: isMercadoPago
        ? "Referencia de depósito de Mercado Pago generada exitosamente. Dinero retirado de caja."
        : "Depósito de resguardo registrado en SQL Server exitosamente.",
      deposit,
    });
  } catch (error: any) {
    if (error.statusCode) { res.status(error.statusCode).json({ message: error.message }); return; }
    console.error(error);
    res.status(500).json({ message: "Error al procesar el depósito bancario." });
  }
};

export const getRecentDeposits = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: "No autenticado." }); return; }
  try {
    const deposits = await getRecentDepositsService(req.user.branchId);
    res.status(200).json({ deposits });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al obtener depósitos recientes." });
  }
};

export const searchDeposits = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: "No autenticado." }); return; }
  try {
    const { reference, userId, status, dateFrom, dateTo } = req.query;
    const deposits = await searchDepositsService(req.user.branchId, {
      reference: reference as string | undefined,
      userId: userId as string | undefined,
      status: status as string | undefined,
      dateFrom: dateFrom as string | undefined,
      dateTo: dateTo as string | undefined,
    });
    res.status(200).json({ deposits });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al buscar depósitos." });
  }
};

export const getDepositById = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: "No autenticado." }); return; }
  const depositId = parseInt(req.params.id, 10);
  if (isNaN(depositId)) { res.status(400).json({ message: "ID de depósito inválido." }); return; }
  try {
    const deposit = await getDepositByIdService(depositId);
    res.status(200).json({ deposit });
  } catch (error: any) {
    if (error.statusCode) { res.status(error.statusCode).json({ message: error.message }); return; }
    console.error(error);
    res.status(500).json({ message: "Error al obtener el depósito." });
  }
};

export const confirmDeposit = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: "No autenticado." }); return; }
  const depositId = parseInt(req.params.id, 10);
  if (isNaN(depositId)) { res.status(400).json({ message: "ID de depósito inválido." }); return; }
  try {
    const deposit = await confirmDepositService(depositId);
    res.status(200).json({ message: "Depósito confirmado exitosamente.", deposit });
  } catch (error: any) {
    if (error.statusCode) { res.status(error.statusCode).json({ message: error.message }); return; }
    console.error(error);
    res.status(500).json({ message: "Error al confirmar el depósito." });
  }
};

export const cancelDeposit = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: "No autenticado." }); return; }
  const { id } = req.params;
  const { pinCode, reason } = req.body;
  if (!id || !pinCode || !reason) {
    res.status(400).json({ message: "El ID del depósito, el código PIN de autorización y el motivo de cancelación son requeridos." }); return;
  }
  const depositId = parseInt(id, 10);
  if (isNaN(depositId)) { res.status(400).json({ message: "ID de depósito inválido." }); return; }
  if (reason && String(reason).length > 100) {
    res.status(400).json({ message: "El motivo de cancelación no puede exceder los 100 caracteres." });
    return;
  }
  try {
    const updatedDeposit = await cancelDepositService(depositId, String(pinCode), String(reason), {
      userId: req.user.userId,
      ipAddress: clientIp(req),
      deviceId: getRequestDeviceId(req),
    });
    res.status(200).json({
      message: "Depósito cancelado exitosamente. Los saldos de caja han sido actualizados.",
      deposit: updatedDeposit,
    });
  } catch (error: any) {
    if (error.statusCode) { res.status(error.statusCode).json({ message: error.message }); return; }
    console.error(error);
    res.status(500).json({ message: "Error al cancelar el depósito." });
  }
};

export const syncDepositStatus = async (req: Request, res: Response): Promise<void> => {
  if (!(req as any).user) { res.status(401).json({ message: "No autenticado." }); return; }
  const depositId = parseInt(req.params.id, 10);
  if (isNaN(depositId)) { res.status(400).json({ message: "ID de depósito inválido." }); return; }
  try {
    const result = await syncDepositStatusService(depositId);
    res.status(200).json(result);
  } catch (error: any) {
    if (error.statusCode) { res.status(error.statusCode).json({ message: error.message }); return; }
    console.error("Error al sincronizar estado de depósito:", error);
    res.status(500).json({ message: "Error al sincronizar el estado con Mercado Pago." });
  }
};
