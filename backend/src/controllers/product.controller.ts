import { Request, Response } from "express";
import { prisma } from "../app";
import { normalizeSearchText, parseSearchWords } from "../utils/search.util";
import { PromotionService } from "../services/promotion.service";

/**
 * Buscar productos por código de barras, SKU o nombre y retornar su inventario en la sucursal actual
 */
export const searchProducts = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }

  const { query, categoryId } = req.query;
  const catId = categoryId ? Number(categoryId) : undefined;

  try {
    const qStr = query ? String(query).trim() : "";
    const rawWords = qStr ? qStr.split(/\s+/).filter((w) => w.length > 0) : [];
    const searchWords = qStr ? parseSearchWords(qStr) : [];

    let matchingProductIds: number[] = [];
    if (qStr) {
      const searchPattern = `%${qStr}%`;
      if (rawWords.length > 0) {
        const firstWordPattern = `%${rawWords[0]}%`;
        const matchingNames = await prisma.$queryRaw<any[]>`
          SELECT id FROM [Product] 
          WHERE [active] = 1 AND (
            [sku] COLLATE Latin1_General_CI_AI LIKE ${searchPattern}
            OR [barcode] COLLATE Latin1_General_CI_AI LIKE ${searchPattern}
            OR [name] COLLATE Latin1_General_CI_AI LIKE ${firstWordPattern}
          )
        `;
        matchingProductIds = matchingNames.map((p) => p.id);
      } else {
        const matching = await prisma.$queryRaw<any[]>`
          SELECT id FROM [Product] 
          WHERE [active] = 1 AND (
            [sku] COLLATE Latin1_General_CI_AI LIKE ${searchPattern}
            OR [barcode] COLLATE Latin1_General_CI_AI LIKE ${searchPattern}
          )
        `;
        matchingProductIds = matching.map((p) => p.id);
      }
    }

    const whereCondition: any = { active: true };
    if (qStr) {
      whereCondition.id = { in: matchingProductIds };
    }
    if (catId) {
      whereCondition.OR = [
        { categoryId: catId },
        { categories: { some: { categoryId: catId } } }
      ];
    }

    const productsRaw = await prisma.product.findMany({
      where: whereCondition,
      take: rawWords.length > 1 ? 40 : 15,
      include: {
        inventories: {
          where: { branchId: req.user.branchId },
        },
        productTaxes: {
          include: {
            taxType: true,
          },
        },
        promotionProducts: {
          include: {
            promotion: {
              include: {
                promotionType: true
              }
            }
          }
        }
      },
    });

    const products = qStr
      ? productsRaw
          .filter((p) => {
            const normQuery = normalizeSearchText(qStr);
            const normSku = normalizeSearchText(p.sku);
            const normBarcode = p.barcode ? normalizeSearchText(p.barcode) : "";

            if (normSku.includes(normQuery) || normBarcode.includes(normQuery)) {
              return true;
            }

            if (searchWords.length === 0) return true;

            const normName = normalizeSearchText(p.name);
            return searchWords.every((word) => normName.includes(word));
          })
          .slice(0, 15)
      : productsRaw;

    const today = new Date();

    // Mapear el resultado para retornar un formato plano con stock fácil de leer por el frontend y promociones activas
    const mappedProducts = products.map((p) => {
      const branchInventory = p.inventories[0];
      
      const activePromo = PromotionService.getDisplayPromotionForProduct(p, p.promotionProducts, today);

      const taxes = p.productTaxes
        ? p.productTaxes
            .map((pt) => pt.taxType)
            .filter((t) => t.active)
            .map((t) => ({
              id: t.id,
              name: t.name,
              rate: Number(t.rate),
            }))
        : [];

      return {
        id: p.id,
        sku: p.sku,
        barcode: p.barcode,
        name: p.name,
        description: p.description,
        costPrice: Number(p.costPrice),
        sellPrice: Number(p.sellPrice),
        stock: branchInventory ? branchInventory.quantity : 0,
        minStock: branchInventory ? branchInventory.minStock : 5,
        activePromotion: activePromo,
        taxes,
      };
    });

    res.status(200).json({ products: mappedProducts });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al buscar productos." });
  }
};

export const getCategories = async (_req: Request, res: Response) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: 'asc' },
    });
    res.status(200).json({ categories });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al obtener categorías." });
  }
};
