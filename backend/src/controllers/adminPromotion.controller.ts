import { Request, Response } from "express";
import {
  addProductsToPromotion,
  createPromotion,
  deleteProductFromPromotion,
  getActiveProductsForPromotions,
  getPromotionById,
  getPromotions,
  getPromotionTypeById,
  getPromotionTypes,
  syncPromotionProducts,
  updatePromotion,
  updatePromotionStatus,
  type PromotionPayload,
} from "../services/adminPromotion.service";

type PromotionRule = "percentage" | "fixedAmount" | "buyXPayY" | "specialPrice";

const parsePositiveInt = (value: unknown): number | null => {
  if (typeof value === "boolean") {
    return null;
  }
  if (typeof value === "string" && !value.trim()) {
    return null;
  }
  if (typeof value !== "number" && typeof value !== "string") {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const parseNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "boolean") {
    return null;
  }
  if (typeof value === "string" && !value.trim()) {
    return null;
  }
  if (typeof value !== "number" && typeof value !== "string") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseNullablePositiveInt = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "boolean") {
    return null;
  }
  if (typeof value === "string" && !value.trim()) {
    return null;
  }
  if (typeof value !== "number" && typeof value !== "string") {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
};

const parseDate = (value: unknown, endOfDay = false): Date | null => {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const raw = value.trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`)
    : new Date(raw);

  return Number.isNaN(date.getTime()) ? null : date;
};

type ProductIdsParseResult =
  | { success: true; productIds: number[] }
  | { success: false; message: string };

const parseProductIds = (value: unknown): ProductIdsParseResult => {
  if (value === undefined) {
    return { success: false, message: "productIds es requerido." };
  }

  if (!Array.isArray(value)) {
    return { success: false, message: "productIds debe ser un arreglo." };
  }

  if (value.length === 0) {
    return { success: false, message: "productIds no puede estar vac\u00edo." };
  }

  const productIds: number[] = [];
  for (const raw of value) {
    const id = parsePositiveInt(raw);
    if (id === null) {
      return { success: false, message: "productIds debe contener ids num\u00e9ricos v\u00e1lidos." };
    }
    if (!productIds.includes(id)) {
      productIds.push(id);
    }
  }

  return { success: true, productIds };
};

type BooleanParseResult =
  | { success: true; value: boolean }
  | { success: false; message: string };

const parseOptionalBoolean = (
  value: unknown,
  defaultValue: boolean,
  requireValue = false,
): BooleanParseResult => {
  if (value === undefined) {
    return requireValue
      ? { success: false, message: "El estado de la promocion debe ser true o false." }
      : { success: true, value: defaultValue };
  }

  if (typeof value !== "boolean") {
    return { success: false, message: "El estado de la promocion debe ser true o false." };
  }

  return { success: true, value };
};

const getRule = (typeName: string): PromotionRule | null => {
  const normalized = typeName.toLowerCase().replace(/\s+/g, "");

  if (normalized.includes("percentage") || normalized.includes("porcentaje")) {
    return "percentage";
  }
  if (normalized.includes("fixedamount") || normalized.includes("montofijo") || normalized.includes("fixed")) {
    return "fixedAmount";
  }
  if (
    normalized.includes("buyxpayy") ||
    normalized.includes("nxm") ||
    normalized.includes("2x1") ||
    normalized.includes("3x2")
  ) {
    return "buyXPayY";
  }
  if (normalized.includes("specialprice") || normalized.includes("precioespecial")) {
    return "specialPrice";
  }

  return null;
};

const sendError = (res: Response, status: number, message: string, error?: string) => {
  res.status(status).json({
    success: false,
    message,
    ...(error ? { error } : {}),
  });
};

const badRequest = (res: Response, message: string) => {
  sendError(res, 400, message);
};

interface BuildPromotionPayloadOptions {
  defaultIsActive?: boolean;
  requireIsActive?: boolean;
}

const buildPromotionPayload = async (
  body: Record<string, unknown>,
  options: BuildPromotionPayloadOptions = {},
): Promise<PromotionPayload | string> => {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return "El nombre de la promocion es obligatorio.";
  }

  const promotionTypeId = parsePositiveInt(body.promotionTypeId);
  if (promotionTypeId === null) {
    return "El tipo de promocion es obligatorio.";
  }

  const type = await getPromotionTypeById(promotionTypeId);
  if (!type) {
    return "El tipo de promocion seleccionado no existe.";
  }

  const startDate = parseDate(body.startDate);
  const endDate = parseDate(body.endDate, true);
  if (!startDate || !endDate) {
    return "La fecha inicial y final son obligatorias.";
  }
  if (endDate <= startDate) {
    return "La fecha final debe ser mayor que la fecha inicial.";
  }

  const parsedIsActive = parseOptionalBoolean(
    body.isActive,
    options.defaultIsActive ?? true,
    options.requireIsActive ?? false,
  );
  if (!parsedIsActive.success) {
    return parsedIsActive.message;
  }

  const parsedProductIds = parseProductIds(body.productIds);
  if (!parsedProductIds.success) {
    return parsedProductIds.message;
  }

  const rule = getRule(type.name);
  if (!rule) {
    return "El tipo de promocion no tiene reglas administrativas configuradas.";
  }

  let value = parseNullableNumber(body.value);
  let minQuantity = parseNullablePositiveInt(body.minQuantity);
  let payQuantity = parseNullablePositiveInt(body.payQuantity);
  let specialPrice = parseNullableNumber(body.specialPrice);

  if (rule === "percentage") {
    if (value === null || value <= 0 || value > 100) {
      return "El porcentaje debe ser mayor a 0 y menor o igual a 100.";
    }
    minQuantity = null;
    payQuantity = null;
    specialPrice = null;
  }

  if (rule === "fixedAmount") {
    if (value === null || value <= 0) {
      return "El monto fijo debe ser mayor a 0.";
    }
    minQuantity = null;
    payQuantity = null;
    specialPrice = null;
  }

  if (rule === "buyXPayY") {
    if (minQuantity === null || minQuantity < 2) {
      return "La cantidad minima debe ser mayor o igual a 2.";
    }
    if (payQuantity === null || payQuantity < 1) {
      return "La cantidad a pagar debe ser mayor o igual a 1.";
    }
    if (payQuantity >= minQuantity) {
      return "La cantidad a pagar debe ser menor que la cantidad minima.";
    }
    value = null;
    specialPrice = null;
  }

  if (rule === "specialPrice") {
    if (minQuantity === null || minQuantity < 1) {
      return "La cantidad minima debe ser mayor o igual a 1.";
    }
    if (specialPrice === null || specialPrice <= 0) {
      return "El precio especial debe ser mayor a 0.";
    }
    value = null;
    payQuantity = null;
  }

  return {
    name,
    description: typeof body.description === "string" && body.description.trim() ? body.description.trim() : null,
    promotionTypeId,
    startDate,
    endDate,
    isActive: parsedIsActive.value,
    value,
    minQuantity,
    payQuantity,
    specialPrice,
    productIds: parsedProductIds.productIds,
  };
};

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
    sendError(res, 404, "El producto no est\u00e1 asignado a esta promoci\u00f3n");
    return;
  }

  if (err.message === "PROMOTION_OVERLAP") {
    sendError(res, 409, "Uno o m\u00e1s productos ya tienen una promoci\u00f3n activa en el rango de fechas seleccionado");
    return;
  }

  if (err.code === "P2002") {
    sendError(res, 409, "La relacion de promocion y producto ya existe.");
    return;
  }

  sendError(res, 500, fallback, err.message);
};

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
    if (id === null) {
      badRequest(res, "Identificador de promocion invalido.");
      return;
    }

    const promotion = await getPromotionById(id);
    if (!promotion) {
      sendError(res, 404, "Promocion no encontrada.");
      return;
    }

    res.status(200).json({ promotion });
  } catch (error: unknown) {
    handlePromotionError(res, error, "Error al obtener la promocion.");
  }
};

export const postPromotion = async (req: Request, res: Response): Promise<void> => {
  try {
    const payload = await buildPromotionPayload(req.body, { defaultIsActive: true });
    if (typeof payload === "string") {
      badRequest(res, payload);
      return;
    }

    const promotion = await createPromotion(payload);
    res.status(201).json({ message: "Promocion creada exitosamente.", promotion });
  } catch (error: unknown) {
    handlePromotionError(res, error, "Error al crear la promocion.");
  }
};

export const putPromotion = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (id === null) {
      badRequest(res, "Identificador de promocion invalido.");
      return;
    }

    const payload = await buildPromotionPayload(req.body, { requireIsActive: true });
    if (typeof payload === "string") {
      badRequest(res, payload);
      return;
    }

    const promotion = await updatePromotion(id, payload);
    res.status(200).json({ message: "Promocion actualizada exitosamente.", promotion });
  } catch (error: unknown) {
    handlePromotionError(res, error, "Error al actualizar la promocion.");
  }
};

export const patchPromotionStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (id === null) {
      badRequest(res, "Identificador de promocion invalido.");
      return;
    }

    const { isActive } = req.body;
    if (typeof isActive !== "boolean") {
      badRequest(res, "El estado de la promocion debe ser true o false.");
      return;
    }

    const promotion = await updatePromotionStatus(id, isActive);
    res.status(200).json({ message: "Estado de promocion actualizado exitosamente.", promotion });
  } catch (error: unknown) {
    handlePromotionError(res, error, "Error al actualizar el estado de la promocion.");
  }
};

export const postPromotionProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (id === null) {
      badRequest(res, "Identificador de promocion invalido.");
      return;
    }

    const parsedProductIds = parseProductIds(req.body.productIds);
    if (!parsedProductIds.success) {
      badRequest(res, parsedProductIds.message);
      return;
    }

    const promotion = await addProductsToPromotion(id, parsedProductIds.productIds);
    res.status(200).json({ message: "Productos asignados exitosamente.", promotion });
  } catch (error: unknown) {
    handlePromotionError(res, error, "Error al asignar productos a la promocion.");
  }
};

export const putPromotionProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (id === null) {
      badRequest(res, "Identificador de promocion invalido.");
      return;
    }

    const parsedProductIds = parseProductIds(req.body.productIds);
    if (!parsedProductIds.success) {
      badRequest(res, parsedProductIds.message);
      return;
    }

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
    if (id === null || productId === null) {
      badRequest(res, "Identificador de promocion o producto invalido.");
      return;
    }

    const promotion = await deleteProductFromPromotion(id, productId);
    res.status(200).json({ message: "Producto removido de la promocion exitosamente.", promotion });
  } catch (error: unknown) {
    handlePromotionError(res, error, "Error al remover el producto de la promocion.");
  }
};
