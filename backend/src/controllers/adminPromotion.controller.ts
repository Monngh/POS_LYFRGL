import { Request, Response } from "express";
import { AppError } from "../utils/AppError";
import {
  addProductsToPromotion,
  createPromotion,
  deleteProductFromPromotion,
  getActiveProductsForPromotions,
  getPromotionById,
  getPromotions,
  getPromotionTypes,
  syncPromotionProducts,
  updatePromotion,
  updatePromotionStatus,
} from "../services/adminPromotion.service";

// ─── Shared parsing helpers ───────────────────────────────────────────────────

const parsePositiveInt = (value: unknown): number | null => {
  if (typeof value === "boolean") return null;
  if (typeof value === "string" && !value.trim()) return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

type ProductIdsParseResult =
  | { success: true; productIds: number[] }
  | { success: false; message: string };

const parseProductIds = (value: unknown): ProductIdsParseResult => {
  if (value === undefined) return { success: false, message: "productIds es requerido." };
  if (!Array.isArray(value)) return { success: false, message: "productIds debe ser un arreglo." };
  if (value.length === 0) return { success: false, message: "productIds no puede estar vacío." };
  const productIds: number[] = [];
  for (const raw of value) {
    const id = parsePositiveInt(raw);
    if (id === null) return { success: false, message: "productIds debe contener ids numéricos válidos." };
    if (!productIds.includes(id)) productIds.push(id);
  }
  return { success: true, productIds };
};

// ─── Response helpers ─────────────────────────────────────────────────────────

const sendError = (res: Response, status: number, message: string, error?: string) => {
  res.status(status).json({ success: false, message, ...(error ? { error } : {}) });
};

const badRequest = (res: Response, message: string) => sendError(res, 400, message);

const handlePromotionError = (res: Response, error: unknown, fallback: string) => {
  const err = error as { message?: string; code?: string };

  if (err.message === "PROMOTION_NOT_FOUND" || err.code === "P2025") {
    sendError(res, 404, "Promocion no encontrada.");
    return;
  }
  if (err.message === "PRODUCT_NOT_FOUND") {
    sendError(res, 404, "Producto no encontrado.");
    return;
  }
  if (err.message === "PRODUCT_INACTIVE") {
    sendError(res, 400, "Producto inactivo.");
    return;
  }
  if (err.message === "PROMOTION_PRODUCT_NOT_FOUND") {
    sendError(res, 404, "El producto no está asignado a esta promoción");
    return;
  }
  if (err.message === "PROMOTION_OVERLAP") {
    sendError(res, 409, "Uno o más productos ya tienen una promoción activa en el rango de fechas seleccionado");
    return;
  }
  if (err.code === "P2002") {
    sendError(res, 409, "La relacion de promocion y producto ya existe.");
    return;
  }

  sendError(res, 500, fallback, err.message);
};

// ─── Exported controller functions ───────────────────────────────────────────

export const listPromotionTypes = async (_req: Request, res: Response): Promise<void> => {
  try {
    const promotionTypes = await getPromotionTypes();
    res.status(200).json({ promotionTypes });
  } catch (error: unknown) {
    handlePromotionError(res, error, "Error al listar tipos de promocion.");
  }
};

export const listActiveProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const products = await getActiveProductsForPromotions(search);
    res.status(200).json({ products });
  } catch (error: unknown) {
    handlePromotionError(res, error, "Error al listar productos activos.");
  }
};

export const listPromotions = async (req: Request, res: Response): Promise<void> => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const promotions = await getPromotions(search);
    res.status(200).json({ promotions });
  } catch (error: unknown) {
    handlePromotionError(res, error, "Error al listar promociones.");
  }
};

export const getPromotionDetail = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (id === null) { badRequest(res, "Identificador de promocion invalido."); return; }

    const promotion = await getPromotionById(id);
    if (!promotion) { sendError(res, 404, "Promocion no encontrada."); return; }

    res.status(200).json({ promotion });
  } catch (error: unknown) {
    handlePromotionError(res, error, "Error al obtener la promocion.");
  }
};

export const postPromotion = async (req: Request, res: Response): Promise<void> => {
  try {
    const promotion = await createPromotion(req.body, { defaultIsActive: true });
    res.status(201).json({ message: "Promocion creada exitosamente.", promotion });
  } catch (error: unknown) {
    if (error instanceof AppError) { badRequest(res, error.message); return; }
    handlePromotionError(res, error, "Error al crear la promocion.");
  }
};

export const putPromotion = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (id === null) { badRequest(res, "Identificador de promocion invalido."); return; }

    const promotion = await updatePromotion(id, req.body, { requireIsActive: true });
    res.status(200).json({ message: "Promocion actualizada exitosamente.", promotion });
  } catch (error: unknown) {
    if (error instanceof AppError) { badRequest(res, error.message); return; }
    handlePromotionError(res, error, "Error al actualizar la promocion.");
  }
};

export const patchPromotionStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (id === null) { badRequest(res, "Identificador de promocion invalido."); return; }

    const { isActive } = req.body;
    if (typeof isActive !== "boolean") { badRequest(res, "El estado de la promocion debe ser true o false."); return; }

    const promotion = await updatePromotionStatus(id, isActive);
    res.status(200).json({ message: "Estado de promocion actualizado exitosamente.", promotion });
  } catch (error: unknown) {
    handlePromotionError(res, error, "Error al actualizar el estado de la promocion.");
  }
};

export const postPromotionProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (id === null) { badRequest(res, "Identificador de promocion invalido."); return; }

    const parsedProductIds = parseProductIds(req.body.productIds);
    if (!parsedProductIds.success) { badRequest(res, parsedProductIds.message); return; }

    const promotion = await addProductsToPromotion(id, parsedProductIds.productIds);
    res.status(200).json({ message: "Productos asignados exitosamente.", promotion });
  } catch (error: unknown) {
    handlePromotionError(res, error, "Error al asignar productos a la promocion.");
  }
};

export const putPromotionProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (id === null) { badRequest(res, "Identificador de promocion invalido."); return; }

    const parsedProductIds = parseProductIds(req.body.productIds);
    if (!parsedProductIds.success) { badRequest(res, parsedProductIds.message); return; }

    const promotion = await syncPromotionProducts(id, parsedProductIds.productIds);
    res.status(200).json({ message: "Productos de la promocion sincronizados exitosamente.", promotion });
  } catch (error: unknown) {
    handlePromotionError(res, error, "Error al sincronizar productos de la promocion.");
  }
};

export const deletePromotionProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parsePositiveInt(req.params.id);
    const productId = parsePositiveInt(req.params.productId);
    if (id === null || productId === null) { badRequest(res, "Identificador de promocion o producto invalido."); return; }

    const promotion = await deleteProductFromPromotion(id, productId);
    res.status(200).json({ message: "Producto removido de la promocion exitosamente.", promotion });
  } catch (error: unknown) {
    handlePromotionError(res, error, "Error al remover el producto de la promocion.");
  }
};
