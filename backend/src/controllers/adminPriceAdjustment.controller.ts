import { Request, Response, NextFunction } from "express";
import {
    applyMassPriceAdjustment,
    getPriceAdjustmentById,
    getPriceAdjustmentHistory,
    getPriceAdjustmentProducts,
    previewPriceAdjustment,
    resolveProductsForPriceAdjustment,
} from "../services/adminPriceAdjustment.service";
import { AppError } from "../utils/AppError";

export const resolvePriceAdjustmentProducts = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const result = await resolveProductsForPriceAdjustment({
            scope: req.body.scope,
            categoryId: req.body.categoryId,
            productIds: req.body.productIds,
            search: req.body.search,
        });

        res.status(200).json({
            message: "Productos obtenidos correctamente",
            data: result,
        });
    } catch (error) {
        next(error);
    }
};

export const previewMassPriceAdjustment = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const result = await previewPriceAdjustment({
            operation: req.body.operation,
            value: req.body.value,
            productIds: req.body.productIds
        });
        res.status(200).json({
            message: "Vista previa generada correctamente",
            data: result,
        })
    } catch (error) {
        next(error);
    }
};

export const applyPriceAdjustment = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        if (!req.user) {
            throw new AppError("No fue posible identificar al usuario.", 401);
        }

        const userId = req.user.userId;

        if (!Number.isInteger(userId) || userId <= 0) {
            throw new AppError("No fue posible identificar al usuario.", 401);
        }

        const result = await applyMassPriceAdjustment({
            scope: req.body.scope,
            categoryId: req.body.categoryId,
            operation: req.body.operation,
            value: req.body.value,
            productIds: req.body.productIds,
            notes: req.body.notes,
            confirmBelowCost: req.body.confirmBelowCost,
            appliedById: userId,
        });

        res.status(200).json({
            message: "El ajuste se aplicó correctamente.",
            data: result,
        });
    } catch (error) {
        next(error);
    }
};

export const getPriceAdjustmentHistoryController = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const result = await getPriceAdjustmentHistory({
            search: req.query.search as string,
            from: req.query.from as string,
            to: req.query.to as string,
            operation: req.query.operation as string,
            scope: req.query.scope as string,
            userId: req.query.userId
                ? Number(req.query.userId)
                : undefined,
            page: req.query.page ? Number(req.query.page) : undefined,
            limit: req.query.limit ? Number(req.query.limit) : undefined,
        });

        res.status(200).json({
            message: "Historial obtenido correctamente.",
            data: result,
        });
    } catch (error) {
        next(error);
    }
};

export const getPriceAdjustmentByIdController = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const result = await getPriceAdjustmentById(Number(req.params.id));

        res.status(200).json({
            message: "Detalle del ajuste obtenido correctamente.",
            data: result,
        });
    } catch (error) {
        next(error);
    }
};

export const getPriceAdjustmentProductsController = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const result = await getPriceAdjustmentProducts({
            adjustmentId: Number(req.params.id),
            search: req.query.search as string,
            page: req.query.page ? Number(req.query.page) : undefined,
            limit: req.query.limit ? Number(req.query.limit) : undefined,
            onlyBelowCost: req.query.onlyBelowCost === "true",
        });

        res.status(200).json({
            message: "Productos del ajuste obtenidos correctamente.",
            data: result,
        });
    } catch (error) {
        next(error);
    }
};
