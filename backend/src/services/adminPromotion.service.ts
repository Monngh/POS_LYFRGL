import { Prisma } from "@prisma/client";
import { prisma } from "../app";

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

const validateActiveProducts = async (
  tx: Prisma.TransactionClient,
  productIds: number[],
) => {
  const uniqueProductIds = [...new Set(productIds)];
  const products = await tx.product.findMany({
    where: { id: { in: uniqueProductIds }, active: true },
    select: { id: true },
  });

  if (products.length !== uniqueProductIds.length) {
    throw new Error("PRODUCT_NOT_FOUND");
  }

  return uniqueProductIds;
};

export const getPromotionTypes = () =>
  prisma.promotionType.findMany({
    orderBy: { name: "asc" },
  });

export const getPromotionTypeById = (id: number) =>
  prisma.promotionType.findUnique({
    where: { id },
  });

export const getActiveProductsForPromotions = async (search?: string) => {
  const q = search?.trim();

  const products = await prisma.product.findMany({
    where: {
      active: true,
      ...(q
        ? {
            OR: [
              { sku: { contains: q } },
              { name: { contains: q } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      sku: true,
      name: true,
      sellPrice: true,
      active: true,
    },
    orderBy: { name: "asc" },
    take: 500,
  });

  return products.map((product) => ({
    ...product,
    sellPrice: Number(product.sellPrice),
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
          {
            products: {
              some: {
                product: {
                  OR: [
                    { sku: { contains: q } },
                    { name: { contains: q } },
                  ],
                },
              },
            },
          },
        ],
      }
    : {};

  const promotions = await prisma.promotion.findMany({
    where,
    include: promotionInclude,
    orderBy: [
      { isActive: "desc" },
      { endDate: "desc" },
      { name: "asc" },
    ],
  });

  return promotions.map(mapPromotion);
};

export const getPromotionById = async (id: number) => {
  const promotion = await prisma.promotion.findUnique({
    where: { id },
    include: promotionInclude,
  });

  return promotion ? mapPromotion(promotion) : null;
};

export const createPromotion = async (payload: PromotionPayload) =>
  prisma.$transaction(async (tx) => {
    const productIds = await validateActiveProducts(tx, payload.productIds);

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
        products: {
          create: productIds.map((productId) => ({ productId })),
        },
      },
      include: promotionInclude,
    });

    return mapPromotion(promotion);
  });

export const updatePromotion = async (id: number, payload: PromotionPayload) =>
  prisma.$transaction(async (tx) => {
    const existing = await tx.promotion.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw new Error("PROMOTION_NOT_FOUND");
    }

    const productIds = await validateActiveProducts(tx, payload.productIds);

    await tx.promotionProduct.deleteMany({
      where: { promotionId: id },
    });

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
        products: {
          create: productIds.map((productId) => ({ productId })),
        },
      },
      include: promotionInclude,
    });

    return mapPromotion(promotion);
  });

export const updatePromotionStatus = async (id: number, isActive: boolean) => {
  const promotion = await prisma.promotion.update({
    where: { id },
    data: { isActive },
    include: promotionInclude,
  });

  return mapPromotion(promotion);
};

export const addProductsToPromotion = async (promotionId: number, productIds: number[]) =>
  prisma.$transaction(async (tx) => {
    const promotion = await tx.promotion.findUnique({
      where: { id: promotionId },
      select: { id: true },
    });

    if (!promotion) {
      throw new Error("PROMOTION_NOT_FOUND");
    }

    const uniqueProductIds = await validateActiveProducts(tx, productIds);
    const existing = await tx.promotionProduct.findMany({
      where: { promotionId, productId: { in: uniqueProductIds } },
      select: { productId: true },
    });
    const existingIds = new Set(existing.map((row) => row.productId));
    const missingIds = uniqueProductIds.filter((productId) => !existingIds.has(productId));

    if (missingIds.length > 0) {
      await tx.promotionProduct.createMany({
        data: missingIds.map((productId) => ({
          promotionId,
          productId,
        })),
      });
    }

    const updated = await tx.promotion.findUniqueOrThrow({
      where: { id: promotionId },
      include: promotionInclude,
    });

    return mapPromotion(updated);
  });

export const deleteProductFromPromotion = async (promotionId: number, productId: number) =>
  prisma.$transaction(async (tx) => {
    const promotion = await tx.promotion.findUnique({
      where: { id: promotionId },
      select: { id: true },
    });

    if (!promotion) {
      throw new Error("PROMOTION_NOT_FOUND");
    }

    await tx.promotionProduct.deleteMany({
      where: { promotionId, productId },
    });

    const updated = await tx.promotion.findUniqueOrThrow({
      where: { id: promotionId },
      include: promotionInclude,
    });

    return mapPromotion(updated);
  });

export const syncPromotionProducts = async (promotionId: number, productIds: number[]) =>
  prisma.$transaction(async (tx) => {
    const promotion = await tx.promotion.findUnique({
      where: { id: promotionId },
      select: { id: true },
    });

    if (!promotion) {
      throw new Error("PROMOTION_NOT_FOUND");
    }

    const uniqueProductIds = await validateActiveProducts(tx, productIds);

    await tx.promotionProduct.deleteMany({
      where: { promotionId },
    });

    if (uniqueProductIds.length > 0) {
      await tx.promotionProduct.createMany({
        data: uniqueProductIds.map((productId) => ({
          promotionId,
          productId,
        })),
      });
    }

    const updated = await tx.promotion.findUniqueOrThrow({
      where: { id: promotionId },
      include: promotionInclude,
    });

    return mapPromotion(updated);
  });
