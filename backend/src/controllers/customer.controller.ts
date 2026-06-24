import { Request, Response } from "express";
import { generateToken } from "../utils/auth";
import { AppError } from "../utils/AppError";
import { prisma } from "../app";
import {
  registerCustomer,
  loginCustomer as loginCustomerService,
  getCustomerProfile as getCustomerProfileService,
  updateCustomerProfile as updateCustomerProfileService,
  getCustomerInvoices as getCustomerInvoicesService,
  verifyCustomerExists,
  resetCustomerPassword as resetCustomerPasswordService,
} from "../services/customer.service";
import nodemailer from "nodemailer";
import { validateEmail } from "../utils/email.util";

const handleAppError = (error: unknown, res: Response, fallbackMessage: string): void => {
  if (error instanceof AppError) {
    const body: Record<string, unknown> = { message: error.message };
    if (error.code) body.code = error.code;
    res.status(error.statusCode).json(body);
    return;
  }
  console.error(error);
  res.status(500).json({ message: fallbackMessage });
};

export const otpStore = new Map<string, { otp: string; expiresAt: Date }>();

// Enviar código de verificación vía correo electrónico (SMTP)
const sendOtpEmail = async (to: string, otpCode: string, type: "register" | "reset"): Promise<void> => {
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

  const subject = type === "register" 
    ? "Código de verificación para registro - POS LYFRGL" 
    : "Restablecer contraseña - POS LYFRGL";

  const introText = type === "register"
    ? "Tu código de verificación de un solo uso para crear tu cuenta es:"
    : "Tu código de verificación de un solo uso para restablecer tu contraseña es:";

  await transporter.sendMail({
    from, to,
    subject,
    html: `
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8" /></head>
        <body style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
          <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;padding:24px;">
            <h2 style="margin:0 0 12px 0;font-size:18px;color:#1e3a8a;">LYFRGL POS — Verificación de Seguridad</h2>
            <p style="margin:0 0 16px 0;font-size:14px;line-height:1.5;">
              ${introText}
            </p>
            <div style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;padding:20px;text-align:center;margin:0 0 16px 0;">
              <span style="font-size:36px;font-weight:900;letter-spacing:12px;color:#1e3a8a;">${otpCode}</span>
            </div>
            <p style="margin:0;font-size:13px;color:#64748b;line-height:1.5;">
              Este código es válido por <strong>5 minutos</strong>. Si no lo solicitaste, ignora este correo.
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

export const sendOtp = async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;
  if (!email || typeof email !== "string") {
    res.status(400).json({ message: "El correo electrónico es requerido." });
    return;
  }
  const cleanEmail = email.trim().toLowerCase();
  if (!validateEmail(cleanEmail)) {
    res.status(400).json({ message: "El correo electrónico no tiene un formato válido." });
    return;
  }

  try {
    // Verificar si ya existe una cuenta registrada con este correo electrónico
    const existing = await prisma.customer.findFirst({
      where: { email: cleanEmail }
    });

    if (existing && existing.passwordHash) {
      res.status(400).json({ message: "El correo electrónico ya está registrado con otra cuenta." });
      return;
    }

    // Generar OTP de 6 dígitos
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutos de expiración

    otpStore.set(cleanEmail, { otp, expiresAt });

    console.log(`[OTP VERIFICACIÓN EMAIL] Correo: ${cleanEmail} | Código: ${otp}`);

    // Enviar el correo electrónico
    await sendOtpEmail(cleanEmail, otp, "register");

    res.status(200).json({
      message: "Código de verificación enviado exitosamente a tu correo electrónico.",
      otp,
    });
  } catch (error) {
    handleAppError(error, res, "Error al enviar el código de verificación.");
  }
};

export const registerCustomerAccount = async (req: Request, res: Response): Promise<void> => {
  const { email, invoiceNumber, password, otp } = req.body;
  if (!email || !invoiceNumber || !password || !otp) {
    res.status(400).json({ message: "El correo electrónico, folio de ticket, contraseña y código OTP son requeridos." });
    return;
  }

  const cleanEmail = email.trim().toLowerCase();
  const record = otpStore.get(cleanEmail);

  if (!record) {
    res.status(400).json({ message: "No se ha solicitado ningún código para este correo electrónico." });
    return;
  }

  if (record.expiresAt < new Date()) {
    otpStore.delete(cleanEmail);
    res.status(400).json({ message: "El código de verificación ha expirado." });
    return;
  }

  if (record.otp !== otp) {
    res.status(400).json({ message: "Código de verificación incorrecto." });
    return;
  }

  // Eliminar OTP al ser verificado con éxito
  otpStore.delete(cleanEmail);

  try {
    await registerCustomer(cleanEmail, invoiceNumber, password);
    res.status(200).json({
      message: "Cuenta registrada exitosamente. Ahora puedes iniciar sesión con tu correo electrónico y contraseña.",
    });
  } catch (error) {
    handleAppError(error, res, "Error al registrar la cuenta.");
  }
};

// Solicitar OTP para Restablecimiento de Contraseña
export const sendPasswordResetOtp = async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;
  if (!email || typeof email !== "string") {
    res.status(400).json({ message: "El correo electrónico es requerido." });
    return;
  }
  const cleanEmail = email.trim().toLowerCase();
  if (!validateEmail(cleanEmail)) {
    res.status(400).json({ message: "El correo electrónico no tiene un formato válido." });
    return;
  }

  try {
    // Validar que el cliente exista en DB
    const exists = await verifyCustomerExists(cleanEmail);
    if (!exists) {
      res.status(404).json({ message: "No existe ningún cliente registrado con este correo electrónico." });
      return;
    }

    // Generar OTP de 6 dígitos
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutos

    otpStore.set(cleanEmail, { otp, expiresAt });

    console.log(`[RESET PASSWORD OTP EMAIL] Correo: ${cleanEmail} | Código: ${otp}`);

    await sendOtpEmail(cleanEmail, otp, "reset");

    res.status(200).json({
      message: "Código de seguridad enviado exitosamente a tu correo electrónico.",
      otp,
    });
  } catch (error) {
    handleAppError(error, res, "Error al procesar el código de seguridad.");
  }
};

// Restablecer contraseña con verificación OTP
export const resetCustomerPassword = async (req: Request, res: Response): Promise<void> => {
  const { email, otp, newPassword } = req.body;
  if (!email || !otp || !newPassword) {
    res.status(400).json({ message: "El correo electrónico, código OTP y la nueva contraseña son requeridos." });
    return;
  }

  const cleanEmail = email.trim().toLowerCase();
  const record = otpStore.get(cleanEmail);

  if (!record) {
    res.status(400).json({ message: "No se ha solicitado ningún código para este correo electrónico." });
    return;
  }

  if (record.expiresAt < new Date()) {
    otpStore.delete(cleanEmail);
    res.status(400).json({ message: "El código de verificación ha expirado." });
    return;
  }

  if (record.otp !== otp) {
    res.status(400).json({ message: "Código de verificación incorrecto." });
    return;
  }

  otpStore.delete(cleanEmail);

  try {
    await resetCustomerPasswordService(cleanEmail, newPassword);
    res.status(200).json({
      message: "Contraseña actualizada exitosamente. Por favor, inicia sesión con tu nueva contraseña.",
    });
  } catch (error) {
    handleAppError(error, res, "Error al actualizar la contraseña.");
  }
};

export const loginCustomer = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ message: "El correo electrónico y la contraseña son requeridos." });
    return;
  }
  try {
    const customer = await loginCustomerService(email, password);
    const token = generateToken({ customerId: customer.id, email: customer.email, role: "CUSTOMER" });
    res.status(200).json({ message: "Inicio de sesión exitoso.", token, customer });
  } catch (error) {
    handleAppError(error, res, "Error al iniciar sesión.");
  }
};

export const getCustomerProfile = async (req: Request, res: Response): Promise<void> => {
  if (!req.user || !req.user.customerId) {
    res.status(401).json({ message: "No autenticado como cliente." });
    return;
  }
  try {
    const customer = await getCustomerProfileService(req.user.customerId);
    res.status(200).json({ customer });
  } catch (error) {
    handleAppError(error, res, "Error al recuperar el perfil.");
  }
};

export const updateCustomerProfile = async (req: Request, res: Response): Promise<void> => {
  if (!req.user || !req.user.customerId) {
    res.status(401).json({ message: "No autenticado como cliente." });
    return;
  }
  const { taxId, name, taxRegime, zipCode, email, cfdiUse, address } = req.body;
  try {
    const customer = await updateCustomerProfileService(req.user.customerId, {
      taxId,
      name,
      taxRegime,
      zipCode,
      email,
      cfdiUse,
      address,
    });
    res.status(200).json({ message: "Datos fiscales actualizados exitosamente.", customer });
  } catch (error) {
    handleAppError(error, res, "Error al actualizar los datos fiscales.");
  }
};

export const getCustomerInvoices = async (req: Request, res: Response): Promise<void> => {
  if (!req.user || !req.user.customerId) {
    res.status(401).json({ message: "No autenticado como cliente." });
    return;
  }
  try {
    const invoices = await getCustomerInvoicesService(req.user.customerId);
    res.status(200).json({ invoices });
  } catch (error) {
    handleAppError(error, res, "Error al obtener el historial de facturas.");
  }
};
