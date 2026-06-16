import { Prisma } from "@prisma/client";
import { prisma } from "../app";
import { AppError } from "../utils/AppError";

const promotionInclude = Prisma.validator<Prisma.PromotionInclude>()({
  promotionType: true,
  products: {
    include: {
      product: {
        select: {
          id: true,
          sku: true,
          name: true,
          sellPrice: true,
          active: true,
        },
      },
    },
    orderBy: { productId: "asc" },
  },
});

type PromotionWithRelations = Prisma.PromotionGetPayload<{ include: typeof promotionInclude }>;

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
      name: row.product.name,
      sellPrice: Number(row.product.sellPrice),
      active: row.product.active,
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
  if (endDate <= startDate) return "La fecha final debe ser mayor que la fecha inicial.";

  const parsedIsActive = parseOptionalBoolean(
    body.isActive,
    options.defaultIsActive ?? true,
    options.requireIsActive ?? false
  );
  if (!parsedIsActive.success) return parsedIsActive.message;

  const parsedProductIds = parseProductIds(body.productIds);
  if (!parsedProductIds.success) return parsedProductIds.message;

  const rule = getRule(type.name);
  if (!rule) return "El tipo de promocion no tiene reglas administrativas configuradas.";

  let value = parseNullableNumber(body.value);
  let minQuantity = parseNullablePositiveInt(body.minQuantity);
  let payQuantity = parseNullablePositiveInt(body.payQuantity);
  let specialPrice = parseNullableNumber(body.specialPrice);

  if (rule === "percentage") {
    if (value === null || value <= 0 || value > 100) return "El porcentaje debe ser mayor a 0 y menor o igual a 100.";
    minQuantity = null; payQuantity = null; specialPrice = null;
  }

  if (rule === "fixedAmount") {
    if (value === null || value <= 0) return "El monto fijo debe ser mayor a 0.";
    minQuantity = null; payQuantity = null; specialPrice = null;
  }

  if (rule === "buyXPayY") {
    if (minQuantity === null || minQuantity < 2) return "La cantidad minima debe ser mayor o igual a 2.";
    if (payQuantity === null || payQuantity < 1) return "La cantidad a pagar debe ser mayor o igual a 1.";
    if (payQuantity >= minQuantity) return "La cantidad a pagar debe ser menor que la cantidad minima.";
    value = null; specialPrice = null;
  }

  if (rule === "specialPrice") {
    if (minQuantity === null || minQuantity < 1) return "La cantidad minima debe ser mayor o igual a 1.";
    if (specialPrice === null || specialPrice <= 0) return "El precio especial debe ser mayor a 0.";
    value = null; payQuantity = null;
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
    select: { id: true, active: true },
  });
  if (products.length !== uniqueProductIds.length) throw new Error("PRODUCT_NOT_FOUND");
  if (products.some((product) => !product.active)) throw new Error("PRODUCT_INACTIVE");
  return uniqueProductIds;
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
    select: { id: true, sku: true, name: true, sellPrice: true, active: true },
    orderBy: { name: "asc" },
    take: 500,
  });
  return products.map((product) => ({ ...product, sellPrice: Number(product.sellPrice) }));
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

// createPromotion now accepts raw body and calls buildPromotionPayload internally.
export const createPromotion = async (
  body: Record<string, unknown>,
  options: BuildPromotionPayloadOptions = {}
) => {
  const payloadOrError = await buildPromotionPayload(body, options);
  if (typeof payloadOrError === "string") throw new AppError(payloadOrError, 400);
  const payload = payloadOrError;

  return prisma.$transaction(async (tx) => {
    const productIds = await validateActiveProducts(tx, payload.productIds);
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
        products: { create: productIds.map((productId) => ({ productId })) },
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
    const existing = await tx.promotion.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new Error("PROMOTION_NOT_FOUND");

    const productIds = await validateActiveProducts(tx, payload.productIds);
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
      select: { id: true, startDate: true, endDate: true, products: { select: { productId: true } } },
    });
    if (!existing) throw new Error("PROMOTION_NOT_FOUND");
    if (isActive) {
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
      select: { id: true, startDate: true, endDate: true, isActive: true },
    });
    if (!promotion) throw new Error("PROMOTION_NOT_FOUND");

    const uniqueProductIds = await validateActiveProducts(tx, productIds);
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
    const promotion = await tx.promotion.findUnique({ where: { id: promotionId }, select: { id: true } });
    if (!promotion) throw new Error("PROMOTION_NOT_FOUND");

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
      select: { id: true, startDate: true, endDate: true, isActive: true },
    });
    if (!promotion) throw new Error("PROMOTION_NOT_FOUND");

    const uniqueProductIds = await validateActiveProducts(tx, productIds);
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
