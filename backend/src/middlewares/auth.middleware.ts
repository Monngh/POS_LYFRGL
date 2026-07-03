/// <reference path="../types/express.d.ts" />
import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/auth";
import { isCurrentSession } from "../utils/sessionRegistry";

/**
 * Middleware para validar que la petición incluye un token JWT válido.
 */
export const authenticateJWT = (req: Request, res: Response, next: NextFunction) => {
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

  // Sesión única para administradores/gerentes: si el jti del token ya no es el
  // vigente, significa que se inició sesión en otro dispositivo (desplazamiento).
  if ((decoded.role === "ADMIN" || decoded.role === "GERENTE") &&
      !isCurrentSession(decoded.userId as number, decoded.jti)) {
    res.status(401).json({
      code: "SESION_DESPLAZADA",
      message: "Tu sesión se cerró porque se inició sesión con este usuario en otro dispositivo.",
    });
    return;
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
