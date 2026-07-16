import { formatMoney, fromMoneyCents, hasMaxDecimalPlaces, roundMoney, toMoneyCents } from "../utils/money.util";

export type PromotionRule = "percentage" | "fixedAmount" | "buyXPayY" | "specialPrice";
export type AppliedPromotionType = "Percentage" | "FixedAmount" | "BuyXPayY" | "SpecialPrice";

export interface PromotionProductForValidation {
  id: number;
  sku?: string | null;
  name: string;
  sellPrice: number;
  costPrice?: number | null;
  active?: boolean;
}

export interface PromotionConfigForValidation {
  id?: number;
  name?: string;
  typeName: string;
  value: number | null;
  minQuantity: number | null;
  payQuantity: number | null;
  specialPrice: number | null;
}

export interface PromotionValidationIssue {
  code: string;
  message: string;
  productId?: number;
  productSku?: string | null;
  productName?: string;
  context?: Record<string, unknown>;
}

export interface PromotionLineCalculation {
  finalUnitPrice: number;
  finalLineTotal: number;
  discountAmount: number;
}

export const getPromotionRule = (typeName: string): PromotionRule | null => {
  const normalized = typeName.toLowerCase().replace(/\s+/g, "");
  if (normalized.includes("percentage") || normalized.includes("porcentaje")) return "percentage";
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
  if (normalized.includes("specialprice") || normalized.includes("precioespecial")) return "specialPrice";
  return null;
};

export const toAppliedPromotionType = (rule: PromotionRule): AppliedPromotionType => {
  if (rule === "percentage") return "Percentage";
  if (rule === "fixedAmount") return "FixedAmount";
  if (rule === "buyXPayY") return "BuyXPayY";
  return "SpecialPrice";
};

export const validateMoneyScale = (value: unknown, label: string): string | null =>
  hasMaxDecimalPlaces(value) ? null : `${label} no puede tener mas de dos decimales.`;

const productLabel = (product: PromotionProductForValidation) => product.name || `Producto #${product.id}`;

const invalidProductIssue = (
  product: PromotionProductForValidation,
  code: string,
  message: string,
  context?: Record<string, unknown>
): PromotionValidationIssue => ({
  code,
  message,
  productId: product.id,
  productSku: product.sku ?? null,
  productName: productLabel(product),
  context,
});

const validateProductBase = (product: PromotionProductForValidation): PromotionValidationIssue[] => {
  const issues: PromotionValidationIssue[] = [];
  if (product.active === false) {
    issues.push(
      invalidProductIssue(
        product,
        "PRODUCT_INACTIVE",
        `El producto "${productLabel(product)}" esta inactivo.`,
        { sellPrice: product.sellPrice }
      )
    );
  }
  if (!Number.isFinite(product.sellPrice) || product.sellPrice <= 0) {
    issues.push(
      invalidProductIssue(
        product,
        "INVALID_SELL_PRICE",
        `El producto "${productLabel(product)}" no tiene un precio de venta vigente mayor a $0.`,
        { sellPrice: product.sellPrice }
      )
    );
  }
  return issues;
};

const validateBelowCost = (
  product: PromotionProductForValidation,
  finalUnitPrice: number,
  rule: PromotionRule
): PromotionValidationIssue | null => {
  const costPrice = Number(product.costPrice ?? 0);
  if (!Number.isFinite(costPrice) || costPrice <= 0) return null;
  if (finalUnitPrice >= costPrice) return null;

  return invalidProductIssue(
    product,
    "PROMOTION_BELOW_COST",
    `La promocion dejaria el producto "${productLabel(product)}" en ${formatMoney(finalUnitPrice)}, por debajo de su costo ${formatMoney(costPrice)}.`,
    { rule, sellPrice: product.sellPrice, costPrice, finalUnitPrice }
  );
};

export const getPromotionValidationIssues = (
  config: PromotionConfigForValidation,
  products: PromotionProductForValidation[]
): PromotionValidationIssue[] => {
  const rule = getPromotionRule(config.typeName);
  if (!rule) {
    return [{ code: "UNSUPPORTED_PROMOTION_TYPE", message: "El tipo de promocion no tiene reglas configuradas." }];
  }

  const issues: PromotionValidationIssue[] = [];

  if (rule === "percentage") {
    if (config.value === null || config.value <= 0 || config.value >= 100) {
      issues.push({ code: "INVALID_PERCENTAGE", message: "El porcentaje debe ser mayor a 0 y menor a 100." });
    }
  }

  if (rule === "fixedAmount") {
    if (config.value === null || config.value <= 0) {
      issues.push({ code: "INVALID_FIXED_AMOUNT", message: "El monto fijo debe ser mayor a 0." });
    }
  }

  if (rule === "specialPrice") {
    if (config.specialPrice === null || config.specialPrice <= 0) {
      issues.push({ code: "INVALID_SPECIAL_PRICE", message: "El precio especial debe ser mayor a 0." });
    }
  }

  if (rule === "buyXPayY") {
    if (!Number.isInteger(config.minQuantity) || Number(config.minQuantity) < 2) {
      issues.push({ code: "INVALID_BUY_QUANTITY", message: "La cantidad minima debe ser un entero mayor o igual a 2." });
    }
    if (!Number.isInteger(config.payQuantity) || Number(config.payQuantity) < 1) {
      issues.push({ code: "INVALID_PAY_QUANTITY", message: "La cantidad a pagar debe ser un entero mayor o igual a 1." });
    }
    if (
      Number.isInteger(config.minQuantity) &&
      Number.isInteger(config.payQuantity) &&
      Number(config.payQuantity) >= Number(config.minQuantity)
    ) {
      issues.push({ code: "INVALID_BUY_PAY_RATIO", message: "La cantidad a pagar debe ser menor que la cantidad minima." });
    }
  }

  for (const product of products) {
    const baseIssues = validateProductBase(product);
    issues.push(...baseIssues);
    if (baseIssues.length > 0) continue;

    const sellPrice = roundMoney(product.sellPrice);
    let finalUnitPrice: number | null = null;

    if (rule === "percentage" && config.value !== null && config.value > 0 && config.value < 100) {
      finalUnitPrice = roundMoney(sellPrice * (1 - config.value / 100));
      if (finalUnitPrice <= 0 || finalUnitPrice >= sellPrice) {
        issues.push(
          invalidProductIssue(
            product,
            "INVALID_PERCENTAGE_RESULT",
            `El porcentaje de ${config.value}% no genera un precio promocional valido para "${productLabel(product)}" (${formatMoney(sellPrice)}).`,
            { sellPrice, value: config.value, finalUnitPrice }
          )
        );
        continue;
      }
    }

    if (rule === "fixedAmount" && config.value !== null && config.value > 0) {
      const requestedDiscount = config.value;
      const resultingPrice = roundMoney(sellPrice - requestedDiscount);
      if (config.value >= sellPrice) {
        issues.push(
          invalidProductIssue(
            product,
            "FIXED_AMOUNT_NOT_BELOW_PRICE",
            `El descuento de ${formatMoney(config.value)} no puede aplicarse al producto "${productLabel(product)}" porque su precio actual es ${formatMoney(sellPrice)}.`,
            { sellPrice, requestedDiscount, value: config.value, finalUnitPrice: resultingPrice }
          )
        );
        continue;
      }
      finalUnitPrice = resultingPrice;
      if (finalUnitPrice <= 0) {
        issues.push(
          invalidProductIssue(
            product,
            "INVALID_FIXED_AMOUNT_RESULT",
            `El monto fijo dejaria el producto "${productLabel(product)}" con un precio invalido.`,
            { sellPrice, requestedDiscount, value: config.value, finalUnitPrice }
          )
        );
        continue;
      }
    }

    if (rule === "specialPrice" && config.specialPrice !== null && config.specialPrice > 0) {
      if (config.specialPrice >= sellPrice) {
        issues.push(
          invalidProductIssue(
            product,
            "SPECIAL_PRICE_NOT_BELOW_PRICE",
            `El precio especial de ${formatMoney(config.specialPrice)} debe ser menor que el precio actual de "${productLabel(product)}" (${formatMoney(sellPrice)}).`,
            { sellPrice, specialPrice: config.specialPrice }
          )
        );
        continue;
      }
      finalUnitPrice = roundMoney(config.specialPrice);
    }

    if (
      rule === "buyXPayY" &&
      Number.isInteger(config.minQuantity) &&
      Number.isInteger(config.payQuantity) &&
      Number(config.minQuantity) > Number(config.payQuantity) &&
      Number(config.payQuantity) > 0
    ) {
      finalUnitPrice = roundMoney(sellPrice * (Number(config.payQuantity) / Number(config.minQuantity)));
      if (finalUnitPrice <= 0 || finalUnitPrice >= sellPrice) {
        issues.push(
          invalidProductIssue(
            product,
            "INVALID_BUY_X_PAY_Y_RESULT",
            `La mecanica ${config.minQuantity}x${config.payQuantity} no genera un precio promocional valido para "${productLabel(product)}".`,
            { sellPrice, minQuantity: config.minQuantity, payQuantity: config.payQuantity, finalUnitPrice }
          )
        );
        continue;
      }
    }

    if (finalUnitPrice !== null) {
      const belowCostIssue = validateBelowCost(product, finalUnitPrice, rule);
      if (belowCostIssue) issues.push(belowCostIssue);
    }
  }

  return issues;
};

export const isPromotionValidForProducts = (
  config: PromotionConfigForValidation,
  products: PromotionProductForValidation[]
): boolean => getPromotionValidationIssues(config, products).length === 0;

export const calculatePromotionLine = (
  config: PromotionConfigForValidation,
  product: PromotionProductForValidation,
  quantity: number
): PromotionLineCalculation | null => {
  const rule = getPromotionRule(config.typeName);
  if (!rule || !Number.isInteger(quantity) || quantity <= 0) return null;
  if (getPromotionValidationIssues(config, [product]).length > 0) return null;

  const minQuantity = config.minQuantity ?? 1;
  const priceCents = toMoneyCents(product.sellPrice);
  const subtotalCents = priceCents * quantity;

  if (rule === "percentage") {
    if (quantity < minQuantity || config.value === null) return null;
    const finalUnitCents = Math.round(priceCents * (1 - config.value / 100));
    const discountCents = subtotalCents - finalUnitCents * quantity;
    if (finalUnitCents <= 0 || discountCents <= 0 || discountCents >= subtotalCents) return null;
    return {
      finalUnitPrice: fromMoneyCents(finalUnitCents),
      finalLineTotal: fromMoneyCents(subtotalCents - discountCents),
      discountAmount: fromMoneyCents(discountCents),
    };
  }

  if (rule === "fixedAmount") {
    if (quantity < minQuantity || config.value === null) return null;
    const discountPerUnitCents = toMoneyCents(config.value);
    const finalUnitCents = priceCents - discountPerUnitCents;
    const discountCents = discountPerUnitCents * quantity;
    if (finalUnitCents <= 0 || discountCents <= 0 || discountCents >= subtotalCents) return null;
    return {
      finalUnitPrice: fromMoneyCents(finalUnitCents),
      finalLineTotal: fromMoneyCents(subtotalCents - discountCents),
      discountAmount: fromMoneyCents(discountCents),
    };
  }

  if (rule === "specialPrice") {
    if (quantity < minQuantity || config.specialPrice === null) return null;
    const finalUnitCents = toMoneyCents(config.specialPrice);
    const discountCents = subtotalCents - finalUnitCents * quantity;
    if (finalUnitCents <= 0 || discountCents <= 0 || discountCents >= subtotalCents) return null;
    return {
      finalUnitPrice: fromMoneyCents(finalUnitCents),
      finalLineTotal: fromMoneyCents(subtotalCents - discountCents),
      discountAmount: fromMoneyCents(discountCents),
    };
  }

  const x = Number(config.minQuantity);
  const y = Number(config.payQuantity);
  if (!Number.isInteger(x) || !Number.isInteger(y) || x <= y || y <= 0 || quantity < x) return null;
  const groups = Math.floor(quantity / x);
  const remainder = quantity % x;
  const paidUnits = groups * y + remainder;
  const finalLineCents = paidUnits * priceCents;
  const discountCents = subtotalCents - finalLineCents;
  if (finalLineCents <= 0 || discountCents <= 0 || discountCents >= subtotalCents) return null;

  return {
    finalUnitPrice: roundMoney(fromMoneyCents(finalLineCents) / quantity),
    finalLineTotal: fromMoneyCents(finalLineCents),
    discountAmount: fromMoneyCents(discountCents),
  };
};
