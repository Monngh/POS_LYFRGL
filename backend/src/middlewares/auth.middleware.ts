/// <reference path="../types/express.d.ts" />
import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/auth";
import { prisma } from "../app";

const SESION_DESPLAZADA_MESSAGE =
  "Tu sesión se cerró porque se inició sesión con este usuario en otro dispositivo.";

/**
 * Middleware para validar que la petición incluye un token JWT válido.
 */
export const authenticateJWT = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ message: "Acceso no autorizado. Token faltante o inválido." });
    return;
  }

  const token = authHeader.split(" ")[1];
  const decoded = verifyToken(token);

  if (!decoded) {
    res.status(401).json({ message: "Acceso no autorizado. Token expirado o inválido." });
    return;
  }

  // Sesión única para administradores/gerentes: se valida contra AdminSession en BD
  // (antes era un Map en memoria — sessionRegistry — que no sobrevivía un reinicio ni
  // se compartía entre workers de PM2 en modo cluster; la BD sí es una fuente de
  // verdad común para cualquier instancia del proceso).
  if (decoded.role === "ADMIN" || decoded.role === "GERENTE") {
    let session;
    try {
      session = await prisma.adminSession.findUnique({ where: { userId: decoded.userId as number } });
    } catch (err) {
      // La BD no respondió (p. ej. caída/latencia del servidor remoto). Antes, este
      // throw en un middleware async quedaba como unhandled rejection y TUMBABA todo
      // el proceso. Ahora se falla en cerrado: se rechaza esta petición con 503 y el
      // servidor sigue vivo para el resto.
      console.error("authenticateJWT: no se pudo validar la sesión contra la BD:", (err as Error)?.message ?? err);
      res.status(503).json({ message: "Servicio no disponible temporalmente. Inténtalo de nuevo en unos momentos." });
      return;
    }

    // Permisivo si NO hay fila registrada (p.ej. justo después de desplegar esta
    // funcionalidad, antes del próximo login) para no expulsar tokens vigentes sin
    // una razón concreta.
    if (session && (session.status !== "ACTIVE" || session.jti !== decoded.jti)) {
      const reason = session.status === "REVOKED" ? session.revokedReason : null;
      res.status(401).json({
        code: "SESION_DESPLAZADA",
        message: reason || SESION_DESPLAZADA_MESSAGE,
        reason,
      });
      return;
    }
  }

  // Inyectar el usuario/cliente autenticado en la petición
  req.user = {
    userId: decoded.userId as number,
    customerId: decoded.customerId,
    email: decoded.email,
    role: decoded.role,
    branchId: decoded.branchId as number,
  };

  next();
};

/**
 * Variante SIN el rechazo duro por AdminSession, exclusiva para
 * GET /security/my-session-status. Si esa ruta usara authenticateJWT normal, el
 * propio middleware respondería 401 SESION_DESPLAZADA (y el interceptor global de
 * axios ya redirigiría al login) ANTES de que getMySessionStatus pudiera devolver
 * { revoked: true, reason } con 200 — dejando el polling de useAdminSessionStatus
 * sin forma de mostrar su propio modal. Aquí solo se decodifica el JWT (firma/
 * expiración) y se inyecta req.user; la verificación real de AdminSession la hace
 * el controlador.
 */
export const authenticateJWTDecodeOnly = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ message: "Acceso no autorizado. Token faltante o inválido." });
    return;
  }

  const token = authHeader.split(" ")[1];
  const decoded = verifyToken(token);

  if (!decoded) {
    res.status(401).json({ message: "Acceso no autorizado. Token expirado o inválido." });
    return;
  }

  req.user = {
    userId: decoded.userId as number,
    customerId: decoded.customerId,
    email: decoded.email,
    role: decoded.role,
    branchId: decoded.branchId as number,
  };

  next();
};

/**
 * Variante de authenticateJWT SOLO para el endpoint SSE de seguridad
 * (GET /api/admin/security/events). El navegador (EventSource nativo) no permite
 * enviar headers personalizados, así que el JWT viaja como query param (?token=).
 * Si ya viene un header Authorization (ej. pruebas con curl/Postman) se respeta ese.
 * No afecta a ninguna otra ruta: el resto sigue exigiendo el header Authorization.
 */
export const authenticateSSE = (req: Request, res: Response, next: NextFunction) => {
  if (!req.headers.authorization && typeof req.query.token === "string" && req.query.token) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  authenticateJWT(req, res, next);
};

/**
 * Middleware para autorizar roles específicos.
 * @param allowedRoles Lista de roles permitidos (ej. ['ADMIN', 'GERENTE'])
 */
export const authorizeRoles = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ message: "No autenticado." });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ message: "Acceso denegado. Permisos insuficientes." });
      return;
    }

    next();
  };
};
