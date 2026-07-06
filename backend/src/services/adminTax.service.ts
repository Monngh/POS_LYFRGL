import { Prisma } from "@prisma/client";
import { prisma } from "../app";

// ---------------------------------------------------------------------------
// Helpers para búsqueda multi-palabra (normalización + split)
// ---------------------------------------------------------------------------
const normalizeSearchText = (value: string): string =>
    value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const splitSearchTerms = (search: string): string[] =>
    normalizeSearchText(search).split(/\s+/).filter(Boolean);

export type TaxProductScope = "ALL" | "DIVISION" | "DEPARTMENT" | "CATEGORY" | "UNCATEGORIZED";

export interface TaxProductFilters {
    search?: string;
    scope: TaxProductScope;
    categoryId?: number;
    page: number;
    limit: number;
    includeAssociated: boolean;
}

const buildProductSearchWhere = (search?: string): Prisma.ProductWhereInput => {
    if (!search) return {};
    const terms = splitSearchTerms(search);
    if (terms.length === 0) return {};
    if (terms.length === 1) {
        const t = terms[0];
        return {
            OR: [
                { name: { contains: t } },
                { sku: { contains: t } },
                { barcode: { contains: t } },
                { description: { contains: t } },
            ],
        };
    }
    return {
        AND: terms.map((t) => ({
            OR: [
                { name: { contains: t } },
                { sku: { contains: t } },
                { barcode: { contains: t } },
                { description: { contains: t } },
            ],
        })),
    };
};

const availableProductsPagination = (page: number, limit: number) => {
    const safePage = Number.isInteger(page) && page > 0 ? page : 1;
    const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 10;
    return {
        page: safePage,
        limit: safeLimit,
        skip: (safePage - 1) * safeLimit,
    };
};

const taxProductSelect = Prisma.validator<Prisma.ProductSelect>()({
    id: true,
    sku: true,
    barcode: true,
    name: true,
    description: true,
    costPrice: true,
    sellPrice: true,
    active: true,
    categories: {
        orderBy: { categoryId: "asc" },
        select: {
            category: {
                select: {
                    id: true,
                    code: true,
                    name: true,
                    level: true,
                },
            },
        },
    },
});

type TaxProductPayload = Prisma.ProductGetPayload<{ select: typeof taxProductSelect }>;

const getFinalCategoryIdsForTaxScope = async (
    scope: TaxProductScope,
    categoryId?: number
): Promise<number[] | undefined> => {
    if (scope === "ALL" || scope === "UNCATEGORIZED") return undefined;

    if (!categoryId) {
        throw new Error("CATEGORY_REQUIRED");
    }

    const category = await prisma.category.findUnique({
        where: { id: categoryId },
        select: { id: true, level: true },
    });

    if (!category) {
        throw new Error("CATEGORY_NOT_FOUND");
    }

    if (category.level !== scope) {
        throw new Error("CATEGORY_LEVEL_MISMATCH");
    }

    if (scope === "CATEGORY") return [category.id];

    if (scope === "DEPARTMENT") {
        const categories = await prisma.category.findMany({
            where: { parentId: category.id, level: "CATEGORY" },
            select: { id: true },
        });
        return categories.map((row) => row.id);
    }

    const departments = await prisma.category.findMany({
        where: { parentId: category.id, level: "DEPARTMENT" },
        select: { id: true },
    });
    if (departments.length === 0) return [];

    const categories = await prisma.category.findMany({
        where: {
            parentId: { in: departments.map((department) => department.id) },
            level: "CATEGORY",
        },
        select: { id: true },
    });
    return categories.map((row) => row.id);
};

const mapTaxProduct = (product: TaxProductPayload, assignedIds: Set<number>) => ({
    id: product.id,
    sku: product.sku,
    barcode: product.barcode,
    name: product.name,
    description: product.description,
    costPrice: Number(product.costPrice),
    sellPrice: Number(product.sellPrice),
    active: product.active,
    assigned: assignedIds.has(product.id),
    categories: product.categories.map((row) => row.category),
});

// ---------------------------------------------------------------------------
// Impuestos (TaxType)
// ---------------------------------------------------------------------------

/**
 * Extrae todos los registros de los impuestos, y trae las
 * búsquedas específicas si es que le pasan parámetro
 */
export const getAllTaxes = async (search?: string) => {
    const searchNumber = search ? Number(search) : NaN;
    const isNumber = !Number.isNaN(searchNumber);

    return prisma.taxType.findMany({
        where: search
            ? {
                OR: [
                    { name: { contains: search } },
                    ...(isNumber ? [{ id: searchNumber }] : [])
                ],
            }
            : {},
        orderBy: {
            createdAt: "asc",
        },
    });
};

export const getTaxById = async (id: number) => {
    return prisma.taxType.findUnique({
        where: { id },
    });
};

export const getTaxByName = async (name: string) => {
    return prisma.taxType.findUnique({
        where: { name },
    });
};

export const getProductForTaxAssignment = async (productId: number) => {
    return prisma.product.findUnique({
        where: { id: productId },
        select: {
            id: true,
            active: true,
        },
    });
};

export const getProductTaxRelation = async (productId: number, taxTypeId: number) => {
    return prisma.productTax.findUnique({
        where: {
            productId_taxTypeId: {
                productId,
                taxTypeId,
            },
        },
    });
};

export const postTax = async (name: string, description: string | null, rate: number, active: boolean = true) => {
    return prisma.taxType.create({
        data: {
            name,
            description,
            rate,
            active,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });
};

export const editTax = async (id: number, name: string, description: string | null, rate: number, active: boolean) => {
    return prisma.taxType.update({
        where: { id },
        data: {
            name,
            description,
            rate,
            active,
            updatedAt: new Date(),
        },
    });
};

export const editTaxStatus = async (id: number, active: boolean) => {
    return prisma.taxType.update({
        where: { id },
        data: {
            active,
            updatedAt: new Date(),
        },
    });
};

// ---------------------------------------------------------------------------
// Relaciones Producto ↔ Impuesto (ProductTax) — perspectiva del PRODUCTO
// ---------------------------------------------------------------------------

export const assignTaxToProduct = async (productId: number, taxTypeId: number) => {
    return prisma.productTax.create({
        data: {
            productId,
            taxTypeId,
        },
    });
};

export const deleteTaxFromProduct = async (productId: number, taxTypeId: number) => {
    return prisma.productTax.deleteMany({
        where: {
            productId,
            taxTypeId,
        },
    });
};

export const getTaxesByProduct = async (productId: number) => {
    const product = await prisma.product.findUnique({
        where: { id: productId },
        select: { id: true },
    });

    if (!product) {
        return null;
    }

    return prisma.productTax.findMany({
        where: { productId },
        include: {
            taxType: true,
        },
        orderBy: {
            taxTypeId: "asc",
        },
    });
};

export const syncTaxesForProduct = async (productId: number, taxIds: number[]) => {
    const uniqueTaxIds = [...new Set(taxIds)];

    return prisma.$transaction(async (tx) => {
        const product = await tx.product.findUnique({
            where: { id: productId },
            select: { id: true, active: true },
        });

        if (!product) {
            throw new Error("PRODUCT_NOT_FOUND");
        }

        if (!product.active) {
            throw new Error("PRODUCT_INACTIVE");
        }

        const taxes = uniqueTaxIds.length > 0
            ? await tx.taxType.findMany({
                where: { id: { in: uniqueTaxIds } },
                select: { id: true, active: true },
            })
            : [];

        if (taxes.length !== uniqueTaxIds.length) {
            throw new Error("TAX_NOT_FOUND");
        }

        if (taxes.some((tax) => !tax.active)) {
            throw new Error("TAX_INACTIVE");
        }

        await tx.productTax.deleteMany({
            where: { productId },
        });

        if (uniqueTaxIds.length > 0) {
            await tx.productTax.createMany({
                data: uniqueTaxIds.map((taxTypeId) => ({
                    productId,
                    taxTypeId,
                })),
            });
        }

        return tx.productTax.findMany({
            where: { productId },
            include: {
                taxType: true,
            },
            orderBy: {
                taxTypeId: "asc",
            },
        });
    });
};

// ---------------------------------------------------------------------------
// Relaciones Producto ↔ Impuesto — perspectiva del IMPUESTO (nuevas)
// ---------------------------------------------------------------------------

/**
 * Devuelve todos los productos activos con un flag `assigned` indicando si
 * ya tienen el impuesto taxId. Acepta búsqueda multi-palabra por nombre,
 * SKU, código de barras o descripción.
 */
export const getActiveProductsWithTaxFlag = async (taxId: number, filters: TaxProductFilters) => {
    const { page, limit, skip } = availableProductsPagination(filters.page, filters.limit);
    const categoryIds = await getFinalCategoryIdsForTaxScope(filters.scope, filters.categoryId);

    const currentAssignments = await prisma.productTax.findMany({
        where: { taxTypeId: taxId },
        select: { productId: true },
    });
    const assignedIds = new Set(currentAssignments.map((assignment) => assignment.productId));

    if (categoryIds && categoryIds.length === 0) {
        return {
            page,
            limit,
            total: 0,
            totalPages: 0,
            assignedCount: assignedIds.size,
            assignedProductIds: [...assignedIds],
            products: [],
        };
    }

    const where: Prisma.ProductWhereInput = {
        active: true,
        ...buildProductSearchWhere(filters.search),
    };

    if (!filters.includeAssociated) {
        where.productTaxes = { none: { taxTypeId: taxId } };
    }

    if (filters.scope === "UNCATEGORIZED") {
        where.categories = { none: {} };
    } else if (categoryIds) {
        where.categories = { some: { categoryId: { in: categoryIds } } };
    }

    const [total, products] = await Promise.all([
        prisma.product.count({ where }),
        prisma.product.findMany({
            where,
            skip,
            take: limit,
            orderBy: [{ name: "asc" }, { id: "asc" }],
            select: taxProductSelect,
        }),
    ]);

    return {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        assignedCount: assignedIds.size,
        assignedProductIds: [...assignedIds],
        products: products.map((product) => mapTaxProduct(product, assignedIds)),
    };
};

/**
 * Sincroniza qué productos tienen el impuesto taxId.
 * - Añade el impuesto a los productIds que no lo tenían.
 * - Quita el impuesto a los que lo tenían pero no están en productIds.
 * - NO modifica otros impuestos del producto (solo gestiona esta relación).
 */
export const syncProductsForTax = async (taxId: number, productIds: number[]) => {
    const uniqueProductIds = [...new Set(productIds)];

    return prisma.$transaction(async (tx) => {
        const tax = await tx.taxType.findUnique({
            where: { id: taxId },
            select: { id: true, active: true },
        });
        if (!tax) throw new Error("TAX_NOT_FOUND");

        const currentAssignments = await tx.productTax.findMany({
            where: { taxTypeId: taxId },
            select: { productId: true },
        });
        const currentIds = new Set(currentAssignments.map((a) => a.productId));

        const toAdd = uniqueProductIds.filter((id) => !currentIds.has(id));
        const toRemove = [...currentIds].filter((id) => !uniqueProductIds.includes(id));

        // Si se agregan nuevos productos, el impuesto debe estar activo
        if (toAdd.length > 0 && !tax.active) throw new Error("TAX_INACTIVE");

        // Validar que los productos a añadir existan y estén activos
        if (toAdd.length > 0) {
            const prods = await tx.product.findMany({
                where: { id: { in: toAdd } },
                select: { id: true, active: true },
            });
            if (prods.length !== toAdd.length) throw new Error("PRODUCT_NOT_FOUND");
            if (prods.some((p) => !p.active)) throw new Error("PRODUCT_INACTIVE");
        }

        if (toRemove.length > 0) {
            await tx.productTax.deleteMany({
                where: { taxTypeId: taxId, productId: { in: toRemove } },
            });
        }

        if (toAdd.length > 0) {
            await tx.productTax.createMany({
                data: toAdd.map((productId) => ({ productId, taxTypeId: taxId })),
            });
        }

        return { added: toAdd.length, removed: toRemove.length };
    });
};
