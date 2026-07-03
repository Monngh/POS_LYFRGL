import { Request, Response } from "express";
import { prisma } from "../app";
import { comparePassword, generateAuditToken, verifyToken } from "../utils/auth";
import { emitSecurityEvent, onSecurityEvent, offSecurityEvent, type SecurityEventPayload } from "../utils/securityEvents";
import { getAllActiveSessions, revokeSessionForcefully } from "../utils/sessionRegistry";

/** Construye el filtro de rango de fechas para createdAt. */
const buildDateWhere = (from: unknown, to: unknown) => {
  const createdAt: any = {};
  if (from) createdAt.gte = new Date(from as string);
  if (to) {
    const toDate = new Date(to as string);
    toDate.setHours(23, 59, 59, 999);
    createdAt.lte = toDate;
  }
  return Object.keys(createdAt).length ? createdAt : undefined;
};

const fetchAccessLogs = async (roles: string[], from: unknown, to: unknown, branchId?: unknown) => {
  const where: any = { role: { in: roles } };
  const dateWhere = buildDateWhere(from, to);
  if (dateWhere) where.createdAt = dateWhere;
  if (branchId) where.branchId = Number(branchId);

  return prisma.authAuditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 500,
    include: {
      user: { select: { id: true, name: true, email: true } },
      branch: { select: { id: true, name: true } },
    },
  });
};

/**
 * Bitácora de accesos de CAJEROS (inicios de sesión en cajas). Solo ADMIN.
 */
export const getCashierAccessLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const { from, to, branchId } = req.query;
    const logs = await fetchAccessLogs(["CAJERO"], from, to, branchId);
    res.json({ logs });
  } catch (err) {
    console.error("[getCashierAccessLogs]", err);
    res.status(500).json({ message: "Error al obtener la bitácora de accesos de caja." });
  }
};

const FAILED_PIN_DEFAULT_PAGE_SIZE = 25;
const FAILED_PIN_MAX_PAGE_SIZE = 200;

/**
 * Bitácora paginada de intentos fallidos de autorización por PIN (cancelar venta,
 * cierre de caja, devoluciones, cancelar depósito). Solo ADMIN.
 */
export const getFailedPinAttempts = async (req: Request, res: Response): Promise<void> => {
  try {
    const { from, to, branchId } = req.query;
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const pageSize = Math.max(
      1,
      Math.min(FAILED_PIN_MAX_PAGE_SIZE, parseInt(req.query.pageSize as string, 10) || FAILED_PIN_DEFAULT_PAGE_SIZE)
    );

    const where: any = {};
    const dateWhere = buildDateWhere(from, to);
    if (dateWhere) where.createdAt = dateWhere;
    if (branchId) where.branchId = Number(branchId);

    const [logs, total] = await Promise.all([
      prisma.failedPinAttempt.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } },
        },
      }),
      prisma.failedPinAttempt.count({ where }),
    ]);

    res.json({ logs, total, page, pageSize });
  } catch (err) {
    console.error("[getFailedPinAttempts]", err);
    res.status(500).json({ message: "Error al obtener los intentos fallidos de PIN." });
  }
};

/**
 * Paso 1 del acceso a la bitácora de administradores: reconfirmar la contraseña
 * del usuario actual. Devuelve un token de auditoría de corta vida (10 min).
 */
export const auditUnlock = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }

  const { password } = req.body;
  if (!password) {
    res.status(400).json({ message: "Debe ingresar su contraseña para continuar." });
    return;
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user) {
      res.status(404).json({ message: "Usuario no encontrado." });
      return;
    }

    const isMatch = await comparePassword(password, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({ code: "PASSWORD_INCORRECTA", message: "Contraseña incorrecta." });
      return;
    }

    res.json({ auditToken: generateAuditToken(user.id) });
  } catch (err) {
    console.error("[auditUnlock]", err);
    res.status(500).json({ message: "Error al validar la contraseña." });
  }
};

/**
 * Paso 2: bitácora de accesos de ADMINISTRADORES / GERENTES. Requiere un token
 * de auditoría válido (emitido por auditUnlock tras reconfirmar la contraseña).
 */
export const getAdminAccessLogs = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }

  const { auditToken, from, to } = req.body;
  const decoded = auditToken ? verifyToken(auditToken) : null;

  if (!decoded || decoded.scope !== "audit" || decoded.userId !== req.user.userId) {
    res.status(401).json({
      code: "AUDIT_LOCK",
      message: "Sesión de auditoría no válida o expirada. Reingrese su contraseña.",
    });
    return;
  }

  try {
    const logs = await fetchAccessLogs(["ADMIN", "GERENTE"], from, to);
    res.json({ logs });
  } catch (err) {
    console.error("[getAdminAccessLogs]", err);
    res.status(500).json({ message: "Error al obtener la bitácora de accesos administrativos." });
  }
};

const SSE_KEEP_ALIVE_MS = 20000;

/**
 * Stream de eventos de seguridad en tiempo real (Server-Sent Events). Notifica al
 * frontend cuando ocurre un nuevo login o un nuevo intento fallido de PIN, para que
 * la vista de auditoría (CajaAccessLogView) pueda refrescarse sin hacer polling.
 * Solo ADMIN. Requiere authenticateSSE (acepta el JWT también por query param, ya
 * que EventSource no permite headers personalizados).
 */
export const streamSecurityEvents = (req: Request, res: Response): void => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const sendEvent = (payload: SecurityEventPayload): void => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  onSecurityEvent(sendEvent);

  const keepAlive = setInterval(() => {
    res.write(": ping\n\n");
  }, SSE_KEEP_ALIVE_MS);

  req.on("close", () => {
    clearInterval(keepAlive);
    offSecurityEvent(sendEvent);
    res.end();
  });
};

/**
 * Lista las sesiones activas (ADMIN/GERENTE) registradas en memoria (sessionRegistry),
 * enriquecidas con nombre/email/rol/sucursal del usuario. Solo ADMIN.
 */
export const getActiveSessions = async (_req: Request, res: Response): Promise<void> => {
  try {
    // Excluye entradas expiradas y las "envenenadas" por revokeSessionForcefully (quedan
    // en el registro a propósito para que isCurrentSession rechace el token viejo, pero
    // no representan una sesión real que deba listarse aquí).
    const entries = getAllActiveSessions().filter(
      ([, entry]) => entry.exp > Date.now() && !entry.jti.startsWith("revoked-")
    );
    const userIds = entries.map(([userId]) => userId);

    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true, role: true, branch: { select: { id: true, name: true } } },
    });
    const usersById = new Map(users.map((u) => [u.id, u]));

    const sessions = entries
      .map(([userId, entry]) => {
        const user = usersById.get(userId);
        if (!user) return null;
        return {
          userId,
          name: user.name,
          email: user.email,
          role: user.role,
          branch: user.branch,
          ipAddress: entry.ip ?? null,
          deviceId: entry.device ?? null,
          since: new Date(entry.since).toISOString(),
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null)
      .sort((a, b) => b.since.localeCompare(a.since));

    res.json({ sessions });
  } catch (err) {
    console.error("[getActiveSessions]", err);
    res.status(500).json({ message: "Error al obtener las sesiones activas." });
  }
};

/**
 * Revoca (cierra) la sesión activa de un ADMIN/GERENTE. El siguiente request de ese
 * usuario será rechazado con SESION_DESPLAZADA por authenticateJWT; adicionalmente se
 * emite un evento SSE "session-revoked" para desconectarlo en tiempo real si tiene la
 * app abierta. Solo ADMIN. No permite auto-revocación (usar "Cerrar sesión" para eso).
 */
export const revokeSession = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }

  const targetUserId = Number(req.params.userId);
  if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
    res.status(400).json({ message: "ID de usuario inválido." });
    return;
  }

  if (targetUserId === req.user.userId) {
    res.status(400).json({ message: "No puedes revocar tu propia sesión desde aquí. Usa \"Cerrar sesión\"." });
    return;
  }

  try {
    revokeSessionForcefully(targetUserId);
    emitSecurityEvent("session-revoked", { userId: targetUserId });
    res.json({ message: "Sesión revocada correctamente." });
  } catch (err) {
    console.error("[revokeSession]", err);
    res.status(500).json({ message: "Error al revocar la sesión." });
  }
};
