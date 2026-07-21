import { prisma } from "../app";
import { AppError } from "../utils/AppError";

// Conversión de unidades capturada manualmente por línea de compra (el mismo producto
// puede venir en cajas/lotes de distinto tamaño según el pedido, no se guarda en catálogo).
interface UnitConversionInput {
  unit: string;
  quantity: number;
  piecesPerBox?: unknown;
  boxesPerLot?: unknown;
  piecesPerLot?: unknown;
}

interface UnitConversionResult {
  totalPieces: number;
  piecesPerBox: number | null;
  boxesPerLot: number | null;
  piecesPerLot: number | null;
}

const isPositiveInt = (value: unknown): value is number => {
  const num = Number(value);
  return value !== null && value !== undefined && value !== "" && Number.isInteger(num) && num > 0;
};

const computeLineUnitConversion = (input: UnitConversionInput, lineLabel: string): UnitConversionResult => {
  const { unit, quantity } = input;
  const piecesPerBox = isPositiveInt(input.piecesPerBox) ? Number(input.piecesPerBox) : null;
  const boxesPerLot = isPositiveInt(input.boxesPerLot) ? Number(input.boxesPerLot) : null;
  const piecesPerLot = isPositiveInt(input.piecesPerLot) ? Number(input.piecesPerLot) : null;

  if (unit === "CAJA") {
    if (piecesPerBox === null) {
      throw new AppError(`${lineLabel}: "Piezas por caja" es obligatorio y debe ser un entero mayor a 0 cuando la unidad es CAJA.`, 400);
    }
    return { totalPieces: quantity * piecesPerBox, piecesPerBox, boxesPerLot: null, piecesPerLot: null };
  }

  if (unit === "LOTE") {
    // Modo (b): total directo de piezas del lote. Tiene prioridad si el usuario lo capturó.
    if (piecesPerLot !== null) {
      return { totalPieces: quantity * piecesPerLot, piecesPerBox: null, boxesPerLot: null, piecesPerLot };
    }
    // Modo (a): cajas del lote × piezas por caja.
    if (boxesPerLot !== null && piecesPerBox !== null) {
      return { totalPieces: quantity * boxesPerLot * piecesPerBox, piecesPerBox, boxesPerLot, piecesPerLot: null };
    }
    throw new AppError(
      `${lineLabel}: la unidad LOTE requiere capturar la conversión de piezas: "Piezas totales del lote", o "Cajas en el lote" + "Piezas por caja".`,
      400
    );
  }

  // PIEZA, KILO, LITRO u otras unidades de conteo directo: sin conversión manual,
  // la cantidad ya representa la cantidad física (mismo comportamiento previo a este cambio).
  return { totalPieces: quantity, piecesPerBox: null, boxesPerLot: null, piecesPerLot: null };
};

export const listPurchases = async (params: {
  branchId?: string;
  status?: string;
  supplierId?: string;
  from?: Date;
  to?: Date;
}) => {
  const where: any = {};
  if (params.branchId && params.branchId !== "all") where.branchId = Number(params.branchId);
  if (params.status && params.status !== "all") where.status = params.status;
  if (params.supplierId) where.supplierId = Number(params.supplierId);
  if (params.from || params.to) {
    where.purchaseDate = {
      ...(params.from ? { gte: params.from } : {}),
      ...(params.to ? { lte: params.to } : {}),
    };
  }

  return prisma.purchaseOrder.findMany({
    where,
    include: {
      supplier: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
      details: { include: { product: { select: { id: true, sku: true, name: true } } } },
      createdByUser: { select: { id: true, name: true } },
    },
    orderBy: { purchaseDate: "desc" },
    take: 100,
  });
};

export const createPurchase = async (body: Record<string, unknown>, userId: number) => {
  const { supplierId, branchId, reference, details, notes } = body as any;

  if (!supplierId || !branchId || !reference || !Array.isArray(details) || details.length === 0) {
    throw new AppError("Faltan campos requeridos: supplierId, branchId, reference, details.", 400);
  }

  const validDetails = details.filter((d: any) => d.productId && Number(d.quantity) > 0);
  if (validDetails.length === 0) {
    throw new AppError("Agregue al menos un producto con cantidad mayor a 0.", 400);
  }

  const preparedDetails = validDetails.map((d: any, index: number) => {
    const quantity = Number(d.quantity);
    const unit = d.unit ? String(d.unit).trim().toUpperCase() : "PIEZA";
    const conversion = computeLineUnitConversion(
      { unit, quantity, piecesPerBox: d.piecesPerBox, boxesPerLot: d.boxesPerLot, piecesPerLot: d.piecesPerLot },
      `Renglón ${index + 1}`
    );
    return {
      productId: Number(d.productId),
      quantity,
      unitCost: Number(d.unitCost || 0),
      subtotal: Math.round(quantity * Number(d.unitCost || 0) * 100) / 100,
      unit,
      piecesPerBox: conversion.piecesPerBox,
      boxesPerLot: conversion.boxesPerLot,
      piecesPerLot: conversion.piecesPerLot,
      totalPieces: conversion.totalPieces,
    };
  });

  const productIds = [...new Set(validDetails.map((d: any) => Number(d.productId)))] as number[];
  const foundProducts = await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true } });
  if (foundProducts.length !== productIds.length) {
    throw new AppError("Uno o más productos no existen en el catálogo.", 404);
  }

  const supplier = await prisma.supplier.findUnique({ where: { id: Number(supplierId) } });
  if (!supplier) throw new AppError("Proveedor no encontrado.", 404);

  const branch = await prisma.branch.findUnique({ where: { id: Number(branchId) } });
  if (!branch) throw new AppError("Sucursal no encontrada.", 404);

  const subtotalNum = validDetails.reduce(
    (sum: number, d: any) => sum + Number(d.quantity) * Number(d.unitCost || 0),
    0
  );

  const taxNum = 0;
  const totalNum = subtotalNum;

  return prisma.purchaseOrder.create({
    data: {
      supplierId: Number(supplierId),
      branchId: Number(branchId),
      reference: String(reference).trim(),
      subtotal: subtotalNum,
      tax: taxNum,
      total: totalNum,
      notes: notes ? String(notes).trim() : undefined,
      createdBy: userId,
      details: {
        createMany: {
          data: preparedDetails,
        },
      },
    },
    include: {
      supplier: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
      details: { include: { product: { select: { id: true, sku: true, name: true } } } },
    },
  });
};

export const receivePurchase = async (purchaseId: number, userId: number) => {
  const purchase = await prisma.purchaseOrder.findUnique({
    where: { id: purchaseId },
    include: { details: true, supplier: true },
  });

  if (!purchase) throw new AppError("Orden de compra no encontrada.", 404);
  if (purchase.status === "RECIBIDA") throw new AppError("La orden de compra ya fue recibida.", 400);

  return prisma.$transaction(async (tx) => {
    for (const detail of purchase.details) {
      // Protección retroactiva: órdenes creadas antes de este cambio tienen
      // totalPieces = NULL, y deben seguir sumando quantity tal cual (comportamiento
      // idéntico al actual). Órdenes nuevas ya traen totalPieces calculado en piezas
      // físicas reales (considerando piezas por caja / lote).
      const piecesToAdd = detail.totalPieces ?? detail.quantity;

      const existing = await tx.inventory.findUnique({
        where: { productId_branchId: { productId: detail.productId, branchId: purchase.branchId } },
      });

      let newQty: number;
      if (existing) {
        newQty = existing.quantity + piecesToAdd;
        await tx.inventory.update({ where: { id: existing.id }, data: { quantity: newQty } });
      } else {
        newQty = piecesToAdd;
        await tx.inventory.create({
          data: { productId: detail.productId, branchId: purchase.branchId, quantity: piecesToAdd },
        });
      }

      // El costo "actual" del producto se valúa por PIEZA, no por la unidad de compra
      // (caja/lote) que haya capturado el usuario: se reparte el dinero total gastado en
      // la línea entre las piezas físicas reales que representa. Para unit=PIEZA,
      // totalPieces === quantity, así que esto da exactamente unitCost (sin cambio).
      const piecesForCost = detail.totalPieces ?? detail.quantity;
      const perPieceCost = Math.round((Number(detail.unitCost) * detail.quantity / piecesForCost) * 100) / 100;

      await tx.product.update({
        where: { id: detail.productId },
        data: { costPrice: perPieceCost },
      });

      await tx.kardex.create({
        data: {
          productId: detail.productId,
          branchId: purchase.branchId,
          userId,
          quantityChange: piecesToAdd,
          balanceAfter: newQty,
          movementType: "COMPRA",
          reason: `Compra ${purchase.reference} de ${purchase.supplier.name}. Costo unit: $${Number(detail.unitCost).toFixed(2)}`,
          purchaseOrderId: purchase.id,
        },
      });
    }

    return tx.purchaseOrder.update({
      where: { id: purchase.id },
      data: { status: "RECIBIDA", receivedBy: userId, receivedDate: new Date() },
      include: {
        supplier: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
        details: { include: { product: { select: { id: true, sku: true, name: true } } } },
      },
    });
  });
};

export const cancelPurchase = async (purchaseId: number) => {
  const purchase = await prisma.purchaseOrder.findUnique({
    where: { id: purchaseId },
  });

  if (!purchase) throw new AppError("Orden de compra no encontrada.", 404);
  if (purchase.status !== "PENDIENTE") throw new AppError(`No se puede cancelar una orden que ya está en estado ${purchase.status}.`, 400);

  return prisma.purchaseOrder.update({
    where: { id: purchase.id },
    data: { status: "CANCELADA" },
    include: {
      supplier: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
      details: { include: { product: { select: { id: true, sku: true, name: true } } } },
    },
  });
};

export const registerPurchase = async (body: Record<string, unknown>, userId: number) => {
  const { branchId, items, supplier, reference } = body as any;
  const bId = Number(branchId);

  if (!bId || isNaN(bId)) throw new AppError("Debe seleccionar una sucursal de destino.", 400);
  if (!Array.isArray(items) || items.length === 0) throw new AppError("Agregue al menos un producto a la compra.", 400);

  const normalized = items.map((it: any) => ({
    productId: Number(it.productId),
    quantity: Number(it.quantity),
    unitCost: it.unitCost !== undefined && it.unitCost !== "" ? Number(it.unitCost) : null,
  }));

  for (const it of normalized) {
    if (!it.productId || isNaN(it.productId) || !it.quantity || isNaN(it.quantity) || it.quantity <= 0) {
      throw new AppError("Cada renglón requiere un producto válido y una cantidad mayor a 0.", 400);
    }
  }

  const branch = await prisma.branch.findUnique({ where: { id: bId } });
  if (!branch) throw new AppError("La sucursal seleccionada no existe.", 404);

  const productIds = [...new Set(normalized.map((n) => n.productId))];
  const products = await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } });
  if (products.length !== productIds.length) throw new AppError("Uno o más productos no existen en el catálogo.", 404);

  const result = await prisma.$transaction(async (tx) => {
    let totalUnidades = 0;
    for (const it of normalized) {
      const existing = await tx.inventory.findUnique({
        where: { productId_branchId: { productId: it.productId, branchId: bId } },
      });

      let nextQty: number;
      if (existing) {
        nextQty = existing.quantity + it.quantity;
        await tx.inventory.update({ where: { id: existing.id }, data: { quantity: nextQty } });
      } else {
        nextQty = it.quantity;
        await tx.inventory.create({ data: { productId: it.productId, branchId: bId, quantity: it.quantity } });
      }

      const reasonParts: string[] = [];
      if (supplier && String(supplier).trim()) reasonParts.push(`Proveedor: ${String(supplier).trim()}`);
      if (reference && String(reference).trim()) reasonParts.push(`Ref: ${String(reference).trim()}`);
      if (it.unitCost !== null && !isNaN(it.unitCost)) reasonParts.push(`Costo unit: $${it.unitCost.toFixed(2)}`);

      await tx.kardex.create({
        data: {
          productId: it.productId,
          branchId: bId,
          userId,
          quantityChange: it.quantity,
          balanceAfter: nextQty,
          movementType: "COMPRA",
          reason: reasonParts.length > 0 ? reasonParts.join(" | ") : "Compra / Entrada de mercancía",
        },
      });

      totalUnidades += it.quantity;
    }
    return { lineas: normalized.length, totalUnidades };
  });

  return { branchName: branch.name, ...result };
};
