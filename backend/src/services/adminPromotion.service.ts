import { Prisma } from "@prisma/client";
import { prisma } from "../app";
import { AppError } from "../utils/AppError";
import { parseSearchWords } from "../utils/search.util";

const promotionInclude = Prisma.validator<Prisma.PromotionInclude>()({
  promotionType: true,
  products: {
    include: {
      product: {
        select: {
          id: true,
          sku: true,
          barcode: true,
          name: true,
          description: true,
          sellPrice: true,
          active: true,
          categories: {
            orderBy: { categoryId: "asc" },
            select: {
              category: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  level: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: { productId: "asc" },
  },
});

type PromotionWithRelations = Prisma.PromotionGetPayload<{ include: typeof promotionInclude }>;

const availableProductSelect = Prisma.validator<Prisma.ProductSelect>()({
  id: true,
  sku: true,
  barcode: true,
  name: true,
  description: true,
  costPrice: true,
  sellPrice: true,
  active: true,
  categories: {
    orderBy: { categoryId: "asc" },
    select: {
      category: {
        select: {
          id: true,
          code: true,
          name: true,
          level: true,
        },
      },
    },
  },
});

type AvailableProductPayload = Prisma.ProductGetPayload<{ select: typeof availableProductSelect }>;

export interface PromotionPayload {
  name: string;
  description: string | null;
  promotionTypeId: number;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  value: number | null;
  minQuantity: number | null;
  payQuantity: number | null;
  specialPrice: number | null;
  productIds: number[];
}

export interface BuildPromotionPayloadOptions {
  defaultIsActive?: boolean;
  requireIsActive?: boolean;
  requireProductIds?: boolean;
}

export type AvailablePromotionProductsScope =
  | "ALL"
  | "DIVISION"
  | "DEPARTMENT"
  | "CATEGORY"
  | "UNCATEGORIZED";

export interface AvailablePromotionProductsFilters {
  search?: string;
  scope: AvailablePromotionProductsScope;
  categoryId?: number;
  page: number;
  limit: number;
  includeAssociated: boolean;
}

export const mapPromotion = (promotion: PromotionWithRelations) => ({
  id: promotion.id,
  name: promotion.name,
  description: promotion.description,
  promotionTypeId: promotion.promotionTypeId,
  startDate: promotion.startDate,
  endDate: promotion.endDate,
  isActive: promotion.isActive,
  value: promotion.value !== null ? Number(promotion.value) : null,
  minQuantity: promotion.minQuantity,
  payQuantity: promotion.payQuantity,
  specialPrice: promotion.specialPrice !== null ? Number(promotion.specialPrice) : null,
  createdAt: promotion.createdAt,
  updatedAt: promotion.updatedAt,
  promotionType: promotion.promotionType,
  products: promotion.products.map((row) => ({
    id: row.id,
    promotionId: row.promotionId,
    productId: row.productId,
    product: {
      id: row.product.id,
      sku: row.product.sku,
      barcode: row.product.barcode,
      name: row.product.name,
      description: row.product.description,
      sellPrice: Number(row.product.sellPrice),
      active: row.product.active,
      categories: row.product.categories.map((categoryRow) => categoryRow.category),
    },
  })),
});

// ─── Private helpers for buildPromotionPayload ───────────────────────────────

type PromotionRule = "percentage" | "fixedAmount" | "buyXPayY" | "specialPrice";

const parsePositiveInt = (value: unknown): number | null => {
  if (typeof value === "boolean") return null;
  if (typeof value === "string" && !value.trim()) return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const parseNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return null;
  if (typeof value === "string" && !value.trim()) return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseNullablePositiveInt = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return null;
  if (typeof value === "string" && !value.trim()) return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
};

const parseDate = (value: unknown, endOfDay = false): Date | null => {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`)
    : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
};

type ProductIdsParseResult =
  | { success: true; productIds: number[] }
  | { success: false; message: string };

const parseProductIds = (value: unknown, required = true): ProductIdsParseResult => {
  if (value === undefined) {
    return required
      ? { success: false, message: "productIds es requerido." }
      : { success: true, productIds: [] };
  }
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

type BooleanParseResult = { success: true; value: boolean } | { success: false; message: string };

const parseOptionalBoolean = (
  value: unknown,
  defaultValue: boolean,
  requireValue = false
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
  if (normalized.includes("percentage") || normalized.includes("porcentaje")) return "percentage";
  if (normalized.includes("fixedamount") || normalized.includes("montofijo") || normalized.includes("fixed"))
    return "fixedAmount";
  if (normalized.includes("buyxpayy") || normalized.includes("nxm") || normalized.includes("2x1") || normalized.includes("3x2"))
    return "buyXPayY";
  if (normalized.includes("specialprice") || normalized.includes("precioespecial")) return "specialPrice";
  return null;
};

// ─── Validation / transformation (moved from controller) ─────────────────────

export const buildPromotionPayload = async (
  body: Record<string, unknown>,
  options: BuildPromotionPayloadOptions = {}
): Promise<PromotionPayload | string> => {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return "El nombre de la promocion es obligatorio.";

  const promotionTypeId = parsePositiveInt(body.promotionTypeId);
  if (promotionTypeId === null) return "El tipo de promocion es obligatorio.";

  const type = await getPromotionTypeById(promotionTypeId);
  if (!type) return "El tipo de promocion seleccionado no existe.";

  const startDate = parseDate(body.startDate);
  const endDate = parseDate(body.endDate, true);
  if (!startDate || !endDate) return "La fecha inicial y final son obligatorias.";
  if (endDate < startDate) return "La fecha inicial no puede ser posterior a la fecha final.";

  const parsedIsActive = parseOptionalBoolean(
    body.isActive,
    options.defaultIsActive ?? true,
    options.requireIsActive ?? false
  );
  if (!parsedIsActive.success) return parsedIsActive.message;

  if (parsedIsActive.value && endDate < new Date()) {
    return "No se puede activar una promocion que ya ha vencido.";
  }

  const parsedProductIds = parseProductIds(body.productIds, options.requireProductIds ?? true);
  if (!parsedProductIds.success) return parsedProductIds.message;

  const rule = getRule(type.name);
  if (!rule) return "El tipo de promocion no tiene reglas administrativas configuradas.";

  let value = parseNullableNumber(body.value);
  let minQuantity = parseNullablePositiveInt(body.minQuantity);
  let payQuantity = parseNullablePositiveInt(body.payQuantity);
  let specialPrice = parseNullableNumber(body.specialPrice);

  if (rule === "percentage") {
    if (value === null || value <= 0 || value >= 100) return "El porcentaje debe ser mayor a 0 y menor a 100.";
    const valueStr = String(value);
    const decimalParts = valueStr.split(".");
    if (decimalParts.length > 1 && decimalParts[1].length > 2) {
      return "El porcentaje no puede tener mas de dos decimales.";
    }
    minQuantity = null; payQuantity = null; specialPrice = null;
  }

  if (rule === "fixedAmount") {
    if (specialPrice === null || specialPrice <= 0) return "El precio especial debe ser mayor a 0.";
    value = null; minQuantity = null; payQuantity = null;
  }

  if (rule === "buyXPayY") {
    if (minQuantity === null || minQuantity < 2) return "La cantidad minima debe ser mayor o igual a 2.";
    if (payQuantity === null || payQuantity < 1) return "La cantidad a pagar debe ser mayor o igual a 1.";
    if (payQuantity >= minQuantity) return "La cantidad a pagar debe ser menor que la cantidad minima.";
    value = null; specialPrice = null;
  }

  if (rule === "specialPrice") {
    if (specialPrice === null || specialPrice <= 0) return "El precio especial debe ser mayor a 0.";
    value = null; minQuantity = null; payQuantity = null;
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

// ─── DB helpers ──────────────────────────────────────────────────────────────

const validateActiveProducts = async (tx: Prisma.TransactionClient, productIds: number[]) => {
  const uniqueProductIds = [...new Set(productIds)];
  const products = await tx.product.findMany({
    where: { id: { in: uniqueProductIds } },
    select: { id: true, active: true, sellPrice: true },
  });
  if (products.length !== uniqueProductIds.length) throw new Error("PRODUCT_NOT_FOUND");
  if (products.some((product) => !product.active)) throw new Error("PRODUCT_INACTIVE");
  return products;
};

const validateNoOverlappingActivePromotions = async (
  tx: Prisma.TransactionClient,
  productIds: number[],
  startDate: Date,
  endDate: Date,
  ignoredPromotionId?: number
) => {
  if (productIds.length === 0) return;
  const where: Prisma.PromotionWhereInput = {
    isActive: true,
    startDate: { lte: endDate },
    endDate: { gte: startDate },
    products: { some: { productId: { in: productIds } } },
  };
  if (ignoredPromotionId !== undefined) where.id = { not: ignoredPromotionId };
  const overlappingPromotion = await tx.promotion.findFirst({ where, select: { id: true } });
  if (overlappingPromotion) throw new Error("PROMOTION_OVERLAP");
};

const buildAvailableProductSearchWhere = (search?: string): Prisma.ProductWhereInput => {
  const rawTerms = search?.split(/\s+/).map((term) => term.trim()).filter(Boolean) ?? [];
  const normalizedTerms = search ? parseSearchWords(search) : [];
  const terms = [...new Set([...rawTerms, ...normalizedTerms])];
  if (terms.length === 0) return {};

  return {
    AND: terms.map((term) => ({
      OR: [
        { sku: { contains: term } },
        { sku: { contains: term.toUpperCase() } },
        { barcode: { contains: term } },
        { name: { contains: term } },
        { description: { contains: term } },
      ],
    })),
  };
};

const availableProductsPagination = (page: number, limit: number) => {
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 10;
  return {
    page: safePage,
    limit: safeLimit,
    skip: (safePage - 1) * safeLimit,
  };
};

const getFinalCategoryIdsForScope = async (
  scope: AvailablePromotionProductsScope,
  categoryId?: number
): Promise<number[] | undefined> => {
  if (scope === "ALL" || scope === "UNCATEGORIZED") return undefined;

  if (!categoryId) {
    throw new AppError("categoryId es obligatorio para el scope seleccionado.", 400);
  }

  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { id: true, level: true },
  });

  if (!category) {
    throw new AppError("Categoria no encontrada.", 404);
  }

  if (category.level !== scope) {
    throw new AppError("El level de la categoria no coincide con el scope solicitado.", 400);
  }

  if (scope === "CATEGORY") return [category.id];

  if (scope === "DEPARTMENT") {
    const categories = await prisma.category.findMany({
      where: { parentId: category.id, level: "CATEGORY" },
      select: { id: true },
    });
    return categories.map((row) => row.id);
  }

  const departments = await prisma.category.findMany({
    where: { parentId: category.id, level: "DEPARTMENT" },
    select: { id: true },
  });
  if (departments.length === 0) return [];

  const categories = await prisma.category.findMany({
    where: {
      parentId: { in: departments.map((department) => department.id) },
      level: "CATEGORY",
    },
    select: { id: true },
  });
  return categories.map((row) => row.id);
};

const mapAvailableProduct = (product: AvailableProductPayload, associatedIds: Set<number>) => ({
  id: product.id,
  sku: product.sku,
  barcode: product.barcode,
  name: product.name,
  description: product.description,
  costPrice: Number(product.costPrice),
  sellPrice: Number(product.sellPrice),
  active: product.active,
  alreadyAssociated: associatedIds.has(product.id),
  categories: product.categories.map((row) => row.category),
});

// ─── Public service functions ─────────────────────────────────────────────────

export const getPromotionTypes = () =>
  prisma.promotionType.findMany({ orderBy: { name: "asc" } });

export const getPromotionTypeById = (id: number) =>
  prisma.promotionType.findUnique({ where: { id } });

export const getActiveProductsForPromotions = async (search?: string) => {
  const q = search?.trim();
  const products = await prisma.product.findMany({
    where: {
      active: true,
      ...(q ? { OR: [{ sku: { contains: q } }, { name: { contains: q } }] } : {}),
    },
    select: {
      id: true,
      sku: true,
      name: true,
      sellPrice: true,
      active: true,
      categories: { select: { categoryId: true } },
    },
    orderBy: { name: "asc" },
    take: 500,
  });
  return products.map((product) => ({
    id: product.id,
    sku: product.sku,
    name: product.name,
    sellPrice: Number(product.sellPrice),
    active: product.active,
    categoryIds: product.categories.map((row) => row.categoryId),
  }));
};

export const getPromotions = async (search?: string) => {
  const q = search?.trim();
  const where: Prisma.PromotionWhereInput = q
    ? {
        OR: [
          { name: { contains: q } },
          { description: { contains: q } },
          { promotionType: { name: { contains: q } } },
          { products: { some: { product: { OR: [{ sku: { contains: q } }, { name: { contains: q } }] } } } },
        ],
      }
    : {};
  const promotions = await prisma.promotion.findMany({
    where,
    include: promotionInclude,
    orderBy: [{ isActive: "desc" }, { endDate: "desc" }, { name: "asc" }],
  });
  return promotions.map(mapPromotion);
};

export const getPromotionById = async (id: number) => {
  const promotion = await prisma.promotion.findUnique({ where: { id }, include: promotionInclude });
  return promotion ? mapPromotion(promotion) : null;
};

export const listAvailableProductsForPromotion = async (
  promotionId: number,
  filters: AvailablePromotionProductsFilters
) => {
  const promotion = await prisma.promotion.findUnique({
    where: { id: promotionId },
    select: { id: true },
  });
  if (!promotion) throw new Error("PROMOTION_NOT_FOUND");

  const { page, limit, skip } = availableProductsPagination(filters.page, filters.limit);
  const categoryIds = await getFinalCategoryIdsForScope(filters.scope, filters.categoryId);

  if (categoryIds && categoryIds.length === 0) {
    return { page, limit, total: 0, totalPages: 0, products: [] };
  }

  const associatedRows = filters.includeAssociated
    ? await prisma.promotionProduct.findMany({
        where: { promotionId },
        select: { productId: true },
      })
    : [];
  const associatedIds = new Set(associatedRows.map((row) => row.productId));

  const where: Prisma.ProductWhereInput = {
    active: true,
    ...buildAvailableProductSearchWhere(filters.search),
  };

  if (!filters.includeAssociated) {
    where.promotionProducts = { none: { promotionId } };
  }

  if (filters.scope === "UNCATEGORIZED") {
    where.categories = { none: {} };
  } else if (categoryIds) {
    where.categories = { some: { categoryId: { in: categoryIds } } };
  }

  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: availableProductSelect,
    }),
  ]);

  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    products: products.map((product) => mapAvailableProduct(product, associatedIds)),
  };
};

// createPromotion now accepts raw body and calls buildPromotionPayload internally.
export const createPromotion = async (
  body: Record<string, unknown>,
  options: BuildPromotionPayloadOptions = {}
) => {
  const payloadOrError = await buildPromotionPayload(body, options);
  if (typeof payloadOrError === "string") throw new AppError(payloadOrError, 400);
  const payload = payloadOrError;

  return prisma.$transaction(async (tx) => {
    const products = payload.productIds.length > 0
      ? await validateActiveProducts(tx, payload.productIds)
      : [];
    const productIds = products.map((p) => p.id);

    if (payload.isActive && productIds.length === 0) {
      throw new AppError("No se puede activar una promocion sin productos asociados.", 400);
    }

    if (payload.specialPrice !== null) {
      const specialPriceVal = Number(payload.specialPrice);
      const invalidProduct = products.find((p) => Number(p.sellPrice) <= specialPriceVal);
      if (invalidProduct) {
        throw new AppError(
          `El precio especial debe ser menor que el precio de venta actual del producto (${invalidProduct.sellPrice}).`,
          400
        );
      }
    }

    if (payload.isActive) {
      await validateNoOverlappingActivePromotions(tx, productIds, payload.startDate, payload.endDate);
    }
    const promotion = await tx.promotion.create({
      data: {
        name: payload.name,
        description: payload.description,
        promotionTypeId: payload.promotionTypeId,
        startDate: payload.startDate,
        endDate: payload.endDate,
        isActive: payload.isActive,
        value: payload.value,
        minQuantity: payload.minQuantity,
        payQuantity: payload.payQuantity,
        specialPrice: payload.specialPrice,
        ...(productIds.length > 0
          ? { products: { create: productIds.map((productId) => ({ productId })) } }
          : {}),
      },
      include: promotionInclude,
    });
    return mapPromotion(promotion);
  });
};

// updatePromotion now accepts raw body and calls buildPromotionPayload internally.
export const updatePromotion = async (
  id: number,
  body: Record<string, unknown>,
  options: BuildPromotionPayloadOptions = {}
) => {
  const payloadOrError = await buildPromotionPayload(body, options);
  if (typeof payloadOrError === "string") throw new AppError(payloadOrError, 400);
  const payload = payloadOrError;

  return prisma.$transaction(async (tx) => {
    const existing = await tx.promotion.findUnique({
      where: { id },
      select: {
        id: true,
        startDate: true,
        promotionTypeId: true,
        value: true,
        minQuantity: true,
        payQuantity: true,
        specialPrice: true,
        products: { select: { productId: true } },
      },
    });
    if (!existing) throw new Error("PROMOTION_NOT_FOUND");

    if (existing.startDate <= new Date()) {
      const existingValue = existing.value !== null ? Number(existing.value) : null;
      const existingSpecialPrice = existing.specialPrice !== null ? Number(existing.specialPrice) : null;

      const economicConfigChanged =
        existing.promotionTypeId !== payload.promotionTypeId ||
        existingValue !== payload.value ||
        existing.minQuantity !== payload.minQuantity ||
        existing.payQuantity !== payload.payQuantity ||
        existingSpecialPrice !== payload.specialPrice;

      if (economicConfigChanged) {
        throw new AppError("No se permite modificar la configuracion economica de una promocion que ya ha iniciado.", 400);
      }

      const existingProductIds = existing.products.map((p) => p.productId);
      const hasRemovedProducts = existingProductIds.some((pid) => !payload.productIds.includes(pid));
      if (hasRemovedProducts) {
        throw new AppError("No se permite quitar productos de una promocion que ya ha iniciado.", 400);
      }
    }

    const products = await validateActiveProducts(tx, payload.productIds);
    const productIds = products.map((p) => p.id);

    if (payload.specialPrice !== null) {
      const specialPriceVal = Number(payload.specialPrice);
      const invalidProduct = products.find((p) => Number(p.sellPrice) <= specialPriceVal);
      if (invalidProduct) {
        throw new AppError(
          `El precio especial debe ser menor que el precio de venta actual del producto (${invalidProduct.sellPrice}).`,
          400
        );
      }
    }

    if (payload.isActive) {
      await validateNoOverlappingActivePromotions(tx, productIds, payload.startDate, payload.endDate, id);
    }
    await tx.promotionProduct.deleteMany({ where: { promotionId: id } });
    const promotion = await tx.promotion.update({
      where: { id },
      data: {
        name: payload.name,
        description: payload.description,
        promotionTypeId: payload.promotionTypeId,
        startDate: payload.startDate,
        endDate: payload.endDate,
        isActive: payload.isActive,
        value: payload.value,
        minQuantity: payload.minQuantity,
        payQuantity: payload.payQuantity,
        specialPrice: payload.specialPrice,
        products: { create: productIds.map((productId) => ({ productId })) },
      },
      include: promotionInclude,
    });
    return mapPromotion(promotion);
  });
};

export const updatePromotionStatus = async (id: number, isActive: boolean) =>
  prisma.$transaction(async (tx) => {
    const existing = await tx.promotion.findUnique({
      where: { id },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        products: {
          select: {
            productId: true,
            product: { select: { active: true } },
          },
        },
      },
    });
    if (!existing) throw new Error("PROMOTION_NOT_FOUND");
    if (isActive) {
      if (existing.endDate < new Date()) {
        throw new AppError("No se puede activar una promocion que ya ha vencido.", 400);
      }
      if (existing.products.length === 0) {
        throw new AppError("No se puede activar una promocion sin productos asociados.", 400);
      }
      const hasActiveProduct = existing.products.some((p) => p.product.active);
      if (!hasActiveProduct) {
        throw new AppError("No se puede activar una promocion sin al menos un producto activo.", 400);
      }
      await validateNoOverlappingActivePromotions(
        tx,
        existing.products.map((product) => product.productId),
        existing.startDate,
        existing.endDate,
        id
      );
    }
    const promotion = await tx.promotion.update({
      where: { id },
      data: { isActive },
      include: promotionInclude,
    });
    return mapPromotion(promotion);
  });

export const addProductsToPromotion = async (promotionId: number, productIds: number[]) =>
  prisma.$transaction(async (tx) => {
    const promotion = await tx.promotion.findUnique({
      where: { id: promotionId },
      select: { id: true, startDate: true, endDate: true, isActive: true, specialPrice: true },
    });
    if (!promotion) throw new Error("PROMOTION_NOT_FOUND");

    const products = await validateActiveProducts(tx, productIds);
    const uniqueProductIds = products.map((p) => p.id);

    if (promotion.specialPrice !== null) {
      const specialPriceVal = Number(promotion.specialPrice);
      const invalidProduct = products.find((p) => Number(p.sellPrice) <= specialPriceVal);
      if (invalidProduct) {
        throw new AppError(
          `El precio especial debe ser menor que el precio de venta actual del producto (${invalidProduct.sellPrice}).`,
          400
        );
      }
    }

    const existing = await tx.promotionProduct.findMany({
      where: { promotionId, productId: { in: uniqueProductIds } },
      select: { productId: true },
    });
    const existingIds = new Set(existing.map((row) => row.productId));
    const missingIds = uniqueProductIds.filter((productId) => !existingIds.has(productId));

    if (promotion.isActive && missingIds.length > 0) {
      await validateNoOverlappingActivePromotions(tx, missingIds, promotion.startDate, promotion.endDate, promotionId);
    }
    if (missingIds.length > 0) {
      await tx.promotionProduct.createMany({
        data: missingIds.map((productId) => ({ promotionId, productId })),
      });
    }
    const updated = await tx.promotion.findUniqueOrThrow({ where: { id: promotionId }, include: promotionInclude });
    return mapPromotion(updated);
  });

export const deleteProductFromPromotion = async (promotionId: number, productId: number) =>
  prisma.$transaction(async (tx) => {
    const promotion = await tx.promotion.findUnique({
      where: { id: promotionId },
      select: { id: true, startDate: true },
    });
    if (!promotion) throw new Error("PROMOTION_NOT_FOUND");

    if (promotion.startDate <= new Date()) {
      throw new AppError("No se permite quitar productos de una promocion que ya ha iniciado.", 400);
    }

    const product = await tx.product.findUnique({ where: { id: productId }, select: { id: true } });
    if (!product) throw new Error("PRODUCT_NOT_FOUND");

    const result = await tx.promotionProduct.deleteMany({ where: { promotionId, productId } });
    if (result.count === 0) throw new Error("PROMOTION_PRODUCT_NOT_FOUND");

    const updated = await tx.promotion.findUniqueOrThrow({ where: { id: promotionId }, include: promotionInclude });
    return mapPromotion(updated);
  });

export const syncPromotionProducts = async (promotionId: number, productIds: number[]) =>
  prisma.$transaction(async (tx) => {
    const promotion = await tx.promotion.findUnique({
      where: { id: promotionId },
      select: { id: true, startDate: true, endDate: true, isActive: true, specialPrice: true },
    });
    if (!promotion) throw new Error("PROMOTION_NOT_FOUND");

    const products = await validateActiveProducts(tx, productIds);
    const uniqueProductIds = products.map((p) => p.id);

    if (promotion.specialPrice !== null) {
      const specialPriceVal = Number(promotion.specialPrice);
      const invalidProduct = products.find((p) => Number(p.sellPrice) <= specialPriceVal);
      if (invalidProduct) {
        throw new AppError(
          `El precio especial debe ser menor que el precio de venta actual del producto (${invalidProduct.sellPrice}).`,
          400
        );
      }
    }

    const existing = await tx.promotionProduct.findMany({
      where: { promotionId },
      select: { productId: true },
    });
    const existingIds = existing.map((p) => p.productId);

    if (promotion.startDate <= new Date()) {
      const hasRemoved = existingIds.some((eid) => !uniqueProductIds.includes(eid));
      if (hasRemoved) {
        throw new AppError("No se permite quitar productos de una promocion que ya ha iniciado.", 400);
      }
    }

    if (promotion.isActive) {
      await validateNoOverlappingActivePromotions(tx, uniqueProductIds, promotion.startDate, promotion.endDate, promotionId);
    }
    await tx.promotionProduct.deleteMany({ where: { promotionId } });
    if (uniqueProductIds.length > 0) {
      await tx.promotionProduct.createMany({
        data: uniqueProductIds.map((productId) => ({ promotionId, productId })),
      });
    }
    const updated = await tx.promotion.findUniqueOrThrow({ where: { id: promotionId }, include: promotionInclude });
    return mapPromotion(updated);
  });
