import { Request, Response, NextFunction } from "express";
import {
    resolveProductsForPriceAdjustment,
    previewPriceAdjustment
} from "../services/adminPriceAdjustment.service";

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