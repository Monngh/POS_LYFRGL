import { Prisma } from "@prisma/client"
import { prisma } from "../app";
import { AppError } from "../utils/AppError";

type PriceAdjustmentScope =
    | "SELECTED_PRODUCTS"
    | "DIVISION"
    | "DEPARTMENT"
    | "CATEGORY"
    | "UNCATEGORIZED";

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

    const validScopes: PriceAdjustmentScope[] = [
        "SELECTED_PRODUCTS",
        "DIVISION",
        "DEPARTMENT",
        "CATEGORY",
        "UNCATEGORIZED",
    ];

    if (!validScopes.includes(scope)) {
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
    const validOperations: PriceAdjustmentOperation[] = [
        "PERCENT_INCREASE",
        "PERCENT_DECREASE",
        "FIXED_INCREASE",
        "FIXED_DECREASE",
        "SET_EXACT",
    ];

    const { operation, productIds } = input;
    const numericValue = Number(input.value);

    if (!validOperations.includes(operation)) {
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

    const hasHighDiscount = previewProducts.some(
        (product) => product.discountPercentage >= 50
    );

    return {
        affectedCount: previewProducts.length,
        belowCostCount,
        requiresBelowCostConfirmation: belowCostCount > 0,
        requiresReason: belowCostCount > 0 || hasHighDiscount,
        products: previewProducts,
    };
};