import { Request, Response } from "express";
import { AppError } from "../utils/AppError";
import { parseOptionalDateRange } from "../utils/dateRange.util";
import {
  listPurchases as listPurchasesService,
  createPurchase as createPurchaseService,
  receivePurchase as receivePurchaseService,
  registerPurchase as registerPurchaseService,
  cancelPurchase as cancelPurchaseService,
} from "../services/adminPurchase.service";

export const listPurchases = async (req: Request, res: Response): Promise<void> => {
  try {
    const range = parseOptionalDateRange(req.query);
    if (range.errorStatus) { res.status(range.errorStatus).json({ message: range.errorMessage }); return; }

    const purchases = await listPurchasesService({
      branchId: req.query.branchId as string | undefined,
      status: req.query.status as string | undefined,
      supplierId: req.query.supplierId as string | undefined,
      from: range.from,
      to: range.to,
    });

    res.json(purchases);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al listar compras." });
  }
};

export const createPurchase = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: "No autenticado." }); return; }
  try {
    const purchase = await createPurchaseService(req.body as Record<string, unknown>, req.user.userId);
    res.status(201).json(purchase);
  } catch (error: any) {
    if (error instanceof AppError) { res.status(error.statusCode).json({ message: error.message }); return; }
    console.error(error);
    res.status(500).json({ message: "Error al crear la orden de compra." });
  }
};

export const receivePurchase = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: "No autenticado." }); return; }
  try {
    const id = Number(req.params.id);
    const updated = await receivePurchaseService(id, req.user.userId);
    res.json(updated);
  } catch (error: any) {
    if (error instanceof AppError) { res.status(error.statusCode).json({ message: error.message }); return; }
    console.error(error);
    res.status(500).json({ message: "Error al recibir la orden de compra." });
  }
};

export const cancelPurchase = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: "No autenticado." }); return; }
  try {
    const id = Number(req.params.id);
    const updated = await cancelPurchaseService(id);
    res.json(updated);
  } catch (error: any) {
    if (error instanceof AppError) { res.status(error.statusCode).json({ message: error.message }); return; }
    console.error(error);
    res.status(500).json({ message: "Error al cancelar la orden de compra." });
  }
};

export const registerPurchase = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: "No autenticado." }); return; }
  try {
    const result = await registerPurchaseService(req.body as Record<string, unknown>, req.user.userId);
    res.status(201).json({
      message: "Compra registrada. El inventario y el kardex fueron actualizados.",
      branch: result.branchName,
      lineas: result.lineas,
      totalUnidades: result.totalUnidades,
    });
  } catch (error: any) {
    if (error instanceof AppError) { res.status(error.statusCode).json({ message: error.message }); return; }
    console.error(error);
    res.status(500).json({ message: "Error al registrar la compra." });
  }
};
