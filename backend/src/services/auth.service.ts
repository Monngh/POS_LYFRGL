import nodemailer from "nodemailer";
import { prisma } from "../app";
import { comparePassword } from "../utils/auth";
import {
  lockoutKey,
  getLockRemaining,
  registerFailedAttempt,
  clearFailedAttempts,
} from "../utils/authSecurity";
import { AppError } from "../utils/AppError";

const lockMessage = (seconds: number): string => {
  const mins = Math.ceil(seconds / 60);
  return `Demasiados intentos fallidos. Cuenta bloqueada temporalmente. Intente de nuevo en ${mins} minuto(s).`;
};

// Validates admin/gerente credentials including brute-force lockout.
export const findUserForAdminLogin = async (email: string, password: string, ip: string) => {
  const key = lockoutKey("admin", email, ip);
  const locked = getLockRemaining(key);
  if (locked > 0) {
    throw new AppError(lockMessage(locked), 429, "CUENTA_BLOQUEADA");
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { branch: true },
  });

  if (!user || !user.active) {
    registerFailedAttempt(key);
    throw new AppError("Credenciales incorrectas o usuario inactivo.", 401);
  }

  if (user.role !== "ADMIN" && user.role !== "GERENTE") {
    throw new AppError("Acceso denegado. Utilice la terminal de ventas para cajeros.", 403);
  }

  const isMatch = await comparePassword(password, user.passwordHash);
  if (!isMatch) {
    const result = registerFailedAttempt(key);
    if (result.locked) {
      throw new AppError(lockMessage(result.lockSeconds), 429, "CUENTA_BLOQUEADA");
    }
    throw new AppError(
      `Credenciales incorrectas. Intentos restantes: ${result.remainingAttempts}.`,
      401
    );
  }

  clearFailedAttempts(key);
  return user;
};

// Validates cashier credentials (email + PIN). Lockout stays in controller
// to preserve the retryAfterSeconds field in 429 responses.
export const findUserForCashierLogin = async (email: string, pinCode: string) => {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { branch: true },
  });

  if (!user || !user.active) {
    throw new AppError("Usuario inactivo o no encontrado.", 401, "USUARIO_INVALIDO");
  }

  if (!user.pinCode) {
    throw new AppError(
      "Este usuario no tiene configurado un código PIN de acceso rápido.",
      400,
      "SIN_PIN"
    );
  }

  const isPinMatch = await comparePassword(pinCode, user.pinCode);
  if (!isPinMatch) {
    throw new AppError("Código PIN incorrecto.", 401, "PIN_INCORRECTO");
  }

  return user;
};

export const getUserProfile = async (userId: number) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { branch: true },
  });

  if (!user) {
    throw new AppError("Usuario no encontrado.", 404);
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    branch: {
      id: user.branch!.id,
      name: user.branch!.name,
      address: user.branch!.address,
      phone: user.branch!.phone,
    },
  };
};

export const getActiveBranches = async () => {
  return prisma.branch.findMany({
    where: { active: true },
    select: { id: true, name: true },
  });
};

export const getCashiersByBranch = async (branchId: number) => {
  return prisma.user.findMany({
    where: { branchId, role: "CAJERO", active: true },
    select: { id: true, email: true, name: true },
  });
};

export const verifyManagerPin = async (pinCode: string, branchId?: number) => {
  const managers = await prisma.user.findMany({
    where: {
      role: { in: ["ADMIN", "GERENTE"] },
      active: true,
      ...(branchId !== undefined && { branchId }),
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
    throw new AppError(
      "PIN de autorización incorrecto o el usuario no cuenta con privilegios de Administrador/Gerente.",
      401
    );
  }

  return { valid: true as const, name: approver.name };
};

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
    from, to,
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

// Generates OTP, saves to DB, sends it by email. Returns raw email for masking in controller.
export const generateOtpCode = async (userId: number): Promise<{ email: string }> => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError("Usuario no encontrado", 404);
  }

  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await prisma.user.update({
    where: { id: user.id },
    data: { otpCode, otpExpiresAt },
  });

  await sendOtpEmail(user.email, otpCode);
  return { email: user.email };
};

// Validates OTP, clears it from DB, returns user with branch for token generation.
export const validateOtpCode = async (userId: number, otpCode: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { branch: true },
  });

  if (!user || !user.otpCode || !user.otpExpiresAt) {
    throw new AppError("No hay código pendiente. Solicita uno nuevo.", 400);
  }

  if (new Date() > user.otpExpiresAt) {
    await prisma.user.update({
      where: { id: user.id },
      data: { otpCode: null, otpExpiresAt: null },
    });
    throw new AppError("El código ha expirado. Solicita uno nuevo.", 400);
  }

  if (user.otpCode !== otpCode.trim()) {
    throw new AppError("Código incorrecto", 400);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { otpCode: null, otpExpiresAt: null },
  });

  return user;
};
