import { Prisma } from "@prisma/client"
import { prisma } from "../app";
import { AppError } from "../utils/AppError";

type PriceAdjustmentScope =
    | "SELECTED_PRODUCTS"
    | "DIVISION"
    | "DEPARTMENT"
    | "CATEGORY"
    | "UNCATEGORIZED";

const validPriceAdjustmentScopes: PriceAdjustmentScope[] = [
    "SELECTED_PRODUCTS",
    "DIVISION",
    "DEPARTMENT",
    "CATEGORY",
    "UNCATEGORIZED",
];

const PRICE_ADJUSTMENT_NOTES_MAX_LENGTH = 500;
const HISTORY_LIMIT_OPTIONS = [10, 20, 50, 100];

const isPriceAdjustmentScope = (
    scope: string
): scope is PriceAdjustmentScope =>
    validPriceAdjustmentScopes.includes(scope as PriceAdjustmentScope);

interface ResolveProductsInput {
    scope: PriceAdjustmentScope;
    categoryId?: number;
    productIds?: number[];
    search?: string;
}

const normalizeText = (value: string) =>
    value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();

const getDescendantCategoryIds = async (categoryId: number) => {
    const rootCategory = await prisma.category.findUnique({
        where: { id: categoryId },
        select: {
            id: true,
            level: true,
            active: true,
            children: {
                select: {
                    id: true,
                    level: true,
                    children: {
                        select: {
                            id: true,
                            level: true,
                        },
                    },
                },
            },
        },
    });

    if (!rootCategory) {
        throw new AppError("La categoría seleccionada no existe.", 404);
    }

    if (!rootCategory.active) {
        throw new AppError(
            "No puedes realizar ajustes usando una categoría inactiva.",
            400
        );
    }

    const categoryIds: number[] = [];

    if (rootCategory.level === "CATEGORY") {
        categoryIds.push(rootCategory.id);
    }

    if (rootCategory.level === "DEPARTMENT") {
        rootCategory.children.forEach((child) => {
            if (child.level === "CATEGORY") {
                categoryIds.push(child.id);
            }
        });
    }

    if (rootCategory.level === "DIVISION") {
        rootCategory.children.forEach((department) => {
            department.children.forEach((category) => {
                if (category.level === "CATEGORY") {
                    categoryIds.push(category.id);
                }
            });
        });
    }

    return {
        category: rootCategory,
        categoryIds,
    };
};

export const resolveProductsForPriceAdjustment = async (
    input: ResolveProductsInput
) => {
    const { scope, categoryId, productIds = [], search = "" } = input;

    if (!isPriceAdjustmentScope(scope)) {
        throw new AppError("El tipo de selección no es válido.", 400);
    }

    let products;

    if (scope === "SELECTED_PRODUCTS") {
        const uniqueProductIds = [...new Set(productIds.map(Number))].filter(
            (id) => Number.isInteger(id) && id > 0
        );

        if (uniqueProductIds.length === 0) {
            throw new AppError(
                "Selecciona al menos un producto para continuar.",
                400
            );
        }

        products = await prisma.product.findMany({
            where: {
                id: {
                    in: uniqueProductIds,
                },
                active: true,
            },
            select: {
                id: true,
                sku: true,
                barcode: true,
                name: true,
                description: true,
                costPrice: true,
                sellPrice: true,
                active: true,
                categories: {
                    select: {
                        category: {
                            select: {
                                id: true,
                                code: true,
                                name: true,
                                level: true,
                                active: true,
                            },
                        },
                    },
                },
            },
            orderBy: {
                sku: "asc",
            },
        });
    } else if (scope === "UNCATEGORIZED") {
        products = await prisma.product.findMany({
            where: {
                active: true,
                categories: {
                    none: {},
                },
            },
            select: {
                id: true,
                sku: true,
                barcode: true,
                name: true,
                description: true,
                costPrice: true,
                sellPrice: true,
                active: true,
                categories: {
                    select: {
                        category: {
                            select: {
                                id: true,
                                code: true,
                                name: true,
                                level: true,
                                active: true,
                            },
                        },
                    },
                },
            },
            orderBy: {
                sku: "asc",
            },
        });
    } else {
        if (!categoryId || !Number.isInteger(Number(categoryId))) {
            throw new AppError("Debes seleccionar una categoría válida.", 400);
        }

        const { category, categoryIds } = await getDescendantCategoryIds(
            Number(categoryId)
        );

        if (category.level !== scope) {
            throw new AppError(
                `La categoría seleccionada no corresponde al tipo ${scope}.`,
                400
            );
        }

        if (categoryIds.length === 0) {
            return {
                scope,
                categoryId: category.id,
                total: 0,
                products: [],
            };
        }

        products = await prisma.product.findMany({
            where: {
                active: true,
                categories: {
                    some: {
                        categoryId: {
                            in: categoryIds,
                        },
                    },
                },
            },
            select: {
                id: true,
                sku: true,
                barcode: true,
                name: true,
                description: true,
                costPrice: true,
                sellPrice: true,
                active: true,
                categories: {
                    select: {
                        category: {
                            select: {
                                id: true,
                                code: true,
                                name: true,
                                level: true,
                                active: true,
                            },
                        },
                    },
                },
            },
            orderBy: {
                sku: "asc",
            },
        });
    }

    const normalizedSearch = normalizeText(search);

    const filteredProducts = normalizedSearch
        ? products.filter((product) => {
            const searchableText = normalizeText(
                [
                    product.sku,
                    product.barcode ?? "",
                    product.name,
                    product.description ?? "",
                ].join(" ")
            );

            const terms = normalizedSearch.split(/\s+/).filter(Boolean);

            return terms.every((term) => searchableText.includes(term));
        })
        : products;

    return {
        scope,
        total: filteredProducts.length,
        products: filteredProducts.map((product) => ({
            ...product,
            categories: product.categories.map((item) => item.category),
        })),
    };
};

type PriceAdjustmentOperation =
    | "PERCENT_INCREASE"
    | "PERCENT_DECREASE"
    | "FIXED_INCREASE"
    | "FIXED_DECREASE"
    | "SET_EXACT";

const validPriceAdjustmentOperations: PriceAdjustmentOperation[] = [
    "PERCENT_INCREASE",
    "PERCENT_DECREASE",
    "FIXED_INCREASE",
    "FIXED_DECREASE",
    "SET_EXACT",
];

const isPriceAdjustmentOperation = (
    operation: string
): operation is PriceAdjustmentOperation =>
    validPriceAdjustmentOperations.includes(
        operation as PriceAdjustmentOperation
    );

interface PreviewPriceAdjustmentInput {
    operation: PriceAdjustmentOperation;
    value: number;
    productIds: number[];
}

const roundToTwoDecimals = (value: Prisma.Decimal) =>
    value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

const getNewSellPrice = (
    currentSellPrice: Prisma.Decimal,
    operation: PriceAdjustmentOperation,
    value: Prisma.Decimal
) => {
    switch (operation) {
        case "PERCENT_INCREASE":
            return currentSellPrice.plus(
                currentSellPrice.mul(value).div(100)
            );

        case "PERCENT_DECREASE":
            return currentSellPrice.minus(
                currentSellPrice.mul(value).div(100)
            );

        case "FIXED_INCREASE":
            return currentSellPrice.plus(value);

        case "FIXED_DECREASE":
            return currentSellPrice.minus(value);

        case "SET_EXACT":
            return value;

        default:
            throw new AppError("El tipo de ajuste no es válido.", 400);
    }
};

export const previewPriceAdjustment = async (
    input: PreviewPriceAdjustmentInput
) => {
    const { operation, productIds } = input;
    const numericValue = Number(input.value);

    if (!isPriceAdjustmentOperation(operation)) {
        throw new AppError("El tipo de ajuste no es válido.", 400);
    }

    if (!Array.isArray(productIds) || productIds.length === 0) {
        throw new AppError(
            "Selecciona al menos un producto para aplicar el ajuste.",
            400
        );
    }

    const normalizedProductIds = productIds.map(Number);

    const hasInvalidProductId = normalizedProductIds.some(
        (id) => !Number.isInteger(id) || id <= 0
    );

    if (hasInvalidProductId) {
        throw new AppError("Uno o más productos no son válidos.", 400);
    }

    const uniqueProductIds = [...new Set(normalizedProductIds)];

    if (uniqueProductIds.length !== normalizedProductIds.length) {
        throw new AppError("No puedes enviar productos repetidos.", 400);
    }

    if (!Number.isFinite(numericValue) || numericValue <= 0) {
        throw new AppError("El valor del ajuste debe ser mayor a $0.00.", 400);
    }

    if (
        (operation === "PERCENT_INCREASE" ||
            operation === "PERCENT_DECREASE") &&
        numericValue >= 100
    ) {
        throw new AppError(
            "El porcentaje debe ser mayor a 0 y menor a 100.",
            400
        );
    }

    const products = await prisma.product.findMany({
        where: {
            id: {
                in: uniqueProductIds,
            },
        },
        select: {
            id: true,
            sku: true,
            barcode: true,
            name: true,
            description: true,
            costPrice: true,
            sellPrice: true,
            active: true,
        },
        orderBy: {
            sku: "asc",
        },
    });

    if (products.length !== uniqueProductIds.length) {
        throw new AppError(
            "Uno o más productos seleccionados no existen.",
            404
        );
    }

    const inactiveProducts = products.filter((product) => !product.active);

    if (inactiveProducts.length > 0) {
        throw new AppError(
            "No puedes modificar precios de productos inactivos.",
            400
        );
    }

    const adjustmentValue = new Prisma.Decimal(numericValue);

    const previewProducts = products.map((product) => {
        const currentSellPrice = new Prisma.Decimal(product.sellPrice);
        const costPrice = new Prisma.Decimal(product.costPrice);

        const calculatedPrice = getNewSellPrice(
            currentSellPrice,
            operation,
            adjustmentValue
        );

        const newSellPrice = roundToTwoDecimals(calculatedPrice);

        if (newSellPrice.lessThanOrEqualTo(0)) {
            throw new AppError(
                `El ajuste dejaría el producto "${product.name}" con un precio inválido.`,
                400
            );
        }

        const isBelowCost = newSellPrice.lessThan(costPrice);

        const discountPercentage = currentSellPrice.greaterThan(0) &&
            newSellPrice.lessThan(currentSellPrice)
            ? roundToTwoDecimals(
                currentSellPrice
                    .minus(newSellPrice)
                    .div(currentSellPrice)
                    .mul(100)
            )
            : new Prisma.Decimal(0);

        return {
            id: product.id,
            sku: product.sku,
            barcode: product.barcode,
            name: product.name,
            description: product.description,
            costPrice: costPrice.toNumber(),
            currentSellPrice: currentSellPrice.toNumber(),
            newSellPrice: newSellPrice.toNumber(),
            isBelowCost,
            discountPercentage: discountPercentage.toNumber(),
        };
    });

    const belowCostCount = previewProducts.filter(
        (product) => product.isBelowCost
    ).length;

    return {
        affectedCount: previewProducts.length,
        belowCostCount,
        requiresBelowCostConfirmation: belowCostCount > 0,
        requiresReason: true,
        products: previewProducts,
    };
};

type ApplyPriceAdjustmentInput = {
    scope:
    | "SELECTED_PRODUCTS"
    | "DIVISION"
    | "DEPARTMENT"
    | "CATEGORY"
    | "UNCATEGORIZED";
    categoryId?: number;
    operation: PriceAdjustmentOperation;
    value: number;
    productIds: number[];
    notes?: unknown;
    confirmBelowCost?: boolean;
    appliedById: number;
};

const getAdjustmentMetadata = (operation: PriceAdjustmentOperation) => {
    switch (operation) {
        case "PERCENT_INCREASE":
            return {
                type: "PERCENTAGE",
                direction: "INCREASE",
            };

        case "PERCENT_DECREASE":
            return {
                type: "PERCENTAGE",
                direction: "DECREASE",
            };

        case "FIXED_INCREASE":
            return {
                type: "FIXED",
                direction: "INCREASE",
            };

        case "FIXED_DECREASE":
            return {
                type: "FIXED",
                direction: "DECREASE",
            };

        case "SET_EXACT":
            return {
                type: "EXACT",
                direction: "SET",
            };

        default:
            throw new AppError("El tipo de ajuste no es válido.", 400);
    }
};

const validateScopeForAdjustment = async (
    scope: ApplyPriceAdjustmentInput["scope"],
    categoryId?: number
) => {
    const categoryScopes = ["DIVISION", "DEPARTMENT", "CATEGORY"];

    if (!categoryScopes.includes(scope)) {
        return null;
    }

    if (!categoryId || !Number.isInteger(Number(categoryId))) {
        throw new AppError("Debes seleccionar una categoría válida.", 400);
    }

    const category = await prisma.category.findUnique({
        where: {
            id: Number(categoryId),
        },
        select: {
            id: true,
            level: true,
            active: true,
            name: true,
            code: true,
        },
    });

    if (!category) {
        throw new AppError("La categoría seleccionada no existe.", 404);
    }

    if (!category.active) {
        throw new AppError(
            "No puedes realizar ajustes usando una categoría inactiva.",
            400
        );
    }

    if (category.level !== scope) {
        throw new AppError(
            `La categoría seleccionada no corresponde al tipo ${scope}.`,
            400
        );
    }

    return category;
};

const validateAdjustmentData = (
    operation: PriceAdjustmentOperation,
    value: number,
    productIds: number[]
) => {
    if (!isPriceAdjustmentOperation(operation)) {
        throw new AppError("El tipo de ajuste no es válido.", 400);
    }

    if (!Array.isArray(productIds) || productIds.length === 0) {
        throw new AppError(
            "Selecciona al menos un producto para aplicar el ajuste.",
            400
        );
    }

    if (!Number.isFinite(value) || value <= 0) {
        throw new AppError("El valor del ajuste debe ser mayor a $0.00.", 400);
    }

    if (
        (operation === "PERCENT_INCREASE" ||
            operation === "PERCENT_DECREASE") &&
        value >= 100
    ) {
        throw new AppError(
            "El porcentaje debe ser mayor a 0 y menor a 100.",
            400
        );
    }

    const normalizedIds = productIds.map(Number);

    const hasInvalidIds = normalizedIds.some(
        (id) => !Number.isInteger(id) || id <= 0
    );

    if (hasInvalidIds) {
        throw new AppError("Uno o más productos no son válidos.", 400);
    }

    const uniqueIds = [...new Set(normalizedIds)];

    if (uniqueIds.length !== normalizedIds.length) {
        throw new AppError("No puedes enviar productos repetidos.", 400);
    }

    return uniqueIds;
};

const validateAdjustmentNotes = (notes: unknown) => {
    if (typeof notes !== "string") {
        throw new AppError("El motivo del ajuste es obligatorio.", 400);
    }

    const cleanNotes = notes.trim();

    if (!cleanNotes) {
        throw new AppError("El motivo del ajuste es obligatorio.", 400);
    }

    if (cleanNotes.length > PRICE_ADJUSTMENT_NOTES_MAX_LENGTH) {
        throw new AppError(
            `El motivo del ajuste no puede exceder ${PRICE_ADJUSTMENT_NOTES_MAX_LENGTH} caracteres.`,
            400
        );
    }

    return cleanNotes;
};

export const applyMassPriceAdjustment = async (
    input: ApplyPriceAdjustmentInput
) => {
    const {
        scope,
        categoryId,
        operation,
        productIds,
        notes,
        confirmBelowCost = false,
        appliedById,
    } = input;

    const numericValue = Number(input.value);

    if (!isPriceAdjustmentScope(scope)) {
        throw new AppError("El tipo de selección no es válido.", 400);
    }

    const uniqueProductIds = validateAdjustmentData(
        operation,
        numericValue,
        productIds
    );
    const cleanNotes = validateAdjustmentNotes(notes);

    const selectedCategory = await validateScopeForAdjustment(
        scope,
        categoryId
    );

    /*
      Si el ajuste viene de División, Departamento, Categoría
      o Sin categoría, validamos que los IDs enviados realmente
      pertenezcan a esa selección inicial.
    */
    if (scope !== "SELECTED_PRODUCTS") {
        const resolvedProducts = await resolveProductsForPriceAdjustment({
            scope,
            categoryId,
        });

        const allowedProductIds = new Set(
            resolvedProducts.products.map((product) => product.id)
        );

        const invalidSelectedProducts = uniqueProductIds.filter(
            (productId) => !allowedProductIds.has(productId)
        );

        if (invalidSelectedProducts.length > 0) {
            throw new AppError(
                "Uno o más productos no pertenecen al alcance seleccionado.",
                400
            );
        }
    }

    const adjustmentValue = new Prisma.Decimal(numericValue);
    const metadata = getAdjustmentMetadata(operation);

    const result = await prisma.$transaction(async (tx) => {
        const products = await tx.product.findMany({
            where: {
                id: {
                    in: uniqueProductIds,
                },
            },
            select: {
                id: true,
                sku: true,
                name: true,
                costPrice: true,
                sellPrice: true,
                active: true,
            },
            orderBy: {
                sku: "asc",
            },
        });

        if (products.length !== uniqueProductIds.length) {
            throw new AppError(
                "Uno o más productos seleccionados no existen.",
                404
            );
        }

        const inactiveProducts = products.filter((product) => !product.active);

        if (inactiveProducts.length > 0) {
            throw new AppError(
                "No puedes modificar precios de productos inactivos.",
                400
            );
        }

        const detailRows = products
            .map((product) => {
                const currentSellPrice = new Prisma.Decimal(product.sellPrice);
                const costPrice = new Prisma.Decimal(product.costPrice);

                const calculatedPrice = getNewSellPrice(
                    currentSellPrice,
                    operation,
                    adjustmentValue
                );

                const newSellPrice = roundToTwoDecimals(calculatedPrice);

                if (newSellPrice.lessThanOrEqualTo(0)) {
                    throw new AppError(
                        `El ajuste dejaría el producto "${product.name}" con un precio inválido.`,
                        400
                    );
                }

                const isBelowCost = newSellPrice.lessThan(costPrice);

                const discountPercentage =
                    currentSellPrice.greaterThan(0) &&
                        newSellPrice.lessThan(currentSellPrice)
                        ? roundToTwoDecimals(
                            currentSellPrice
                                .minus(newSellPrice)
                                .div(currentSellPrice)
                                .mul(100)
                        )
                        : new Prisma.Decimal(0);

                return {
                    productId: product.id,
                    sku: product.sku,
                    name: product.name,
                    oldSellPrice: currentSellPrice,
                    newSellPrice,
                    costPriceAtChange: costPrice,
                    isBelowCost,
                    discountPercentage,
                    changed: !newSellPrice.equals(currentSellPrice),
                };
            })
            .filter((detail) => detail.changed);

        if (detailRows.length === 0) {
            throw new AppError(
                "No se realizaron cambios porque los precios ya eran iguales.",
                400
            );
        }

        const belowCostRows = detailRows.filter((detail) => detail.isBelowCost);

        if (belowCostRows.length > 0 && !confirmBelowCost) {
            throw new AppError(
                "Algunos productos quedarán por debajo de su costo. Confirma el ajuste para continuar.",
                400
            );
        }

        const adjustment = await tx.priceAdjustment.create({
            data: {
                type: metadata.type,
                direction: metadata.direction,
                scope,
                value: adjustmentValue,
                affectedRows: detailRows.length,
                belowCostCount: belowCostRows.length,
                notes: cleanNotes,
                appliedById,
                categoryId: selectedCategory?.id ?? null,
                details: {
                    create: detailRows.map((detail) => ({
                        productId: detail.productId,
                        oldSellPrice: detail.oldSellPrice,
                        newSellPrice: detail.newSellPrice,
                        costPriceAtChange: detail.costPriceAtChange,
                        isBelowCost: detail.isBelowCost,
                    })),
                },
            },
            include: {
                appliedBy: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                category: {
                    select: {
                        id: true,
                        code: true,
                        name: true,
                        level: true,
                    },
                },
                details: {
                    include: {
                        product: {
                            select: {
                                id: true,
                                sku: true,
                                name: true,
                            },
                        },
                    },
                },
            },
        });

        for (const detail of detailRows) {
            await tx.product.update({
                where: {
                    id: detail.productId,
                },
                data: {
                    sellPrice: detail.newSellPrice,
                },
            });
        }

        return adjustment;
    });

    return {
        id: result.id,
        type: result.type,
        direction: result.direction,
        scope: result.scope,
        value: Number(result.value),
        affectedRows: result.affectedRows,
        belowCostCount: result.belowCostCount,
        notes: result.notes,
        appliedAt: result.appliedAt,
        appliedBy: result.appliedBy,
        category: result.category,
        products: result.details.map((detail) => ({
            id: detail.product.id,
            sku: detail.product.sku,
            name: detail.product.name,
            oldSellPrice: Number(detail.oldSellPrice),
            newSellPrice: Number(detail.newSellPrice),
            costPriceAtChange: Number(detail.costPriceAtChange),
            isBelowCost: detail.isBelowCost,
        })),
    };
};

type HistoryQueryInput = {
    search?: string;
    from?: string;
    to?: string;
    operation?: string;
    scope?: string;
    userId?: number;
    page?: number;
    limit?: number;
};

const getPagination = (page?: number, limit?: number) => {
    const requestedPage = Number(page);
    const requestedLimit = Number(limit);
    const normalizedPage =
        Number.isInteger(requestedPage) && requestedPage > 0
            ? requestedPage
            : 1;
    const normalizedLimit =
        Number.isInteger(requestedLimit) &&
            HISTORY_LIMIT_OPTIONS.includes(requestedLimit)
            ? requestedLimit
            : 10;

    return {
        page: normalizedPage,
        limit: normalizedLimit,
        skip: (normalizedPage - 1) * normalizedLimit,
    };
};

const parseHistoryDate = (
    value: string | undefined,
    endOfDay = false
) => {
    if (!value) return undefined;

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        throw new AppError("La fecha enviada no es válida.", 400);
    }

    if (endOfDay) {
        date.setHours(23, 59, 59, 999);
    }

    return date;
};

const getHistoryOperationWhere = (
    operation: string | undefined
): Prisma.PriceAdjustmentWhereInput => {
    const normalizedOperation = operation?.trim();

    if (!normalizedOperation) {
        return {};
    }

    if (!isPriceAdjustmentOperation(normalizedOperation)) {
        throw new AppError("El filtro de operación no es válido.", 400);
    }

    const metadata = getAdjustmentMetadata(normalizedOperation);

    return {
        type: metadata.type,
        direction: metadata.direction,
    };
};

export const getPriceAdjustmentHistory = async (
    input: HistoryQueryInput
) => {
    const {
        search = "",
        from,
        to,
        operation,
        scope,
        userId,
        page,
        limit,
    } = input;

    const { page: currentPage, limit: currentLimit, skip } = getPagination(
        page,
        limit
    );

    const fromDate = parseHistoryDate(from);
    const toDate = parseHistoryDate(to, true);

    if (fromDate && toDate && fromDate > toDate) {
        throw new AppError(
            "La fecha inicial no puede ser posterior a la fecha final.",
            400
        );
    }

    const normalizedScope = scope?.trim();

    if (normalizedScope && !isPriceAdjustmentScope(normalizedScope)) {
        throw new AppError("El filtro de alcance no es válido.", 400);
    }

    if (
        userId !== undefined &&
        (!Number.isInteger(Number(userId)) || Number(userId) <= 0)
    ) {
        throw new AppError("El filtro de usuario no es válido.", 400);
    }

    const searchTerm = search.trim();
    const operationWhere = getHistoryOperationWhere(operation);

    const where: Prisma.PriceAdjustmentWhereInput = {
        ...(fromDate || toDate
            ? {
                appliedAt: {
                    ...(fromDate ? { gte: fromDate } : {}),
                    ...(toDate ? { lte: toDate } : {}),
                },
            }
            : {}),
        ...operationWhere,
        ...(normalizedScope ? { scope: normalizedScope } : {}),
        ...(userId ? { appliedById: Number(userId) } : {}),
    };

    if (searchTerm) {
        const existingAnd = Array.isArray(where.AND)
            ? where.AND
            : where.AND
              ? [where.AND]
              : [];

        where.AND = [
            ...existingAnd,
            {
                OR: [
                    {
                        notes: {
                            contains: searchTerm,
                        },
                    },
                    {
                        appliedBy: {
                            name: {
                                contains: searchTerm,
                            },
                        },
                    },
                    {
                        appliedBy: {
                            email: {
                                contains: searchTerm,
                            },
                        },
                    },
                    {
                        category: {
                            name: {
                                contains: searchTerm,
                            },
                        },
                    },
                    {
                        category: {
                            code: {
                                contains: searchTerm,
                            },
                        },
                    },
                ],
            },
        ];
    }

    const [total, adjustments] = await Promise.all([
        prisma.priceAdjustment.count({ where }),
        prisma.priceAdjustment.findMany({
            where,
            skip,
            take: currentLimit,
            orderBy: {
                appliedAt: "desc",
            },
            include: {
                appliedBy: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                category: {
                    select: {
                        id: true,
                        code: true,
                        name: true,
                        level: true,
                    },
                },
                _count: {
                    select: {
                        details: true,
                    },
                },
            },
        }),
    ]);

    return {
        page: currentPage,
        limit: currentLimit,
        total,
        totalPages: Math.ceil(total / currentLimit),
        adjustments: adjustments.map((adjustment) => ({
            id: adjustment.id,
            type: adjustment.type,
            direction: adjustment.direction,
            scope: adjustment.scope,
            value: Number(adjustment.value),
            affectedRows: adjustment.affectedRows,
            belowCostCount: adjustment.belowCostCount,
            notes: adjustment.notes,
            appliedAt: adjustment.appliedAt,
            appliedBy: adjustment.appliedBy,
            category: adjustment.category,
            detailsCount: adjustment._count.details,
        })),
    };
};

export const getPriceAdjustmentById = async (id: number) => {
    const adjustmentId = Number(id);

    if (!Number.isInteger(adjustmentId) || adjustmentId <= 0) {
        throw new AppError("El ajuste solicitado no es válido.", 400);
    }

    const adjustment = await prisma.priceAdjustment.findUnique({
        where: {
            id: adjustmentId,
        },
        include: {
            appliedBy: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                },
            },
            category: {
                select: {
                    id: true,
                    code: true,
                    name: true,
                    level: true,
                },
            },
            _count: {
                select: {
                    details: true,
                },
            },
        },
    });

    if (!adjustment) {
        throw new AppError("El ajuste de precio no existe.", 404);
    }

    return {
        id: adjustment.id,
        type: adjustment.type,
        direction: adjustment.direction,
        scope: adjustment.scope,
        value: Number(adjustment.value),
        affectedRows: adjustment.affectedRows,
        belowCostCount: adjustment.belowCostCount,
        notes: adjustment.notes,
        appliedAt: adjustment.appliedAt,
        appliedBy: adjustment.appliedBy,
        category: adjustment.category,
        detailsCount: adjustment._count.details,
    };
};

type HistoryProductsQueryInput = {
    adjustmentId: number;
    search?: string;
    page?: number;
    limit?: number;
    onlyBelowCost?: boolean;
};

export const getPriceAdjustmentProducts = async (
    input: HistoryProductsQueryInput
) => {
    const {
        adjustmentId,
        search = "",
        page,
        limit,
        onlyBelowCost = false,
    } = input;

    const normalizedAdjustmentId = Number(adjustmentId);

    if (
        !Number.isInteger(normalizedAdjustmentId) ||
        normalizedAdjustmentId <= 0
    ) {
        throw new AppError("El ajuste solicitado no es válido.", 400);
    }

    const adjustmentExists = await prisma.priceAdjustment.findUnique({
        where: {
            id: normalizedAdjustmentId,
        },
        select: {
            id: true,
        },
    });

    if (!adjustmentExists) {
        throw new AppError("El ajuste de precio no existe.", 404);
    }

    const { page: currentPage, limit: currentLimit, skip } = getPagination(
        page,
        limit
    );

    const where: Prisma.PriceAdjustmentDetailWhereInput = {
        priceAdjustmentId: normalizedAdjustmentId,
        ...(onlyBelowCost ? { isBelowCost: true } : {}),
    };

    if (search.trim()) {
        where.AND = [
            {
                product: {
                    OR: [
                        {
                            sku: {
                                contains: search.trim(),
                            },
                        },
                        {
                            barcode: {
                                contains: search.trim(),
                            },
                        },
                        {
                            name: {
                                contains: search.trim(),
                            },
                        },
                        {
                            description: {
                                contains: search.trim(),
                            },
                        },
                    ],
                },
            },
        ];
    }

    const [total, details] = await Promise.all([
        prisma.priceAdjustmentDetail.count({ where }),
        prisma.priceAdjustmentDetail.findMany({
            where,
            skip,
            take: currentLimit,
            orderBy: {
                id: "asc",
            },
            include: {
                product: {
                    select: {
                        id: true,
                        sku: true,
                        barcode: true,
                        name: true,
                        description: true,
                        active: true,
                    },
                },
            },
        }),
    ]);

    return {
        page: currentPage,
        limit: currentLimit,
        total,
        totalPages: Math.ceil(total / currentLimit),
        products: details.map((detail) => ({
            id: detail.id,
            producto: detail.product,
            oldSellPrice: Number(detail.oldSellPrice),
            newSellPrice: Number(detail.newSellPrice),
            costPriceAtChange: Number(detail.costPriceAtChange),
            isBelowCost: detail.isBelowCost,
            createdAt: detail.createdAt,
        })),
    };
};
