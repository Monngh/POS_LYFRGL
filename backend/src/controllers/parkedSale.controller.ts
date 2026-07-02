import { Request, Response } from "express";
import { prisma } from "../app";
import { AppError } from "../utils/AppError";

const handleAppError = (error: unknown, res: Response, fallbackMessage: string): void => {
  if (error instanceof AppError) {
    const body: Record<string, unknown> = { message: error.message };
    if (error.code) body.code = error.code;
    res.status(error.statusCode).json(body);
    return;
  }
  console.error(error);
  res.status(500).json({ message: fallbackMessage });
};

export const parkSale = async (req: Request, res: Response) => {
  try {
    const { branchId, customerId, cartData, total } = req.body;
    const userId = (req as any).user?.userId;

    if (!userId) {
      throw new AppError("Usuario no autenticado", 401);
    }
    if (!branchId || !cartData || total === undefined) {
      throw new AppError("Datos incompletos para pausar la venta", 400);
    }

    const parkedSale = await prisma.parkedSale.create({
      data: {
        userId,
        branchId,
        customerId: customerId || null,
        cartData,
        total,
      },
    });

    res.status(201).json(parkedSale);
  } catch (error) {
    handleAppError(error, res, "Error al guardar la venta pausada");
  }
};

export const getParkedSales = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      throw new AppError("Usuario no autenticado", 401);
    }

    const parkedSales = await prisma.parkedSale.findMany({
      where: { userId },
      include: {
        customer: {
          select: { id: true, name: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(parkedSales);
  } catch (error) {
    handleAppError(error, res, "Error al obtener las ventas pausadas");
  }
};

export const deleteParkedSale = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;

    if (!userId) {
      throw new AppError("Usuario no autenticado", 401);
    }

    const parkedSale = await prisma.parkedSale.findUnique({
      where: { id: parseInt(id) },
    });

    if (!parkedSale) {
      throw new AppError("Venta pausada no encontrada", 404);
    }

    if (parkedSale.userId !== userId) {
      throw new AppError("No autorizado para eliminar esta venta pausada", 403);
    }

    await prisma.parkedSale.delete({
      where: { id: parseInt(id) },
    });

    res.json({ message: "Venta pausada eliminada" });
  } catch (error) {
    handleAppError(error, res, "Error al eliminar la venta pausada");
  }
};
