// ---------------------------------------------------------------------------
// Types for promotion product association feature
// ---------------------------------------------------------------------------

export type PromotionProductScope =
  | "ALL"
  | "DIVISION"
  | "DEPARTMENT"
  | "CATEGORY"
  | "UNCATEGORIZED";

/** Categoría mínima retornada dentro de productos disponibles */
export interface AvailableProductCategory {
  id: number;
  code: string;
  name: string;
  level: "DIVISION" | "DEPARTMENT" | "CATEGORY";
}

/** Producto disponible para asociar a una promoción */
export interface AvailablePromotionProduct {
  id: number;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  costPrice: number;
  sellPrice: number;
  active: boolean;
  alreadyAssociated: boolean;
  categories: AvailableProductCategory[];
}

/** Producto ya asociado a una promoción */
export interface PromotionAssociatedProductDetail {
  id: number;
  sku: string;
  barcode: string | null;
  name: string;
  description?: string | null;
  sellPrice: number;
  active: boolean;
  categories?: AvailableProductCategory[];
}

export interface PromotionAssociatedProduct {
  id?: number;
  promotionId?: number;
  productId: number;
  product?: PromotionAssociatedProductDetail;
}

/** Paginación estándar del backend */
export interface PromotionProductPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface InvalidPromotionProduct {
  productId: number;
  sku: string | null;
  name: string;
  currentPrice: number | null;
  requestedValue: number | null;
  resultingPrice: number | null;
  reason: string;
  code: string;
}

/** Respuesta de GET /api/admin-promotions/promotions/:id/available-products */
export interface AvailableProductsResponse {
  products: AvailablePromotionProduct[];
  pagination: PromotionProductPagination;
  invalidProducts?: InvalidPromotionProduct[];
  categories?: AvailableProductCategory[];
}

/** Envoltura real devuelta por el backend */
export interface AvailableProductsApiEnvelope {
  success?: boolean;
  message?: string;
  data?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    products: AvailablePromotionProduct[];
    invalidProducts?: InvalidPromotionProduct[];
    categories?: AvailableProductCategory[];
  };
}

/** Respuesta de POST /api/admin-promotions/promotions/:id/products */
export interface PromotionProductAssociationResponse {
  message?: string;
  added?: number;
  productIds?: number[];
  promotion?: unknown;
}

/** Parámetros para el endpoint de productos disponibles */
export interface GetAvailableProductsParams {
  search?: string;
  scope?: PromotionProductScope;
  categoryId?: number;
  page?: number;
  limit?: number;
  includeAssociated?: boolean;
}
