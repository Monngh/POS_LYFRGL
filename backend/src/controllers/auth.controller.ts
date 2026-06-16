import { Request, Response } from "express";
import { prisma } from "../app";
import { comparePassword, generateToken } from "../utils/auth";
import { lockoutKey, getLockRemaining, registerFailedAttempt, clearFailedAttempts } from "../utils/authSecurity";
import { buildLoginSecondFactor } from "./webauthn.controller";

const clientIp = (req: Request): string =>
  (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || req.socket.remoteAddress || "unknown";

const lockMessage = (seconds: number): string => {
  const mins = Math.ceil(seconds / 60);
  return `Demasiados intentos fallidos. Cuenta bloqueada temporalmente. Intente de nuevo en ${mins} minuto(s).`;
};

/**
 * Login clásico para Administradores y Gerentes (Email + Contraseña).
 * Paso 1 del flujo de 2 factores: tras validar la contraseña NO se entrega la
 * sesión todavía, sino el reto WebAuthn (Windows Hello) y un token temporal.
 */
export const adminLogin = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ message: "El correo y la contraseña son requeridos." });
    return;
  }

  const key = lockoutKey("admin", email, clientIp(req));
  const locked = getLockRemaining(key);
  if (locked > 0) {
    res.status(429).json({ code: "CUENTA_BLOQUEADA", message: lockMessage(locked) });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { branch: true },
    });

    if (!user || !user.active) {
      registerFailedAttempt(key);
      res.status(401).json({ message: "Credenciales incorrectas o usuario inactivo." });
      return;
    }

    // El cajero también tiene contraseña pero aquí forzamos que use el login de PIN,
    // o permitimos que entren si son ADMIN o GERENTE.
    if (user.role !== "ADMIN" && user.role !== "GERENTE") {
      res.status(403).json({ message: "Acceso denegado. Utilice la terminal de ventas para cajeros." });
      return;
    }

    const isMatch = await comparePassword(password, user.passwordHash);
    if (!isMatch) {
      const result = registerFailedAttempt(key);
      if (result.locked) {
        res.status(429).json({ code: "CUENTA_BLOQUEADA", message: lockMessage(result.lockSeconds) });
        return;
      }
      res.status(401).json({
        message: `Credenciales incorrectas. Intentos restantes: ${result.remainingAttempts}.`,
      });
      return;
    }

    // Contraseña correcta: limpiar intentos y pasar al segundo factor (WebAuthn).
    clearFailedAttempts(key);
    const secondFactor = await buildLoginSecondFactor(user as any);
    res.status(200).json({
      message: secondFactor.mode === "register"
        ? "Contraseña correcta. Registre su dispositivo de seguridad (Windows Hello) para continuar."
        : "Contraseña correcta. Confirme su identidad con Windows Hello.",
      ...secondFactor,
    });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor." });
  }
};

/**
 * Login de Acceso Rápido para Cajeros (Email + PIN de 4 dígitos)
 */
export const cashierLogin = async (req: Request, res: Response): Promise<void> => {
  const { email, pinCode } = req.body;

  if (!email || !pinCode) {
    res.status(400).json({ message: "El correo y el código PIN son requeridos." });
    return;
  }

  // Bloqueo por fuerza bruta: un PIN de 4 dígitos solo es seguro si se limita el
  // número de intentos (igual que un cajero automático).
  const key = lockoutKey("cashier", email, clientIp(req));
  const locked = getLockRemaining(key);
  if (locked > 0) {
    res.status(429).json({ code: "CUENTA_BLOQUEADA", message: lockMessage(locked), retryAfterSeconds: locked });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { branch: true },
    });

    if (!user || !user.active) {
      registerFailedAttempt(key);
      res.status(401).json({ code: "USUARIO_INVALIDO", message: "Usuario inactivo o no encontrado." });
      return;
    }

    if (!user.pinCode) {
      res.status(400).json({ code: "SIN_PIN", message: "Este usuario no tiene configurado un código PIN de acceso rápido." });
      return;
    }

    const isPinMatch = await comparePassword(pinCode, user.pinCode);
    if (!isPinMatch) {
      const result = registerFailedAttempt(key);
      if (result.locked) {
        res.status(429).json({
          code: "CUENTA_BLOQUEADA",
          message: lockMessage(result.lockSeconds),
          retryAfterSeconds: result.lockSeconds,
        });
        return;
      }
      res.status(401).json({
        code: "PIN_INCORRECTO",
        message: "Código PIN incorrecto.",
        remainingAttempts: result.remainingAttempts,
      });
      return;
    }

    clearFailedAttempts(key);

    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      branchId: user.branchId,
    });

    res.status(200).json({
      message: "Acceso autorizado.",
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        branch: {
          id: user.branch.id,
          name: user.branch.name,
          phone: user.branch.phone,
          address: user.branch.address,
        },
      },
    });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor." });
  }
};

/**
 * Obtener perfil del usuario autenticado
 */
export const getProfile = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: { branch: true },
    });

    if (!user) {
      res.status(404).json({ message: "Usuario no encontrado." });
      return;
    }

    res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        branch: {
          id: user.branch.id,
          name: user.branch.name,
          address: user.branch.address,
          phone: user.branch.phone,
        },
      },
    });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor." });
  }
};

/**
 * Obtener listado de todas las sucursales activas
 */
export const getBranches = async (_req: Request, res: Response): Promise<void> => {
  try {
    const branches = await prisma.branch.findMany({
      where: { active: true },
      select: { id: true, name: true }
    });
    res.status(200).json({ branches });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al obtener sucursales." });
  }
};

/**
 * Obtener listado de cajeros activos asignados a una sucursal específica
 */
export const getCashiersByBranch = async (req: Request, res: Response): Promise<void> => {
  const { branchId } = req.params;

  if (!branchId) {
    res.status(400).json({ message: "El ID de la sucursal es requerido." });
    return;
  }

  try {
    const cashiers = await prisma.user.findMany({
      where: {
        branchId: parseInt(branchId),
        role: "CAJERO",
        active: true
      },
      select: {
        id: true,
        email: true,
        name: true
      }
    });
    res.status(200).json({ cashiers });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al obtener cajeros de la sucursal." });
  }
};

/**
 * Verificar si un código PIN corresponde a un Administrador o Gerente
 */
export const verifyManagerPin = async (req: Request, res: Response): Promise<void> => {
  const { pinCode } = req.body;

  if (!pinCode) {
    res.status(400).json({ message: "El código PIN es requerido." });
    return;
  }

  try {
    const managers = await prisma.user.findMany({
      where: {
        role: { in: ["ADMIN", "GERENTE"] },
        active: true,
      },
    });

    let approver = null;
    for (const m of managers) {
      if (m.pinCode) {
        const isMatch = await comparePassword(pinCode, m.pinCode);
        if (isMatch) {
          approver = m;
          break;
        }
      }
    }

    if (!approver) {
      res.status(401).json({ message: "PIN de autorización incorrecto o el usuario no cuenta con privilegios de Administrador/Gerente." });
      return;
    }

    res.status(200).json({
      valid: true,
      name: approver.name,
    });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al validar el PIN." });
  }
};
