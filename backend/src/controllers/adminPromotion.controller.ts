import { Request, Response } from "express";
import { AppError } from "../utils/AppError";
import {
  AvailablePromotionProductsScope,
  addProductsToPromotion,
  createPromotion,
  deleteProductFromPromotion,
  getActiveProductsForPromotions,
  listAvailableProductsForPromotion,
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

type ParseResult<T> = { success: true; value: T } | { success: false; message: string };

const availableProductScopes: AvailablePromotionProductsScope[] = [
  "ALL",
  "DIVISION",
  "DEPARTMENT",
  "CATEGORY",
  "UNCATEGORIZED",
];

const parseOptionalQueryString = (value: unknown, label: string): ParseResult<string | undefined> => {
  if (value === undefined) return { success: true, value: undefined };
  if (typeof value !== "string") return { success: false, message: `${label} debe ser texto.` };
  const trimmed = value.trim();
  return { success: true, value: trimmed ? trimmed : undefined };
};

const parseOptionalBooleanQuery = (
  value: unknown,
  label: string,
  defaultValue: boolean
): ParseResult<boolean> => {
  if (value === undefined) return { success: true, value: defaultValue };
  if (typeof value === "boolean") return { success: true, value };
  if (typeof value !== "string") return { success: false, message: `${label} debe ser true o false.` };

  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return { success: true, value: true };
  if (normalized === "false") return { success: true, value: false };
  return { success: false, message: `${label} debe ser true o false.` };
};

const parseOptionalPositiveInt = (value: unknown, label: string): ParseResult<number | undefined> => {
  if (value === undefined || value === null || value === "") return { success: true, value: undefined };
  const parsed = parsePositiveInt(value);
  if (parsed === null) return { success: false, message: `${label} debe ser un numero entero positivo.` };
  return { success: true, value: parsed };
};

const parsePagination = (pageValue: unknown, limitValue: unknown): ParseResult<{ page: number; limit: number }> => {
  const page = pageValue === undefined ? 1 : parsePositiveInt(pageValue);
  if (page === null) return { success: false, message: "page debe ser un numero entero positivo." };

  const limit = limitValue === undefined ? 10 : parsePositiveInt(limitValue);
  if (limit === null) return { success: false, message: "limit debe ser un numero entero positivo." };

  return { success: true, value: { page, limit } };
};

const parseAvailableProductsScope = (value: unknown): ParseResult<AvailablePromotionProductsScope> => {
  if (value === undefined) return { success: true, value: "ALL" };
  if (typeof value !== "string") {
    return { success: false, message: "scope debe ser ALL, DIVISION, DEPARTMENT, CATEGORY o UNCATEGORIZED." };
  }

  const scope = value.trim().toUpperCase();
  if (!availableProductScopes.includes(scope as AvailablePromotionProductsScope)) {
    return { success: false, message: "scope debe ser ALL, DIVISION, DEPARTMENT, CATEGORY o UNCATEGORIZED." };
  }
  return { success: true, value: scope as AvailablePromotionProductsScope };
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
    if (productIds.includes(id)) {
      return { success: false, message: "No se permiten productos duplicados en la promocion." };
    }
    productIds.push(id);
  }
  return { success: true, productIds };
};

// ─── Response helpers ─────────────────────────────────────────────────────────

const sendError = (res: Response, status: number, message: string, error?: string) => {
  res.status(status).json({ success: false, message, ...(error ? { error } : {}) });
};

const badRequest = (res: Response, message: string) => sendError(res, 400, message);

const handlePromotionError = (res: Response, error: unknown, fallback: string) => {
  const err = error as { message?: string; code?: string; statusCode?: number };

  if (err instanceof AppError || (err.statusCode && err.statusCode >= 400 && err.statusCode < 500)) {
    sendError(res, err.statusCode || 400, err.message || fallback);
    return;
  }
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

export const getAvailablePromotionProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (id === null) { badRequest(res, "Identificador de promocion invalido."); return; }

    const search = parseOptionalQueryString(req.query.search, "search");
    if (!search.success) { badRequest(res, search.message); return; }

    const scope = parseAvailableProductsScope(req.query.scope);
    if (!scope.success) { badRequest(res, scope.message); return; }

    const categoryId = parseOptionalPositiveInt(req.query.categoryId, "categoryId");
    if (!categoryId.success) { badRequest(res, categoryId.message); return; }

    const pagination = parsePagination(req.query.page, req.query.limit);
    if (!pagination.success) { badRequest(res, pagination.message); return; }

    const includeAssociated = parseOptionalBooleanQuery(req.query.includeAssociated, "includeAssociated", false);
    if (!includeAssociated.success) { badRequest(res, includeAssociated.message); return; }

    const data = await listAvailableProductsForPromotion(id, {
      search: search.value,
      scope: scope.value,
      categoryId: categoryId.value,
      page: pagination.value.page,
      limit: pagination.value.limit,
      includeAssociated: includeAssociated.value,
    });

    res.status(200).json({
      success: true,
      message: "Productos disponibles obtenidos correctamente.",
      data,
    });
  } catch (error: unknown) {
    handlePromotionError(res, error, "Error al obtener productos disponibles para la promocion.");
  }
};

export const postPromotion = async (req: Request, res: Response): Promise<void> => {
  try {
    const promotion = await createPromotion(req.body, { defaultIsActive: false, requireProductIds: false });
    res.status(201).json({ message: "Promocion creada exitosamente.", promotion });
  } catch (error: unknown) {
    if (error instanceof AppError) { badRequest(res, error.message); return; }
    handlePromotionError(res, error, "Error al crear la promocion.");
  }
};

export const putPromotion = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.params.id === "status") {
      const promotionId = Number(req.body.id);
      if (!Number.isInteger(promotionId) || promotionId <= 0) {
        throw new AppError("Identificador de promoción inválido.", 400);
      }

      if (typeof req.body.status !== "boolean") {
        throw new AppError("El estado de la promoción es obligatorio.", 400);
      }

      const promotion = await updatePromotionStatus(promotionId, req.body.status);
      res.status(200).json({ message: "Estado de promocion actualizado exitosamente.", promotion });
      return;
    }

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
