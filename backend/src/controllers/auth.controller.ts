import { Request, Response } from "express";
import { prisma } from "../app";
import { comparePassword, generateToken } from "../utils/auth";

/**
 * Login clásico para Administradores y Gerentes (Email + Contraseña)
 */
export const adminLogin = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ message: "El correo y la contraseña son requeridos." });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { branch: true },
    });

    if (!user || !user.active) {
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
      res.status(401).json({ message: "Credenciales incorrectas." });
      return;
    }

    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      branchId: user.branchId,
    });

    res.status(200).json({
      message: "Inicio de sesión exitoso.",
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
 * Login de Acceso Rápido para Cajeros (Email + PIN de 4 dígitos)
 */
export const cashierLogin = async (req: Request, res: Response): Promise<void> => {
  const { email, pinCode } = req.body;

  if (!email || !pinCode) {
    res.status(400).json({ message: "El correo y el código PIN son requeridos." });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { branch: true },
    });

    if (!user || !user.active) {
      res.status(401).json({ message: "Usuario inactivo o no encontrado." });
      return;
    }

    if (!user.pinCode) {
      res.status(400).json({ message: "Este usuario no tiene configurado un código PIN de acceso rápido." });
      return;
    }

    const isPinMatch = await comparePassword(pinCode, user.pinCode);
    if (!isPinMatch) {
      res.status(401).json({ message: "Código PIN incorrecto." });
      return;
    }



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
