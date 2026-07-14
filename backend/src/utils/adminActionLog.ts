import { prisma } from "../app";

/**
 * Registra un movimiento administrativo (navegación o acción sensible) en
 * AdminActionLog. Fire-and-forget: nunca debe bloquear ni romper la operación
 * que la origina, igual que auditReport/recordLoginEvent.
 */
export const logAdminAction = (
  userId: number,
  actionType: string,
  target?: string | null,
  details?: string | null,
  ip?: string | null
): void => {
  prisma.adminActionLog
    .create({
      data: {
        userId,
        actionType,
        target: target ?? null,
        details: details ?? null,
        ipAddress: ip ?? null,
      },
    })
    .catch((err: unknown) => {
      console.error("[AdminActionLog] Error guardando log:", err);
    });
};
