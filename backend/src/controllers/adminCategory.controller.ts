import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { AppError } from "../utils/AppError";
import { logger } from "../utils/logger";
import {
  CategoryTextInput,
  CreateCategoryInput,
  ProductListFilters,
  createCategory as createCategoryService,
  updateCategory as updateCategoryService,
  updateCategoryStatus as updateCategoryStatusService,
  deleteCategory as deleteCategoryService,
  getCategoryDetail as getCategoryDetailService,
  getCategoryTree as getCategoryTreeService,
  listCategoriesFlat as listCategoriesFlatService,
  listCategoryProducts as listCategoryProductsService,
  replaceCategoryProducts as replaceCategoryProductsService,
  addCategoryProducts as addCategoryProductsService,
  removeCategoryProduct as removeCategoryProductService,
  listUncategorizedProducts as listUncategorizedProductsService,
  reassignCategoryProducts as reassignCategoryProductsService,
  isCategoryLevel,
} from "../services/adminCategory.service";

type ParseResult<T> = { success: true; value: T } | { success: false; message: string };

const hasOwn = (body: Record<string, unknown>, field: string): boolean =>
  Object.prototype.hasOwnProperty.call(body, field);

const getBodyRecord = (body: unknown): Record<string, unknown> =>
  typeof body === "object" && body !== null && !Array.isArray(body) ? body as Record<string, unknown> : {};

const sendError = (res: Response, status: number, message: string, error?: string): void => {
  res.status(status).json({ success: false, message, ...(error ? { error } : {}) });
};

const sendSuccess = <T>(
  res: Response,
  status: number,
  message: string,
  data: T
): void => {
  res.status(status).json({ success: true, message, data });
};

const parsePositiveInt = (value: unknown): number | null => {
  if (typeof value === "boolean") return null;
  if (typeof value === "string" && !value.trim()) return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const parseOptionalPositiveInt = (value: unknown, label: string): ParseResult<number | undefined> => {
  if (value === undefined || value === null || value === "") {
    return { success: true, value: undefined };
  }
  const parsed = parsePositiveInt(value);
  if (parsed === null) {
    return { success: false, message: `${label} debe ser un numero entero positivo.` };
  }
  return { success: true, value: parsed };
};

const parseOptionalQueryString = (value: unknown, label: string): ParseResult<string | undefined> => {
  if (value === undefined) return { success: true, value: undefined };
  if (typeof value !== "string") {
    return { success: false, message: `${label} debe ser texto.` };
  }
  const trimmed = value.trim();
  return { success: true, value: trimmed ? trimmed : undefined };
};

const parseOptionalBooleanQuery = (
  value: unknown,
  label: string,
  defaultValue?: boolean
): ParseResult<boolean | undefined> => {
  if (value === undefined) return { success: true, value: defaultValue };
  if (typeof value === "boolean") return { success: true, value };
  if (typeof value !== "string") {
    return { success: false, message: `${label} debe ser true o false.` };
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return { success: true, value: true };
  if (normalized === "false") return { success: true, value: false };
  return { success: false, message: `${label} debe ser true o false.` };
};

const parseRequiredText = (value: unknown, label: string, maxLength: number): ParseResult<string> => {
  if (typeof value !== "string") {
    return { success: false, message: `${label} es obligatorio.` };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { success: false, message: `${label} es obligatorio.` };
  }
  if (trimmed.length > maxLength) {
    return { success: false, message: `${label} no puede exceder ${maxLength} caracteres.` };
  }
  return { success: true, value: trimmed };
};

const parseOptionalText = (value: unknown, label: string, maxLength: number): ParseResult<string | null> => {
  if (value === undefined || value === null || value === "") {
    return { success: true, value: null };
  }
  if (typeof value !== "string") {
    return { success: false, message: `${label} debe ser texto.` };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { success: true, value: null };
  }
  if (trimmed.length > maxLength) {
    return { success: false, message: `${label} no puede exceder ${maxLength} caracteres.` };
  }
  return { success: true, value: trimmed };
};

const parseCategoryTextFields = (body: Record<string, unknown>): ParseResult<CategoryTextInput> => {
  const name = parseRequiredText(body.name, "El nombre de la categoria", 30);
  if (!name.success) return name;

  const description = parseOptionalText(body.description, "La descripcion", 50);
  if (!description.success) return description;

  const color = parseOptionalText(body.color, "El color", 20);
  if (!color.success) return color;

  const icon = parseOptionalText(body.icon, "El icono", 50);
  if (!icon.success) return icon;

  return {
    success: true,
    value: {
      name: name.value,
      description: description.value,
      color: color.value,
      icon: icon.value,
    },
  };
};

const parseProductIds = (value: unknown): ParseResult<number[]> => {
  if (!Array.isArray(value)) {
    return { success: false, message: "productIds debe ser un arreglo de ids numericos." };
  }

  const productIds: number[] = [];
  for (const raw of value) {
    const productId = parsePositiveInt(raw);
    if (productId === null) {
      return { success: false, message: "productIds debe contener ids numericos positivos." };
    }
    if (!productIds.includes(productId)) {
      productIds.push(productId);
    }
  }

  return { success: true, value: productIds };
};

const parsePagination = (pageValue: unknown, limitValue: unknown): ParseResult<{ page: number; limit: number }> => {
  const page = pageValue === undefined ? 1 : parsePositiveInt(pageValue);
  if (page === null) {
    return { success: false, message: "page debe ser un numero entero positivo." };
  }

  const limit = limitValue === undefined ? 20 : parsePositiveInt(limitValue);
  if (limit === null) {
    return { success: false, message: "limit debe ser un numero entero positivo." };
  }

  return { success: true, value: { page, limit } };
};

const parseProductListFilters = (req: Request): ParseResult<ProductListFilters> => {
  const search = parseOptionalQueryString(req.query.search, "search");
  if (!search.success) return search;

  const includeInactive = parseOptionalBooleanQuery(req.query.includeInactive, "includeInactive", false);
  if (!includeInactive.success) return includeInactive;

  const pagination = parsePagination(req.query.page, req.query.limit);
  if (!pagination.success) return pagination;

  return {
    success: true,
    value: {
      search: search.value,
      includeInactive: includeInactive.value ?? false,
      page: pagination.value.page,
      limit: pagination.value.limit,
    },
  };
};

const parseCreateCategoryInput = (body: Record<string, unknown>): ParseResult<CreateCategoryInput> => {
  if (hasOwn(body, "code")) {
    return { success: false, message: "El codigo se genera automaticamente; no envies code." };
  }

  const textFields = parseCategoryTextFields(body);
  if (!textFields.success) return textFields;

  const levelValue = typeof body.level === "string" ? body.level.trim().toUpperCase() : "";
  if (!isCategoryLevel(levelValue)) {
    return { success: false, message: "level debe ser DIVISION, DEPARTMENT o CATEGORY." };
  }

  const parentId = parseOptionalPositiveInt(body.parentId, "parentId");
  if (!parentId.success) return parentId;

  const divisionPrefix = body.divisionPrefix === undefined || body.divisionPrefix === null
    ? undefined
    : String(body.divisionPrefix);

  return {
    success: true,
    value: {
      ...textFields.value,
      level: levelValue,
      parentId: parentId.value,
      divisionPrefix,
    },
  };
};

const handleCategoryError = (res: Response, error: unknown, fallback: string): void => {
  if (error instanceof AppError) {
    sendError(res, error.statusCode, error.message);
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      sendError(res, 409, "Ya existe una categoria con ese nombre o codigo.");
      return;
    }
    if (error.code === "P2025") {
      sendError(res, 404, "Categoria no encontrada.");
      return;
    }
    sendError(res, 400, "Error en la operacion de base de datos.", error.code);
    return;
  }

  const message = error instanceof Error ? error.message : undefined;
  logger.error(fallback, error);
  sendError(res, 500, fallback, message);
};

export const getCategoryTree = async (_req: Request, res: Response): Promise<void> => {
  try {
    const categories = await getCategoryTreeService();
    sendSuccess(res, 200, "Categorias obtenidas exitosamente.", categories);
  } catch (error: unknown) {
    handleCategoryError(res, error, "Error al obtener el arbol de categorias.");
  }
};

export const getCategoriesFlat = async (req: Request, res: Response): Promise<void> => {
  try {
    const search = parseOptionalQueryString(req.query.search, "search");
    if (!search.success) { sendError(res, 400, search.message); return; }

    const levelQuery = parseOptionalQueryString(req.query.level, "level");
    if (!levelQuery.success) { sendError(res, 400, levelQuery.message); return; }

    const level = levelQuery.value ? levelQuery.value.toUpperCase() : undefined;
    if (level !== undefined && !isCategoryLevel(level)) {
      sendError(res, 400, "level debe ser DIVISION, DEPARTMENT o CATEGORY.");
      return;
    }

    const active = parseOptionalBooleanQuery(req.query.active, "active");
    if (!active.success) { sendError(res, 400, active.message); return; }

    const includeInactive = parseOptionalBooleanQuery(req.query.includeInactive, "includeInactive", false);
    if (!includeInactive.success) { sendError(res, 400, includeInactive.message); return; }

    const onlyFinal = parseOptionalBooleanQuery(req.query.onlyFinal, "onlyFinal", false);
    if (!onlyFinal.success) { sendError(res, 400, onlyFinal.message); return; }

    const parentId = parseOptionalPositiveInt(req.query.parentId, "parentId");
    if (!parentId.success) { sendError(res, 400, parentId.message); return; }

    const categories = await listCategoriesFlatService({
      search: search.value,
      level,
      active: active.value,
      parentId: parentId.value,
      includeInactive: includeInactive.value ?? false,
      onlyFinal: onlyFinal.value ?? false,
    });

    sendSuccess(res, 200, "Categorias obtenidas exitosamente.", categories);
  } catch (error: unknown) {
    handleCategoryError(res, error, "Error al listar categorias.");
  }
};

export const getCategoryDetail = async (req: Request, res: Response): Promise<void> => {
  try {
    const categoryId = parsePositiveInt(req.params.id);
    if (categoryId === null) {
      sendError(res, 400, "El id de categoria es invalido.");
      return;
    }

    const category = await getCategoryDetailService(categoryId);
    sendSuccess(res, 200, "Categoria obtenida exitosamente.", category);
  } catch (error: unknown) {
    handleCategoryError(res, error, "Error al obtener la categoria.");
  }
};

export const createCategory = async (req: Request, res: Response): Promise<void> => {
  try {
    const body = getBodyRecord(req.body);
    const parsed = parseCreateCategoryInput(body);
    if (!parsed.success) {
      sendError(res, 400, parsed.message);
      return;
    }

    const category = await createCategoryService(parsed.value);
    sendSuccess(res, 201, "Categoria creada exitosamente.", category);
  } catch (error: unknown) {
    handleCategoryError(res, error, "Error al crear la categoria.");
  }
};

export const updateCategory = async (req: Request, res: Response): Promise<void> => {
  try {
    const categoryId = parsePositiveInt(req.params.id);
    if (categoryId === null) {
      sendError(res, 400, "El id de categoria es invalido.");
      return;
    }

    const body = getBodyRecord(req.body);
    const forbiddenField = ["code", "level", "parentId", "active"].find((field) => hasOwn(body, field));
    if (forbiddenField) {
      sendError(res, 400, `No se puede modificar ${forbiddenField} desde este endpoint.`);
      return;
    }

    const parsed = parseCategoryTextFields(body);
    if (!parsed.success) {
      sendError(res, 400, parsed.message);
      return;
    }

    const category = await updateCategoryService(categoryId, parsed.value);
    sendSuccess(res, 200, "Categoria actualizada exitosamente.", category);
  } catch (error: unknown) {
    handleCategoryError(res, error, "Error al actualizar la categoria.");
  }
};

export const updateCategoryStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const categoryId = parsePositiveInt(req.params.id);
    if (categoryId === null) {
      sendError(res, 400, "El id de categoria es invalido.");
      return;
    }

    const body = getBodyRecord(req.body);
    if (typeof body.active !== "boolean") {
      sendError(res, 400, "active debe ser true o false.");
      return;
    }

    const category = await updateCategoryStatusService(categoryId, body.active);
    sendSuccess(res, 200, "Estado de categoria actualizado exitosamente.", category);
  } catch (error: unknown) {
    handleCategoryError(res, error, "Error al actualizar el estado de la categoria.");
  }
};

export const deleteCategory = async (req: Request, res: Response): Promise<void> => {
  try {
    const categoryId = parsePositiveInt(req.params.id);
    if (categoryId === null) {
      sendError(res, 400, "El id de categoria es invalido.");
      return;
    }

    const category = await deleteCategoryService(categoryId);
    sendSuccess(res, 200, "Categoria eliminada exitosamente.", category);
  } catch (error: unknown) {
    handleCategoryError(res, error, "Error al eliminar la categoria.");
  }
};

export const getCategoryProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const categoryId = parsePositiveInt(req.params.id);
    if (categoryId === null) {
      sendError(res, 400, "El id de categoria es invalido.");
      return;
    }

    const filters = parseProductListFilters(req);
    if (!filters.success) {
      sendError(res, 400, filters.message);
      return;
    }

    const result = await listCategoryProductsService(categoryId, filters.value);
    sendSuccess(res, 200, "Productos de la categoria obtenidos exitosamente.", result);
  } catch (error: unknown) {
    handleCategoryError(res, error, "Error al obtener productos de la categoria.");
  }
};

export const replaceCategoryProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const categoryId = parsePositiveInt(req.params.id);
    if (categoryId === null) {
      sendError(res, 400, "El id de categoria es invalido.");
      return;
    }

    const body = getBodyRecord(req.body);
    const parsedProductIds = parseProductIds(body.productIds);
    if (!parsedProductIds.success) {
      sendError(res, 400, parsedProductIds.message);
      return;
    }

    const result = await replaceCategoryProductsService(categoryId, parsedProductIds.value);
    sendSuccess(res, 200, "Productos de la categoria actualizados exitosamente.", result);
  } catch (error: unknown) {
    handleCategoryError(res, error, "Error al actualizar productos de la categoria.");
  }
};

export const addCategoryProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const categoryId = parsePositiveInt(req.params.id);
    if (categoryId === null) {
      sendError(res, 400, "El id de categoria es invalido.");
      return;
    }

    const body = getBodyRecord(req.body);
    const parsedProductIds = parseProductIds(body.productIds);
    if (!parsedProductIds.success) {
      sendError(res, 400, parsedProductIds.message);
      return;
    }

    const result = await addCategoryProductsService(categoryId, parsedProductIds.value);
    sendSuccess(res, 200, "Productos agregados a la categoria exitosamente.", result);
  } catch (error: unknown) {
    handleCategoryError(res, error, "Error al agregar productos a la categoria.");
  }
};

export const removeCategoryProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const categoryId = parsePositiveInt(req.params.id);
    const productId = parsePositiveInt(req.params.productId);
    if (categoryId === null || productId === null) {
      sendError(res, 400, "El id de categoria o producto es invalido.");
      return;
    }

    const result = await removeCategoryProductService(categoryId, productId);
    sendSuccess(res, 200, "Producto desvinculado de la categoria exitosamente.", result);
  } catch (error: unknown) {
    handleCategoryError(res, error, "Error al desvincular producto de la categoria.");
  }
};

export const getUncategorizedProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const filters = parseProductListFilters(req);
    if (!filters.success) {
      sendError(res, 400, filters.message);
      return;
    }

    const result = await listUncategorizedProductsService(filters.value);
    sendSuccess(res, 200, "Productos sin categoria nueva obtenidos exitosamente.", result);
  } catch (error: unknown) {
    handleCategoryError(res, error, "Error al obtener productos sin categoria nueva.");
  }
};

export const reassignCategoryProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const sourceCategoryId = parsePositiveInt(req.params.id);
    if (sourceCategoryId === null) {
      sendError(res, 400, "El id de categoria origen es invalido.");
      return;
    }

    const body = getBodyRecord(req.body);
    const targetCategoryId = parsePositiveInt(body.targetCategoryId);
    if (targetCategoryId === null) {
      sendError(res, 400, "targetCategoryId debe ser un numero entero positivo.");
      return;
    }

    const parsedProductIds = parseProductIds(body.productIds);
    if (!parsedProductIds.success) {
      sendError(res, 400, parsedProductIds.message);
      return;
    }

    const result = await reassignCategoryProductsService(sourceCategoryId, targetCategoryId, parsedProductIds.value);
    sendSuccess(res, 200, "Productos reasignados exitosamente.", result);
  } catch (error: unknown) {
    handleCategoryError(res, error, "Error al reasignar productos.");
  }
};
