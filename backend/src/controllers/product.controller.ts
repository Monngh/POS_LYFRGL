import { Request, Response } from "express";
import { prisma } from "../app";

/**
 * Buscar productos por código de barras, SKU o nombre y retornar su inventario en la sucursal actual
 */
export const searchProducts = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }

  const { query } = req.query;

  try {
    const qStr = query ? String(query).trim() : "";

    // Si la búsqueda es vacía, retornar listado de prueba rápido (ej. top 10 productos)
    const whereCondition = qStr
      ? {
          active: true,
          OR: [
            { sku: { contains: qStr } },
            { barcode: { contains: qStr } },
            { name: { contains: qStr } },
          ],
        }
      : { active: true };

    const products = await prisma.product.findMany({
      where: whereCondition,
      take: 15,
      include: {
        inventories: {
          where: { branchId: req.user.branchId },
        },
      },
    });

    // Mapear el resultado para retornar un formato plano con stock fácil de leer por el frontend
    const mappedProducts = products.map((p) => {
      const branchInventory = p.inventories[0];
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
      };
    });

    res.status(200).json({ products: mappedProducts });
  } catch (error: any) {
    res.status(500).json({ message: "Error al buscar productos.", error: error.message });
  }
};
