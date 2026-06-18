import { Request, Response } from "express";
import { prisma } from "../app";
import { comparePassword, generateAuditToken, verifyToken } from "../utils/auth";

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

const fetchAccessLogs = async (roles: string[], from: unknown, to: unknown) => {
  const where: any = { role: { in: roles } };
  const dateWhere = buildDateWhere(from, to);
  if (dateWhere) where.createdAt = dateWhere;

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
    const { from, to } = req.query;
    const logs = await fetchAccessLogs(["CAJERO"], from, to);
    res.json({ logs });
  } catch (err) {
    console.error("[getCashierAccessLogs]", err);
    res.status(500).json({ message: "Error al obtener la bitácora de accesos de caja." });
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
