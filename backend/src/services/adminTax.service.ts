import { prisma } from "../app";

/**
    Extrae todos los registros de los impuestos, y trae las
    búsquedas específicas si es que le pasan parámetro
**/
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
