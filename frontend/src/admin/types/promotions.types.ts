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

/** Paginación estándar del backend */
export interface PromotionProductPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** Respuesta de GET /api/admin-promotions/promotions/:id/available-products */
export interface AvailableProductsResponse {
  products: AvailablePromotionProduct[];
  pagination: PromotionProductPagination;
  categories?: AvailableProductCategory[];
}

/** Respuesta de POST /api/admin-promotions/promotions/:id/products */
export interface PromotionProductAssociationResponse {
  message?: string;
  added?: number;
  productIds?: number[];
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
