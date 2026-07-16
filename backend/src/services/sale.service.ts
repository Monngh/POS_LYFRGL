import { Prisma } from "@prisma/client";
import { prisma } from "../app";
import { AppError } from "../utils/AppError";
import { toMoneyCents } from "../utils/money.util";
import { PromotionService } from "./promotion.service";

type NormalizedSaleItem = { productId: number; quantity: number; name?: string };

const assertPromotionCalculationStillValid = async (
  tx: Prisma.TransactionClient,
  itemsWithCosts: any[]
) => {
  const cartItems = itemsWithCosts.map((item) => ({
    id: item.productId,
    productId: item.productId,
    name: item.productName,
    quantity: item.quantity,
  }));

  const recalculated = await PromotionService.calculatePromotions(cartItems, tx);
  if (recalculated.lines.length !== itemsWithCosts.length) {
    throw new AppError("No se pudo validar nuevamente el carrito antes de cobrar.", 400);
  }

  for (let i = 0; i < itemsWithCosts.length; i++) {
    const original = itemsWithCosts[i];
    const recalculatedLine = recalculated.lines[i];
    const originalDiscount = toMoneyCents(Number(original.discountAmount || 0));
    const recalculatedDiscount = toMoneyCents(recalculatedLine.discountAmount);
    const originalPrice = toMoneyCents(Number(original.unitPrice));
    const recalculatedPrice = toMoneyCents(recalculatedLine.originalPrice);
    const originalPromotionId = original.promotionId ?? null;
    const recalculatedPromotionId = recalculatedLine.appliedPromotion?.promotionId ?? null;

    if (
      originalDiscount !== recalculatedDiscount ||
      originalPrice !== recalculatedPrice ||
      originalPromotionId !== recalculatedPromotionId
    ) {
      throw new AppError(
        "El precio o la promocion de uno o mas productos cambio antes de cobrar. Actualice el carrito e intente de nuevo.",
        409
      );
    }
  }
};

export const calculateSaleCart = async (params: {
  normalizedItems: NormalizedSaleItem[];
  branchId: number;
  userId: number;
  customerId?: number | null;
  ptsRedeemed: number;
  salePaymentMethod: string;
  numericCashReceived: number;
  numericCardAmount: number;
  payments?: { method: string; amount: number; reference?: string }[];
}): Promise<{
  activeSession: any;
  itemsWithCosts: any[];
  discount: number;
  finalSubtotal: number;
  finalTax: number;
  finalTotal: number;
  pointsDiscount: number;
  pointsEarned: number;
  finalPaidAmount: number;
}> => {
  const { normalizedItems, branchId, userId, customerId, ptsRedeemed, salePaymentMethod, numericCashReceived, numericCardAmount, payments } = params;

  const activeSession = await prisma.cashSession.findFirst({
    where: { userId, branchId, status: "ABIERTA", closedAt: null },
  });
  if (!activeSession) throw new AppError("Debe tener una sesión de caja abierta para registrar ventas.", 400);

  const dbProducts: any[] = [];
  const cartItems: any[] = [];

  for (const item of normalizedItems) {
    const dbProduct = await prisma.product.findUnique({
      where: { id: item.productId },
      include: {
        inventories: { where: { branchId } },
        productTaxes: { include: { taxType: true } },
      },
    });

    if (!dbProduct || !dbProduct.active) {
      throw new AppError(`El producto ${item.name || `con ID ${item.productId}`} no existe o está inactivo.`, 404);
    }

    const branchInventory = dbProduct.inventories[0];
    if (!branchInventory) {
      throw new AppError(`No hay inventario configurado para ${dbProduct.name} en esta sucursal.`, 400);
    }
    const currentStock = branchInventory.quantity;

    if (currentStock < item.quantity) {
      throw new AppError(
        `Inventario insuficiente para: ${dbProduct.name}. Disponible: ${currentStock} pz. Solicitado: ${item.quantity} pz.`,
        400
      );
    }

    dbProducts.push({ product: dbProduct, inventoryId: branchInventory.id, currentStock, quantity: item.quantity });
    cartItems.push({ id: dbProduct.id, productId: dbProduct.id, name: dbProduct.name, sellPrice: Number(dbProduct.sellPrice), quantity: item.quantity });
  }

  const promoCalc = await PromotionService.calculatePromotions(cartItems);

  let totalTaxAmount = 0;
  const itemsWithCosts: any[] = [];

  for (let i = 0; i < dbProducts.length; i++) {
    const { product, inventoryId, currentStock, quantity } = dbProducts[i];
    const calcLine = promoCalc.lines[i];

    const finalPriceWithTaxesAndDiscount = calcLine.finalLineTotal;

    const applicableTaxes = product.productTaxes
      ? product.productTaxes.map((pt: any) => pt.taxType).filter((t: any) => t.active)
      : [];

    let ivaRate = 0;
    let iepsRate = 0;
    for (const tax of applicableTaxes) {
      const nameUpper = tax.name.toUpperCase();
      if (nameUpper.includes("IVA") && !nameUpper.includes("EXENTO")) ivaRate += Number(tax.rate);
      if (nameUpper.includes("IEPS") && !nameUpper.includes("EXENTO")) iepsRate += Number(tax.rate);
    }

    const basePrice = finalPriceWithTaxesAndDiscount / ((1 + iepsRate) * (1 + ivaRate));
    const baseIeps = basePrice * iepsRate;

    let lineTaxAmount = 0;
    const lineTaxes = applicableTaxes.map((tax: any) => {
      const nameUpper = tax.name.toUpperCase();
      let amount = 0;
      if (nameUpper.includes("IEPS") && !nameUpper.includes("EXENTO")) {
        amount = Number((basePrice * Number(tax.rate)).toFixed(2));
      } else if (nameUpper.includes("IVA") && !nameUpper.includes("EXENTO")) {
        amount = Number(((basePrice + baseIeps) * Number(tax.rate)).toFixed(2));
      } else if (!nameUpper.includes("EXENTO")) {
        amount = Number((basePrice * Number(tax.rate)).toFixed(2));
      }
      lineTaxAmount += amount;
      return { taxTypeId: tax.id, taxName: tax.name, taxRate: tax.rate, taxAmount: amount };
    });

    totalTaxAmount += lineTaxAmount;

    itemsWithCosts.push({
      productId: product.id,
      quantity,
      unitPrice: Number(product.sellPrice),
      productName: product.name,
      costPrice: Number(product.costPrice),
      discountAmount: calcLine.discountAmount,
      promotionId: calcLine.appliedPromotion?.promotionId || null,
      promotionLabel: calcLine.appliedPromotion ? calcLine.appliedPromotion.name : null,
      currentStock,
      inventoryId,
      taxAmount: lineTaxAmount,
      taxes: lineTaxes,
    });
  }

  const discount = promoCalc.totalDiscount;
  const exactTotal = promoCalc.totalFinal;
  const finalTax = Number(totalTaxAmount.toFixed(2));
  const finalSubtotal = Number((exactTotal - finalTax).toFixed(2));
  const finalTotal = Math.round(exactTotal * 2) / 2;

  let pointsDiscount = 0;
  let pointsEarned = 0;
  if (customerId) {
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new AppError("El cliente seleccionado no existe.", 404);
    if (ptsRedeemed > 0) {
      if (customer.points < ptsRedeemed) {
        throw new AppError(`El cliente no tiene puntos suficientes. Disponible: ${customer.points}, Solicitado: ${ptsRedeemed}`, 400);
      }
      pointsDiscount = ptsRedeemed * 1.0;
      if (pointsDiscount > finalTotal) {
        throw new AppError(`El descuento por puntos ($${pointsDiscount}) no puede superar el total de la compra ($${finalTotal.toFixed(2)}).`, 400);
      }
    }
    pointsEarned = Math.floor(Math.max(0, finalTotal - pointsDiscount) / 10);
  }

  const finalPaidAmount = Number((finalTotal - pointsDiscount).toFixed(2));

  if (salePaymentMethod === "EFECTIVO" && numericCashReceived < finalPaidAmount) {
    throw new AppError(`El efectivo recibido ($${numericCashReceived.toFixed(2)}) es menor al total a pagar ($${finalPaidAmount.toFixed(2)}).`, 400);
  }
  if (salePaymentMethod === "MIXTO") {
    if (payments && payments.length > 0) {
      const totalPayments = payments.reduce((sum, p) => sum + p.amount, 0);
      if (totalPayments < finalPaidAmount) {
        throw new AppError(`La suma de los pagos en modo mixto ($${totalPayments.toFixed(2)}) es menor al total a pagar ($${finalPaidAmount.toFixed(2)}).`, 400);
      }
    } else {
      if (numericCardAmount > finalPaidAmount) {
        throw new AppError("El monto pagado con tarjeta no puede ser mayor al total de la compra.", 400);
      }
      if (numericCashReceived + numericCardAmount < finalPaidAmount) {
        throw new AppError("La suma de efectivo y tarjeta es menor al total a pagar.", 400);
      }
    }
  }
  if (salePaymentMethod === "STORE_CREDIT") {
    if (!payments || payments.length === 0) {
      throw new AppError("El pago con vale requiere especificar los detalles del vale.", 400);
    }
    const storeCreditPayment = payments.find(p => p.method === "STORE_CREDIT");
    if (!storeCreditPayment) {
      throw new AppError("El pago con vale requiere un método de pago STORE_CREDIT.", 400);
    }
    if (storeCreditPayment.amount < finalPaidAmount) {
      throw new AppError(`El monto del vale ($${storeCreditPayment.amount.toFixed(2)}) es insuficiente para cubrir el total ($${finalPaidAmount.toFixed(2)}).`, 400);
    }
  }

  return { activeSession, itemsWithCosts, discount, finalSubtotal, finalTax, finalTotal, pointsDiscount, pointsEarned, finalPaidAmount };
};

export const processSaleTransaction = async (params: {
  invoiceNumber: string;
  branchId: number;
  userId: number;
  customerId: number | null;
  cashSessionId: number;
  finalPaidAmount: number;
  finalTax: number;
  discount: number;
  salePaymentMethod: string;
  cardType: string | null;
  numericCashReceived: number;
  numericChangeGiven: number;
  pointsEarned: number;
  ptsRedeemed: number;
  pointsDiscount: number;
  itemsWithCosts: any[];
  activeSessionId: number;
  payments?: { method: string; amount: number; reference?: string }[];
}) => {
  const {
    invoiceNumber, branchId, userId, customerId, cashSessionId,
    finalPaidAmount, finalTax, discount, salePaymentMethod, cardType,
    numericCashReceived, numericChangeGiven, pointsEarned, ptsRedeemed,
    pointsDiscount, itemsWithCosts, activeSessionId, payments,
  } = params;

  return prisma.$transaction(async (tx) => {
    await assertPromotionCalculationStillValid(tx, itemsWithCosts);

    // a. Crear registro de venta principal y pagos
    const sale = await tx.sale.create({
      data: {
        invoiceNumber,
        branchId,
        userId,
        customerId: customerId || null,
        cashSessionId,
        totalAmount: finalPaidAmount,
        taxAmount: finalTax,
        discountAmount: discount,
        paymentMethod: salePaymentMethod,
        cardType: (salePaymentMethod === "TARJETA" || salePaymentMethod === "MIXTO") ? cardType : null,
        cashReceived: (salePaymentMethod === "EFECTIVO" || salePaymentMethod === "MIXTO") ? numericCashReceived : null,
        changeGiven: (salePaymentMethod === "EFECTIVO" || salePaymentMethod === "MIXTO") ? numericChangeGiven : null,
        status: salePaymentMethod === "QR_MERCADOPAGO" ? "PENDIENTE" : "COMPLETADA",
        pointsEarned,
        pointsRedeemed: ptsRedeemed,
        pointsDiscount,
        payments: payments ? {
          create: payments.map(p => ({
            paymentMethod: p.method,
            amount: p.amount,
            reference: p.reference,
          }))
        } : undefined
      },
    });

    // Validar Store Credits usados en pagos
    if (payments && payments.length > 0) {
      for (const p of payments) {
        if (p.method === 'STORE_CREDIT' && p.reference) {
          const storeCredit = await tx.storeCredit.findUnique({ where: { code: p.reference } });
          if (!storeCredit || !storeCredit.active || Number(storeCredit.remaining) < p.amount) {
            throw new Error(`Código de Store Credit inválido o con saldo insuficiente: ${p.reference}`);
          }
          await tx.storeCredit.update({
            where: { id: storeCredit.id },
            data: {
              remaining: { decrement: p.amount },
              active: Number(storeCredit.remaining) - p.amount > 0
            }
          });
        }
      }
    }

    // b. Actualizar puntos del cliente si está seleccionado
    if (customerId) {
      const customer = await tx.customer.findUnique({ where: { id: customerId } });
      if (customer) {
        const newPoints = customer.points - ptsRedeemed + pointsEarned;
        await tx.customer.update({ where: { id: customerId }, data: { points: newPoints } });
      }
    }

    // c. Procesar cada detalle del carrito, ajustar inventario y registrar Kardex
    for (const item of itemsWithCosts) {
      const detail = await tx.saleDetail.create({
        data: {
          saleId: sale.id,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          costPrice: item.costPrice,
          taxAmount: item.taxAmount,
          discountAmount: item.discountAmount,
          promotionId: item.promotionId,
          promotionLabel: item.promotionLabel,
        },
      });

      if (item.taxes && item.taxes.length > 0) {
        for (const sdt of item.taxes) {
          await tx.saleDetailTax.create({
            data: {
              saleDetailId: detail.id,
              taxTypeId: sdt.taxTypeId,
              taxName: sdt.taxName,
              taxRate: sdt.taxRate,
              taxAmount: sdt.taxAmount,
            },
          });
        }
      }

      const nextQty = item.currentStock - item.quantity;
      await tx.inventory.update({ where: { id: item.inventoryId }, data: { quantity: nextQty } });

      await tx.kardex.create({
        data: {
          productId: item.productId,
          branchId,
          userId,
          quantityChange: -item.quantity,
          balanceAfter: nextQty,
          movementType: "VENTA",
          reason: `Venta registrada con Folio: ${invoiceNumber}`,
        },
      });
    }

    // d. Actualizar montos en la sesión de caja activa solo si no está PENDIENTE
    if (salePaymentMethod !== "QR_MERCADOPAGO") {
      const cashToAdd = salePaymentMethod === "EFECTIVO"
        ? finalPaidAmount
        : salePaymentMethod === "MIXTO"
        ? Math.max(0, numericCashReceived - numericChangeGiven)
        : 0;

      await tx.cashSession.update({
        where: { id: activeSessionId },
        data: { cashIn: { increment: cashToAdd }, expectedAmount: { increment: cashToAdd } },
      });
    }

    return sale;
  }, { maxWait: 15000, timeout: 35000 });
};

export const cancelSaleTransaction = async (params: {
  sale: any;
  userId: number;
  branchId: number;
  approverName: string;
  reason: string;
  invoiceNumber: string;
  refundInfo?: any;
}) => {
  const { sale, userId, branchId, approverName, reason, invoiceNumber, refundInfo } = params;

  return prisma.$transaction(async (tx) => {
    // a. Cambiar estatus de la venta
    const updateData: any = { status: "CANCELADA" };
    if (refundInfo) {
      // @ts-ignore
      updateData.refundStatus = refundInfo.status === "approved" ? "APPROVED" : "PENDING";
      // @ts-ignore
      updateData.refundId = refundInfo.refundId;
      // @ts-ignore
      updateData.refundDate = new Date();
      // @ts-ignore
      updateData.refundAmount = sale.totalAmount;
    }
    await tx.sale.update({ where: { id: sale.id }, data: updateData });

    // b. Reintegrar cada producto al stock de la sucursal y registrar Kardex de devolución
    for (const d of sale.saleDetails) {
      const inventory = await tx.inventory.findFirst({
        where: { productId: d.productId, branchId: sale.branchId },
      });
      if (inventory) {
        const nextQty = inventory.quantity + d.quantity;
        await tx.inventory.update({ where: { id: inventory.id }, data: { quantity: nextQty } });
        await tx.kardex.create({
          data: {
            productId: d.productId,
            branchId: sale.branchId,
            userId,
            quantityChange: d.quantity,
            balanceAfter: nextQty,
            movementType: "DEVOLUCION",
            reason: `Cancelación Venta Folio: ${invoiceNumber}. Autorizó: ${approverName}. Motivo: ${reason}`,
          },
        });
      }
    }

    // c. Revertir impacto de caja en la sesión activa o en la sesión original de la venta
    if (sale.status === "COMPLETADA") {
      const activeSession = await tx.cashSession.findFirst({
        where: { userId, branchId, status: "ABIERTA", closedAt: null },
      });
      const sessionToAffectId = activeSession ? activeSession.id : sale.cashSessionId;
      if (sessionToAffectId) {
        const cashToSubtract =
          sale.paymentMethod === "EFECTIVO"
            ? Number(sale.totalAmount)
            : sale.paymentMethod === "MIXTO"
            ? Number(sale.cashReceived || 0) - Number(sale.changeGiven || 0)
            : 0;
        await tx.cashSession.update({
          where: { id: sessionToAffectId },
          data: { cashIn: { decrement: cashToSubtract }, expectedAmount: { decrement: Number(sale.totalAmount) } },
        });
      }
    }

    // d. Revertir puntos del cliente si la venta tenía cliente asociado
    if (sale.customerId) {
      const customer = await tx.customer.findUnique({ where: { id: sale.customerId } });
      if (customer) {
        const newPoints = Math.max(0, customer.points + sale.pointsRedeemed - sale.pointsEarned);
        await tx.customer.update({ where: { id: sale.customerId }, data: { points: newPoints } });
      }
    }
  }, { maxWait: 15000, timeout: 35000 });
};

export const getRecentSales = async (
  branchId: number,
  filters: { search?: string; customer?: string; phone?: string; dateFrom?: string; dateTo?: string }
) => {
  const where: any = { branchId };

  const hasSearchFilters =
    (filters.search && filters.search.trim()) ||
    (filters.customer && filters.customer.trim()) ||
    (filters.phone && filters.phone.trim()) ||
    filters.dateFrom ||
    filters.dateTo;

  if (!hasSearchFilters) {
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    where.createdAt = { gte: fortyEightHoursAgo };
  } else {
    if (filters.search && filters.search.trim()) {
      where.invoiceNumber = { contains: filters.search.trim() };
    }
    if ((filters.customer && filters.customer.trim()) || (filters.phone && filters.phone.trim())) {
      if (filters.customer && filters.customer.trim()) {
        const searchPattern = `%${filters.customer.trim()}%`;
        const matchingCustomers = await prisma.$queryRaw<any[]>`
          SELECT id FROM [Customer] WHERE [name] COLLATE Latin1_General_CI_AI LIKE ${searchPattern}
        `;
        const customerIds = matchingCustomers.map(c => c.id);
        where.customerId = { in: customerIds };
      }
      if (filters.phone && filters.phone.trim()) {
        where.customer = where.customer || {};
        where.customer.phone = { contains: filters.phone.trim() };
      }
    }
    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) where.createdAt.gte = new Date(`${filters.dateFrom}T00:00:00`);
      if (filters.dateTo) where.createdAt.lte = new Date(`${filters.dateTo}T23:59:59.999`);
    }
  }

  const recentSales = await prisma.sale.findMany({
    where,
    take: 50,
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { name: true } },
      customer: { select: { name: true, phone: true } },
    },
  });

  return recentSales.map((s) => ({
    id: s.id,
    invoiceNumber: s.invoiceNumber,
    createdAt: s.createdAt,
    totalAmount: Number(s.totalAmount),
    paymentMethod: s.paymentMethod,
    cardType: s.cardType,
    status: s.status,
    refundStatus: s.refundStatus,
    cajero: s.user.name,
    customerName: s.customer?.name || null,
    customerPhone: s.customer?.phone || null,
  }));
};

export const getMyRecentSales = async (
  userId: number,
  branchId: number,
  filters: { search?: string; customer?: string; phone?: string; dateFrom?: string; dateTo?: string }
) => {
  const where: any = { branchId, userId };

  const hasSearchFilters =
    (filters.search && filters.search.trim()) ||
    (filters.customer && filters.customer.trim()) ||
    (filters.phone && filters.phone.trim()) ||
    filters.dateFrom ||
    filters.dateTo;

  if (!hasSearchFilters) {
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    where.createdAt = { gte: fortyEightHoursAgo };
  } else {
    if (filters.search && filters.search.trim()) {
      where.invoiceNumber = { contains: filters.search.trim() };
    }
    if ((filters.customer && filters.customer.trim()) || (filters.phone && filters.phone.trim())) {
      if (filters.customer && filters.customer.trim()) {
        const searchPattern = `%${filters.customer.trim()}%`;
        const matchingCustomers = await prisma.$queryRaw<any[]>`
          SELECT id FROM [Customer] WHERE [name] COLLATE Latin1_General_CI_AI LIKE ${searchPattern}
        `;
        const customerIds = matchingCustomers.map(c => c.id);
        where.customerId = { in: customerIds };
      }
      if (filters.phone && filters.phone.trim()) {
        where.customer = where.customer || {};
        where.customer.phone = { contains: filters.phone.trim() };
      }
    }
    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) where.createdAt.gte = new Date(String(filters.dateFrom));
      if (filters.dateTo) {
        const dateToParsed = new Date(String(filters.dateTo));
        if (String(filters.dateTo).length <= 10) {
          dateToParsed.setHours(23, 59, 59, 999);
        }
        where.createdAt.lte = dateToParsed;
      }
    }
  }

  const mySales = await prisma.sale.findMany({
    where,
    take: 50,
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { name: true } },
      customer: { select: { name: true, phone: true } },
    },
  });

  return mySales.map((s) => ({
    id: s.id,
    invoiceNumber: s.invoiceNumber,
    createdAt: s.createdAt,
    totalAmount: Number(s.totalAmount),
    paymentMethod: s.paymentMethod,
    cardType: s.cardType,
    status: s.status,
    refundStatus: s.refundStatus,
    cajero: s.user.name,
    customerName: s.customer?.name || null,
    customerPhone: s.customer?.phone || null,
  }));
};

export const getSaleDetail = async (
  branchId: number,
  query: { id?: number; invoiceNumber?: string }
) => {
  const where: any = { branchId };
  if (query.id) {
    where.id = query.id;
  } else if (query.invoiceNumber) {
    where.invoiceNumber = query.invoiceNumber;
  } else {
    throw new AppError("Debe proporcionar el ID o el folio de la venta.", 400);
  }

  const sale = await prisma.sale.findFirst({
    where,
    include: {
      user: { select: { name: true } },
      customer: { select: { name: true, phone: true, email: true, points: true } },
      saleDetails: {
        include: {
          product: { select: { name: true, sku: true, sellPrice: true } },
          saleDetailTaxes: true,
        },
      },
      returns: {
        include: { returnDetails: true },
      },
    },
  });

  if (!sale) throw new AppError("Venta no encontrada en esta sucursal.", 404);

  const totalRefunded = sale.returns.reduce((acc, curr) => acc + Number(curr.totalRefunded), 0);

  const taxBreakdownMap: { [name: string]: { rate: number; amount: number } } = {};
  let hasTaxDetails = false;

  for (const d of sale.saleDetails) {
    if (d.saleDetailTaxes && d.saleDetailTaxes.length > 0) {
      hasTaxDetails = true;
      for (const sdt of d.saleDetailTaxes) {
        const name = sdt.taxName;
        if (!taxBreakdownMap[name]) {
          taxBreakdownMap[name] = { rate: Number(sdt.taxRate), amount: 0 };
        }
        taxBreakdownMap[name].amount += Number(sdt.taxAmount);
      }
    }
  }

  if (!hasTaxDetails && Number(sale.taxAmount) > 0) {
    taxBreakdownMap["IVA 16%"] = { rate: 0.16, amount: Number(sale.taxAmount) };
  }

  const taxBreakdown = Object.keys(taxBreakdownMap).map((name) => ({
    name,
    rate: taxBreakdownMap[name].rate,
    amount: Number(taxBreakdownMap[name].amount.toFixed(2)),
  }));

  return {
    id: sale.id,
    invoiceNumber: sale.invoiceNumber,
    createdAt: sale.createdAt,
    subtotal: Number(sale.totalAmount) + Number(sale.pointsDiscount) - Number(sale.taxAmount),
    tax: Number(sale.taxAmount),
    taxBreakdown,
    discountAmount: Number(sale.discountAmount),
    total: Number(sale.totalAmount),
    paymentMethod: sale.paymentMethod,
    cardType: sale.cardType,
    status: sale.status,
    cajero: sale.user.name,
    cashReceived: sale.cashReceived ? Number(sale.cashReceived) : Number(sale.totalAmount),
    changeGiven: sale.changeGiven ? Number(sale.changeGiven) : 0,
    pointsEarned: sale.pointsEarned,
    pointsRedeemed: sale.pointsRedeemed,
    pointsDiscount: Number(sale.pointsDiscount),
    customerName: sale.customer?.name || null,
    customerPhone: sale.customer?.phone || null,
    customerEmail: sale.customer?.email || (sale as any).cfdiEmail || null,
    customerPoints: sale.customer?.points || 0,
    totalRefunded,
    returns: sale.returns.map((ret) => ({
      id: ret.id,
      returnNumber: ret.returnNumber,
      type: ret.type,
      totalRefunded: Number(ret.totalRefunded),
      reason: ret.reason,
      createdAt: ret.createdAt,
    })),
    items: sale.saleDetails.map((d) => {
      let returnedQuantity = 0;
      sale.returns.forEach((ret) => {
        ret.returnDetails.forEach((rd) => {
          if (rd.saleDetailId === d.id) {
            returnedQuantity += rd.quantity;
          }
        });
      });

      const itemTaxes = d.saleDetailTaxes.map((sdt) => ({
        name: sdt.taxName,
        rate: Number(sdt.taxRate),
        amount: Number(sdt.taxAmount),
      }));

      return {
        product: {
          id: d.productId,
          sku: d.product.sku,
          name: d.product.name,
          sellPrice: Number(d.unitPrice),
          activePromotion: d.promotionLabel
            ? {
                id: d.promotionId || 0,
                name: d.promotionLabel,
                type: "Custom",
                value: null,
                minQuantity: null,
                payQuantity: null,
                specialPrice: null,
              }
            : null,
        },
        quantity: d.quantity,
        discountAmount: Number(d.discountAmount),
        taxAmount: Number(d.taxAmount),
        taxes: itemTaxes,
        returnedQuantity,
      };
    }),
  };
};

export const confirmQrPayment = async (
  invoiceNumber: string,
  paymentId: string | number,
  userId: number
): Promise<{ alreadyConfirmed: boolean; saleId: number }> => {
  const sale = await prisma.sale.findUnique({ where: { invoiceNumber } });
  if (!sale) throw new AppError("Venta no encontrada.", 404);

  if (sale.userId !== userId) throw new AppError("No autorizado. Esta venta no pertenece a su sesión.", 403);

  if (sale.status === "COMPLETADA") return { alreadyConfirmed: true, saleId: sale.id };

  const updatedSale = await prisma.$transaction(async (tx) => {
    const updated = await tx.sale.update({
      where: { id: sale.id },
      data: {
        status: "COMPLETADA",
        mercadoPagoPaymentId: String(paymentId),
        mercadoPagoStatus: "approved",
      },
    });
    return updated;
  });

  return { alreadyConfirmed: false, saleId: updatedSale.id };
};
