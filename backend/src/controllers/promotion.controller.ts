import { Request, Response } from "express";
import { PromotionService } from "../services/promotion.service";

export class PromotionController {
  /**
   * GET /api/promotions/active
   * Retorna todas las promociones activas actuales
   */
  static async getActive(_req: Request, res: Response) {
    try {
      const promotions = await PromotionService.getActivePromotions();
      res.json(promotions);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Error al obtener promociones" });
    }
  }

  /**
   * POST /api/promotions/calculate
   * Calcula el descuento de promociones para un conjunto de productos en el carrito
   */
  static async calculate(req: Request, res: Response): Promise<void> {
    try {
      const { items } = req.body;
      if (!items || !Array.isArray(items)) {
        res.status(400).json({ error: "Debe proporcionar una lista de productos en 'items'" });
        return;
      }

      const result = await PromotionService.calculatePromotions(items);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Error al calcular promociones" });
    }
  }
}
