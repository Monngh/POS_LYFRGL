export type PriceAdjustmentScope =
  | "SELECTED_PRODUCTS"
  | "DIVISION"
  | "DEPARTMENT"
  | "CATEGORY"
  | "UNCATEGORIZED";

export type PriceAdjustmentOperation =
  | "PERCENT_INCREASE"
  | "PERCENT_DECREASE"
  | "FIXED_INCREASE"
  | "FIXED_DECREASE"
  | "SET_EXACT";

export interface PriceAdjustmentCategory {
  id: number;
  code: string;
  name: string;
  level: "DIVISION" | "DEPARTMENT" | "CATEGORY";
  active: boolean;
}

export interface PriceAdjustmentProduct {
  id: number;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  costPrice: number;
  sellPrice: number;
  active: boolean;
  categories: PriceAdjustmentCategory[];
}

export interface InventoryProductForAdjustment extends PriceAdjustmentProduct {
  stock: number;
  minStock: number;
  low: boolean;
  branchCount: number;
}

export interface ResolveProductsResult {
  scope: PriceAdjustmentScope;
  categoryId?: number;
  total: number;
  products: PriceAdjustmentProduct[];
}

export interface PreviewProduct {
  id: number;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  costPrice: number;
  currentSellPrice: number;
  newSellPrice: number;
  isBelowCost: boolean;
  discountPercentage: number;
}

export interface PreviewResult {
  affectedCount: number;
  belowCostCount: number;
  requiresBelowCostConfirmation: boolean;
  requiresReason: boolean;
  products: PreviewProduct[];
}

export interface ApplyPriceAdjustmentResult {
  id: number;
  type: string;
  direction: string;
  scope: PriceAdjustmentScope;
  value: number;
  affectedRows: number;
  belowCostCount: number;
  notes: string | null;
  appliedAt: string;
  appliedBy: PriceAdjustmentUser;
  category: PriceAdjustmentHistoryCategory | null;
  products: AppliedPriceAdjustmentProduct[];
}

export interface AppliedPriceAdjustmentProduct {
  id: number;
  sku: string;
  name: string;
  oldSellPrice: number;
  newSellPrice: number;
  costPriceAtChange: number;
  isBelowCost: boolean;
}

export interface PriceAdjustmentUser {
  id: number;
  name: string;
  email: string | null;
}

export interface PriceAdjustmentHistoryCategory {
  id: number;
  code: string;
  name: string;
  level: "DIVISION" | "DEPARTMENT" | "CATEGORY";
}

export interface PriceAdjustmentHistoryItem {
  id: number;
  type: string;
  direction: string;
  scope: PriceAdjustmentScope;
  value: number;
  affectedRows: number;
  belowCostCount: number;
  notes: string | null;
  appliedAt: string;
  appliedBy: PriceAdjustmentUser;
  category: PriceAdjustmentHistoryCategory | null;
  reversalOfId: number | null;
  reversalOf: PriceAdjustmentRelatedAdjustment | null;
  reversals: PriceAdjustmentRelatedAdjustment[];
  reversalStatus: PriceAdjustmentReversalStatus;
  detailsCount: number;
}

export interface PriceAdjustmentRelatedAdjustment {
  id: number;
  appliedAt: string;
}

export type PriceAdjustmentReversalStatusCode =
  | "NOT_REVERTED"
  | "PARTIALLY_REVERTED"
  | "FULLY_REVERTED"
  | "REVERSAL";

export interface PriceAdjustmentReversalStatus {
  status: PriceAdjustmentReversalStatusCode;
  label: string;
  totalRows: number;
  reversedRows: number;
  reversibleRows: number;
  isReversal: boolean;
}

export interface PriceAdjustmentHistoryResponse {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  adjustments: PriceAdjustmentHistoryItem[];
}

export interface HistoryProductsResponse {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  products: PriceAdjustmentHistoryProduct[];
}

export interface PriceAdjustmentHistoryProduct {
  id: number;
  producto: {
    id: number;
    sku: string;
    barcode: string | null;
    name: string;
    description: string | null;
    active: boolean;
  };
  oldSellPrice: number;
  newSellPrice: number;
  currentSellPrice: number;
  costPriceAtChange: number;
  isBelowCost: boolean;
  reversedAt: string | null;
  reversedByAdjustmentId: number | null;
  reversalSourceDetailId: number | null;
  createdAt: string;
}

export type PriceAdjustmentReversalReasonCode =
  | "ADJUSTMENT_NOT_FOUND"
  | "ADJUSTMENT_IS_REVERSAL"
  | "REVERSAL_WINDOW_EXPIRED"
  | "DETAIL_NOT_FOUND"
  | "DETAIL_NOT_IN_ADJUSTMENT"
  | "ALREADY_REVERTED"
  | "PRODUCT_NOT_FOUND"
  | "PRODUCT_INACTIVE"
  | "PRICE_CHANGED"
  | "INVALID_TARGET_PRICE"
  | "INCOMPLETE_HISTORY";

export interface PriceAdjustmentReversalConflict {
  detailId?: number;
  productId?: number;
  name?: string;
  sku?: string;
  reasonCode: PriceAdjustmentReversalReasonCode;
  reason: string;
  originalNewPrice?: number;
  currentPrice?: number;
  targetPrice?: number;
}

export interface PriceAdjustmentReversalProduct {
  detailId: number;
  productId: number;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  oldSellPrice: number;
  newSellPrice: number;
  currentSellPrice: number | null;
  targetSellPrice: number;
  costPriceAtChange: number;
  isBelowCost: boolean;
  active: boolean;
  reversedAt: string | null;
  reversedByAdjustmentId: number | null;
  reversible: boolean;
  reasonCode: PriceAdjustmentReversalReasonCode | null;
  reason: string | null;
  conflicts: PriceAdjustmentReversalConflict[];
}

export interface PriceAdjustmentReversalPreviewResponse {
  adjustment: PriceAdjustmentHistoryItem & {
    reversalDeadline: string;
    canRevert: boolean;
    blockReason: string | null;
  };
  products: PriceAdjustmentReversalProduct[];
  summary: {
    total: number;
    reversible: number;
    conflicted: number;
    reversed: number;
    status: PriceAdjustmentReversalStatusCode;
    label: string;
  };
}

export interface RevertPriceAdjustmentPayload {
  productDetailIds: number[];
  reason: string;
  credential: string;
}

export interface RevertPriceAdjustmentResult {
  id: number;
  type: string;
  direction: string;
  scope: PriceAdjustmentScope;
  value: number;
  affectedRows: number;
  belowCostCount: number;
  notes: string | null;
  appliedAt: string;
  appliedBy: PriceAdjustmentUser;
  category: PriceAdjustmentHistoryCategory | null;
  reversalOfId: number | null;
  reversalOf: PriceAdjustmentRelatedAdjustment | null;
  products: Array<{
    detailId: number;
    productId: number;
    sku: string;
    name: string;
    currentSellPrice: number;
    restoredSellPrice: number;
    sourceDetailId: number | null;
  }>;
}

export interface HistoryProductsApiRow extends Omit<PriceAdjustmentHistoryProduct, "producto"> {
  producto?: PriceAdjustmentHistoryProduct["producto"];
  product?: PriceAdjustmentHistoryProduct["producto"];
}

export interface ApiEnvelope<T> {
  message: string;
  data: T;
}

