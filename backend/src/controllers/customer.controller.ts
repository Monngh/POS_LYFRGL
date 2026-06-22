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
import https from "https";

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

// Función nativa para enviar SMS mediante Twilio
export const sendSmsViaTwilio = (phone: string, text: string): Promise<void> => {
  return new Promise((resolve) => {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_FROM_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      console.warn("[TWILIO WARNING] Credenciales de Twilio incompletas en el archivo .env.");
      return resolve(); // fallback a logs de consola
    }

    let formattedPhone = phone.trim();
    if (!formattedPhone.startsWith("+")) {
      formattedPhone = `+52${formattedPhone}`;
    }

    const postData = new URLSearchParams({
      To: formattedPhone,
      From: fromNumber,
      Body: text,
    }).toString();

    const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

    const options = {
      hostname: "api.twilio.com",
      port: 443,
      path: `/2010-04-01/Accounts/${accountSid}/Messages.json`,
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`[TWILIO SUCCESS] SMS enviado exitosamente a ${formattedPhone}`);
        } else {
          console.error("[TWILIO ERROR] Status Code:", res.statusCode, "Response:", body);
        }
        resolve(); // Resolvemos siempre para no bloquear el flujo si falla Twilio en ambiente de desarrollo
      });
    });

    req.on("error", (e) => {
      console.error("[TWILIO HTTP ERROR]", e);
      resolve();
    });

    req.write(postData);
    req.end();
  });
};

export const sendOtp = async (req: Request, res: Response): Promise<void> => {
  const { phone } = req.body;
  if (!phone || typeof phone !== "string") {
    res.status(400).json({ message: "El teléfono es requerido." });
    return;
  }
  const cleanPhone = phone.replace(/\D/g, "");
  if (cleanPhone.length !== 10) {
    res.status(400).json({ message: "El teléfono debe tener exactamente 10 dígitos." });
    return;
  }

  // Verificar si ya existe una cuenta registrada con este número
  let existing = await prisma.customer.findFirst({
    where: {
      OR: [
        { phone: cleanPhone },
        { phone: phone }
      ]
    }
  });

  if (!existing) {
    const allCustomers = await prisma.customer.findMany({
      where: { phone: { not: null } }
    });
    existing = allCustomers.find((c: any) => (c.phone || "").replace(/[^0-9]/g, "") === cleanPhone) || null;
  }

  if (existing && existing.passwordHash) {
    res.status(400).json({ message: "El número de teléfono ya está registrado con otra cuenta." });
    return;
  }

  // Generar OTP de 6 dígitos
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutos de expiración

  otpStore.set(cleanPhone, { otp, expiresAt });

  console.log(`[OTP VERIFICACIÓN] Celular: ${cleanPhone} | Código: ${otp}`);

  // Enviar el SMS real a través de Twilio
  const messageText = `Tu codigo de verificacion LYFRGL para autofacturacion es: ${otp}`;
  await sendSmsViaTwilio(cleanPhone, messageText);

  res.status(200).json({
    message: "Código de verificación enviado exitosamente.",
    otp,
  });
};

export const registerCustomerAccount = async (req: Request, res: Response): Promise<void> => {
  const { phone, invoiceNumber, password, email, otp } = req.body;
  if (!phone || !invoiceNumber || !password || !otp) {
    res.status(400).json({ message: "El teléfono, folio de ticket, contraseña y código OTP son requeridos." });
    return;
  }

  const cleanPhone = phone.replace(/\D/g, "");
  const record = otpStore.get(cleanPhone);

  if (!record) {
    res.status(400).json({ message: "No se ha solicitado ningún código para este número de teléfono." });
    return;
  }

  if (record.expiresAt < new Date()) {
    otpStore.delete(cleanPhone);
    res.status(400).json({ message: "El código de verificación ha expirado." });
    return;
  }

  if (record.otp !== otp) {
    res.status(400).json({ message: "Código de verificación incorrecto." });
    return;
  }

  // Eliminar OTP al ser verificado con éxito
  otpStore.delete(cleanPhone);

  try {
    await registerCustomer(cleanPhone, invoiceNumber, password, email);
    res.status(200).json({
      message: "Cuenta registrada exitosamente. Ahora puedes iniciar sesión con tu teléfono y contraseña.",
    });
  } catch (error) {
    handleAppError(error, res, "Error al registrar la cuenta.");
  }
};

// Solicitar OTP para Restablecimiento de Contraseña
export const sendPasswordResetOtp = async (req: Request, res: Response): Promise<void> => {
  const { phone } = req.body;
  if (!phone || typeof phone !== "string") {
    res.status(400).json({ message: "El teléfono es requerido." });
    return;
  }
  const cleanPhone = phone.replace(/\D/g, "");
  if (cleanPhone.length !== 10) {
    res.status(400).json({ message: "El teléfono debe tener exactamente 10 dígitos." });
    return;
  }

  try {
    // Validar que el cliente exista en DB
    const exists = await verifyCustomerExists(cleanPhone);
    if (!exists) {
      res.status(404).json({ message: "No existe ningún cliente registrado con este número de teléfono." });
      return;
    }

    // Generar OTP de 6 dígitos
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutos

    otpStore.set(cleanPhone, { otp, expiresAt });

    console.log(`[RESET PASSWORD OTP] Celular: ${cleanPhone} | Código: ${otp}`);

    const messageText = `Tu codigo de seguridad LYFRGL para restablecer tu contrasena es: ${otp}`;
    await sendSmsViaTwilio(cleanPhone, messageText);

    res.status(200).json({
      message: "Código de verificación enviado exitosamente.",
      otp,
    });
  } catch (error) {
    handleAppError(error, res, "Error al procesar el código de seguridad.");
  }
};

// Restablecer contraseña con verificación OTP
export const resetCustomerPassword = async (req: Request, res: Response): Promise<void> => {
  const { phone, otp, newPassword } = req.body;
  if (!phone || !otp || !newPassword) {
    res.status(400).json({ message: "El teléfono, código OTP y la nueva contraseña son requeridos." });
    return;
  }

  const cleanPhone = phone.replace(/\D/g, "");
  const record = otpStore.get(cleanPhone);

  if (!record) {
    res.status(400).json({ message: "No se ha solicitado ningún código para este número de teléfono." });
    return;
  }

  if (record.expiresAt < new Date()) {
    otpStore.delete(cleanPhone);
    res.status(400).json({ message: "El código de verificación ha expirado." });
    return;
  }

  if (record.otp !== otp) {
    res.status(400).json({ message: "Código de verificación incorrecto." });
    return;
  }

  otpStore.delete(cleanPhone);

  try {
    await resetCustomerPasswordService(cleanPhone, newPassword);
    res.status(200).json({
      message: "Contraseña actualizada exitosamente. Por favor, inicia sesión con tu nueva contraseña.",
    });
  } catch (error) {
    handleAppError(error, res, "Error al actualizar la contraseña.");
  }
};

export const loginCustomer = async (req: Request, res: Response): Promise<void> => {
  const { phone, password } = req.body;
  if (!phone || !password) {
    res.status(400).json({ message: "El teléfono y la contraseña son requeridos." });
    return;
  }
  try {
    const customer = await loginCustomerService(phone, password);
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
