/// <reference path="../types/express.d.ts" />
import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/auth";

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

  // Inyectar el usuario autenticado en la petición
  req.user = {
    userId: decoded.userId,
    email: decoded.email,
    role: decoded.role,
    branchId: decoded.branchId,
  };

  next();
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
