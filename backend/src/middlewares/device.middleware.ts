/// <reference path="../types/express.d.ts" />
import { Request, Response, NextFunction } from "express";
import { prisma } from "../app";

/**
 * Extrae el identificador del dispositivo (terminal/computadora) de la petición.
 * El frontend genera un UUID persistente por equipo y lo envía en el header X-Device-Id.
 */
export const getRequestDeviceId = (req: Request): string | null => {
  const header = req.headers["x-device-id"];
  const value = Array.isArray(header) ? header[0] : header;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 64) : null;
};

/**
 * Busca la sesión de caja ABIERTA del usuario autenticado (en cualquier sucursal).
 */
export const findActiveSessionForUser = (userId: number) => {
  return prisma.cashSession.findFirst({
    where: {
      userId,
      status: "ABIERTA",
      closedAt: null,
    },
  });
};

/**
 * Middleware: garantiza que las operaciones de caja (ventas, cierres, cortes,
 * depósitos, devoluciones) solo puedan ejecutarse desde el MISMO equipo en el
 * que se abrió el turno de caja.
 *
 * Reglas:
 * - Si el usuario no tiene caja abierta, se deja pasar (cada endpoint ya valida
 *   por su cuenta si requiere una sesión activa).
 * - Si la caja abierta no tiene dispositivo vinculado (sesión previa a esta
 *   versión), se deja pasar por compatibilidad.
 * - Si la caja está vinculada a otro dispositivo, se rechaza con 409.
 */
export const enforceCajaDevice = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }

  try {
    const activeSession = await findActiveSessionForUser(req.user.userId);

    if (activeSession && activeSession.deviceId) {
      const requestDeviceId = getRequestDeviceId(req);
      if (!requestDeviceId || requestDeviceId !== activeSession.deviceId) {
        res.status(409).json({
          code: "CAJA_EN_OTRO_EQUIPO",
          message: "Su turno de caja está abierto en otro equipo. Solo puede operar la caja desde el equipo donde abrió el turno, o solicitar a un administrador el cierre forzado de la sesión.",
        });
        return;
      }
    }

    next();
  } catch (error: any) {
    res.status(500).json({ message: "Error al validar el dispositivo de la sesión de caja.", error: error.message });
  }
};
