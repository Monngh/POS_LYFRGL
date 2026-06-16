import { Request, Response } from "express";
import { generateToken } from "../utils/auth";
import { AppError } from "../utils/AppError";
import {
  registerCustomer,
  loginCustomer as loginCustomerService,
  getCustomerProfile as getCustomerProfileService,
  updateCustomerProfile as updateCustomerProfileService,
  getCustomerInvoices as getCustomerInvoicesService,
} from "../services/customer.service";

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

export const registerCustomerAccount = async (req: Request, res: Response): Promise<void> => {
  const { phone, invoiceNumber, password, email } = req.body;
  if (!phone || !invoiceNumber || !password) {
    res.status(400).json({ message: "El teléfono, folio de ticket y la contraseña son requeridos." });
    return;
  }
  try {
    await registerCustomer(phone, invoiceNumber, password, email);
    res.status(200).json({
      message: "Cuenta registrada exitosamente. Ahora puedes iniciar sesión con tu teléfono y contraseña.",
    });
  } catch (error) {
    handleAppError(error, res, "Error al registrar la cuenta.");
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
