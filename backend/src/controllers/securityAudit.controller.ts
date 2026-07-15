import { Request, Response } from "express";
import { prisma } from "../app";
import { comparePassword, generateAuditToken, verifyToken } from "../utils/auth";
import { onSecurityEvent, offSecurityEvent, type SecurityEventPayload } from "../utils/securityEvents";
import { clientIp } from "../utils/authAudit";
import { logAdminAction } from "../utils/adminActionLog";

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
  res.setHeader("X-Accel-Buffering", "no");
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
 * Lista las sesiones activas (ADMIN/GERENTE) registradas en AdminSession (BD),
 * enriquecidas con nombre/email/rol/sucursal del usuario. Solo ADMIN.
 */
export const getActiveSessions = async (_req: Request, res: Response): Promise<void> => {
  try {
    const activeSessions = await prisma.adminSession.findMany({
      where: { status: "ACTIVE" },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true, branch: { select: { id: true, name: true } } },
        },
      },
    });

    const sessions = activeSessions
      .map((s) => ({
        userId: s.userId,
        name: s.user.name,
        email: s.user.email,
        role: s.user.role,
        branch: s.user.branch,
        ipAddress: s.ipAddress,
        deviceId: s.deviceId,
        since: s.createdAt.toISOString(),
      }))
      .sort((a, b) => b.since.localeCompare(a.since));

    res.json({ sessions });
  } catch (err) {
    console.error("[getActiveSessions]", err);
    res.status(500).json({ message: "Error al obtener las sesiones activas." });
  }
};

/**
 * Revoca (cierra) la sesión activa de un ADMIN/GERENTE, dejando registrado el motivo
 * en AdminSession. El siguiente request de ese usuario será rechazado con
 * SESION_DESPLAZADA por authenticateJWT (rechazo duro); adicionalmente, su polling de
 * 5s (useAdminSessionStatus) detectará la revocación y mostrará el motivo de forma
 * instantánea sin esperar su siguiente clic. Solo ADMIN. No permite auto-revocación
 * (usar "Cerrar sesión" para eso).
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

  const { reason } = req.body;
  if (!reason || typeof reason !== "string" || !reason.trim()) {
    res.status(400).json({ message: "Debe indicar un motivo para revocar la sesión." });
    return;
  }

  try {
    const session = await prisma.adminSession.findFirst({
      where: { userId: targetUserId, status: "ACTIVE" },
      include: { user: { select: { name: true } } },
    });
    if (!session) {
      res.status(404).json({ message: "El usuario no tiene una sesión activa." });
      return;
    }

    const trimmedReason = reason.trim();
    const revokedByUserId = req.user.userId;
    const revokedAt = new Date();

    await prisma.$transaction([
      prisma.adminSession.update({
        where: { userId: targetUserId },
        data: {
          status: "REVOKED",
          revokedReason: trimmedReason,
          revokedByUserId,
          revokedAt,
        },
      }),
      prisma.adminSessionClosure.create({
        data: {
          userId: session.userId,
          branchId: session.branchId,
          deviceId: session.deviceId,
          ipAddress: session.ipAddress,
          loginAt: session.createdAt,
          closureType: "REVOKED",
          revokedByUserId,
          revokedReason: trimmedReason,
        },
      }),
    ]);

    logAdminAction(revokedByUserId, "REVOKE_SESSION", session.user.name, trimmedReason, clientIp(req));

    res.json({ message: "Sesión revocada correctamente." });
  } catch (err) {
    console.error("[revokeSession]", err);
    res.status(500).json({ message: "Error al revocar la sesión." });
  }
};

/**
 * Estado de la propia sesión del admin/gerente autenticado, consultado por
 * useAdminSessionStatus (polling de 5s) para mostrarle un modal instantáneo con el
 * motivo si fue revocada, en vez de esperar a su siguiente petición (donde de todas
 * formas authenticateJWT la rechazaría con 401 SESION_DESPLAZADA).
 */
export const getMySessionStatus = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }

  try {
    const session = await prisma.adminSession.findUnique({ where: { userId: req.user.userId } });
    if (!session || session.status !== "REVOKED") {
      res.json({ revoked: false, reason: null, revokedAt: null });
      return;
    }

    res.json({
      revoked: true,
      reason: session.revokedReason,
      revokedAt: session.revokedAt ? session.revokedAt.toISOString() : null,
    });
  } catch (err) {
    console.error("[getMySessionStatus]", err);
    res.status(500).json({ message: "Error al consultar el estado de la sesión." });
  }
};

/**
 * Historial append-only de cierres de sesión de admin/gerente (AdminSessionClosure):
 * incluye tanto logout normal como revocación forzada. A diferencia de AdminSession
 * (una sola fila vigente por usuario), aquí se acumula una fila por cada cierre, así
 * que sirve para auditar el historial completo sin importar cuántas veces se
 * reabrió la sesión después. El "tiempo en la plataforma" (loginAt vs. closedAt) se
 * deja para que lo calcule el frontend, igual que "since" en getActiveSessions — no
 * existe ya un helper de formato de duración reutilizable en el proyecto. Solo ADMIN.
 */
export const getAdminSessionClosures = async (req: Request, res: Response): Promise<void> => {
  try {
    const { from, to } = req.query;
    const where: any = {};
    const dateWhere = buildDateWhere(from, to);
    if (dateWhere) where.closedAt = dateWhere;

    const closures = await prisma.adminSessionClosure.findMany({
      where,
      orderBy: { closedAt: "desc" },
      take: 500,
      include: {
        user: { select: { id: true, name: true, email: true } },
        branch: { select: { id: true, name: true } },
        revokedBy: { select: { id: true, name: true, email: true } },
      },
    });

    res.json({ closures });
  } catch (err) {
    console.error("[getAdminSessionClosures]", err);
    res.status(500).json({ message: "Error al obtener el historial de cierres de sesión." });
  }
};

/**
 * Log de movimientos administrativos (AdminActionLog): navegación entre vistas y
 * acciones sensibles (revocar sesión, cambio de estado de empleado). Fase 1 — no
 * incluye catálogo (productos/precios/promociones). Solo ADMIN.
 */
export const getAdminActionLog = async (req: Request, res: Response): Promise<void> => {
  try {
    const { from, to } = req.query;
    const where: any = {};
    const dateWhere = buildDateWhere(from, to);
    if (dateWhere) where.createdAt = dateWhere;

    const logs = await prisma.adminActionLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 500,
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    res.json({ logs });
  } catch (err) {
    console.error("[getAdminActionLog]", err);
    res.status(500).json({ message: "Error al obtener el log de movimientos administrativos." });
  }
};

/**
 * Registra un movimiento de NAVEGACIÓN entre vistas del panel admin. El actionType
 * queda fijo en el backend (no lo decide el cliente) para que este endpoint no pueda
 * usarse para falsificar otros tipos de acción sensible. Disponible para ADMIN y
 * GERENTE, igual que el resto del panel administrativo.
 */
export const recordNavigationAction = (req: Request, res: Response): void => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }

  const { target } = req.body;
  if (!target || typeof target !== "string" || !target.trim()) {
    res.status(400).json({ message: "Debe indicar la vista visitada." });
    return;
  }

  logAdminAction(req.user.userId, "NAVIGATION", target.trim().slice(0, 255), null, clientIp(req));
  res.status(202).json({ message: "Movimiento registrado." });
};
