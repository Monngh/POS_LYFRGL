import { Prisma } from "@prisma/client";
import { prisma } from "../app";
import { AppError } from "../utils/AppError";
import { parseSearchWords } from "../utils/search.util";

export const CATEGORY_LEVELS = ["DIVISION", "DEPARTMENT", "CATEGORY"] as const;
export type CategoryLevel = (typeof CATEGORY_LEVELS)[number];

export interface CategoryTextInput {
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
}

export interface CreateCategoryInput extends CategoryTextInput {
  level: CategoryLevel;
  parentId?: number | null;
  divisionPrefix?: string;
}

export interface CategoryFlatFilters {
  search?: string;
  level?: CategoryLevel;
  active?: boolean;
  parentId?: number;
  includeInactive: boolean;
  onlyFinal: boolean;
}

export interface ProductListFilters {
  search?: string;
  page: number;
  limit: number;
  includeInactive: boolean;
}

export interface PaginatedProducts {
  products: ProductSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ProductSummary {
  id: number;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  sellPrice: number;
  active: boolean;
}

const NAME_MAX_LENGTH = 30;
const DESCRIPTION_MAX_LENGTH = 50;
const COLOR_MAX_LENGTH = 20;
const ICON_MAX_LENGTH = 50;
const MAX_CHILD_SUFFIX = 99;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const categorySummarySelect = {
  id: true,
  code: true,
  name: true,
  description: true,
  color: true,
  icon: true,
  active: true,
  level: true,
  parentId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CategorySelect;

const categoryTreeSelect = {
  ...categorySummarySelect,
  children: {
    where: { level: "DEPARTMENT" },
    orderBy: { code: "asc" },
    select: {
      ...categorySummarySelect,
      children: {
        where: { level: "CATEGORY" },
        orderBy: { code: "asc" },
        select: categorySummarySelect,
      },
    },
  },
} satisfies Prisma.CategorySelect;

const categoryDetailSelect = {
  ...categorySummarySelect,
  parent: { select: categorySummarySelect },
  children: {
    orderBy: { code: "asc" },
    select: categorySummarySelect,
  },
} satisfies Prisma.CategorySelect;

const categoryFlatSelect = {
  ...categorySummarySelect,
  parent: {
    select: {
      ...categorySummarySelect,
      parent: { select: categorySummarySelect },
    },
  },
} satisfies Prisma.CategorySelect;

const productSummarySelect = {
  id: true,
  sku: true,
  barcode: true,
  name: true,
  description: true,
  sellPrice: true,
  active: true,
} satisfies Prisma.ProductSelect;

type CategorySummaryPayload = Prisma.CategoryGetPayload<{ select: typeof categorySummarySelect }>;
type CategoryTreePayload = Prisma.CategoryGetPayload<{ select: typeof categoryTreeSelect }>;
type CategoryFlatPayload = Prisma.CategoryGetPayload<{ select: typeof categoryFlatSelect }>;
type ProductSummaryPayload = Prisma.ProductGetPayload<{ select: typeof productSummarySelect }>;

export interface CategorySummary {
  id: number;
  code: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  active: boolean;
  level: string;
  parentId: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CategoryTreeNode extends CategorySummary {
  children?: CategoryTreeNode[];
}

export interface CategoryFlatItem extends CategorySummary {
  parent: (CategorySummary & { parent: CategorySummary | null }) | null;
  path: string[];
  pathLabel: string;
}

export interface CategoryDetail extends CategorySummary {
  parent: CategorySummary | null;
  children: CategorySummary[];
  productCounts: {
    productCategory: number;
    legacyCategoryId: number;
    total: number;
  };
}

export const isCategoryLevel = (value: unknown): value is CategoryLevel =>
  typeof value === "string" && CATEGORY_LEVELS.includes(value as CategoryLevel);

const cleanRequiredText = (value: string, fieldName: string, maxLength: number): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new AppError(`${fieldName} es obligatorio.`, 400);
  }
  if (trimmed.length > maxLength) {
    throw new AppError(`${fieldName} no puede exceder ${maxLength} caracteres.`, 400);
  }
  return trimmed;
};

const cleanOptionalText = (value: string | null | undefined, fieldName: string, maxLength: number): string | null => {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) {
    throw new AppError(`${fieldName} no puede exceder ${maxLength} caracteres.`, 400);
  }
  return trimmed;
};

const normalizeCategoryTextInput = (input: CategoryTextInput): CategoryTextInput => ({
  name: cleanRequiredText(input.name, "El nombre de la categoria", NAME_MAX_LENGTH),
  description: cleanOptionalText(input.description, "La descripcion", DESCRIPTION_MAX_LENGTH),
  color: cleanOptionalText(input.color, "El color", COLOR_MAX_LENGTH),
  icon: cleanOptionalText(input.icon, "El icono", ICON_MAX_LENGTH),
});

const mapCategorySummary = (category: CategorySummaryPayload): CategorySummary => ({
  id: category.id,
  code: category.code,
  name: category.name,
  description: category.description,
  color: category.color,
  icon: category.icon,
  active: category.active,
  level: category.level,
  parentId: category.parentId,
  createdAt: category.createdAt,
  updatedAt: category.updatedAt,
});

const mapProductSummary = (product: ProductSummaryPayload): ProductSummary => ({
  id: product.id,
  sku: product.sku,
  barcode: product.barcode,
  name: product.name,
  description: product.description,
  sellPrice: Number(product.sellPrice),
  active: product.active,
});

const mapCategoryTree = (division: CategoryTreePayload): CategoryTreeNode => ({
  ...mapCategorySummary(division),
  children: division.children.map((department) => ({
    ...mapCategorySummary(department),
    children: department.children.map((category) => mapCategorySummary(category)),
  })),
});

const mapCategoryFlatItem = (category: CategoryFlatPayload): CategoryFlatItem => {
  const parent = category.parent
    ? {
        ...mapCategorySummary(category.parent),
        parent: category.parent.parent ? mapCategorySummary(category.parent.parent) : null,
      }
    : null;
  const path = [
    parent?.parent?.name,
    parent?.name,
    category.name,
  ].filter((value): value is string => Boolean(value));

  return {
    ...mapCategorySummary(category),
    parent,
    path,
    pathLabel: path.join(" > "),
  };
};

const buildTextSearchWhere = (
  search: string | undefined,
  fields: Array<"code" | "name" | "description">
): Prisma.CategoryWhereInput => {
  const terms = search ? parseSearchWords(search) : [];
  if (terms.length === 0) return {};

  return {
    AND: terms.map((term) => ({
      OR: fields.flatMap((field) => {
        if (field === "code") {
          return [{ code: { contains: term.toUpperCase() } }, { code: { contains: term } }];
        }
        return [{ [field]: { contains: term } }];
      }),
    })),
  };
};

const buildProductSearchWhere = (search?: string): Prisma.ProductWhereInput => {
  const terms = search ? parseSearchWords(search) : [];
  if (terms.length === 0) return {};

  return {
    AND: terms.map((term) => ({
      OR: [
        { sku: { contains: term } },
        { barcode: { contains: term } },
        { name: { contains: term } },
        { description: { contains: term } },
      ],
    })),
  };
};

const normalizeDivisionPrefix = (divisionPrefix?: string): string => {
  const code = divisionPrefix?.trim().toUpperCase() ?? "";
  if (!/^[A-Z]{2}$/.test(code)) {
    throw new AppError("El prefijo de division debe tener exactamente dos letras.", 400);
  }
  return code;
};

const ensureUniqueName = async (
  tx: Prisma.TransactionClient,
  name: string,
  ignoredCategoryId?: number
): Promise<void> => {
  const existing = await tx.category.findUnique({
    where: { name },
    select: { id: true },
  });

  if (existing && existing.id !== ignoredCategoryId) {
    throw new AppError("Ya existe una categoria con ese nombre.", 409);
  }
};

const ensureUniqueCode = async (tx: Prisma.TransactionClient, code: string): Promise<void> => {
  const existing = await tx.category.findUnique({
    where: { code },
    select: { id: true },
  });

  if (existing) {
    throw new AppError("Ya existe una categoria con ese codigo.", 409);
  }
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getNextChildCode = async (
  tx: Prisma.TransactionClient,
  parentCode: string,
  parentId: number,
  childLevel: CategoryLevel,
  maxMessage: string
): Promise<string> => {
  const children = await tx.category.findMany({
    where: { parentId, level: childLevel },
    select: { code: true },
  });

  const pattern = new RegExp(`^${escapeRegExp(parentCode)}(\\d{2})$`);
  const maxSuffix = children.reduce((max, child) => {
    const match = child.code.match(pattern);
    if (!match) return max;
    const suffix = Number(match[1]);
    return Number.isInteger(suffix) ? Math.max(max, suffix) : max;
  }, 0);

  if (maxSuffix >= MAX_CHILD_SUFFIX) {
    throw new AppError(maxMessage, 400);
  }

  return `${parentCode}${String(maxSuffix + 1).padStart(2, "0")}`;
};

const resolveCreateCodeAndParent = async (
  tx: Prisma.TransactionClient,
  input: CreateCategoryInput
): Promise<{ code: string; parentId: number | null }> => {
  if (input.level === "DIVISION") {
    if (input.parentId !== undefined && input.parentId !== null) {
      throw new AppError("Una division no puede tener categoria padre.", 400);
    }
    const code = normalizeDivisionPrefix(input.divisionPrefix);
    await ensureUniqueCode(tx, code);
    return { code, parentId: null };
  }

  if (!input.parentId) {
    throw new AppError("parentId es obligatorio para departamentos y categorias finales.", 400);
  }

  const parent = await tx.category.findUnique({
    where: { id: input.parentId },
    select: { id: true, code: true, level: true, active: true },
  });

  if (!parent) {
    throw new AppError("La categoria padre no existe.", 404);
  }

  if (!parent.active) {
    throw new AppError("No se puede crear una categoria debajo de un padre inactivo.", 400);
  }

  if (input.level === "DEPARTMENT") {
    if (parent.level !== "DIVISION") {
      throw new AppError("Un departamento solo puede depender de una division activa.", 400);
    }
    if (!/^[A-Z]{2}$/.test(parent.code)) {
      throw new AppError("El codigo de la division padre no tiene formato valido.", 400);
    }

    return {
      parentId: parent.id,
      code: await getNextChildCode(
        tx,
        parent.code,
        parent.id,
        "DEPARTMENT",
        "No es posible crear mas departamentos en esta division."
      ),
    };
  }

  if (parent.level !== "DEPARTMENT") {
    throw new AppError("Una categoria final solo puede depender de un departamento activo.", 400);
  }
  if (!/^[A-Z]{2}\d{2}$/.test(parent.code)) {
    throw new AppError("El codigo del departamento padre no tiene formato valido.", 400);
  }

  return {
    parentId: parent.id,
    code: await getNextChildCode(
      tx,
      parent.code,
      parent.id,
      "CATEGORY",
      "No es posible crear mas categorias en este departamento."
    ),
  };
};

const assertCategoryExists = async (
  tx: Prisma.TransactionClient,
  categoryId: number
): Promise<CategorySummaryPayload> => {
  const category = await tx.category.findUnique({
    where: { id: categoryId },
    select: categorySummarySelect,
  });

  if (!category) {
    throw new AppError("Categoria no encontrada.", 404);
  }

  return category;
};

const assertFinalCategory = async (
  tx: Prisma.TransactionClient,
  categoryId: number,
  options: { requireActive: boolean; message?: string }
): Promise<CategorySummaryPayload> => {
  const category = await assertCategoryExists(tx, categoryId);

  if (category.level !== "CATEGORY") {
    throw new AppError(options.message ?? "Solo se pueden asignar categorias finales a productos.", 400);
  }

  if (options.requireActive && !category.active) {
    throw new AppError("No se pueden asignar productos a una categoria inactiva.", 400);
  }

  return category;
};

const uniqueIds = (ids: number[]): number[] => [...new Set(ids)];

const assertProductsExist = async (tx: Prisma.TransactionClient, productIds: number[]): Promise<void> => {
  if (productIds.length === 0) return;

  const count = await tx.product.count({
    where: { id: { in: productIds } },
  });

  if (count !== productIds.length) {
    throw new AppError("Uno o mas productos no existen.", 404);
  }
};

const paginationParams = (page: number, limit: number): { page: number; limit: number; skip: number } => {
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const safeLimit = Number.isInteger(limit) && limit > 0
    ? Math.min(limit, MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;
  return {
    page: safePage,
    limit: safeLimit,
    skip: (safePage - 1) * safeLimit,
  };
};

export const getCategoryTree = async (): Promise<CategoryTreeNode[]> => {
  const divisions = await prisma.category.findMany({
    where: { level: "DIVISION", parentId: null },
    orderBy: { code: "asc" },
    select: categoryTreeSelect,
  });

  return divisions.map(mapCategoryTree);
};

export const listCategoriesFlat = async (filters: CategoryFlatFilters): Promise<CategoryFlatItem[]> => {
  if (filters.onlyFinal && filters.level && filters.level !== "CATEGORY") {
    throw new AppError("onlyFinal solo puede combinarse con level=CATEGORY.", 400);
  }

  const baseWhere: Prisma.CategoryWhereInput = {};
  if (filters.onlyFinal) {
    baseWhere.level = "CATEGORY";
  } else if (filters.level) {
    baseWhere.level = filters.level;
  }
  if (filters.parentId !== undefined) {
    baseWhere.parentId = filters.parentId;
  }
  if (filters.active !== undefined) {
    baseWhere.active = filters.active;
  } else if (!filters.includeInactive) {
    baseWhere.active = true;
  }

  const searchWhere = buildTextSearchWhere(filters.search, ["code", "name", "description"]);

  const categories = await prisma.category.findMany({
    where: { ...baseWhere, ...searchWhere },
    orderBy: { code: "asc" },
    select: categoryFlatSelect,
  });

  return categories.map(mapCategoryFlatItem);
};

export const getCategoryDetail = async (categoryId: number): Promise<CategoryDetail> => {
  const [category, productCategoryRows, legacyProductRows] = await Promise.all([
    prisma.category.findUnique({
      where: { id: categoryId },
      select: categoryDetailSelect,
    }),
    prisma.productCategory.findMany({
      where: { categoryId },
      select: { productId: true },
    }),
    prisma.product.findMany({
      where: { categoryId },
      select: { id: true },
    }),
  ]);

  if (!category) {
    throw new AppError("Categoria no encontrada.", 404);
  }

  const distinctProductIds = new Set<number>([
    ...productCategoryRows.map((row) => row.productId),
    ...legacyProductRows.map((row) => row.id),
  ]);

  return {
    ...mapCategorySummary(category),
    parent: category.parent ? mapCategorySummary(category.parent) : null,
    children: category.children.map(mapCategorySummary),
    productCounts: {
      productCategory: productCategoryRows.length,
      legacyCategoryId: legacyProductRows.length,
      total: distinctProductIds.size,
    },
  };
};

export const createCategory = async (input: CreateCategoryInput): Promise<CategorySummary> => {
  const text = normalizeCategoryTextInput(input);

  return prisma.$transaction(
    async (tx) => {
      await ensureUniqueName(tx, text.name);
      const { code, parentId } = await resolveCreateCodeAndParent(tx, input);

      const category = await tx.category.create({
        data: {
          code,
          name: text.name,
          description: text.description,
          color: text.color,
          icon: text.icon,
          level: input.level,
          parentId,
          active: true,
        },
        select: categorySummarySelect,
      });

      return mapCategorySummary(category);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
};

export const updateCategory = async (categoryId: number, input: CategoryTextInput): Promise<CategorySummary> => {
  const text = normalizeCategoryTextInput(input);

  return prisma.$transaction(async (tx) => {
    await assertCategoryExists(tx, categoryId);
    await ensureUniqueName(tx, text.name, categoryId);

    const category = await tx.category.update({
      where: { id: categoryId },
      data: {
        name: text.name,
        description: text.description,
        color: text.color,
        icon: text.icon,
      },
      select: categorySummarySelect,
    });

    return mapCategorySummary(category);
  });
};

export const updateCategoryStatus = async (categoryId: number, active: boolean): Promise<CategorySummary> =>
  prisma.$transaction(async (tx) => {
    const category = await tx.category.findUnique({
      where: { id: categoryId },
      select: {
        ...categorySummarySelect,
        parent: { select: { id: true, active: true } },
      },
    });

    if (!category) {
      throw new AppError("Categoria no encontrada.", 404);
    }

    if (active && category.parent && !category.parent.active) {
      throw new AppError("No se puede activar una categoria si su padre esta inactivo.", 400);
    }

    if (!active) {
      const activeChildren = await tx.category.count({
        where: { parentId: categoryId, active: true },
      });

      if (activeChildren > 0) {
        throw new AppError(
          "No se puede desactivar una categoria con hijos activos. Desactiva primero sus hijos.",
          400
        );
      }
    }

    const updated = await tx.category.update({
      where: { id: categoryId },
      data: { active },
      select: categorySummarySelect,
    });

    return mapCategorySummary(updated);
  });

export const deleteCategory = async (categoryId: number): Promise<CategorySummary> =>
  prisma.$transaction(async (tx) => {
    const category = await assertCategoryExists(tx, categoryId);

    const childrenCount = await tx.category.count({ where: { parentId: categoryId } });
    if (childrenCount > 0) {
      throw new AppError("No se puede eliminar la categoria porque tiene subcategorias.", 400);
    }

    const productCategoryCount = await tx.productCategory.count({ where: { categoryId } });
    const legacyProductCount = await tx.product.count({ where: { categoryId } });
    if (productCategoryCount > 0 || legacyProductCount > 0) {
      throw new AppError("No se puede eliminar la categoria porque tiene productos asociados.", 400);
    }

    const priceAdjustmentCount = await tx.priceAdjustment.count({ where: { categoryId } });
    if (priceAdjustmentCount > 0) {
      throw new AppError("No se puede eliminar la categoria porque tiene ajustes de precio relacionados.", 400);
    }

    await tx.category.delete({ where: { id: categoryId } });
    return mapCategorySummary(category);
  });

export const listCategoryProducts = async (
  categoryId: number,
  filters: ProductListFilters
): Promise<PaginatedProducts> => {
  await prisma.$transaction(async (tx) => {
    await assertFinalCategory(tx, categoryId, {
      requireActive: false,
      message: "Solo las categorias finales tienen productos asignados.",
    });
  });

  const { page, limit, skip } = paginationParams(filters.page, filters.limit);
  const productWhere: Prisma.ProductWhereInput = {
    ...(filters.includeInactive ? {} : { active: true }),
    ...buildProductSearchWhere(filters.search),
  };
  const relationWhere: Prisma.ProductCategoryWhereInput = {
    categoryId,
    ...(Object.keys(productWhere).length > 0 ? { product: productWhere } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.productCategory.count({ where: relationWhere }),
    prisma.productCategory.findMany({
      where: relationWhere,
      skip,
      take: limit,
      orderBy: { productId: "asc" },
      select: {
        product: { select: productSummarySelect },
      },
    }),
  ]);

  return {
    products: rows.map((row) => mapProductSummary(row.product)),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const replaceCategoryProducts = async (
  categoryId: number,
  productIds: number[]
): Promise<{ categoryId: number; added: number; removed: number; productIds: number[] }> => {
  const desiredIds = uniqueIds(productIds);

  return prisma.$transaction(async (tx) => {
    await assertFinalCategory(tx, categoryId, { requireActive: true });
    await assertProductsExist(tx, desiredIds);

    const currentRows = await tx.productCategory.findMany({
      where: { categoryId },
      select: { productId: true },
    });
    const currentIds = new Set(currentRows.map((row) => row.productId));
    const desiredIdSet = new Set(desiredIds);
    const toRemove = [...currentIds].filter((productId) => !desiredIdSet.has(productId));
    const toAdd = desiredIds.filter((productId) => !currentIds.has(productId));

    if (toRemove.length > 0) {
      await tx.productCategory.deleteMany({
        where: { categoryId, productId: { in: toRemove } },
      });
    }

    if (toAdd.length > 0) {
      await tx.productCategory.createMany({
        data: toAdd.map((productId) => ({ categoryId, productId })),
      });
    }

    return { categoryId, added: toAdd.length, removed: toRemove.length, productIds: desiredIds };
  });
};

export const addCategoryProducts = async (
  categoryId: number,
  productIds: number[]
): Promise<{ categoryId: number; added: number; skipped: number; productIds: number[] }> => {
  const requestedIds = uniqueIds(productIds);

  return prisma.$transaction(async (tx) => {
    await assertFinalCategory(tx, categoryId, { requireActive: true });
    await assertProductsExist(tx, requestedIds);

    const existingRows = requestedIds.length > 0
      ? await tx.productCategory.findMany({
          where: { categoryId, productId: { in: requestedIds } },
          select: { productId: true },
        })
      : [];
    const existingIds = new Set(existingRows.map((row) => row.productId));
    const toAdd = requestedIds.filter((productId) => !existingIds.has(productId));

    if (toAdd.length > 0) {
      await tx.productCategory.createMany({
        data: toAdd.map((productId) => ({ categoryId, productId })),
      });
    }

    return {
      categoryId,
      added: toAdd.length,
      skipped: requestedIds.length - toAdd.length,
      productIds: requestedIds,
    };
  });
};

export const removeCategoryProduct = async (
  categoryId: number,
  productId: number
): Promise<{ categoryId: number; productId: number }> =>
  prisma.$transaction(async (tx) => {
    await assertFinalCategory(tx, categoryId, {
      requireActive: false,
      message: "Solo las categorias finales tienen productos asignados.",
    });
    await assertProductsExist(tx, [productId]);

    const result = await tx.productCategory.deleteMany({
      where: { categoryId, productId },
    });

    if (result.count === 0) {
      throw new AppError("El producto no esta asignado a esta categoria.", 404);
    }

    return { categoryId, productId };
  });

export const listUncategorizedProducts = async (filters: ProductListFilters): Promise<PaginatedProducts> => {
  const { page, limit, skip } = paginationParams(filters.page, filters.limit);
  const where: Prisma.ProductWhereInput = {
    ...(filters.includeInactive ? {} : { active: true }),
    categories: { none: {} },
    ...buildProductSearchWhere(filters.search),
  };

  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      skip,
      take: limit,
      orderBy: { id: "asc" },
      select: productSummarySelect,
    }),
  ]);

  return {
    products: products.map(mapProductSummary),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const reassignCategoryProducts = async (
  sourceCategoryId: number,
  targetCategoryId: number,
  productIds: number[]
): Promise<{
  sourceCategoryId: number;
  targetCategoryId: number;
  moved: number;
  linkedToTarget: number;
  productIds: number[];
}> => {
  if (sourceCategoryId === targetCategoryId) {
    throw new AppError("La categoria origen y destino deben ser diferentes.", 400);
  }

  const requestedIds = uniqueIds(productIds);

  return prisma.$transaction(async (tx) => {
    await assertFinalCategory(tx, sourceCategoryId, {
      requireActive: false,
      message: "La categoria origen debe ser una categoria final.",
    });
    await assertFinalCategory(tx, targetCategoryId, {
      requireActive: true,
      message: "La categoria destino debe ser una categoria final activa.",
    });
    await assertProductsExist(tx, requestedIds);

    if (requestedIds.length === 0) {
      return {
        sourceCategoryId,
        targetCategoryId,
        moved: 0,
        linkedToTarget: 0,
        productIds: requestedIds,
      };
    }

    const sourceRows = await tx.productCategory.findMany({
      where: { categoryId: sourceCategoryId, productId: { in: requestedIds } },
      select: { productId: true },
    });
    if (sourceRows.length !== requestedIds.length) {
      throw new AppError("Uno o mas productos no estan asignados a la categoria origen.", 400);
    }

    const targetRows = await tx.productCategory.findMany({
      where: { categoryId: targetCategoryId, productId: { in: requestedIds } },
      select: { productId: true },
    });
    const targetIds = new Set(targetRows.map((row) => row.productId));
    const toCreate = requestedIds.filter((productId) => !targetIds.has(productId));

    if (toCreate.length > 0) {
      await tx.productCategory.createMany({
        data: toCreate.map((productId) => ({ categoryId: targetCategoryId, productId })),
      });
    }

    const removed = await tx.productCategory.deleteMany({
      where: { categoryId: sourceCategoryId, productId: { in: requestedIds } },
    });

    return {
      sourceCategoryId,
      targetCategoryId,
      moved: removed.count,
      linkedToTarget: toCreate.length,
      productIds: requestedIds,
    };
  });
};
