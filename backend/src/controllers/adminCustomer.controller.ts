import { Request, Response } from "express";
import { AppError } from "../utils/AppError";
import {
  listCustomers as listCustomersService,
  createCustomer as createCustomerService,
  updateCustomer as updateCustomerService,
} from "../services/adminCustomer.service";

const trimQuery = (v: unknown): string | undefined => {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length > 0 ? s : undefined;
};

export const listCustomers = async (req: Request, res: Response): Promise<void> => {
  try {
    const customers = await listCustomersService(trimQuery(req.query.search));
    res.status(200).json({ customers });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al listar clientes." });
  }
};

export const createCustomer = async (req: Request, res: Response): Promise<void> => {
  try {
    const customer = await createCustomerService(req.body as Record<string, unknown>);
    res.status(201).json({ message: "Cliente registrado exitosamente.", customer });
  } catch (error: any) {
    if (error instanceof AppError) { res.status(error.statusCode).json({ message: error.message }); return; }
    console.error(error);
    res.status(500).json({ message: "Error al registrar el cliente." });
  }
};

export const updateCustomer = async (req: Request, res: Response): Promise<void> => {
  try {
    const customerId = Number(req.params.id);
    if (isNaN(customerId)) { res.status(400).json({ message: "ID de cliente inválido." }); return; }

    const customer = await updateCustomerService(customerId, req.body as Record<string, unknown>);
    res.status(200).json({ message: "Cliente actualizado exitosamente.", customer });
  } catch (error: any) {
    if (error instanceof AppError) { res.status(error.statusCode).json({ message: error.message }); return; }
    console.error(error);
    res.status(500).json({ message: "Error al actualizar el cliente." });
  }
};
