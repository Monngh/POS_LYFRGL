import { Request, Response } from "express";
import { AppError } from "../utils/AppError";
import { getRequestDeviceId } from "../middlewares/device.middleware";
import { comparePassword } from "../utils/auth";
import { prisma } from "../app";
import {
  getSessionStatus as getSessionStatusService,
  openCashSession,
  closeCashSession,
  getSessionStats as getSessionStatsService,
  createPartialCut as createPartialCutService,
  getPartialCuts as getPartialCutsService,
} from "../services/cashSession.service";

export const getSessionStatus = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }
  try {
    const { activeSession, lastClosed } = await getSessionStatusService(req.user.userId, req.user.branchId);
    const requestDeviceId = getRequestDeviceId(req);
    const isOwnedByThisDevice = activeSession
      ? !activeSession.deviceId || activeSession.deviceId === requestDeviceId
      : null;
    res.status(200).json({
      isOpen: !!activeSession,
      session: activeSession,
      isOwnedByThisDevice,
      lastClosed: activeSession ? null : lastClosed,
    });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al obtener estado de caja." });
  }
};

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

  // ── Autorización con PIN de gerente/admin ──
  if (!pinCode || typeof pinCode !== "string" || !pinCode.trim()) {
    res.status(400).json({
      code: "PIN_REQUERIDO",
      message: "Ingrese el PIN de autorización para abrir la caja.",
    });
    return;
  }

  const staff = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "GERENTE"] }, active: true, branchId: req.user.branchId },
    select: { name: true, pinCode: true },
  });

  let authorized = false;
  for (const s of staff) {
    if (s.pinCode && (await comparePassword(pinCode.trim(), s.pinCode))) {
      authorized = true;
      break;
    }
  }

  if (!authorized) {
    res.status(403).json({
      code: "PIN_INVALIDO",
      message: "PIN de autorización incorrecto.",
    });
    return;
  }
  // ── Fin autorización ──

  try {
    const newSession = await openCashSession(
      req.user.userId,
      req.user.branchId,
      Number(initialAmount),
      getRequestDeviceId(req)
    );
    res.status(201).json({ message: "Caja abierta exitosamente.", session: newSession });
  } catch (error: any) {
    if (error.isSessionConflict) {
      res.status(409).json({ code: "CAJA_YA_ABIERTA", message: "Ya tienes una sesión de caja activa. Verifica el estado de tu turno antes de abrir una nueva." });
      return;
    }
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

export const closeSession = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }

  const { declaredAmount, pinCode } = req.body;
  if (declaredAmount === undefined || declaredAmount === null || isNaN(Number(declaredAmount))) {
    res.status(400).json({ message: "El monto de efectivo declarado/contado es requerido y debe ser numérico." });
    return;
  }

  // ── Autorización con PIN de gerente/admin ──
  if (!pinCode || typeof pinCode !== "string" || !pinCode.trim()) {
    res.status(400).json({
      code: "PIN_REQUERIDO",
      message: "Ingrese el PIN de autorización para cerrar la caja.",
    });
    return;
  }

  const staff = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "GERENTE"] }, active: true, branchId: req.user.branchId },
    select: { name: true, pinCode: true },
  });

  let authorized = false;
  for (const s of staff) {
    if (s.pinCode && (await comparePassword(pinCode.trim(), s.pinCode))) {
      authorized = true;
      break;
    }
  }

  if (!authorized) {
    res.status(403).json({
      code: "PIN_INVALIDO",
      message: "PIN de autorización incorrecto.",
    });
    return;
  }
  // ── Fin autorización ──

  try {
    const result = await closeCashSession(req.user.userId, req.user.branchId, Number(declaredAmount));
    res.status(200).json({ message: "Caja cerrada y arqueada exitosamente.", ...result });
  } catch (error: any) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ message: error.message });
      return;
    }
    console.error(error);
    res.status(500).json({ message: "Error al cerrar la caja." });
  }
};

export const getSessionStats = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }
  try {
    const stats = await getSessionStatsService(req.user.userId, req.user.branchId);
    res.status(200).json({ hasActive: true, stats });
  } catch (error: any) {
    if (error instanceof AppError && error.statusCode === 400) {
      res.status(400).json({ message: error.message, hasActive: false });
      return;
    }
    console.error(error);
    res.status(500).json({ message: "Error al cargar estadísticas de turno." });
  }
};

export const createPartialCut = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }
  try {
    const cut = await createPartialCutService(req.user.userId, req.user.branchId);
    res.status(201).json({ message: "Corte parcial registrado exitosamente.", cut });
  } catch (error: any) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ message: error.message });
      return;
    }
    console.error(error);
    res.status(500).json({ message: "Error al generar corte parcial." });
  }
};

export const getPartialCuts = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }
  try {
    const cuts = await getPartialCutsService(req.user.userId, req.user.branchId);
    res.status(200).json({ cuts });
  } catch (error: any) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ message: error.message });
      return;
    }
    console.error(error);
    res.status(500).json({ message: "Error al cargar historial de cortes." });
  }
};
