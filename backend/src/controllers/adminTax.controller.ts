import { Request, Response } from "express";
import {
    getAllTaxes,
    postTax,
    editTax,
    editTaxStatus,
    assignTaxToProduct,
    deleteTaxFromProduct,
    getTaxesByProduct,
    syncTaxesForProduct,
} from "../services/adminTax.service";

const parsePositiveInt = (value: unknown): number | null => {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
};

const parseTaxIds = (value: unknown): number[] | null => {
    if (!Array.isArray(value)) {
        return null;
    }

    const taxIds: number[] = [];
    for (const raw of value) {
        const id = parsePositiveInt(raw);
        if (id === null) {
            return null;
        }
        if (!taxIds.includes(id)) {
            taxIds.push(id);
        }
    }

    return taxIds;
};

const mapProductTaxResponse = (productTaxes: Awaited<ReturnType<typeof getTaxesByProduct>>) => {
    const rows = productTaxes ?? [];

    return {
        taxIds: rows.map((row) => row.taxTypeId),
        taxes: rows.map((row) => ({
            id: row.TaxType.id,
            name: row.TaxType.name,
            description: row.TaxType.description,
            rate: row.TaxType.rate,
            active: row.TaxType.active,
            createdAt: row.TaxType.createdAt,
            updatedAt: row.TaxType.updatedAt,
        })),
    };
};

/**
 * Traer todos los impuestos o buscar por nombre/id
 */
export const getTaxes = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
        res.status(401).json({ message: "No autenticado." });
        return;
    }

    try {
        const search = req.query.search as string | undefined;

        const taxes = await getAllTaxes(search);

        res.status(200).json({
            success: true,
            message: "Impuestos obtenidos exitosamente",
            data: taxes,
        });
    } catch (error: any) {
        console.log("Error al obtener los impuestos", error.message);

        res.status(500).json({
            message: "Error al obtener los impuestos",
            error: error.message,
        });
    }
};

/**
 * Crear nuevo impuesto
 */
export const createTax = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
        res.status(401).json({ message: "No autenticado." });
        return;
    }

    try {
        const { name, description, rate, active } = req.body;

        if (!name) {
            res.status(400).json({ message: "El nombre es requerido" })
            return;
        }
        if (!rate) {
            res.status(400).json({ message: "El porcentaje es requerido" })
            return;
        }
        if (!active) {
            res.status(400).json({ message: "El estado es requerido" })
            return;
        }

        const tax = await postTax(name, description, rate, active);

        res.status(201).json({
            success: true,
            message: "Impuesto creado exitosamente",
            data: tax,
        });
    }
    catch (error: any) {
        console.log("Error al crear el impuesto", error.message);

        res.status(500).json({
            message: "Error al crear el impuesto",
            error: error.message,
        });
    }
}

/**
 * Editar impuesto
 */

export const updateTax = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
        res.status(401).json({ message: "No autenticado." });
        return;
    }

    try {
        const { id, name, description, rate, active } = req.body;

        if (!id) {
            res.status(400).json({ message: "El id es requerido" })
            return;
        }
        if (!name) {
            res.status(400).json({ message: "El nombre es requerido" })
            return;
        }
        if (!rate) {
            res.status(400).json({ message: "El porcentaje es requerido" })
            return;
        }
        if (!active) {
            res.status(400).json({ message: "El estado es requerido" })
            return;
        }

        const tax = await editTax(id, name, description, rate, active);

        res.status(201).json({
            success: true,
            message: "Impuesto editado exitosamente",
            data: tax,
        });
    }
    catch (error: any) {
        console.log("Error al editar el impuesto", error.message);

        res.status(500).json({
            message: "Error al editar el impuesto",
            error: error.message,
        });
    }
}


/**
 * Cambiar estado de impuesto
 */

export const updateTaxStatus = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
        res.status(401).json({ message: "No autenticado." });
        return;
    }

    try {
        const { id, status } = req.body;



        if (!id) {
            res.status(400).json({ message: "El id es requerido" })
            return;
        }
        if (typeof status !== "boolean") {
            res.status(400).json({ message: "El estado debe ser true o false" });
            return;
        }

        const tax = await editTaxStatus(Number(id), status);

        res.status(201).json({
            success: true,
            message: "Estado del impuesto actualizado exitosamente",
            data: tax,
        });
    }
    catch (error: any) {
        console.log("Error al actualizar el estado del impuesto", error.message);

        res.status(500).json({
            message: "Error al actualizar el estado del impuesto",
            error: error.message,
        });
    }
}

/**
 * Asignar impuesto a un producto // se accede desde el de productos
 */

export const createProductTax = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
        res.status(401).json({ message: "No autenticado." });
        return;
    }

    try {
        const { productId, taxTypeId } = req.body;

        if (!productId) {
            res.status(400).json({ message: "El id del producto es requerido" })
            return;
        }
        if (!taxTypeId) {
            res.status(400).json({ message: "El id del impuesto es requerido" })
            return;
        }

        const tax = await assignTaxToProduct(productId, taxTypeId);

        res.status(201).json({
            success: true,
            message: "Impuesto asignado exitosamente",
            data: tax,
        });
    }
    catch (error: any) {
        console.log("Error al asignar el impuesto", error.message);

        res.status(500).json({
            message: "Error al asignar el impuesto",
            error: error.message,
        });
    }
}

/**
 * Eliminar impuesto
 */

export const deleteProductTax = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
        res.status(401).json({ message: "No autenticado." });
        return;
    }

    try {
        const { productId, taxTypeId } = req.body;

        if (!productId) {
            res.status(400).json({ message: "El id del producto es requerido" });
            return;
        }

        if (!taxTypeId) {
            res.status(400).json({ message: "El id del impuesto es requerido" });
            return;
        }

        const tax = await deleteTaxFromProduct(Number(productId), Number(taxTypeId));

        res.status(200).json({
            success: true,
            message: "Impuesto desvinculado del producto exitosamente",
            data: tax,
        });
    } catch (error: any) {
        console.log("Error al desvincular el impuesto del producto", error.message);

        res.status(500).json({
            message: "Error al eliminar el impuesto",
            error: error.message,
        });
    }
};

/**
 * Obtener impuestos asignados a un producto
 */
export const getProductTaxes = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
        res.status(401).json({ message: "No autenticado." });
        return;
    }

    try {
        const productId = parsePositiveInt(req.params.productId);

        if (productId === null) {
            res.status(400).json({ message: "El id del producto es inválido" });
            return;
        }

        const productTaxes = await getTaxesByProduct(productId);

        if (productTaxes === null) {
            res.status(404).json({ message: "Producto no encontrado" });
            return;
        }

        res.status(200).json({
            success: true,
            message: "Impuestos del producto obtenidos exitosamente",
            data: {
                productId,
                ...mapProductTaxResponse(productTaxes),
            },
        });
    } catch (error: any) {
        console.log("Error al obtener los impuestos del producto", error.message);

        res.status(500).json({
            message: "Error al obtener los impuestos del producto",
            error: error.message,
        });
    }
};

/**
 * Sincronizar impuestos seleccionados para un producto
 */
export const syncProductTaxes = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
        res.status(401).json({ message: "No autenticado." });
        return;
    }

    try {
        const productId = parsePositiveInt(req.params.productId);
        const taxIds = parseTaxIds(req.body.taxIds);

        if (productId === null) {
            res.status(400).json({ message: "El id del producto es inválido" });
            return;
        }

        if (taxIds === null) {
            res.status(400).json({ message: "taxIds debe ser un arreglo de ids numéricos válidos" });
            return;
        }

        const productTaxes = await syncTaxesForProduct(productId, taxIds);

        res.status(200).json({
            success: true,
            message: "Impuestos del producto sincronizados exitosamente",
            data: {
                productId,
                ...mapProductTaxResponse(productTaxes),
            },
        });
    } catch (error: any) {
        if (error.message === "PRODUCT_NOT_FOUND") {
            res.status(404).json({ message: "Producto no encontrado" });
            return;
        }

        if (error.message === "TAX_NOT_FOUND") {
            res.status(400).json({ message: "Uno o más impuestos seleccionados no existen" });
            return;
        }

        console.log("Error al sincronizar los impuestos del producto", error.message);

        res.status(500).json({
            message: "Error al sincronizar los impuestos del producto",
            error: error.message,
        });
    }
};
