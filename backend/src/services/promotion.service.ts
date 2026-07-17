import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../app";
import { AppError } from "../utils/AppError";
import { logger } from "../utils/logger";
import { fromMoneyCents, toMoneyCents } from "../utils/money.util";
import {
  calculatePromotionLine,
  getPromotionRule,
  getPromotionValidationIssues,
  toAppliedPromotionType,
  type PromotionConfigForValidation,
  type PromotionProductForValidation,
} from "./promotionRules.util";

type PrismaExecutor = PrismaClient | Prisma.TransactionClient;

export interface CartItem {
  id?: number;
  productId: number;
  name?: string;
  sellPrice?: number;
  quantity: number;
}

export interface AppliedPromotion {
  promotionId: number;
  name: string;
  type: "Percentage" | "FixedAmount" | "BuyXPayY" | "SpecialPrice";
  discountAmount: number;
}

export interface CalculationLine {
  productId: number;
  quantity: number;
  originalPrice: number;
  finalPrice: number;
  finalLineTotal: number;
  discountAmount: number;
  appliedPromotion?: AppliedPromotion;
}

export interface PromotionCalculationResult {
  lines: CalculationLine[];
  totalOriginal: number;
  totalDiscount: number;
  totalFinal: number;
}

type ProductForPromotion = {
  id: number;
  name: string;
  sellPrice: Prisma.Decimal;
  costPrice: Prisma.Decimal;
  active: boolean;
};

type PromotionCandidate = {
  id: number;
  name: string;
  isActive: boolean;
  startDate: Date;
  endDate: Date;
  value: Prisma.Decimal | null;
  minQuantity: number | null;
  payQuantity: number | null;
  specialPrice: Prisma.Decimal | null;
  promotionType: { name: string };
};

type PromotionProductCandidate = {
  productId: number;
  promotion: PromotionCandidate;
};

const toValidationProduct = (product: ProductForPromotion): PromotionProductForValidation => ({
  id: product.id,
  name: product.name,
  active: product.active,
  sellPrice: Number(product.sellPrice),
  costPrice: Number(product.costPrice),
});

const toValidationConfig = (promotion: PromotionCandidate): PromotionConfigForValidation => ({
  id: promotion.id,
  name: promotion.name,
  typeName: promotion.promotionType.name,
  value: promotion.value !== null ? Number(promotion.value) : null,
  minQuantity: promotion.minQuantity,
  payQuantity: promotion.payQuantity,
  specialPrice: promotion.specialPrice !== null ? Number(promotion.specialPrice) : null,
});

const logPromotionRejection = (
  reason: string,
  promotion: PromotionCandidate | null,
  product: PromotionProductForValidation,
  extra: Record<string, unknown> = {}
) => {
  logger.warn("[PROMOTION_REJECTED]", {
    reason,
    promotionId: promotion?.id ?? null,
    productId: product.id,
    type: promotion?.promotionType.name ?? null,
    normalPrice: product.sellPrice,
    configuredValue: promotion?.value !== null && promotion?.value !== undefined ? Number(promotion.value) : null,
    specialPrice: promotion?.specialPrice !== null && promotion?.specialPrice !== undefined ? Number(promotion.specialPrice) : null,
    ...extra,
  });
};

const isPromotionCurrentlyActive = (promotion: PromotionCandidate, now: Date) =>
  promotion.isActive && promotion.startDate <= now && promotion.endDate >= now;

const selectPromotionForProduct = (
  product: PromotionProductForValidation,
  candidates: PromotionCandidate[],
  now: Date
): PromotionCandidate | null => {
  const validCandidates: PromotionCandidate[] = [];

  for (const promotion of candidates) {
    if (!isPromotionCurrentlyActive(promotion, now)) {
      logPromotionRejection("PROMOTION_OUT_OF_WINDOW_OR_INACTIVE", promotion, product);
      continue;
    }

    const issues = getPromotionValidationIssues(toValidationConfig(promotion), [product]);
    if (issues.length > 0) {
      logPromotionRejection(issues[0].code, promotion, product, { message: issues[0].message });
      continue;
    }

    validCandidates.push(promotion);
  }

  if (validCandidates.length > 1) {
    logPromotionRejection("PROMOTION_OVERLAP", null, product, {
      promotionIds: validCandidates.map((promotion) => promotion.id),
    });
    return null;
  }

  return validCandidates[0] ?? null;
};

const emptyLine = (productId: number, quantity: number, originalPrice: number): CalculationLine => {
  const subtotalCents = toMoneyCents(originalPrice) * quantity;
  return {
    productId,
    quantity,
    originalPrice: fromMoneyCents(toMoneyCents(originalPrice)),
    finalPrice: fromMoneyCents(toMoneyCents(originalPrice)),
    finalLineTotal: fromMoneyCents(subtotalCents),
    discountAmount: 0,
  };
};

export class PromotionService {
  static async getActivePromotions(client: PrismaExecutor = prisma) {
    const today = new Date();
    const promotions = await client.promotion.findMany({
      where: {
        isActive: true,
        startDate: { lte: today },
        endDate: { gte: today },
      },
      include: {
        promotionType: true,
        products: {
          include: {
            product: true,
          },
        },
      },
    });

    return promotions
      .map((promotion) => {
        const validProducts = promotion.products.filter((row) => {
          const product = toValidationProduct(row.product);
          const issues = getPromotionValidationIssues(toValidationConfig(promotion), [product]);
          if (issues.length > 0) {
            logPromotionRejection(issues[0].code, promotion, product, { message: issues[0].message });
            return false;
          }
          return true;
        });
        return { ...promotion, products: validProducts };
      })
      .filter((promotion) => promotion.products.length > 0);
  }

  static getDisplayPromotionForProduct(
    product: ProductForPromotion,
    promotionProducts: PromotionProductCandidate[],
    now = new Date()
  ) {
    const validationProduct = toValidationProduct(product);
    const candidates = promotionProducts.map((row) => row.promotion);
    const promotion = selectPromotionForProduct(validationProduct, candidates, now);
    if (!promotion) return null;

    return {
      id: promotion.id,
      name: promotion.name,
      type: promotion.promotionType.name,
      value: promotion.value !== null ? Number(promotion.value) : null,
      minQuantity: promotion.minQuantity,
      payQuantity: promotion.payQuantity,
      specialPrice: promotion.specialPrice !== null ? Number(promotion.specialPrice) : null,
    };
  }

  static async calculatePromotions(
    items: CartItem[],
    client: PrismaExecutor = prisma
  ): Promise<PromotionCalculationResult> {
    if (!Array.isArray(items) || items.length === 0) {
      return { lines: [], totalOriginal: 0, totalDiscount: 0, totalFinal: 0 };
    }

    const normalizedItems = items.map((item, index) => {
      const productId = Number(item.productId ?? item.id);
      const quantity = Number(item.quantity);
      if (!Number.isInteger(productId) || productId <= 0) {
        throw new AppError(`El producto en la posicion ${index + 1} no tiene un identificador valido.`, 400);
      }
      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new AppError(`La cantidad del producto ${item.name || productId} debe ser un entero mayor a cero.`, 400);
      }
      return { productId, quantity };
    });

    const productIds = [...new Set(normalizedItems.map((item) => item.productId))];
    const products = await client.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, sellPrice: true, costPrice: true, active: true },
    });

    const productMap = new Map(products.map((product) => [product.id, product]));
    const missingProduct = productIds.find((productId) => !productMap.has(productId));
    if (missingProduct !== undefined) {
      throw new AppError(`El producto con ID ${missingProduct} no existe.`, 404);
    }

    const inactiveProduct = products.find((product) => !product.active);
    if (inactiveProduct) {
      throw new AppError(`El producto ${inactiveProduct.name} esta inactivo.`, 400);
    }

    const now = new Date();
    const promotions = await client.promotion.findMany({
      where: {
        isActive: true,
        startDate: { lte: now },
        endDate: { gte: now },
        products: { some: { productId: { in: productIds } } },
      },
      include: {
        promotionType: true,
        products: {
          where: { productId: { in: productIds } },
          select: { productId: true },
        },
      },
      orderBy: [{ id: "asc" }],
    });

    const candidatesByProductId = new Map<number, PromotionCandidate[]>();
    for (const promotion of promotions) {
      for (const row of promotion.products) {
        const candidates = candidatesByProductId.get(row.productId) ?? [];
        candidates.push(promotion);
        candidatesByProductId.set(row.productId, candidates);
      }
    }

    const lines: CalculationLine[] = [];
    let totalOriginalCents = 0;
    let totalDiscountCents = 0;
    let totalFinalCents = 0;

    for (const item of normalizedItems) {
      const product = productMap.get(item.productId)!;
      const validationProduct = toValidationProduct(product);
      const originalPrice = Number(product.sellPrice);
      const noPromotionLine = emptyLine(item.productId, item.quantity, originalPrice);
      const candidates = candidatesByProductId.get(item.productId) ?? [];
      const promotion = selectPromotionForProduct(validationProduct, candidates, now);

      if (!promotion) {
        lines.push(noPromotionLine);
        totalOriginalCents += toMoneyCents(originalPrice) * item.quantity;
        totalFinalCents += toMoneyCents(originalPrice) * item.quantity;
        continue;
      }

      const config = toValidationConfig(promotion);
      const rule = getPromotionRule(config.typeName);
      const calculated = calculatePromotionLine(config, validationProduct, item.quantity);

      if (!rule || !calculated) {
        logPromotionRejection("PROMOTION_NOT_APPLIED", promotion, validationProduct, { quantity: item.quantity });
        lines.push(noPromotionLine);
        totalOriginalCents += toMoneyCents(originalPrice) * item.quantity;
        totalFinalCents += toMoneyCents(originalPrice) * item.quantity;
        continue;
      }

      const subtotalCents = toMoneyCents(originalPrice) * item.quantity;
      const discountCents = toMoneyCents(calculated.discountAmount);
      const finalLineCents = subtotalCents - discountCents;

      if (finalLineCents <= 0 || discountCents <= 0 || discountCents >= subtotalCents) {
        logPromotionRejection("INVALID_PROMOTION_TOTAL", promotion, validationProduct, {
          quantity: item.quantity,
          subtotal: fromMoneyCents(subtotalCents),
          discount: fromMoneyCents(discountCents),
          finalLineTotal: fromMoneyCents(finalLineCents),
        });
        lines.push(noPromotionLine);
        totalOriginalCents += subtotalCents;
        totalFinalCents += subtotalCents;
        continue;
      }

      const discountAmount = fromMoneyCents(discountCents);
      const line: CalculationLine = {
        productId: item.productId,
        quantity: item.quantity,
        originalPrice: fromMoneyCents(toMoneyCents(originalPrice)),
        finalPrice: calculated.finalUnitPrice,
        finalLineTotal: fromMoneyCents(finalLineCents),
        discountAmount,
        appliedPromotion: {
          promotionId: promotion.id,
          name: promotion.name,
          type: toAppliedPromotionType(rule),
          discountAmount,
        },
      };

      lines.push(line);
      totalOriginalCents += subtotalCents;
      totalDiscountCents += discountCents;
      totalFinalCents += finalLineCents;
    }

    return {
      lines,
      totalOriginal: fromMoneyCents(totalOriginalCents),
      totalDiscount: fromMoneyCents(totalDiscountCents),
      totalFinal: fromMoneyCents(totalFinalCents),
    };
  }
}
