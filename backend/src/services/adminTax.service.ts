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

export const postTax = async (name: string, description: string, rate: number, active: boolean = true) => {
    return prisma.taxType.create({
        data: {
            name,
            description,
            rate,
            active,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    })
}

export const editTax = async (id: number, name: string, description: string, rate: number, active: boolean = true) => {
    return prisma.taxType.update({
        where: { id },
        data: {
            name,
            description,
            rate,
            active,
            updatedAt: new Date(),
        },
    })
}

export const editTaxStatus = async (id: number, active: boolean) => {
    return prisma.taxType.update({
        where: { id },
        data: {
            active,
            updatedAt: new Date(),
        },
    })
}

export const assignTaxToProduct = async (productId: number, taxTypeId: number) => {
    return prisma.productTax.create({
        data: {
            productId,
            taxTypeId
        },
    })
}

export const deleteTaxFromProduct = async (productId: number, taxTypeId: number) => {
    return prisma.productTax.deleteMany({
        where: {
            productId: productId,
            taxTypeId: taxTypeId
        },
    })
}