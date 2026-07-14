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
      console.error(error);
      res.status(500).json({ message: "Error interno del servidor." });
    }
  }

  /**
   * GET /api/promotions/search?q=query
   * Busca promociones activas por nombre de promoción o producto
   */
  static async search(req: Request, res: Response) {
    try {
      const q = ((req.query.q as string) || "").trim().toLowerCase();
      const promotions = await PromotionService.getActivePromotions();

      const filtered = q
        ? promotions.filter((promo) => {
            const nameMatch = promo.name.toLowerCase().includes(q);
            const productMatch = promo.products.some((pp: any) =>
              pp.product.name.toLowerCase().includes(q) ||
              pp.product.sku.toLowerCase().includes(q)
            );
            return nameMatch || productMatch;
          })
        : promotions;

      res.json(filtered);
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ message: "Error interno del servidor." });
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
      console.error(error);
      res.status(500).json({ message: "Error interno del servidor." });
    }
  }
}
