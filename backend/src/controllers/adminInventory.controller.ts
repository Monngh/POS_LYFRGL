import { Request, Response } from "express";
import { AppError } from "../utils/AppError";
import { parseOptionalDateRange } from "../utils/dateRange.util";
import {
  type InventoryStatusFilter,
  listInventory as listInventoryService,
  listKardex as listKardexService,
  adjustInventory as adjustInventoryService,
  transferInventory as transferInventoryService,
} from "../services/adminInventory.service";

const parseBranch = (req: Request): number | undefined => {
  if (req.user && req.user.role === "GERENTE") return req.user.branchId;
  const b = req.query.branchId as string | undefined;
  return b && b !== "all" && !isNaN(Number(b)) ? Number(b) : undefined;
};

const trimQuery = (v: unknown): string | undefined => {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length > 0 ? s : undefined;
};

const parseInventoryStatus = (value: unknown): InventoryStatusFilter | null => {
  if (value === undefined) return "all";
  if (typeof value !== "string") return null;

  const status = value.trim().toLowerCase();
  if (status === "all" || status === "active" || status === "inactive") {
    return status;
  }
  return null;
};

const parseOptionalBoolean = (value: unknown): boolean | null => {
  if (value === undefined) return false;
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  return null;
};

const cleanBodyText = (value: unknown): string => String(value ?? "").trim();

const parseInteger = (value: unknown): number | null => {
  const text = cleanBodyText(value);
  if (!/^-?\d+$/.test(text)) return null;
  const numeric = Number(text);
  return Number.isSafeInteger(numeric) ? numeric : null;
};

export const listInventory = async (req: Request, res: Response): Promise<void> => {
  try {
    const status = parseInventoryStatus(req.query.status);
    if (status === null) {
      res.status(400).json({ message: "Filtro de estado invalido." });
      return;
    }

    const lowStock = parseOptionalBoolean(req.query.lowStock);
    if (lowStock === null) {
      res.status(400).json({ message: "Filtro de stock bajo invalido." });
      return;
    }

    const result = await listInventoryService({
      branchId: parseBranch(req),
      search: trimQuery(req.query.search),
      status,
      lowStock,
    });
    res.status(200).json(result);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al listar inventario." });
  }
};

export const listKardex = async (req: Request, res: Response): Promise<void> => {
  try {
    const range = parseOptionalDateRange(req.query);
    if (range.errorStatus) { res.status(range.errorStatus).json({ message: range.errorMessage }); return; }

    const rawPage = Number(req.query.page ?? 1);
    const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;

    const result = await listKardexService({
      branchId: parseBranch(req),
      movementType: req.query.movementType as string | undefined,
      search: trimQuery(req.query.search),
      from: range.from,
      to: range.to,
      page,
    });

    res.status(200).json({ entries: result.entries, total: result.total });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al listar el kardex." });
  }
};

export const adjustInventory = async (req: Request, res: Response): Promise<void> => {
  try {
    const productId = parseInteger(req.body.productId);
    const branchId = parseInteger(req.body.branchId);
    const quantityChange = parseInteger(req.body.quantityChange);
    const movementType = cleanBodyText(req.body.movementType);
    const reason = cleanBodyText(req.body.reason);

    if (!productId || productId <= 0 || !branchId || branchId <= 0 || quantityChange === null || quantityChange === 0 || !movementType || !reason) {
      res.status(400).json({ message: "Campos requeridos incompletos." });
      return;
    }

    const newQuantity = await adjustInventoryService({
      productId,
      branchId,
      quantityChange,
      movementType,
      reason,
      userId: req.user!.userId,
      requester: req.user ? { role: req.user.role, branchId: req.user.branchId } : undefined,
    });

    res.status(200).json({ message: "Ajuste aplicado exitosamente.", newQuantity });
  } catch (error: any) {
    if (error instanceof AppError) { res.status(error.statusCode).json({ message: error.message }); return; }
    console.error(error);
    res.status(500).json({ message: "Error al aplicar ajuste de inventario." });
  }
};

export const transferInventory = async (req: Request, res: Response): Promise<void> => {
  try {
    const productId = parseInteger(req.body.productId);
    const fromBranch = parseInteger(req.body.fromBranch);
    const toBranch = parseInteger(req.body.toBranch);
    const quantity = parseInteger(req.body.quantity);

    if (!productId || productId <= 0 || !fromBranch || fromBranch <= 0 || !toBranch || toBranch <= 0 || quantity === null) {
      res.status(400).json({ message: "Campos requeridos incompletos." });
      return;
    }

    await transferInventoryService({
      productId,
      fromBranch,
      toBranch,
      quantity,
      userId: req.user!.userId,
      requester: req.user ? { role: req.user.role, branchId: req.user.branchId } : undefined,
    });

    res.status(200).json({ message: "Traslado aplicado exitosamente." });
  } catch (error: any) {
    if (error instanceof AppError) { res.status(error.statusCode).json({ message: error.message }); return; }
    console.error(error);
    res.status(500).json({ message: "Error al aplicar traslado." });
  }
};
