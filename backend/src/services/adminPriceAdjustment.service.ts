import { Prisma } from "@prisma/client"
import { prisma } from "../app";
import { AppError } from "../utils/AppError";
import { comparePassword } from "../utils/auth";

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
const PRICE_ADJUSTMENT_REVERSAL_WINDOW_DAYS = 3;
const REVERSAL_TYPE = "REVERSAL";
const REVERSAL_DIRECTION = "REVERT";

type ReversalStatus =
    | "NOT_REVERTED"
    | "PARTIALLY_REVERTED"
    | "FULLY_REVERTED"
    | "REVERSAL";

type ReversalReasonCode =
    | "ADJUSTMENT_NOT_FOUND"
    | "ADJUSTMENT_IS_REVERSAL"
    | "REVERSAL_WINDOW_EXPIRED"
    | "DETAIL_NOT_FOUND"
    | "DETAIL_NOT_IN_ADJUSTMENT"
    | "ALREADY_REVERTED"
    | "PRODUCT_NOT_FOUND"
    | "PRODUCT_INACTIVE"
    | "PRICE_CHANGED"
    | "INVALID_TARGET_PRICE"
    | "INCOMPLETE_HISTORY";

export type PriceAdjustmentReversalConflict = {
    detailId?: number;
    productId?: number;
    name?: string;
    sku?: string;
    reasonCode: ReversalReasonCode;
    reason: string;
    originalNewPrice?: number;
    currentPrice?: number;
    targetPrice?: number;
};

export class PriceAdjustmentReversalConflictError extends Error {
    public readonly statusCode = 409;
    public readonly conflicts: PriceAdjustmentReversalConflict[];

    constructor(
        message: string,
        conflicts: PriceAdjustmentReversalConflict[]
    ) {
        super(message);
        this.conflicts = conflicts;
        Object.setPrototypeOf(this, PriceAdjustmentReversalConflictError.prototype);
    }
}

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

const toMoney = (value: Prisma.Decimal | number | string) =>
    roundToTwoDecimals(new Prisma.Decimal(value));

const moneyEquals = (
    first: Prisma.Decimal | number | string,
    second: Prisma.Decimal | number | string
) => toMoney(first).equals(toMoney(second));

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

const validateReversalReason = (reason: unknown) => {
    if (typeof reason !== "string") {
        throw new AppError("El motivo de la reversión es obligatorio.", 400);
    }

    const cleanReason = reason.trim();

    if (!cleanReason) {
        throw new AppError("El motivo de la reversión es obligatorio.", 400);
    }

    if (cleanReason.length > PRICE_ADJUSTMENT_NOTES_MAX_LENGTH) {
        throw new AppError(
            `El motivo de la reversión no puede exceder ${PRICE_ADJUSTMENT_NOTES_MAX_LENGTH} caracteres.`,
            400
        );
    }

    return cleanReason;
};

type ReversalStatusSource = {
    type: string;
    reversalOfId: number | null;
    details?: Array<{
        reversedAt: Date | null;
        reversedByAdjustmentId: number | null;
    }>;
    _count?: {
        details: number;
    };
};

type ReversalDetailProduct = {
    id: number;
    sku: string;
    barcode: string | null;
    name: string;
    description: string | null;
    sellPrice: Prisma.Decimal;
    active: boolean;
} | null;

type ReversalDetailSource = {
    id: number;
    priceAdjustmentId: number;
    productId: number;
    oldSellPrice: Prisma.Decimal;
    newSellPrice: Prisma.Decimal;
    costPriceAtChange: Prisma.Decimal;
    isBelowCost: boolean;
    reversedAt: Date | null;
    reversedByAdjustmentId: number | null;
    product: ReversalDetailProduct;
};

const isReversalAdjustment = (
    adjustment: Pick<ReversalStatusSource, "type" | "reversalOfId">
) => adjustment.type === REVERSAL_TYPE || adjustment.reversalOfId !== null;

const getReversalDeadline = (appliedAt: Date) => {
    const deadline = new Date(appliedAt.getTime());
    deadline.setDate(deadline.getDate() + PRICE_ADJUSTMENT_REVERSAL_WINDOW_DAYS);
    return deadline;
};

const getReversalWindowState = (appliedAt: Date, now = new Date()) => {
    const deadline = getReversalDeadline(appliedAt);
    return {
        deadline,
        expired: now.getTime() > deadline.getTime(),
    };
};

const getReversalStatus = (adjustment: ReversalStatusSource) => {
    const totalRows = adjustment._count?.details ?? adjustment.details?.length ?? 0;
    const reversedRows =
        adjustment.details?.filter(
            (detail) => detail.reversedAt || detail.reversedByAdjustmentId
        ).length ?? 0;
    const isReversal = isReversalAdjustment(adjustment);

    let status: ReversalStatus = "NOT_REVERTED";
    if (isReversal) {
        status = "REVERSAL";
    } else if (totalRows > 0 && reversedRows >= totalRows) {
        status = "FULLY_REVERTED";
    } else if (reversedRows > 0) {
        status = "PARTIALLY_REVERTED";
    }

    const label =
        status === "REVERSAL"
            ? "Ajuste de reversión"
            : status === "FULLY_REVERTED"
              ? "Revertido completamente"
              : status === "PARTIALLY_REVERTED"
                ? `Revertido parcialmente: ${reversedRows} de ${totalRows} productos`
                : "No revertido";

    return {
        status,
        label,
        totalRows,
        reversedRows,
        reversibleRows: Math.max(totalRows - reversedRows, 0),
        isReversal,
    };
};

const buildReversalConflict = (
    detail: Partial<ReversalDetailSource>,
    reasonCode: ReversalReasonCode,
    reason: string,
    extra: Partial<PriceAdjustmentReversalConflict> = {}
): PriceAdjustmentReversalConflict => ({
    detailId: detail.id,
    productId: detail.productId,
    name: detail.product?.name,
    sku: detail.product?.sku,
    reasonCode,
    reason,
    ...extra,
});

const getReversalProductEligibility = (
    adjustment: {
        type: string;
        reversalOfId: number | null;
        appliedAt: Date;
    },
    detail: ReversalDetailSource,
    now = new Date()
) => {
    const adjustmentIsReversal = isReversalAdjustment(adjustment);
    const { expired } = getReversalWindowState(adjustment.appliedAt, now);
    const conflicts: PriceAdjustmentReversalConflict[] = [];

    if (adjustmentIsReversal) {
        conflicts.push(
            buildReversalConflict(
                detail,
                "ADJUSTMENT_IS_REVERSAL",
                "Los ajustes de reversión no pueden revertirse."
            )
        );
    }

    if (expired) {
        conflicts.push(
            buildReversalConflict(
                detail,
                "REVERSAL_WINDOW_EXPIRED",
                "El plazo de 3 días para revertir este ajuste ha vencido."
            )
        );
    }

    if (detail.reversedAt || detail.reversedByAdjustmentId) {
        conflicts.push(
            buildReversalConflict(
                detail,
                "ALREADY_REVERTED",
                "Este producto ya fue revertido."
            )
        );
    }

    if (!detail.product) {
        conflicts.push(
            buildReversalConflict(
                detail,
                "PRODUCT_NOT_FOUND",
                "El producto ya no existe."
            )
        );
    } else {
        if (!detail.product.active) {
            conflicts.push(
                buildReversalConflict(
                    detail,
                    "PRODUCT_INACTIVE",
                    "No disponible: el producto está inactivo."
                )
            );
        }

        if (!moneyEquals(detail.product.sellPrice, detail.newSellPrice)) {
            conflicts.push(
                buildReversalConflict(
                    detail,
                    "PRICE_CHANGED",
                    "No disponible: el precio actual fue modificado después del ajuste.",
                    {
                        originalNewPrice: Number(detail.newSellPrice),
                        currentPrice: Number(detail.product.sellPrice),
                    }
                )
            );
        }
    }

    if (
        !detail.oldSellPrice ||
        !detail.newSellPrice ||
        !detail.costPriceAtChange
    ) {
        conflicts.push(
            buildReversalConflict(
                detail,
                "INCOMPLETE_HISTORY",
                "El registro histórico está incompleto."
            )
        );
    } else if (toMoney(detail.oldSellPrice).lessThanOrEqualTo(0)) {
        conflicts.push(
            buildReversalConflict(
                detail,
                "INVALID_TARGET_PRICE",
                "El precio a restaurar no es válido.",
                {
                    targetPrice: Number(detail.oldSellPrice),
                }
            )
        );
    }

    return {
        detailId: detail.id,
        productId: detail.productId,
        sku: detail.product?.sku ?? "-",
        barcode: detail.product?.barcode ?? null,
        name: detail.product?.name ?? "Producto no disponible",
        description: detail.product?.description ?? null,
        oldSellPrice: Number(detail.oldSellPrice),
        newSellPrice: Number(detail.newSellPrice),
        currentSellPrice: detail.product ? Number(detail.product.sellPrice) : null,
        targetSellPrice: Number(detail.oldSellPrice),
        costPriceAtChange: Number(detail.costPriceAtChange),
        isBelowCost: detail.isBelowCost,
        active: detail.product?.active ?? false,
        reversedAt: detail.reversedAt,
        reversedByAdjustmentId: detail.reversedByAdjustmentId,
        reversible: conflicts.length === 0,
        reasonCode: conflicts[0]?.reasonCode ?? null,
        reason: conflicts[0]?.reason ?? null,
        conflicts,
    };
};

const validateCurrentAdminCredential = async (
    userId: number,
    credential: unknown
) => {
    if (typeof credential !== "string" || !credential.trim()) {
        throw new AppError("Debes confirmar tu PIN o contraseña.", 400);
    }

    const adminUser = await prisma.user.findUnique({
        where: {
            id: userId,
        },
        select: {
            id: true,
            passwordHash: true,
            pinCode: true,
            role: true,
            active: true,
        },
    });

    if (!adminUser || !adminUser.active || adminUser.role !== "ADMIN") {
        throw new AppError("Solo un administrador activo puede revertir ajustes.", 403);
    }

    const cleanCredential = credential.trim();
    const passwordMatches = await comparePassword(
        cleanCredential,
        adminUser.passwordHash
    );
    const pinMatches = adminUser.pinCode
        ? await comparePassword(cleanCredential, adminUser.pinCode)
        : false;

    if (!passwordMatches && !pinMatches) {
        throw new AppError("PIN o contraseña incorrectos.", 401, "INVALID_CREDENTIAL");
    }
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

    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    const date = dateOnlyMatch
        ? new Date(
            Number(dateOnlyMatch[1]),
            Number(dateOnlyMatch[2]) - 1,
            Number(dateOnlyMatch[3]),
            endOfDay ? 23 : 0,
            endOfDay ? 59 : 0,
            endOfDay ? 59 : 0,
            endOfDay ? 999 : 0
        )
        : new Date(value);

    if (Number.isNaN(date.getTime())) {
        throw new AppError("La fecha enviada no es válida.", 400);
    }

    if (endOfDay && !dateOnlyMatch) {
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
                reversalOf: {
                    select: {
                        id: true,
                        appliedAt: true,
                    },
                },
                reversals: {
                    select: {
                        id: true,
                        appliedAt: true,
                    },
                    orderBy: {
                        appliedAt: "desc",
                    },
                },
                details: {
                    select: {
                        reversedAt: true,
                        reversedByAdjustmentId: true,
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
            reversalOfId: adjustment.reversalOfId,
            reversalOf: adjustment.reversalOf,
            reversals: adjustment.reversals,
            reversalStatus: getReversalStatus(adjustment),
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
            reversalOf: {
                select: {
                    id: true,
                    appliedAt: true,
                },
            },
            reversals: {
                select: {
                    id: true,
                    appliedAt: true,
                },
                orderBy: {
                    appliedAt: "desc",
                },
            },
            details: {
                select: {
                    reversedAt: true,
                    reversedByAdjustmentId: true,
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
        reversalOfId: adjustment.reversalOfId,
        reversalOf: adjustment.reversalOf,
        reversals: adjustment.reversals,
        reversalStatus: getReversalStatus(adjustment),
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
                        sellPrice: true,
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
            currentSellPrice: Number(detail.product.sellPrice),
            costPriceAtChange: Number(detail.costPriceAtChange),
            isBelowCost: detail.isBelowCost,
            reversedAt: detail.reversedAt,
            reversedByAdjustmentId: detail.reversedByAdjustmentId,
            reversalSourceDetailId: detail.reversalSourceDetailId,
            createdAt: detail.createdAt,
        })),
    };
};

export const getPriceAdjustmentReversalPreview = async (id: number) => {
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
            reversalOf: {
                select: {
                    id: true,
                    appliedAt: true,
                },
            },
            reversals: {
                select: {
                    id: true,
                    appliedAt: true,
                },
                orderBy: {
                    appliedAt: "desc",
                },
            },
            details: {
                include: {
                    product: {
                        select: {
                            id: true,
                            sku: true,
                            barcode: true,
                            name: true,
                            description: true,
                            sellPrice: true,
                            active: true,
                        },
                    },
                },
                orderBy: {
                    id: "asc",
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

    const now = new Date();
    const windowState = getReversalWindowState(adjustment.appliedAt, now);
    const products = (adjustment.details as ReversalDetailSource[]).map(
        (detail) => getReversalProductEligibility(adjustment, detail, now)
    );
    const reversalStatus = getReversalStatus(adjustment);
    const blockReason = reversalStatus.isReversal
        ? "Los ajustes de reversión no pueden revertirse."
        : windowState.expired
          ? "El plazo de 3 días para revertir este ajuste ha vencido."
          : null;

    return {
        adjustment: {
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
            reversalOfId: adjustment.reversalOfId,
            reversalOf: adjustment.reversalOf,
            reversals: adjustment.reversals,
            reversalDeadline: windowState.deadline,
            canRevert: !blockReason && products.some((product) => product.reversible),
            blockReason,
            reversalStatus,
            detailsCount: adjustment._count.details,
        },
        products,
        summary: {
            total: products.length,
            reversible: products.filter((product) => product.reversible).length,
            conflicted: products.filter((product) => !product.reversible).length,
            reversed: products.filter(
                (product) => product.reversedAt || product.reversedByAdjustmentId
            ).length,
            status: reversalStatus.status,
            label: reversalStatus.label,
        },
    };
};

type RevertPriceAdjustmentInput = {
    adjustmentId: number;
    productDetailIds: number[];
    reason: unknown;
    credential: unknown;
    appliedById: number;
};

const normalizeReversalDetailIds = (productDetailIds: number[]) => {
    if (!Array.isArray(productDetailIds) || productDetailIds.length === 0) {
        throw new AppError(
            "Selecciona al menos un producto para revertir.",
            400
        );
    }

    const normalizedIds = productDetailIds.map(Number);
    const hasInvalidIds = normalizedIds.some(
        (detailId) => !Number.isInteger(detailId) || detailId <= 0
    );

    if (hasInvalidIds) {
        throw new AppError("Uno o más detalles seleccionados no son válidos.", 400);
    }

    const uniqueIds = [...new Set(normalizedIds)];

    if (uniqueIds.length !== normalizedIds.length) {
        throw new AppError("No puedes enviar productos repetidos.", 400);
    }

    return uniqueIds;
};

export const revertPriceAdjustment = async (
    input: RevertPriceAdjustmentInput
) => {
    const adjustmentId = Number(input.adjustmentId);

    if (!Number.isInteger(adjustmentId) || adjustmentId <= 0) {
        throw new AppError("El ajuste solicitado no es válido.", 400);
    }

    const detailIds = normalizeReversalDetailIds(input.productDetailIds);
    const cleanReason = validateReversalReason(input.reason);
    await validateCurrentAdminCredential(input.appliedById, input.credential);

    try {
        const reversal = await prisma.$transaction(
            async (tx) => {
                const adjustment = await tx.priceAdjustment.findUnique({
                    where: {
                        id: adjustmentId,
                    },
                    select: {
                        id: true,
                        type: true,
                        direction: true,
                        scope: true,
                        value: true,
                        affectedRows: true,
                        belowCostCount: true,
                        notes: true,
                        appliedAt: true,
                        appliedById: true,
                        categoryId: true,
                        reversalOfId: true,
                    },
                });

                if (!adjustment) {
                    throw new AppError("El ajuste de precio no existe.", 404);
                }

                const selectedDetails = await tx.priceAdjustmentDetail.findMany({
                    where: {
                        id: {
                            in: detailIds,
                        },
                    },
                    include: {
                        product: {
                            select: {
                                id: true,
                                sku: true,
                                barcode: true,
                                name: true,
                                description: true,
                                sellPrice: true,
                                active: true,
                            },
                        },
                    },
                    orderBy: {
                        id: "asc",
                    },
                });

                const detailById = new Map(
                    (selectedDetails as ReversalDetailSource[]).map((detail) => [
                        detail.id,
                        detail,
                    ])
                );
                const now = new Date();
                const conflicts: PriceAdjustmentReversalConflict[] = [];
                const eligibleDetails: ReversalDetailSource[] = [];

                detailIds.forEach((detailId) => {
                    const detail = detailById.get(detailId);

                    if (!detail) {
                        conflicts.push({
                            detailId,
                            reasonCode: "DETAIL_NOT_FOUND",
                            reason: "El detalle histórico seleccionado no existe.",
                        });
                        return;
                    }

                    if (detail.priceAdjustmentId !== adjustment.id) {
                        conflicts.push(
                            buildReversalConflict(
                                detail,
                                "DETAIL_NOT_IN_ADJUSTMENT",
                                "El producto no pertenece a este ajuste."
                            )
                        );
                        return;
                    }

                    const eligibility = getReversalProductEligibility(
                        adjustment,
                        detail,
                        now
                    );

                    if (!eligibility.reversible) {
                        conflicts.push(...eligibility.conflicts);
                        return;
                    }

                    eligibleDetails.push(detail);
                });

                if (conflicts.length > 0) {
                    throw new PriceAdjustmentReversalConflictError(
                        "Algunos productos ya no pueden revertirse.",
                        conflicts
                    );
                }

                const reversalRows = eligibleDetails.map((detail) => {
                    const restoredSellPrice = toMoney(detail.oldSellPrice);
                    const currentSellPrice = toMoney(detail.newSellPrice);
                    const costPriceAtChange = toMoney(detail.costPriceAtChange);

                    return {
                        productId: detail.productId,
                        oldSellPrice: currentSellPrice,
                        newSellPrice: restoredSellPrice,
                        costPriceAtChange,
                        isBelowCost: restoredSellPrice.lessThan(costPriceAtChange),
                        reversalSourceDetailId: detail.id,
                    };
                });

                const createdReversal = await tx.priceAdjustment.create({
                    data: {
                        type: REVERSAL_TYPE,
                        direction: REVERSAL_DIRECTION,
                        scope: "SELECTED_PRODUCTS",
                        value: new Prisma.Decimal(0),
                        affectedRows: reversalRows.length,
                        belowCostCount: reversalRows.filter((row) => row.isBelowCost)
                            .length,
                        notes: cleanReason,
                        appliedById: input.appliedById,
                        categoryId: adjustment.categoryId,
                        reversalOfId: adjustment.id,
                        details: {
                            create: reversalRows,
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
                        reversalOf: {
                            select: {
                                id: true,
                                appliedAt: true,
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
                            orderBy: {
                                id: "asc",
                            },
                        },
                    },
                });

                for (const detail of eligibleDetails) {
                    const productUpdate = await tx.product.updateMany({
                        where: {
                            id: detail.productId,
                            active: true,
                            sellPrice: toMoney(detail.newSellPrice),
                        },
                        data: {
                            sellPrice: toMoney(detail.oldSellPrice),
                        },
                    });

                    if (productUpdate.count !== 1) {
                        const currentProduct = await tx.product.findUnique({
                            where: {
                                id: detail.productId,
                            },
                            select: {
                                sellPrice: true,
                                active: true,
                            },
                        });

                        throw new PriceAdjustmentReversalConflictError(
                            "Algunos productos ya no pueden revertirse.",
                            [
                                buildReversalConflict(
                                    {
                                        ...detail,
                                        product: detail.product
                                            ? {
                                                ...detail.product,
                                                active:
                                                    currentProduct?.active ??
                                                    detail.product.active,
                                                sellPrice:
                                                    currentProduct?.sellPrice ??
                                                    detail.product.sellPrice,
                                            }
                                            : null,
                                    },
                                    !currentProduct
                                        ? "PRODUCT_NOT_FOUND"
                                        : currentProduct.active === false
                                          ? "PRODUCT_INACTIVE"
                                          : "PRICE_CHANGED",
                                    !currentProduct
                                        ? "El producto ya no existe."
                                        : currentProduct.active === false
                                          ? "No disponible: el producto está inactivo."
                                          : "No disponible: el precio actual fue modificado después del ajuste.",
                                    {
                                        originalNewPrice: Number(detail.newSellPrice),
                                        currentPrice: currentProduct
                                            ? Number(currentProduct.sellPrice)
                                            : undefined,
                                    }
                                ),
                            ]
                        );
                    }

                    const originalDetailUpdate =
                        await tx.priceAdjustmentDetail.updateMany({
                            where: {
                                id: detail.id,
                                reversedAt: null,
                                reversedByAdjustmentId: null,
                            },
                            data: {
                                reversedAt: now,
                                reversedByAdjustmentId: createdReversal.id,
                            },
                        });

                    if (originalDetailUpdate.count !== 1) {
                        throw new PriceAdjustmentReversalConflictError(
                            "Algunos productos ya no pueden revertirse.",
                            [
                                buildReversalConflict(
                                    detail,
                                    "ALREADY_REVERTED",
                                    "Este producto ya fue revertido."
                                ),
                            ]
                        );
                    }
                }

                return createdReversal;
            },
            {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            }
        );

        return {
            id: reversal.id,
            type: reversal.type,
            direction: reversal.direction,
            scope: reversal.scope,
            value: Number(reversal.value),
            affectedRows: reversal.affectedRows,
            belowCostCount: reversal.belowCostCount,
            notes: reversal.notes,
            appliedAt: reversal.appliedAt,
            appliedBy: reversal.appliedBy,
            category: reversal.category,
            reversalOfId: reversal.reversalOfId,
            reversalOf: reversal.reversalOf,
            products: reversal.details.map((detail) => ({
                detailId: detail.id,
                productId: detail.productId,
                sku: detail.product.sku,
                name: detail.product.name,
                currentSellPrice: Number(detail.oldSellPrice),
                restoredSellPrice: Number(detail.newSellPrice),
                sourceDetailId: detail.reversalSourceDetailId,
            })),
        };
    } catch (error) {
        if (error instanceof PriceAdjustmentReversalConflictError) {
            throw error;
        }

        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
        ) {
            throw new PriceAdjustmentReversalConflictError(
                "Algunos productos ya no pueden revertirse.",
                [
                    {
                        reasonCode: "ALREADY_REVERTED",
                        reason: "Uno o más productos ya fueron revertidos.",
                    },
                ]
            );
        }

        throw error;
    }
};
