import assert from "node:assert/strict";
import {
  calculatePromotionLine,
  getPromotionValidationIssues,
  validateMoneyScale,
  type PromotionConfigForValidation,
  type PromotionProductForValidation,
} from "./src/services/promotionRules.util";

const product = (sellPrice: number, costPrice = 0, name = "Agua"): PromotionProductForValidation => ({
  id: Math.round(sellPrice * 100),
  name,
  active: true,
  sellPrice,
  costPrice,
});

const config = (partial: Partial<PromotionConfigForValidation>): PromotionConfigForValidation => ({
  typeName: "Percentage",
  value: null,
  minQuantity: null,
  payQuantity: null,
  specialPrice: null,
  ...partial,
});

const valid = (promotion: PromotionConfigForValidation, products: PromotionProductForValidation[]) =>
  getPromotionValidationIssues(promotion, products).length === 0;

// Porcentaje
assert.equal(valid(config({ typeName: "Percentage", value: 0 }), [product(100)]), false);
assert.equal(valid(config({ typeName: "Percentage", value: 0.01 }), [product(100)]), true);
assert.equal(valid(config({ typeName: "Percentage", value: 10 }), [product(100)]), true);
assert.equal(valid(config({ typeName: "Percentage", value: 99.99 }), [product(100)]), true);
assert.equal(valid(config({ typeName: "Percentage", value: 100 }), [product(100)]), false);
assert.equal(valid(config({ typeName: "Percentage", value: -1 }), [product(100)]), false);
assert.equal(validateMoneyScale("10.123", "El porcentaje") !== null, true);

// Monto fijo
assert.equal(valid(config({ typeName: "FixedAmount", value: 5 }), [product(13)]), true);
assert.equal(valid(config({ typeName: "FixedAmount", value: 12.99 }), [product(13)]), true);
assert.equal(valid(config({ typeName: "FixedAmount", value: 13 }), [product(13)]), false);
assert.equal(valid(config({ typeName: "FixedAmount", value: 50 }), [product(13)]), false);
assert.equal(valid(config({ typeName: "FixedAmount", value: 50 }), [product(100, 0, "A"), product(13, 0, "B")]), false);
assert.equal(valid(config({ typeName: "FixedAmount", value: 50 }), [product(30)]), false);

// Precio especial
assert.equal(valid(config({ typeName: "SpecialPrice", specialPrice: 10 }), [product(13)]), true);
assert.equal(valid(config({ typeName: "SpecialPrice", specialPrice: 0 }), [product(13)]), false);
assert.equal(valid(config({ typeName: "SpecialPrice", specialPrice: 13 }), [product(13)]), false);
assert.equal(valid(config({ typeName: "SpecialPrice", specialPrice: 14 }), [product(13)]), false);
assert.equal(valid(config({ typeName: "SpecialPrice", specialPrice: 10 }), [product(13, 12)]), false);

// Lleva X paga Y
const threeForTwo = config({ typeName: "BuyXPayY", minQuantity: 3, payQuantity: 2 });
const expectedLineTotals = [10, 20, 20, 30, 40, 40, 50];
for (let quantity = 1; quantity <= 7; quantity++) {
  const line = calculatePromotionLine(threeForTwo, product(10), quantity);
  const finalLineTotal = line?.finalLineTotal ?? quantity * 10;
  assert.equal(finalLineTotal, expectedLineTotals[quantity - 1], `3x2 quantity ${quantity}`);
}
assert.equal(valid(config({ typeName: "BuyXPayY", minQuantity: 3, payQuantity: 3 }), [product(10)]), false);
assert.equal(valid(config({ typeName: "BuyXPayY", minQuantity: 2, payQuantity: 3 }), [product(10)]), false);
assert.equal(valid(config({ typeName: "BuyXPayY", minQuantity: 3, payQuantity: 0 }), [product(10)]), false);
assert.equal(valid(config({ typeName: "BuyXPayY", minQuantity: 3.5, payQuantity: 2 }), [product(10)]), false);

console.log("Promotion rule regression tests passed.");
