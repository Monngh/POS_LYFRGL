import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import {
    getAllTaxes,
    postTax,
    editTax,
    editTaxStatus,
    assignTaxToProduct,
    deleteTaxFromProduct,
    getTaxesByProduct,
    syncTaxesForProduct,
    getTaxById,
    getTaxByName,
    getProductForTaxAssignment,
    getProductTaxRelation,
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

const parseRequiredName = (value: unknown): { value?: string; message?: string } => {
    if (value === undefined || value === null) {
        return { message: "El nombre del impuesto es requerido" };
    }

    if (typeof value !== "string") {
        return { message: "El nombre del impuesto debe ser texto" };
    }

    const name = value.trim();
    if (!name) {
        return { message: "El nombre del impuesto es requerido" };
    }

    return { value: name };
};

const parseRequiredRate = (value: unknown): { value?: number; message?: string } => {
    if (value === undefined || value === null || value === "") {
        return { message: "La tasa es requerida" };
    }

    if (typeof value === "boolean") {
        return { message: "La tasa debe ser un número válido" };
    }

    const rate = Number(value);
    if (!Number.isFinite(rate)) {
        return { message: "La tasa debe ser un número válido" };
    }

    if (rate < 0) {
        return { message: "La tasa no puede ser negativa" };
    }

    return { value: rate };
};

const parseOptionalBoolean = (value: unknown, defaultValue: boolean): { value?: boolean; message?: string } => {
    if (value === undefined) {
        return { value: defaultValue };
    }

    if (typeof value !== "boolean") {
        return { message: "El estado debe ser true o false" };
    }

    return { value };
};

const normalizeDescription = (value: unknown): string | null => {
    return typeof value === "string" && value.trim() ? value.trim() : null;
};

const isUniqueConstraintError = (error: any) => {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
};

const mapProductTaxResponse = (productTaxes: Awaited<ReturnType<typeof getTaxesByProduct>>) => {
    const rows = productTaxes ?? [];

    return {
        taxIds: rows.map((row: any) => row.taxTypeId),
        taxes: rows.map((row: any) => ({
            id: row.taxType.id,
            name: row.taxType.name,
            description: row.taxType.description,
            rate: row.taxType.rate,
            active: row.taxType.active,
            createdAt: row.taxType.createdAt,
            updatedAt: row.taxType.updatedAt,
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
        const parsedName = parseRequiredName(name);
        if (parsedName.message) {
            res.status(400).json({ message: parsedName.message });
            return;
        }

        const parsedRate = parseRequiredRate(rate);
        if (parsedRate.message) {
            res.status(400).json({ message: parsedRate.message });
            return;
        }

        const parsedActive = parseOptionalBoolean(active, true);
        if (parsedActive.message) {
            res.status(400).json({ message: parsedActive.message });
            return;
        }

        const existingTax = await getTaxByName(parsedName.value!);
        if (existingTax) {
            res.status(409).json({ message: "Ya existe un impuesto con ese nombre" });
            return;
        }

        const tax = await postTax(
            parsedName.value!,
            normalizeDescription(description),
            parsedRate.value!,
            parsedActive.value!,
        );

        res.status(201).json({
            success: true,
            message: "Impuesto creado exitosamente",
            data: tax,
        });
    } catch (error: any) {
        if (isUniqueConstraintError(error)) {
            res.status(409).json({ message: "Ya existe un impuesto con ese nombre" });
            return;
        }

        console.log("Error al crear el impuesto", error.message);

        res.status(500).json({
            message: "Error al crear el impuesto",
            error: error.message,
        });
    }
};

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
        const taxId = parsePositiveInt(id);

        if (taxId === null) {
            res.status(400).json({ message: "El id es requerido y debe ser numérico" });
            return;
        }

        const existingTax = await getTaxById(taxId);
        if (!existingTax) {
            res.status(404).json({ message: "Impuesto no encontrado" });
            return;
        }

        const parsedName = parseRequiredName(name);
        if (parsedName.message) {
            res.status(400).json({ message: parsedName.message });
            return;
        }

        const parsedRate = parseRequiredRate(rate);
        if (parsedRate.message) {
            res.status(400).json({ message: parsedRate.message });
            return;
        }

        const parsedActive = parseOptionalBoolean(active, existingTax.active);
        if (parsedActive.message) {
            res.status(400).json({ message: parsedActive.message });
            return;
        }

        const duplicateTax = await getTaxByName(parsedName.value!);
        if (duplicateTax && duplicateTax.id !== taxId) {
            res.status(409).json({ message: "Ya existe un impuesto con ese nombre" });
            return;
        }

        const tax = await editTax(
            taxId,
            parsedName.value!,
            normalizeDescription(description),
            parsedRate.value!,
            parsedActive.value!,
        );

        res.status(201).json({
            success: true,
            message: "Impuesto editado exitosamente",
            data: tax,
        });
    } catch (error: any) {
        if (isUniqueConstraintError(error)) {
            res.status(409).json({ message: "Ya existe un impuesto con ese nombre" });
            return;
        }

        console.log("Error al editar el impuesto", error.message);

        res.status(500).json({
            message: "Error al editar el impuesto",
            error: error.message,
        });
    }
};

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
        const taxId = parsePositiveInt(id);

        if (taxId === null) {
            res.status(400).json({ message: "El id es requerido y debe ser numérico" });
            return;
        }

        if (typeof status !== "boolean") {
            res.status(400).json({ message: "El estado debe ser true o false" });
            return;
        }

        const existingTax = await getTaxById(taxId);
        if (!existingTax) {
            res.status(404).json({ message: "Impuesto no encontrado" });
            return;
        }

        const tax = await editTaxStatus(taxId, status);

        res.status(201).json({
            success: true,
            message: "Estado del impuesto actualizado exitosamente",
            data: tax,
        });
    } catch (error: any) {
        console.log("Error al actualizar el estado del impuesto", error.message);

        res.status(500).json({
            message: "Error al actualizar el estado del impuesto",
            error: error.message,
        });
    }
};

/**
 * Asignar impuesto a un producto // se accede desde el de productos
 */
export const createProductTax = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
        res.status(401).json({ message: "No autenticado." });
        return;
    }

    try {
        const productId = parsePositiveInt(req.body.productId);
        const taxTypeId = parsePositiveInt(req.body.taxTypeId);

        if (productId === null) {
            res.status(400).json({ message: "El id del producto es requerido y debe ser numérico" });
            return;
        }

        if (taxTypeId === null) {
            res.status(400).json({ message: "El id del impuesto es requerido y debe ser numérico" });
            return;
        }

        const product = await getProductForTaxAssignment(productId);
        if (!product) {
            res.status(404).json({ message: "Producto no encontrado" });
            return;
        }

        if (!product.active) {
            res.status(400).json({ message: "No se puede asignar impuesto a un producto inactivo" });
            return;
        }

        const tax = await getTaxById(taxTypeId);
        if (!tax) {
            res.status(404).json({ message: "Impuesto no encontrado" });
            return;
        }

        if (!tax.active) {
            res.status(400).json({ message: "No se puede asignar un impuesto inactivo" });
            return;
        }

        const existingRelation = await getProductTaxRelation(productId, taxTypeId);
        if (existingRelation) {
            res.status(409).json({ message: "Ese impuesto ya está asignado al producto" });
            return;
        }

        const productTax = await assignTaxToProduct(productId, taxTypeId);

        res.status(201).json({
            success: true,
            message: "Impuesto asignado exitosamente",
            data: productTax,
        });
    } catch (error: any) {
        if (isUniqueConstraintError(error)) {
            res.status(409).json({ message: "Ese impuesto ya está asignado al producto" });
            return;
        }

        console.log("Error al asignar el impuesto", error.message);

        res.status(500).json({
            message: "Error al asignar el impuesto",
            error: error.message,
        });
    }
};

/**
 * Eliminar impuesto
 */
export const deleteProductTax = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
        res.status(401).json({ message: "No autenticado." });
        return;
    }

    try {
        const productId = parsePositiveInt(req.body.productId);
        const taxTypeId = parsePositiveInt(req.body.taxTypeId);

        if (productId === null) {
            res.status(400).json({ message: "El id del producto es requerido y debe ser numérico" });
            return;
        }

        if (taxTypeId === null) {
            res.status(400).json({ message: "El id del impuesto es requerido y debe ser numérico" });
            return;
        }

        const existingRelation = await getProductTaxRelation(productId, taxTypeId);
        if (!existingRelation) {
            res.status(404).json({ message: "Ese impuesto no está asignado al producto" });
            return;
        }

        const result = await deleteTaxFromProduct(productId, taxTypeId);

        if (result.count === 0) {
            res.status(404).json({ message: "Ese impuesto no está asignado al producto" });
            return;
        }

        res.status(200).json({
            success: true,
            message: "Impuesto desvinculado del producto exitosamente",
            data: result,
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

        if (error.message === "PRODUCT_INACTIVE") {
            res.status(400).json({ message: "No se puede asignar impuesto a un producto inactivo" });
            return;
        }

        if (error.message === "TAX_NOT_FOUND") {
            res.status(400).json({ message: "Uno o más impuestos seleccionados no existen" });
            return;
        }

        if (error.message === "TAX_INACTIVE") {
            res.status(400).json({ message: "No se puede asignar un impuesto inactivo" });
            return;
        }

        console.log("Error al sincronizar los impuestos del producto", error.message);

        res.status(500).json({
            message: "Error al sincronizar los impuestos del producto",
            error: error.message,
        });
    }
};
