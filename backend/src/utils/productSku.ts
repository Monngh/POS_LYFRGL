const SKU_PREFIX = "PROD-";
const SKU_MINIMUM_WIDTH = 3;
const SKU_SEQUENCE_PATTERN = /^PROD-(\d+)$/;

interface ProductSkuRecord {
  sku: string;
}

export const buildNextProductSku = (products: readonly ProductSkuRecord[]): string => {
  let maxNumber = 0n;

  for (const product of products) {
    const match = SKU_SEQUENCE_PATTERN.exec(product.sku);
    if (!match) continue;

    const numericSuffix = BigInt(match[1]);
    if (numericSuffix > maxNumber) maxNumber = numericSuffix;
  }

  const nextNumber = maxNumber + 1n;
  return `${SKU_PREFIX}${String(nextNumber).padStart(SKU_MINIMUM_WIDTH, "0")}`;
};
