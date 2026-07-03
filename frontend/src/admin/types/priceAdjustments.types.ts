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
  detailsCount: number;
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
  costPriceAtChange: number;
  isBelowCost: boolean;
  createdAt: string;
}

export interface HistoryProductsApiRow extends Omit<PriceAdjustmentHistoryProduct, "producto"> {
  producto?: PriceAdjustmentHistoryProduct["producto"];
  product?: PriceAdjustmentHistoryProduct["producto"];
}

export interface ApiEnvelope<T> {
  message: string;
  data: T;
}

