import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export interface CartItem {
  id: number;
  productId: number;
  name: string;
  sellPrice: number;
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
  discountAmount: number; // Ahorro total en esta línea
  appliedPromotion?: AppliedPromotion;
}

export interface PromotionCalculationResult {
  lines: CalculationLine[];
  totalOriginal: number;
  totalDiscount: number;
  totalFinal: number;
}

export class PromotionService {
  /**
   * Obtiene las promociones activas para el día de hoy
   */
  static async getActivePromotions() {
    const today = new Date();
    return prisma.promotion.findMany({
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
  }

  /**
   * Calcula las promociones para los items del carrito.
   * La lógica de negocio indica:
   * - Cada producto solo puede tener a lo sumo una promoción activa (la base de datos se asume bien configurada o tomamos la primera/más ventajosa).
   * - Si un producto tiene promoción BuyXPayY, se agrupan en lotes de X y se paga Y de cada lote, cobrando el precio original por los excedentes.
   * - Si es SpecialPrice, se aplica a partir de minQuantity; de lo contrario precio normal.
   * - Si es Percentage, se aplica a cada unidad.
   * - Si es FixedAmount, se reduce un monto fijo a cada unidad.
   */
  static async calculatePromotions(items: CartItem[]): Promise<PromotionCalculationResult> {
    const activePromotions = await this.getActivePromotions();
    
    // Mapear productId a promoción activa
    const productPromoMap = new Map<number, any>();
    for (const promo of activePromotions) {
      for (const pp of promo.products) {
        // Si hay duplicado, priorizar por algún criterio o simplemente usar la primera
        if (!productPromoMap.has(pp.productId)) {
          productPromoMap.set(pp.productId, promo);
        }
      }
    }

    const lines: CalculationLine[] = [];
    let totalOriginal = 0;
    let totalDiscount = 0;
    let totalFinal = 0;

    for (const item of items) {
      const originalPrice = item.sellPrice;
      const quantity = item.quantity;
      const subtotalOriginal = originalPrice * quantity;
      
      const promo = productPromoMap.get(item.id) || productPromoMap.get(item.productId);

      if (!promo) {
        // Sin promoción
        lines.push({
          productId: item.productId || item.id,
          quantity,
          originalPrice,
          finalPrice: originalPrice,
          discountAmount: 0,
        });
        totalOriginal += subtotalOriginal;
        totalFinal += subtotalOriginal;
        continue;
      }

      const promoType = promo.promotionType.name;
      let discountAmount = 0;
      let finalPrice = originalPrice;
      let appliedPromo: AppliedPromotion | undefined;

      if (promoType === "Percentage") {
        const minQty = promo.minQuantity || 1;
        if (quantity >= minQty) {
          const percentage = Number(promo.value || 0);
          const discountPerUnit = originalPrice * (percentage / 100);
          discountAmount = discountPerUnit * quantity;
          finalPrice = originalPrice - discountPerUnit;
          appliedPromo = {
            promotionId: promo.id,
            name: promo.name,
            type: "Percentage",
            discountAmount,
          };
        } else {
          // No alcanza la cantidad mínima
          discountAmount = 0;
          finalPrice = originalPrice;
        }
      } else if (promoType === "FixedAmount") {
        const minQty = promo.minQuantity || 1;
        if (quantity >= minQty) {
          const discountPerUnit = Number(promo.value || 0);
          discountAmount = discountPerUnit * quantity;
          finalPrice = Math.max(0, originalPrice - discountPerUnit);
          appliedPromo = {
            promotionId: promo.id,
            name: promo.name,
            type: "FixedAmount",
            discountAmount,
          };
        } else {
          // No alcanza la cantidad mínima
          discountAmount = 0;
          finalPrice = originalPrice;
        }
      } else if (promoType === "BuyXPayY") {
        const x = promo.minQuantity || 1;
        const y = promo.payQuantity || 1;
        
        if (quantity >= x) {
          const promoGroups = Math.floor(quantity / x);
          const remainder = quantity % x;
          const paidUnits = (promoGroups * y) + remainder;
          const lineCost = paidUnits * originalPrice;
          discountAmount = subtotalOriginal - lineCost;
          finalPrice = lineCost / quantity;
          appliedPromo = {
            promotionId: promo.id,
            name: promo.name,
            type: "BuyXPayY",
            discountAmount,
          };
        } else {
          // No alcanza la cantidad mínima
          discountAmount = 0;
          finalPrice = originalPrice;
        }
      } else if (promoType === "SpecialPrice") {
        const minQty = promo.minQuantity || 1;
        const special = Number(promo.specialPrice || originalPrice);
        
        if (quantity >= minQty) {
          finalPrice = special;
          discountAmount = (originalPrice - special) * quantity;
          appliedPromo = {
            promotionId: promo.id,
            name: promo.name,
            type: "SpecialPrice",
            discountAmount,
          };
        } else {
          // No alcanza la cantidad mínima
          discountAmount = 0;
          finalPrice = originalPrice;
        }
      }

      lines.push({
        productId: item.productId || item.id,
        quantity,
        originalPrice,
        finalPrice,
        discountAmount,
        appliedPromotion: appliedPromo,
      });

      totalOriginal += subtotalOriginal;
      totalDiscount += discountAmount;
      totalFinal += (finalPrice * quantity);
    }

    return {
      lines,
      totalOriginal,
      totalDiscount,
      totalFinal,
    };
  }
}
