import api from "../../shared/services/api";

export type CategoryLevel = "DIVISION" | "DEPARTMENT" | "CATEGORY";

export interface AdminCategorySummary {
  id: number;
  code: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  active: boolean;
  level: CategoryLevel;
  parentId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminCategoryTreeNode extends AdminCategorySummary {
  children?: AdminCategoryTreeNode[];
}

export interface AdminCategoryFlatItem extends AdminCategorySummary {
  parent: (AdminCategorySummary & { parent: AdminCategorySummary | null }) | null;
  path: string[];
  pathLabel: string;
}

export interface AdminCategoryDetail extends AdminCategorySummary {
  parent: AdminCategorySummary | null;
  children: AdminCategorySummary[];
  productCounts: {
    productCategory: number;
    legacyCategoryId: number;
    total: number;
  };
}

export interface AdminCategoryProduct {
  id: number;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  sellPrice: number;
  active: boolean;
}

export interface ProductPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedCategoryProducts {
  products: AdminCategoryProduct[];
  pagination: ProductPagination;
}

export interface CategoryProductUpdateResult {
  categoryId: number;
  added: number;
  removed: number;
  productIds: number[];
}

export interface ProductListParams {
  search?: string;
  page?: number;
  limit?: number;
  includeInactive?: boolean;
}

export type CategoryProductPageLoader = (params: ProductListParams) => Promise<PaginatedCategoryProducts>;

export interface CreateCategoryPayload {
  level: CategoryLevel;
  parentId?: number;
  divisionPrefix?: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
}

export interface UpdateCategoryPayload {
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
}

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

const dataOf = <T,>(payload: ApiEnvelope<T>): T => payload.data;

export const getAdminCategoryErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === "object" && error !== null && "response" in error) {
    const apiError = error as { response?: { status?: number; data?: { message?: string } } };
    if (apiError.response?.status === 403) {
      return apiError.response.data?.message || "Permiso insuficiente para administrar categorias.";
    }
    return apiError.response?.data?.message || fallback;
  }

  return fallback;
};

export const fetchAllAdminCategoryProducts = async (
  loader: CategoryProductPageLoader
): Promise<AdminCategoryProduct[]> => {
  const first = await loader({ page: 1, limit: 100, includeInactive: true });
  const totalPages = first.pagination.totalPages;
  if (totalPages <= 1) return first.products;

  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      loader({ page: index + 2, limit: 100, includeInactive: true })
    )
  );

  return [...first.products, ...rest.flatMap((page) => page.products)];
};

export const adminCategoryService = {
  async listTree(): Promise<AdminCategoryTreeNode[]> {
    const response = await api.get<ApiEnvelope<AdminCategoryTreeNode[]>>("/api/admin-categories");
    return dataOf(response.data);
  },

  async listFlat(params: {
    search?: string;
    level?: CategoryLevel;
    active?: boolean;
    parentId?: number;
    includeInactive?: boolean;
    onlyFinal?: boolean;
  } = {}): Promise<AdminCategoryFlatItem[]> {
    const response = await api.get<ApiEnvelope<AdminCategoryFlatItem[]>>("/api/admin-categories/flat", {
      params,
    });
    return dataOf(response.data);
  },

  async getDetail(categoryId: number): Promise<AdminCategoryDetail> {
    const response = await api.get<ApiEnvelope<AdminCategoryDetail>>(`/api/admin-categories/${categoryId}`);
    return dataOf(response.data);
  },

  async create(payload: CreateCategoryPayload): Promise<AdminCategorySummary> {
    const response = await api.post<ApiEnvelope<AdminCategorySummary>>("/api/admin-categories", payload);
    return dataOf(response.data);
  },

  async update(categoryId: number, payload: UpdateCategoryPayload): Promise<AdminCategorySummary> {
    const response = await api.put<ApiEnvelope<AdminCategorySummary>>(`/api/admin-categories/${categoryId}`, payload);
    return dataOf(response.data);
  },

  async updateStatus(categoryId: number, active: boolean): Promise<AdminCategorySummary> {
    const response = await api.patch<ApiEnvelope<AdminCategorySummary>>(`/api/admin-categories/${categoryId}/status`, {
      active,
    });
    return dataOf(response.data);
  },

  async remove(categoryId: number): Promise<AdminCategorySummary> {
    const response = await api.delete<ApiEnvelope<AdminCategorySummary>>(`/api/admin-categories/${categoryId}`);
    return dataOf(response.data);
  },

  async listProducts(categoryId: number, params: ProductListParams = {}): Promise<PaginatedCategoryProducts> {
    const response = await api.get<ApiEnvelope<PaginatedCategoryProducts>>(
      `/api/admin-categories/${categoryId}/products`,
      { params }
    );
    return dataOf(response.data);
  },

  async replaceProducts(categoryId: number, productIds: number[]): Promise<CategoryProductUpdateResult> {
    const response = await api.put<ApiEnvelope<CategoryProductUpdateResult>>(
      `/api/admin-categories/${categoryId}/products`,
      { productIds }
    );
    return dataOf(response.data);
  },

  async listUncategorizedProducts(params: ProductListParams = {}): Promise<PaginatedCategoryProducts> {
    const response = await api.get<ApiEnvelope<PaginatedCategoryProducts>>(
      "/api/admin-categories/products/uncategorized",
      { params }
    );
    return dataOf(response.data);
  },
};
