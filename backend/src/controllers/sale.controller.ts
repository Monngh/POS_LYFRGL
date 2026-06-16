import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../app";
import bcrypt from "bcryptjs";
import { executeRefund } from "../services/mercadopago.service";
import { searchCustomers as searchCustomersService, registerCustomerFromPos } from "../services/posCustomer.service";
import { PromotionService } from "../services/promotion.service";
import { BillingService } from "../services/billing.service";
import { MercadoPagoConfig, Preference } from "mercadopago";

const SALE_PAYMENT_METHODS = ["EFECTIVO", "TARJETA", "MIXTO", "QR_MERCADOPAGO"] as const;
type SalePaymentMethod = typeof SALE_PAYMENT_METHODS[number];
const CARD_TYPES = ["CREDITO", "DEBITO"] as const;

type NormalizedSaleItem = {
  productId: number;
  quantity: number;
  name?: string;
};

const isSalePaymentMethod = (value: unknown): value is SalePaymentMethod =>
  typeof value === "string" && SALE_PAYMENT_METHODS.includes(value as SalePaymentMethod);

const isCardType = (value: unknown): value is typeof CARD_TYPES[number] =>
  typeof value === "string" && CARD_TYPES.includes(value as typeof CARD_TYPES[number]);

const normalizeSaleItems = (items: unknown): { items: NormalizedSaleItem[]; error?: string } => {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return { items: [], error: "El carrito de ventas no puede estar vacío." };
  }

  const normalized: NormalizedSaleItem[] = [];

  for (const [index, rawItem] of items.entries()) {
    const item = rawItem as Record<string, unknown>;
    const productId = Number(item.id ?? item.productId);
    const quantity = Number(item.quantity);

    if (!Number.isInteger(productId) || productId <= 0) {
      return { items: [], error: `El producto en la posición ${index + 1} no tiene un identificador válido.` };
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return { items: [], error: `La cantidad del producto ${item.name || productId} debe ser mayor a cero.` };
    }

    normalized.push({
      productId,
      quantity,
      name: typeof item.name === "string" ? item.name : undefined,
    });
  }

  return { items: normalized };
};

const numberOrZero = (value: unknown): number => {
  if (value === undefined || value === null || value === "") return 0;
  return Number(value);
};

const saleProcessingError = (error: any): { status: number; message: string; detail: string } => {
  const detail = error?.message || "Error desconocido.";

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2021" || error.code === "P2022") {
      return {
        status: 500,
        message: "La base de datos no coincide con el schema Prisma usado por el cobro.",
        detail,
      };
    }
    if (error.code === "P2002") {
      return {
        status: 409,
        message: "No se pudo generar un folio único para la venta. Intente cobrar nuevamente.",
        detail,
      };
    }
    if (error.code === "P2025") {
      return {
        status: 400,
        message: "No se encontró un registro requerido para procesar la venta.",
        detail,
      };
    }
    if (error.code === "P2028") {
      return {
        status: 500,
        message: "La transacción de cobro tardó demasiado o fue cerrada por Prisma antes de completarse.",
        detail,
      };
    }
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return {
      status: 400,
      message: "El payload de la venta no coincide con los campos esperados por Prisma.",
      detail,
    };
  }

  return {
    status: 500,
    message: `Error al procesar la venta: ${detail}`,
    detail,
  };
};

/**
 * Simular una venta: calcula promociones e impuestos dinámicos sin registrar nada en BD
 */
export const simulateSale = async (req: Request, res: Response): Promise<void> => {
  try {
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: "Items requeridos" });
      return;
    }

    const cartItems: any[] = [];
    const productMap = new Map<number, any>();

    for (const item of items) {
      const product = await prisma.product.findUnique({
        where: { id: Number(item.productId) },
        include: {
          productTaxes: { include: { taxType: true } },
        },
      });

      if (!product || !product.active) continue;

      productMap.set(product.id, product);
      cartItems.push({
        id: product.id,
        productId: product.id,
        name: product.name,
        sellPrice: Number(product.sellPrice),
        quantity: item.quantity,
      });
    }

    const promoCalc = await PromotionService.calculatePromotions(cartItems);

    const simulation = {
      items: [] as any[],
      subtotal: 0,
      totalDiscount: 0,
      totalTax: 0,
      total: 0,
      taxBreakdown: {} as Record<string, number>,
    };

    for (let i = 0; i < cartItems.length; i++) {
      const cartItem = cartItems[i];
      const calcLine = promoCalc.lines[i];
      const product = productMap.get(cartItem.id)!;

      const subtotalItem = cartItem.sellPrice * cartItem.quantity;
      const discount = calcLine.discountAmount;
      const subtotalNet = subtotalItem - discount;

      const applicableTaxes = (product.productTaxes as any[]).filter((pt) => pt.taxType.active);

      let taxTotal = 0;
      const taxesBreakdown: Record<string, number> = {};

      for (const pt of applicableTaxes) {
        const taxAmount = Math.round(subtotalNet * Number(pt.taxType.rate) * 100) / 100;
        taxTotal += taxAmount;
        taxesBreakdown[pt.taxType.name] = (taxesBreakdown[pt.taxType.name] || 0) + taxAmount;
      }

      simulation.items.push({
        productId: cartItem.id,
        productName: product.name,
        quantity: cartItem.quantity,
        unitPrice: cartItem.sellPrice,
        subtotal: subtotalItem,
        discount,
        promotionLabel: calcLine.appliedPromotion?.name || "",
        subtotalNet,
        taxes: taxesBreakdown,
        taxTotal,
        total: subtotalNet + taxTotal,
      });

      simulation.subtotal += subtotalItem;
      simulation.totalDiscount += discount;
      simulation.totalTax += taxTotal;

      for (const [taxName, taxAmount] of Object.entries(taxesBreakdown)) {
        simulation.taxBreakdown[taxName] = (simulation.taxBreakdown[taxName] || 0) + taxAmount;
      }
    }

    const exactTotal = simulation.subtotal - simulation.totalDiscount + simulation.totalTax;
    
    // REDONDEO DE TICKET (Opción A): Redondear a la fracción de .50 más cercana
    // Ej: 11.16 -> 11.00, 11.36 -> 11.50, 11.85 -> 12.00
    simulation.total = Math.round(exactTotal * 2) / 2;

    res.json(simulation);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Registrar una nueva venta en el sistema (Corte Transaccional ACID)
 */
export const createSale = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }

  const { items, paymentMethod, cardType, cashReceived, changeGiven, customerId, pointsRedeemed, invoiceRequested, cardAmount } = req.body;

  const normalizedResult = normalizeSaleItems(items);
  if (normalizedResult.error) {
    res.status(400).json({ message: normalizedResult.error });
    return;
  }
  const normalizedItems = normalizedResult.items;

  if (!isSalePaymentMethod(paymentMethod)) {
    res.status(400).json({ message: "El método de pago es requerido o no es válido." });
    return;
  }
  const salePaymentMethod = paymentMethod;

  if ((salePaymentMethod === "TARJETA" || salePaymentMethod === "MIXTO") && !isCardType(cardType)) {
    res.status(400).json({ message: "El tipo de tarjeta debe ser CREDITO o DEBITO." });
    return;
  }

  const numericCashReceived = numberOrZero(cashReceived);
  const numericChangeGiven = numberOrZero(changeGiven);
  const numericCardAmount = numberOrZero(cardAmount);

  if (!Number.isFinite(numericCashReceived) || numericCashReceived < 0) {
    res.status(400).json({ message: "El efectivo recibido debe ser un número válido mayor o igual a cero." });
    return;
  }
  if (!Number.isFinite(numericChangeGiven) || numericChangeGiven < 0) {
    res.status(400).json({ message: "El cambio debe ser un número válido mayor o igual a cero." });
    return;
  }
  if (!Number.isFinite(numericCardAmount) || numericCardAmount < 0) {
    res.status(400).json({ message: "El monto pagado con tarjeta debe ser un número válido mayor o igual a cero." });
    return;
  }

  if (customerId !== undefined && customerId !== null && customerId !== "" && (!Number.isInteger(Number(customerId)) || Number(customerId) <= 0)) {
    res.status(400).json({ message: "El cliente seleccionado no tiene un identificador válido." });
    return;
  }

  const ptsRedeemed = pointsRedeemed === undefined || pointsRedeemed === null || pointsRedeemed === "" ? 0 : Number(pointsRedeemed);
  if (!Number.isInteger(ptsRedeemed) || ptsRedeemed < 0) {
    res.status(400).json({ message: "Los puntos a redimir deben ser un entero mayor o igual a cero." });
    return;
  }

  if (salePaymentMethod === "MIXTO" && (numericCashReceived <= 0 || numericCardAmount <= 0)) {
    res.status(400).json({ message: "En pago mixto, el monto en efectivo y el monto en tarjeta deben ser mayores a cero." });
    return;
  }

  try {
    if (invoiceRequested) {
      if (!customerId) {
        res.status(400).json({ message: "Debe seleccionar un cliente del directorio para poder facturar en caja." });
        return;
      }
      const customer = await prisma.customer.findUnique({
        where: { id: Number(customerId) }
      });
      if (!customer) {
        res.status(404).json({ message: "El cliente seleccionado no existe." });
        return;
      }
      if (!customer.taxId || !customer.name || !customer.taxRegime || !customer.zipCode || !customer.email || !customer.cfdiUse) {
        res.status(400).json({ message: "El cliente no cuenta con datos fiscales completos para facturación (SAT 4.0)." });
        return;
      }
    }

    // 1. Verificar sesión de caja abierta
    const activeSession = await prisma.cashSession.findFirst({
      where: {
        userId: req.user.userId,
        branchId: req.user.branchId,
        status: "ABIERTA",
        closedAt: null,
      },
    });

    if (!activeSession) {
      res.status(400).json({ message: "Debe tener una sesión de caja abierta para registrar ventas." });
      return;
    }

    // 2. Calcular importes y validar stock de productos utilizando el motor de promociones

    // Obtener productos de la base de datos y validar stock
    const dbProducts = [];
    const cartItems = [];

    for (const item of normalizedItems) {
      const dbProduct = await prisma.product.findUnique({
        where: { id: item.productId },
        include: {
          inventories: {
            where: { branchId: req.user.branchId },
          },
          productTaxes: {
            include: {
              taxType: true,
            },
          },
        },
      });

      if (!dbProduct || !dbProduct.active) {
        res.status(404).json({ message: `El producto ${item.name || `con ID ${item.productId}`} no existe o está inactivo.` });
        return;
      }

      const branchInventory = dbProduct.inventories[0];
      if (!branchInventory) {
        res.status(400).json({ message: `No hay inventario configurado para ${dbProduct.name} en esta sucursal.` });
        return;
      }
      const currentStock = branchInventory ? branchInventory.quantity : 0;

      if (currentStock < item.quantity) {
        res.status(400).json({
          message: `Inventario insuficiente para: ${dbProduct.name}. Disponible: ${currentStock} pz. Solicitado: ${item.quantity} pz.`,
        });
        return;
      }

      dbProducts.push({
        product: dbProduct,
        inventoryId: branchInventory.id,
        currentStock,
        quantity: item.quantity,
      });

      cartItems.push({
        id: dbProduct.id,
        productId: dbProduct.id,
        name: dbProduct.name,
        sellPrice: Number(dbProduct.sellPrice),
        quantity: item.quantity,
      });
    }

    const promoCalc = await PromotionService.calculatePromotions(cartItems);

    let calculatedSubtotal = 0;
    let totalTaxAmount = 0;
    const itemsWithCosts: any[] = [];

    for (let i = 0; i < dbProducts.length; i++) {
      const { product, inventoryId, currentStock, quantity } = dbProducts[i];
      const calcLine = promoCalc.lines[i];

      calculatedSubtotal += Number(product.sellPrice) * quantity;

      // Net price after discount/promotion
      const lineNetPrice = (Number(product.sellPrice) * quantity) - calcLine.discountAmount;

      // Calculate taxes for this line
      let lineTaxAmount = 0;
      const applicableTaxes = product.productTaxes
        ? product.productTaxes.map((pt) => pt.taxType).filter((t) => t.active)
        : [];

      const lineTaxes = applicableTaxes.map((tax) => {
        const rate = Number(tax.rate);
        const amount = Number((lineNetPrice * rate).toFixed(2));
        lineTaxAmount += amount;
        return {
          taxTypeId: tax.id,
          taxName: tax.name,
          taxRate: tax.rate,
          taxAmount: amount,
        };
      });

      totalTaxAmount += lineTaxAmount;

      itemsWithCosts.push({
        productId: product.id,
        quantity: quantity,
        unitPrice: Number(product.sellPrice),
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

    // Calcular Impuestos y Total usando los montos calculados por el motor de promociones
    const discount = promoCalc.totalDiscount; // Se sobreescribe con el descuento real de promociones
    const finalSubtotal = promoCalc.totalFinal;
    const finalTax = Number(totalTaxAmount.toFixed(2));
    
    // REDONDEO DE TICKET (Opción A): Redondear a la fracción de .50 más cercana
    const exactTotal = finalSubtotal + finalTax;
    const finalTotal = Math.round(exactTotal * 2) / 2;

    // Lógica de Lealtad (Puntos FMB)
    let pointsDiscount = 0;
    let pointsEarned = 0;
    if (customerId) {
      const customer = await prisma.customer.findUnique({
        where: { id: Number(customerId) }
      });
      if (!customer) {
        res.status(404).json({ message: "El cliente seleccionado no existe." });
        return;
      }
      if (ptsRedeemed > 0) {
        if (customer.points < ptsRedeemed) {
          res.status(400).json({ message: `El cliente no tiene puntos suficientes. Disponible: ${customer.points}, Solicitado: ${ptsRedeemed}` });
          return;
        }
        pointsDiscount = ptsRedeemed * 1.0;
        if (pointsDiscount > finalTotal) {
          res.status(400).json({ message: `El descuento por puntos ($${pointsDiscount}) no puede superar el total de la compra ($${finalTotal.toFixed(2)}).` });
          return;
        }
      }
      // Puntos acumulados: 1 punto por cada $10.00 MXN gastados netos (redondeado hacia abajo)
      pointsEarned = Math.floor(Math.max(0, finalTotal - pointsDiscount) / 10);
    }

    // Generar Folio Único correlativo temporal
    const finalPaidAmount = Number((finalTotal - pointsDiscount).toFixed(2));

    if (salePaymentMethod === "EFECTIVO" && numericCashReceived < finalPaidAmount) {
      res.status(400).json({ message: `El efectivo recibido ($${numericCashReceived.toFixed(2)}) es menor al total a pagar ($${finalPaidAmount.toFixed(2)}).` });
      return;
    }

    if (salePaymentMethod === "MIXTO") {
      if (numericCardAmount > finalPaidAmount) {
        res.status(400).json({ message: "El monto pagado con tarjeta no puede ser mayor al total de la compra." });
        return;
      }
      if (numericCashReceived + numericCardAmount < finalPaidAmount) {
        res.status(400).json({ message: "La suma de efectivo y tarjeta es menor al total a pagar." });
        return;
      }
    }

    const timestamp = Date.now().toString().slice(-6);
    const randomSuffix = Math.floor(100 + Math.random() * 900);
    const invoiceNumber = `V-${timestamp}${randomSuffix}`;

    // 3. Bloque de Transacción Transaccional ACID en Prisma
    const newSale = await prisma.$transaction(async (tx) => {
      // a. Crear registro de venta principal
      const sale = await tx.sale.create({
        data: {
          invoiceNumber,
          branchId: req.user!.branchId,
          userId: req.user!.userId,
          customerId: customerId ? Number(customerId) : null,
          cashSessionId: activeSession.id,
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
        },
      });

      // b. Actualizar puntos del cliente si está seleccionado
      if (customerId) {
        const customer = await tx.customer.findUnique({
          where: { id: Number(customerId) }
        });
        if (customer) {
          const newPoints = customer.points - ptsRedeemed + pointsEarned;
          await tx.customer.update({
            where: { id: Number(customerId) },
            data: { points: newPoints }
          });
        }
      }

      // c. Procesar cada detalle del carrito, ajustar inventario y registrar Kardex
      for (const item of itemsWithCosts) {
        // Guardar detalles de la venta
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

        // Guardar desglose histórico de impuestos para esta partida
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

        // Decrementar el inventario físico
        const nextQty = item.currentStock - item.quantity;
        await tx.inventory.update({
          where: { id: item.inventoryId },
          data: { quantity: nextQty },
        });

        // Registrar movimiento inmutable en el Kardex
        await tx.kardex.create({
          data: {
            productId: item.productId,
            branchId: req.user!.branchId,
            userId: req.user!.userId,
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
          where: { id: activeSession.id },
          data: {
            cashIn: { increment: cashToAdd },
            expectedAmount: { increment: cashToAdd },
          },
        });
      }

      return sale;
    }, {
      maxWait: 15000,
      timeout: 35000,
    });

    // Obtener los datos actualizados del cliente
    let customerPoints = 0;
    let customerName = null;
    if (customerId) {
      const updatedCustomer = await prisma.customer.findUnique({
        where: { id: Number(customerId) }
      });
      if (updatedCustomer) {
        customerPoints = updatedCustomer.points;
        customerName = updatedCustomer.name;
      }
    }

    let cfdiUuid = null;
    let pdfUrl = null;
    if (invoiceRequested && customerId) {
      try {
        const customer = await prisma.customer.findUnique({
          where: { id: Number(customerId) }
        });
        if (customer) {
          const billingInfo = await BillingService.createInvoice(newSale.id, {
            rfc: customer.taxId!.toUpperCase(),
            legalName: customer.name.toUpperCase(),
            taxSystem: customer.taxRegime!,
            zip: customer.zipCode!,
            email: customer.email || "facturacion@fmb.com",
            cfdiUse: customer.cfdiUse!
          });
          cfdiUuid = billingInfo.uuid;
          pdfUrl = billingInfo.pdfUrl;
        }
      } catch (billingErr: any) {
        console.error("Error al timbrar factura al checkout:", billingErr);
      }
    }

    res.status(201).json({
      message: "Venta registrada exitosamente." + (cfdiUuid ? " Factura timbrada y enviada." : ""),
      invoiceNumber: newSale.invoiceNumber,
      saleId: newSale.id,
      pointsEarned,
      pointsRedeemed: ptsRedeemed,
      pointsDiscount,
      customerPoints,
      customerName,
      cfdiUuid,
      pdfUrl,
    });
  } catch (error: any) {
    const responseError = saleProcessingError(error);
    console.error("[SALE_CREATE_ERROR]", {
      user: req.user,
      body: {
        paymentMethod,
        cardType,
        items: normalizedItems,
        customerId,
        pointsRedeemed: ptsRedeemed,
      },
      error: {
        name: error?.name,
        code: error?.code,
        message: error?.message,
      },
    });
    res.status(responseError.status).json({ message: responseError.message, error: responseError.detail });
  }
};

/**
 * Obtener listado de las últimas 10 ventas registradas en la sucursal (para el dashboard del cajero)
 */
export const getRecentSales = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }

  const { search, customer, phone, dateFrom, dateTo } = req.query;

  try {
    const where: any = {
      branchId: req.user.branchId,
    };

    const hasSearchFilters = 
      (search && typeof search === "string" && search.trim()) ||
      (customer && typeof customer === "string" && customer.trim()) ||
      (phone && typeof phone === "string" && phone.trim()) ||
      dateFrom || 
      dateTo;

    if (!hasSearchFilters) {
      const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
      where.createdAt = { gte: fortyEightHoursAgo };
    } else {
      if (search && typeof search === "string" && search.trim()) {
        where.invoiceNumber = { contains: search.trim() };
      }

      if ((customer && typeof customer === "string" && customer.trim()) || 
          (phone && typeof phone === "string" && phone.trim())) {
        where.customer = {};
        if (customer && typeof customer === "string" && customer.trim()) {
          where.customer.name = { contains: customer.trim() };
        }
        if (phone && typeof phone === "string" && phone.trim()) {
          where.customer.phone = { contains: phone.trim() };
        }
      }

      if (dateFrom || dateTo) {
        where.createdAt = {};
        if (dateFrom) {
          where.createdAt.gte = new Date(`${dateFrom}T00:00:00`);
        }
        if (dateTo) {
          where.createdAt.lte = new Date(`${dateTo}T23:59:59.999`);
        }
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

    const mappedSales = recentSales.map((s) => ({
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

    res.status(200).json({ sales: mappedSales });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al recuperar ventas recientes." });
  }
};

/**
 * Obtener las últimas ventas realizadas ÚNICAMENTE por el empleado/cajero autenticado.
 * Filtra por userId desde el token JWT — el cajero solo ve sus propias ventas.
 * Soporta los mismos filtros de búsqueda que getRecentSales para el modal de reimpresión.
 */
export const getMyRecentSales = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }

  const { search, customer, phone, dateFrom, dateTo } = req.query;

  try {
    // Filtro base: solo ventas del empleado autenticado en su sucursal
    const where: any = {
      branchId: req.user.branchId,
      userId: req.user.userId,
    };

    const hasSearchFilters =
      (search && typeof search === "string" && search.trim()) ||
      (customer && typeof customer === "string" && customer.trim()) ||
      (phone && typeof phone === "string" && phone.trim()) ||
      dateFrom ||
      dateTo;

    if (!hasSearchFilters) {
      const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
      where.createdAt = { gte: fortyEightHoursAgo };
    } else {
      if (search && typeof search === "string" && search.trim()) {
        where.invoiceNumber = { contains: search.trim() };
      }

      if (
        (customer && typeof customer === "string" && customer.trim()) ||
        (phone && typeof phone === "string" && phone.trim())
      ) {
        where.customer = {};
        if (customer && typeof customer === "string" && customer.trim()) {
          where.customer.name = { contains: customer.trim() };
        }
        if (phone && typeof phone === "string" && phone.trim()) {
          where.customer.phone = { contains: phone.trim() };
        }
      }

      if (dateFrom || dateTo) {
        where.createdAt = {};
        if (dateFrom) {
          where.createdAt.gte = new Date(String(dateFrom));
        }
        if (dateTo) {
          const dateToParsed = new Date(String(dateTo));
          if (String(dateTo).length <= 10) {
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

    const mappedSales = mySales.map((s) => ({
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

    res.status(200).json({ sales: mappedSales });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al recuperar ventas del empleado." });
  }
};

/**
 * Cancelar una venta requiriendo la autorización por PIN de un Administrador o Gerente
 */
export const authorizeAndCancelSale = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }

  const { invoiceNumber, pinCode, reason } = req.body;

  if (!invoiceNumber || !pinCode || !reason) {
    res.status(400).json({ message: "El folio de la venta, el código PIN del autorizador y el motivo son requeridos." });
    return;
  }

  try {
    // 1. Validar que el PIN corresponda a un Administrador o Gerente de la misma sucursal o global

    // Validar el PIN comparando con todos los administradores/gerentes del sistema
    const managers = await prisma.user.findMany({
      where: {
        role: { in: ["ADMIN", "GERENTE"] },
        active: true,
      },
    });

    let approver = null;
    for (const m of managers) {
      if (m.pinCode) {
        const isMatch = await bcrypt.compare(pinCode, m.pinCode);
        if (isMatch) {
          approver = m;
          break;
        }
      }
    }

    if (!approver) {
      res.status(401).json({ message: "PIN de autorización incorrecto o el usuario no cuenta con privilegios de Administrador/Gerente." });
      return;
    }

    // 2. Buscar la venta y sus detalles
    const sale = await prisma.sale.findUnique({
      where: { invoiceNumber },
      include: { saleDetails: true },
    });

    if (!sale) {
      res.status(404).json({ message: "Venta no encontrada." });
      return;
    }

    if (sale.status === "CANCELADA") {
      res.status(400).json({ message: "Esta venta ya fue cancelada anteriormente." });
      return;
    }

    // Validar si existen devoluciones parciales asociadas a la venta
    const hasReturns = await prisma.return.findFirst({
      where: { saleId: sale.id }
    });

    if (hasReturns) {
      res.status(400).json({ message: "No se puede cancelar directamente una venta que ya tiene devoluciones parciales registradas. Utilice el módulo de devoluciones para procesar los artículos restantes." });
      return;
    }

    // NEW LOGIC FOR QR_MERCADOPAGO REFUND
    let refundInfo = null;
    if (sale.paymentMethod === "QR_MERCADOPAGO" && sale.mercadoPagoPaymentId && sale.status === "COMPLETADA") {
      const refundResult = await executeRefund(sale.mercadoPagoPaymentId, Number(sale.totalAmount));
      if (!refundResult.success) {
        res.status(500).json({ message: "La devolución de Mercado Pago falló. No se puede cancelar la venta.", error: refundResult.message });
        return;
      }
      refundInfo = refundResult;
    }

    // Cancelación de Factura (CFDI) asociada si existe y no es global
    if (sale.cfdiUuid && !sale.cfdiUuid.startsWith("GLOBAL")) {
      try {
        const parts = sale.cfdiUuid.split(":");
        const facturapiId = parts[1] || parts[0];
        if (facturapiId) {
          await BillingService.cancelInvoice(facturapiId, "02");
        }
      } catch (billingErr: any) {
        console.error("Fallo al cancelar factura en Facturapi:", billingErr);
        res.status(500).json({
          message: "No se pudo cancelar la factura en el SAT. La venta no ha sido cancelada.",
          error: billingErr.message
        });
        return;
      }
    }

    // 3. Bloque transaccional ACID para revertir inventario, registrar Kardex y actualizar venta
    await prisma.$transaction(async (tx) => {
      // a. Cambiar estatus de la venta
      const updateData: any = { status: "CANCELADA" };

      // Si se ejecutó reembolso, registrar detalles
      if (refundInfo) {
        // Ignoramos el error de tipo con ts-ignore ya que Prisma puede no haber actualizado el cliente aún (EPERM error)
        // @ts-ignore
        updateData.refundStatus = refundInfo.status === 'approved' ? "APPROVED" : "PENDING";
        // @ts-ignore
        updateData.refundId = refundInfo.refundId;
        // @ts-ignore
        updateData.refundDate = new Date();
        // @ts-ignore
        updateData.refundAmount = sale.totalAmount;
      }

      await tx.sale.update({
        where: { id: sale.id },
        data: updateData,
      });

      // b. Reintegrar cada producto al stock de la sucursal y registrar Kardex de devolución
      for (const d of sale.saleDetails) {
        // Encontrar inventario del producto
        const inventory = await tx.inventory.findFirst({
          where: {
            productId: d.productId,
            branchId: sale.branchId,
          },
        });

        if (inventory) {
          const nextQty = inventory.quantity + d.quantity;
          await tx.inventory.update({
            where: { id: inventory.id },
            data: { quantity: nextQty },
          });

          // Registrar en el Kardex como AJUSTE_INVENTARIO o DEVOLUCION
          await tx.kardex.create({
            data: {
              productId: d.productId,
              branchId: sale.branchId,
              userId: req.user!.userId,
              quantityChange: d.quantity,
              balanceAfter: nextQty,
              movementType: "DEVOLUCION",
              reason: `Cancelación Venta Folio: ${invoiceNumber}. Autorizó: ${approver.name}. Motivo: ${reason}`,
            },
          });
        }
      }

      // c. Revertir impacto de caja en la sesión activa del cajero actual (si existe y está abierta),
      // o en su defecto en la sesión original de la venta, siempre que la venta haya estado COMPLETADA.
      if (sale.status === "COMPLETADA") {
        const activeSession = await tx.cashSession.findFirst({
          where: {
            userId: req.user!.userId,
            branchId: req.user!.branchId,
            status: "ABIERTA",
            closedAt: null,
          },
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
            data: {
              cashIn: { decrement: cashToSubtract },
              expectedAmount: { decrement: Number(sale.totalAmount) },
            },
          });
        }
      }

      // d. Revertir puntos del cliente si la venta tenía cliente asociado
      if (sale.customerId) {
        const customer = await tx.customer.findUnique({
          where: { id: sale.customerId }
        });
        if (customer) {
          const newPoints = Math.max(0, customer.points + sale.pointsRedeemed - sale.pointsEarned);
          await tx.customer.update({
            where: { id: sale.customerId },
            data: { points: newPoints }
          });
        }
      }
    }, {
      maxWait: 15000,
      timeout: 35000
    });

    res.status(200).json({
      message: "Venta cancelada exitosamente. El inventario y los saldos de caja han sido actualizados.",
      approver: approver.name,
    });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al cancelar la venta." });
  }
};

export {
  createBankDeposit,
  getRecentDeposits,
  searchDeposits,
  getDepositById,
  confirmDeposit,
  cancelDeposit,
  syncDepositStatus,
} from "./bankDeposit.controller";

/**
 * Confirmar el pago QR y cambiar el estado de la venta a COMPLETADA.
 */
export const confirmQrPayment = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }

  const { invoiceNumber, paymentId } = req.body;

  if (!invoiceNumber || !paymentId) {
    res.status(400).json({ message: "invoiceNumber y paymentId son requeridos." });
    return;
  }

  try {
    const sale = await prisma.sale.findUnique({ where: { invoiceNumber } });
    if (!sale) {
      res.status(404).json({ message: "Venta no encontrada." });
      return;
    }

    if (sale.userId !== req.user.userId) {
      res.status(403).json({ message: "No autorizado. Esta venta no pertenece a su sesión." });
      return;
    }

    if (sale.status === "COMPLETADA") {
      res.status(200).json({ message: "Venta ya estaba confirmada." });
      return;
    }

    const updatedSale = await prisma.$transaction(async (tx) => {
      // 1. Actualizar venta
      const updated = await tx.sale.update({
        where: { id: sale.id },
        data: {
          status: "COMPLETADA",
          mercadoPagoPaymentId: String(paymentId),
          mercadoPagoStatus: "approved"
        }
      });

      // 2. No sumamos el total a expectedAmount de la sesión ya que es un pago no-efectivo (QR)
      return updated;
    });

    res.status(200).json({ message: "Pago confirmado exitosamente.", saleId: updatedSale.id });
  } catch (error: any) {
    console.error("Error al confirmar pago QR:", error);
    res.status(500).json({ message: "Error al confirmar el pago QR." });
  }
};

/**
 * Buscar clientes por nombre o teléfono (acceso para cajero)
 */
export const searchCustomers = async (req: Request, res: Response): Promise<void> => {
  try {
    const query = typeof req.query.query === "string" ? req.query.query.trim() : "";
    const customers = await searchCustomersService(query);
    res.status(200).json({ customers });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al buscar clientes." });
  }
};

export const registerCustomer = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: "No autenticado." }); return; }
  try {
    const { name, phone, email } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ message: "El nombre del cliente es obligatorio." }); return;
    }
    if (!phone || typeof phone !== "string" || !phone.trim()) {
      res.status(400).json({ message: "El teléfono del cliente es obligatorio." }); return;
    }
    const customer = await registerCustomerFromPos(
      name.trim(),
      phone.trim(),
      email && typeof email === "string" && email.trim() ? email.trim() : undefined
    );
    res.status(201).json({ message: "Cliente registrado exitosamente.", customer });
  } catch (error: any) {
    if (error.statusCode) { res.status(error.statusCode).json({ message: error.message }); return; }
    console.error(error);
    res.status(500).json({ message: "Error al registrar el cliente." });
  }
};

/**
 * Obtener detalles completos de una venta por folio (invoiceNumber) o ID (para cajero)
 */
export const getSaleDetailForCashier = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }

  const { invoiceNumber, id } = req.query;

  try {
    const where: any = { branchId: req.user.branchId };
    if (id) {
      where.id = Number(id);
    } else if (invoiceNumber) {
      where.invoiceNumber = String(invoiceNumber).trim();
    } else {
      res.status(400).json({ message: "Debe proporcionar el ID o el folio de la venta." });
      return;
    }

    const sale = await prisma.sale.findFirst({
      where,
      include: {
        user: { select: { name: true } },
        customer: { select: { name: true, phone: true, email: true, points: true } },
        saleDetails: {
          include: {
            product: { select: { name: true, sku: true, sellPrice: true } },
            saleDetailTaxes: true
          }
        },
        returns: {
          include: {
            returnDetails: true
          }
        }
      }
    });

    if (!sale) {
      res.status(404).json({ message: "Venta no encontrada en esta sucursal." });
      return;
    }

    const totalRefunded = sale.returns.reduce((acc, curr) => acc + Number(curr.totalRefunded), 0);

    // Group taxes at sale level for desglose in ticket footer
    const taxBreakdownMap: { [name: string]: { rate: number; amount: number } } = {};
    let hasTaxDetails = false;

    for (const d of sale.saleDetails) {
      if (d.saleDetailTaxes && d.saleDetailTaxes.length > 0) {
        hasTaxDetails = true;
        for (const sdt of d.saleDetailTaxes) {
          const name = sdt.taxName;
          if (!taxBreakdownMap[name]) {
            taxBreakdownMap[name] = {
              rate: Number(sdt.taxRate),
              amount: 0
            };
          }
          taxBreakdownMap[name].amount += Number(sdt.taxAmount);
        }
      }
    }

    // Retro-compatibility fallback
    if (!hasTaxDetails && Number(sale.taxAmount) > 0) {
      taxBreakdownMap["IVA 16%"] = {
        rate: 0.16,
        amount: Number(sale.taxAmount)
      };
    }

    const taxBreakdown = Object.keys(taxBreakdownMap).map((name) => ({
      name,
      rate: taxBreakdownMap[name].rate,
      amount: Number(taxBreakdownMap[name].amount.toFixed(2))
    }));

    // Mapear al formato esperado por el frontend
    const mapped = {
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
      customerEmail: sale.customer?.email || sale.cfdiEmail || null,
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
            activePromotion: d.promotionLabel ? {
              id: d.promotionId || 0,
              name: d.promotionLabel,
              type: "Custom",
              value: null,
              minQuantity: null,
              payQuantity: null,
              specialPrice: null,
            } : null,
          },
          quantity: d.quantity,
          discountAmount: Number(d.discountAmount),
          taxAmount: Number(d.taxAmount),
          taxes: itemTaxes,
          returnedQuantity,
        };
      })
    };

    res.status(200).json({ sale: mapped });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al obtener los detalles de la venta." });
  }
};

/**
 * Regenerar preferencia de Mercado Pago para una venta existente en estado PENDIENTE.
 */
export const retryQrPayment = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }

  const { invoiceNumber } = req.body;

  if (!invoiceNumber) {
    res.status(400).json({ message: "invoiceNumber es requerido." });
    return;
  }

  try {
    const sale = await prisma.sale.findUnique({
      where: { invoiceNumber }
    });

    if (!sale) {
      res.status(404).json({ message: "Venta no encontrada." });
      return;
    }

    if (sale.status !== "PENDIENTE") {
      res.status(400).json({ message: `La venta ya no está pendiente. Estado actual: ${sale.status}` });
      return;
    }

    if (sale.paymentMethod !== "QR_MERCADOPAGO") {
      res.status(400).json({ message: "La venta no fue registrada con método de pago QR_MERCADOPAGO." });
      return;
    }

    const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!token) {
      res.status(400).json({ message: "MERCADOPAGO_ACCESS_TOKEN no está configurado en el archivo .env" });
      return;
    }

    // Configurar cliente de Mercado Pago
    const client = new MercadoPagoConfig({ accessToken: token });
    const preference = new Preference(client);

    // Generar la preferencia con expiración a 15 minutos
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    
    // El externalReference que usamos es el folio de la factura
    const externalReference = sale.invoiceNumber;

    const result = await preference.create({
      body: {
        items: [
          {
            id: externalReference,
            title: `Venta POS ${externalReference}`,
            quantity: 1,
            unit_price: Number(sale.totalAmount),
            currency_id: 'MXN'
          }
        ],
        external_reference: externalReference,
        expires: true,
        expiration_date_from: new Date().toISOString(),
        expiration_date_to: expiresAt,
        payment_methods: {
          excluded_payment_types: [
            { id: 'ticket' },
          ],
          installments: 1
        },
        notification_url: `${process.env.WEBHOOK_BASE_URL || 'https://tuservidor.com'}/api/mercadopago/webhook`,
      }
    });

    // Seleccionar automáticamente sandbox o producción según la configuración o el tipo de token
    const isSandbox = process.env.MERCADOPAGO_SANDBOX === "true" || token.startsWith("TEST-");
    const initPoint = isSandbox ? result.sandbox_init_point : result.init_point;

    // Actualizar la venta con la nueva referencia de Mercado Pago
    await prisma.sale.update({
      where: { id: sale.id },
      data: {
        mercadoPagoReference: result.id
      }
    });

    res.json({
      success: true,
      preferenceId: result.id,
      initPoint: initPoint,
      externalReference,
      expiresAt: expiresAt
    });
  } catch (error: any) {
    console.error("Error al regenerar preferencia de Mercado Pago:", error);
    res.status(500).json({
      message: "Error al regenerar el cobro QR en Mercado Pago",
      error: error.message
    });
  }
};
