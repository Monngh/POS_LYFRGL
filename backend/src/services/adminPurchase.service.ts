import { prisma } from "../app";
import { AppError } from "../utils/AppError";

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

  let taxNum = 0;
  for (const detail of validDetails) {
    const detailSubtotal = Number(detail.quantity) * Number(detail.unitCost || 0);
    const productTaxes = await prisma.productTax.findMany({
      where: { productId: Number(detail.productId) },
      include: { taxType: true },
    });

    if (productTaxes.length > 0) {
      for (const pt of productTaxes) {
        taxNum += Math.round(detailSubtotal * Number((pt as any).taxType.rate) * 100) / 100;
      }
    } else {
      taxNum += Math.round(detailSubtotal * 0.16 * 100) / 100;
      console.warn(`⚠️ Producto ${detail.productId} sin impuestos en BD, usando 16% default`);
    }
  }
  taxNum = Math.round(taxNum * 100) / 100;
  const totalNum = Math.round((subtotalNum + taxNum) * 100) / 100;

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
          data: validDetails.map((d: any) => ({
            productId: Number(d.productId),
            quantity: Number(d.quantity),
            unitCost: Number(d.unitCost || 0),
            subtotal: Math.round(Number(d.quantity) * Number(d.unitCost || 0) * 100) / 100,
          })),
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
      const existing = await tx.inventory.findUnique({
        where: { productId_branchId: { productId: detail.productId, branchId: purchase.branchId } },
      });

      let newQty: number;
      if (existing) {
        newQty = existing.quantity + detail.quantity;
        await tx.inventory.update({ where: { id: existing.id }, data: { quantity: newQty } });
      } else {
        newQty = detail.quantity;
        await tx.inventory.create({
          data: { productId: detail.productId, branchId: purchase.branchId, quantity: detail.quantity },
        });
      }

      await tx.product.update({
        where: { id: detail.productId },
        data: { costPrice: detail.unitCost },
      });

      await tx.kardex.create({
        data: {
          productId: detail.productId,
          branchId: purchase.branchId,
          userId,
          quantityChange: detail.quantity,
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
