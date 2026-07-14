import api from "../../shared/services/api";
import type {
  AvailableProductsApiEnvelope,
  AvailableProductsResponse,
  GetAvailableProductsParams,
  PromotionProductAssociationResponse,
} from "../types/promotions.types";

const BASE_URL = "/api/admin-promotions/promotions";

/** Limpia parámetros undefined/vacíos antes de enviarlos */
const compactParams = (
  params: Record<string, string | number | boolean | undefined>
): Record<string, string | number | boolean> =>
  Object.fromEntries(
    Object.entries(params).filter(
      (entry): entry is [string, string | number | boolean] =>
        entry[1] !== undefined && entry[1] !== ""
    )
  );

/**
 * Normaliza la envoltura real del backend:
 * { success, message, data: { page, limit, total, totalPages, products } }
 */
const normalizeAvailableProductsResponse = (
  payload: AvailableProductsApiEnvelope | AvailableProductsResponse
): AvailableProductsResponse => {
  if ("data" in payload && payload.data) {
    return {
      products: payload.data.products,
      pagination: {
        page: payload.data.page,
        limit: payload.data.limit,
        total: payload.data.total,
        totalPages: payload.data.totalPages,
      },
      categories: payload.data.categories,
    };
  }

  return payload as AvailableProductsResponse;
};

/**
 * Obtiene productos disponibles para asociar a una promoción.
 * GET /api/admin-promotions/promotions/:id/available-products
 */
export async function getAvailablePromotionProducts(
  promotionId: number,
  params: GetAvailableProductsParams = {}
): Promise<AvailableProductsResponse> {
  const response = await api.get<AvailableProductsApiEnvelope | AvailableProductsResponse>(
    `${BASE_URL}/${promotionId}/available-products`,
    {
      params: compactParams({
        search: params.search,
        scope: params.scope,
        categoryId: params.categoryId,
        page: params.page,
        limit: params.limit,
        includeAssociated: params.includeAssociated,
      }),
    }
  );
  return normalizeAvailableProductsResponse(response.data);
}

/**
 * Asocia productos a una promoción.
 * POST /api/admin-promotions/promotions/:id/products
 */
export async function addProductsToPromotion(
  promotionId: number,
  productIds: number[]
): Promise<PromotionProductAssociationResponse> {
  const response = await api.post<PromotionProductAssociationResponse>(
    `${BASE_URL}/${promotionId}/products`,
    { productIds }
  );
  return response.data;
}

/**
 * Quita un producto de una promoción.
 * DELETE /api/admin-promotions/promotions/:id/products/:productId
 */
export async function removeProductFromPromotion(
  promotionId: number,
  productId: number
): Promise<PromotionProductAssociationResponse> {
  const response = await api.delete<PromotionProductAssociationResponse>(
    `${BASE_URL}/${promotionId}/products/${productId}`
  );
  return response.data;
}

/** Extrae mensaje de error de respuestas Axios */
export const getPromotionApiError = (error: unknown, fallback: string): string => {
  if (typeof error === "object" && error !== null && "response" in error) {
    const apiError = error as { response?: { data?: { message?: string; error?: string } } };
    return apiError.response?.data?.message || apiError.response?.data?.error || fallback;
  }
  return fallback;
};
