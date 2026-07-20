import api from "../../shared/services/api";
import type {
  ApiEnvelope,
  ApplyPriceAdjustmentResult,
  HistoryProductsApiRow,
  HistoryProductsResponse,
  InventoryProductForAdjustment,
  PreviewResult,
  PriceAdjustmentHistoryItem,
  PriceAdjustmentHistoryResponse,
  PriceAdjustmentOperation,
  PriceAdjustmentProduct,
  PriceAdjustmentReversalPreviewResponse,
  PriceAdjustmentScope,
  RevertPriceAdjustmentPayload,
  RevertPriceAdjustmentResult,
  ResolveProductsResult,
} from "../types/priceAdjustments.types";

const BASE_URL = "/api/admin-price-adjustments";

interface ResolveProductsPayload {
  scope: PriceAdjustmentScope;
  categoryId?: number;
  productIds?: number[];
  search?: string;
}

interface PreviewPayload {
  operation: PriceAdjustmentOperation;
  value: number;
  productIds: number[];
}

export interface ApplyPriceAdjustmentPayload extends PreviewPayload {
  scope: PriceAdjustmentScope;
  categoryId?: number;
  notes: string;
  confirmBelowCost?: boolean;
}

export interface HistoryQueryParams {
  search?: string;
  from?: string;
  to?: string;
  operation?: PriceAdjustmentOperation | "";
  scope?: PriceAdjustmentScope | "";
  userId?: number;
  page?: number;
  limit?: number;
}

export interface HistoryProductsQueryParams {
  search?: string;
  page?: number;
  limit?: number;
  onlyBelowCost?: boolean;
}

interface InventoryProductsResponse {
  products: InventoryProductForAdjustment[];
}

const dataOf = <T,>(payload: ApiEnvelope<T>): T => payload.data;

const compactParams = (params: object): Record<string, string | number | boolean> =>
  Object.fromEntries(
    Object.entries(params).filter((entry): entry is [string, string | number | boolean] => {
      const value = entry[1];
      return value !== undefined && value !== "";
    })
  );

const normalizeHistoryProducts = (
  response: Omit<HistoryProductsResponse, "products"> & { products: HistoryProductsApiRow[] }
): HistoryProductsResponse => ({
  ...response,
  products: response.products
    .map((row) => {
      const producto = row.producto ?? row.product;
      return producto ? { ...row, producto } : null;
    })
    .filter((row): row is HistoryProductsResponse["products"][number] => row !== null),
});

export const priceAdjustmentsApi = {
  async listActiveInventoryProducts(search?: string): Promise<InventoryProductForAdjustment[]> {
    const response = await api.get<InventoryProductsResponse>("/api/admin/inventory", {
      params: compactParams({ search: search?.trim() }),
    });
    return response.data.products.filter((product) => product.active);
  },

  async resolveProducts(payload: ResolveProductsPayload): Promise<ResolveProductsResult> {
    const response = await api.post<ApiEnvelope<ResolveProductsResult>>(
      `${BASE_URL}/resolve-products`,
      payload
    );
    return dataOf(response.data);
  },

  async preview(payload: PreviewPayload): Promise<PreviewResult> {
    const response = await api.post<ApiEnvelope<PreviewResult>>(`${BASE_URL}/preview`, payload);
    return dataOf(response.data);
  },

  async apply(payload: ApplyPriceAdjustmentPayload): Promise<ApplyPriceAdjustmentResult> {
    const response = await api.post<ApiEnvelope<ApplyPriceAdjustmentResult>>(
      `${BASE_URL}/apply`,
      payload
    );
    return dataOf(response.data);
  },

  async getHistory(params: HistoryQueryParams): Promise<PriceAdjustmentHistoryResponse> {
    const response = await api.get<ApiEnvelope<PriceAdjustmentHistoryResponse>>(
      `${BASE_URL}/history`,
      { params: compactParams(params) }
    );
    return dataOf(response.data);
  },

  async getAdjustment(id: number): Promise<PriceAdjustmentHistoryItem> {
    const response = await api.get<ApiEnvelope<PriceAdjustmentHistoryItem>>(
      `${BASE_URL}/history/${id}`
    );
    return dataOf(response.data);
  },

  async getAdjustmentProducts(
    id: number,
    params: HistoryProductsQueryParams
  ): Promise<HistoryProductsResponse> {
    const response = await api.get<
      ApiEnvelope<Omit<HistoryProductsResponse, "products"> & { products: HistoryProductsApiRow[] }>
    >(`${BASE_URL}/history/${id}/products`, {
      params: compactParams(params),
    });
    return normalizeHistoryProducts(dataOf(response.data));
  },

  async getReversalPreview(id: number): Promise<PriceAdjustmentReversalPreviewResponse> {
    const response = await api.get<ApiEnvelope<PriceAdjustmentReversalPreviewResponse>>(
      `${BASE_URL}/history/${id}/reversal-preview`
    );
    return dataOf(response.data);
  },

  async revertAdjustment(
    id: number,
    payload: RevertPriceAdjustmentPayload
  ): Promise<RevertPriceAdjustmentResult> {
    const response = await api.post<ApiEnvelope<RevertPriceAdjustmentResult>>(
      `${BASE_URL}/history/${id}/revert`,
      payload
    );
    return dataOf(response.data);
  },
};

export const getApiErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === "object" && error !== null && "response" in error) {
    const apiError = error as { response?: { data?: { message?: string; error?: string } } };
    return apiError.response?.data?.message || apiError.response?.data?.error || fallback;
  }

  return fallback;
};

export type { PriceAdjustmentProduct };
