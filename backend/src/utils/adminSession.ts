import crypto from "crypto";
import { prisma } from "../app";

/**
 * Abre (o reemplaza) la sesión única en BD del admin/gerente y devuelve el jti
 * nuevo para firmar el JWT.
 *
 * Reemplaza al antiguo sessionRegistry.openSession (Map en memoria): ahora la
 * fuente de verdad es la tabla AdminSession, compartida entre todos los procesos/
 * workers de PM2 sin importar el modo (cluster o fork), y persiste ante reinicios.
 */

export const openAdminSession = async (
  userId: number,
  branchId: number | null | undefined,
  info: { ip?: string; device?: string | null } = {}
): Promise<string> => {
  const jti = crypto.randomUUID();
  await prisma.adminSession.upsert({
    where: { userId },
    create: {
      userId,
      branchId: branchId ?? undefined,
      jti,
      ipAddress: info.ip,
      deviceId: info.device ?? undefined,
      status: "ACTIVE",
    },
    update: {
      branchId: branchId ?? undefined,
      jti,
      ipAddress: info.ip,
      deviceId: info.device ?? undefined,
      status: "ACTIVE",
      revokedReason: null,
      revokedByUserId: null,
      revokedAt: null,
      // Sin esto, un reingreso tras una revocación arrastraría el createdAt de la
      // sesión anterior (upsert solo actualiza, no reemplaza la fila), corrompiendo
      // el cálculo de "tiempo en la plataforma" del próximo cierre en AdminSessionClosure.
      createdAt: new Date(),
    },
  });
  return jti;
};
