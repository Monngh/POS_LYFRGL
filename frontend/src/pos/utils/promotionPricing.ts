interface ActivePromotion {
  id?: number;
  name: string;
  type: string;
  value: number | null;
  minQuantity: number | null;
  payQuantity: number | null;
  specialPrice: number | null;
}

interface PromotionCartItem {
  product: {
    sellPrice: number;
    activePromotion?: ActivePromotion | null;
  };
  quantity: number;
}

const toCents = (value: number) => Math.round((value + Number.EPSILON) * 100);
const fromCents = (value: number) => Number((value / 100).toFixed(2));

export const calculateItemPromotion = (item: PromotionCartItem) => {
  const promo = item.product.activePromotion;
  const originalPrice = Number(item.product.sellPrice);
  const quantity = Math.floor(Number(item.quantity));

  if (!promo || !Number.isFinite(originalPrice) || originalPrice <= 0 || !Number.isInteger(quantity) || quantity <= 0) {
    return { finalPrice: originalPrice, discountAmount: 0, label: "", promoApplied: false };
  }

  const minQty = promo.minQuantity ?? 1;
  const priceCents = toCents(originalPrice);
  const subtotalCents = priceCents * quantity;
  let finalLineCents = subtotalCents;

  if ((promo.type === "Percentage" || promo.type === "Porcentaje") && quantity >= minQty) {
    const value = Number(promo.value);
    if (Number.isFinite(value) && value > 0 && value < 100) {
      const finalUnitCents = Math.round(priceCents * (1 - value / 100));
      finalLineCents = finalUnitCents * quantity;
    }
  } else if ((promo.type === "FixedAmount" || promo.type === "MontoFijo") && quantity >= minQty) {
    const valueCents = toCents(Number(promo.value));
    if (valueCents > 0 && valueCents < priceCents) {
      finalLineCents = (priceCents - valueCents) * quantity;
    }
  } else if (promo.type === "BuyXPayY") {
    const x = Number(promo.minQuantity);
    const y = Number(promo.payQuantity);
    if (Number.isInteger(x) && Number.isInteger(y) && x > y && y > 0 && quantity >= x) {
      const groups = Math.floor(quantity / x);
      const remainder = quantity % x;
      finalLineCents = (groups * y + remainder) * priceCents;
    }
  } else if ((promo.type === "SpecialPrice" || promo.type === "PrecioEspecial") && quantity >= minQty) {
    const specialCents = toCents(Number(promo.specialPrice));
    if (specialCents > 0 && specialCents < priceCents) {
      finalLineCents = specialCents * quantity;
    }
  }

  const discountCents = subtotalCents - finalLineCents;
  if (finalLineCents <= 0 || discountCents <= 0 || discountCents >= subtotalCents) {
    return { finalPrice: originalPrice, discountAmount: 0, label: "", promoApplied: false };
  }

  return {
    finalPrice: fromCents(finalLineCents) / quantity,
    discountAmount: fromCents(discountCents),
    label: promo.name,
    promoApplied: true,
  };
};
