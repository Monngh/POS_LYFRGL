import { Request, Response } from "express";
import nodemailer from "nodemailer";
import { prisma } from "../app";
import { comparePassword, generateToken, verifyToken } from "../utils/auth";
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

// ─── Helper SMTP (mismo patrón que ticketEmail.service.ts) ───────────────────
const sendOtpEmail = async (to: string, otpCode: string): Promise<void> => {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = process.env.SMTP_FROM?.trim() || user;

  if (!host || !user || !pass || !from) {
    throw new Error("El servicio de correo no está configurado. Contacte al administrador.");
  }

  const transporter = nodemailer.createTransport({
    host, port,
    secure: port === 465,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from,
    to,
    subject: "Código de verificación - POS LYFRGL",
    html: `
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8" /></head>
        <body style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
          <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;padding:24px;">
            <h2 style="margin:0 0 12px 0;font-size:18px;color:#1e3a8a;">LYFRGL POS — Verificación de Seguridad</h2>
            <p style="margin:0 0 16px 0;font-size:14px;line-height:1.5;">
              Tu código de verificación de un solo uso es:
            </p>
            <div style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;padding:20px;text-align:center;margin:0 0 16px 0;">
              <span style="font-size:36px;font-weight:900;letter-spacing:12px;color:#1e3a8a;">${otpCode}</span>
            </div>
            <p style="margin:0;font-size:13px;color:#64748b;line-height:1.5;">
              Este código es válido por <strong>10 minutos</strong>. Si no lo solicitaste, ignora este correo.
            </p>
          </div>
          <p style="max-width:520px;margin:12px auto 0;font-size:11px;color:#64748b;text-align:center;">
            Código generado por LYFRGL POS
          </p>
        </body>
      </html>
    `,
  });
};

/**
 * Paso 2b (fallback): solicitar un código OTP de 6 dígitos por correo.
 * Solo disponible para usuarios que ya pasaron el Paso 1 (tienen un pendingToken).
 */
export const requestOtp = async (req: Request, res: Response) => {
  try {
    const { pendingToken } = req.body;

    if (!pendingToken) {
      return res.status(400).json({ message: "Token requerido" });
    }

    const decoded = verifyToken(pendingToken);
    if (!decoded) {
      return res.status(401).json({ message: "Token inválido o expirado" });
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    await prisma.user.update({
      where: { id: user.id },
      data: { otpCode, otpExpiresAt },
    });

    await sendOtpEmail(user.email, otpCode);

    return res.json({
      message: "Código enviado a tu correo",
      email: user.email.replace(/(.{2}).*(@.*)/, "$1***$2"),
    });
  } catch (err) {
    console.error("[requestOtp]", err);
    return res.status(500).json({ message: "Error al enviar el código" });
  }
};

/**
 * Paso 2b (fallback): verificar el OTP recibido por correo y emitir la sesión.
 */
export const verifyOtp = async (req: Request, res: Response) => {
  try {
    const { pendingToken, otpCode } = req.body;

    if (!pendingToken || !otpCode) {
      return res.status(400).json({ message: "Token y código son requeridos" });
    }

    const decoded = verifyToken(pendingToken);
    if (!decoded) {
      return res.status(401).json({ message: "Token inválido o expirado" });
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { branch: true },
    });

    if (!user || !user.otpCode || !user.otpExpiresAt) {
      return res.status(400).json({ message: "No hay código pendiente. Solicita uno nuevo." });
    }

    if (new Date() > user.otpExpiresAt) {
      await prisma.user.update({
        where: { id: user.id },
        data: { otpCode: null, otpExpiresAt: null },
      });
      return res.status(400).json({ message: "El código ha expirado. Solicita uno nuevo." });
    }

    if (user.otpCode !== otpCode.trim()) {
      return res.status(400).json({ message: "Código incorrecto" });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { otpCode: null, otpExpiresAt: null },
    });

    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      branchId: user.branchId,
    });

    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        branch: {
          id: user.branch.id,
          name: user.branch.name,
          phone: user.branch.phone,
          address: user.branch.address,
        },
      },
    });
  } catch (err) {
    console.error("[verifyOtp]", err);
    return res.status(500).json({ message: "Error al verificar el código" });
  }
};
