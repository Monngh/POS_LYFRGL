import { Request } from "express";
import { prisma } from "../app";
import { getRequestDeviceId } from "../middlewares/device.middleware";

export const clientIp = (req: Request): string =>
  (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
  req.ip ||
  req.socket.remoteAddress ||
  "unknown";

/**
 * Registra un inicio de sesión exitoso en la bitácora de accesos (AuthAuditLog).
 * Es "fire-and-forget": nunca debe bloquear ni romper el login si falla.
 */
export const recordLoginEvent = (
  req: Request,
  user: { id: number; email: string; name: string; role: string; branchId: number | null },
  method: string
): void => {
  prisma.authAuditLog
    .create({
      data: {
        userId: user.id,
        branchId: user.branchId ?? null,
        email: user.email,
        name: user.name,
        role: user.role,
        method,
        ipAddress: clientIp(req),
        deviceId: getRequestDeviceId(req),
      },
    })
    .catch((err: unknown) => {
      console.error("[authAudit] Error al registrar acceso:", err);
    });
};
