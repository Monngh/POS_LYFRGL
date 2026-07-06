import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../app";
import bcrypt from "bcryptjs";
import { clientIp } from "../utils/authAudit";
import { getRequestDeviceId } from "../middlewares/device.middleware";
import { emitSecurityEvent } from "../utils/securityEvents";
import { executeRefund } from "../services/mercadopago.service";
import { searchCustomers as searchCustomersService, registerCustomerFromPos } from "../services/posCustomer.service";
import { PromotionService } from "../services/promotion.service";
import { BillingService } from "../services/billing.service";
import { MercadoPagoConfig, Preference } from "mercadopago";
import {
  calculateSaleCart,
  processSaleTransaction,
  cancelSaleTransaction,
  getRecentSales as getRecentSalesService,
  getMyRecentSales as getMyRecentSalesService,
  getSaleDetail as getSaleDetailService,
  confirmQrPayment as confirmQrPaymentService,
} from "../services/sale.service";

const SALE_PAYMENT_METHODS = ["EFECTIVO", "TARJETA", "MIXTO", "QR_MERCADOPAGO", "STORE_CREDIT"] as const;
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
      return { status: 500, message: "La base de datos no coincide con el schema Prisma usado por el cobro.", detail };
    }
    if (error.code === "P2002") {
      return { status: 409, message: "No se pudo generar un folio único para la venta. Intente cobrar nuevamente.", detail };
    }
    if (error.code === "P2025") {
      return { status: 400, message: "No se encontró un registro requerido para procesar la venta.", detail };
    }
    if (error.code === "P2028") {
      return { status: 500, message: "La transacción de cobro tardó demasiado o fue cerrada por Prisma antes de completarse.", detail };
    }
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return { status: 400, message: "El payload de la venta no coincide con los campos esperados por Prisma.", detail };
  }

  return { status: 500, message: `Error al procesar la venta: ${detail}`, detail };
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

      let ivaRate = 0;
      let iepsRate = 0;
      for (const pt of applicableTaxes) {
        const nameUpper = pt.taxType.name.toUpperCase();
        if (nameUpper.includes("IVA") && !nameUpper.includes("EXENTO")) ivaRate += Number(pt.taxType.rate);
        if (nameUpper.includes("IEPS") && !nameUpper.includes("EXENTO")) iepsRate += Number(pt.taxType.rate);
      }

      const basePrice = subtotalNet / ((1 + iepsRate) * (1 + ivaRate));
      const baseIeps = basePrice * iepsRate;

      const baseOriginalPrice = subtotalItem / ((1 + iepsRate) * (1 + ivaRate));
      const baseDiscount = baseOriginalPrice - basePrice;

      let taxTotal = 0;
      const taxesBreakdown: Record<string, number> = {};

      for (const pt of applicableTaxes) {
        const nameUpper = pt.taxType.name.toUpperCase();
        let taxAmount = 0;
        if (nameUpper.includes("IEPS") && !nameUpper.includes("EXENTO")) {
          taxAmount = Number((basePrice * Number(pt.taxType.rate)).toFixed(2));
        } else if (nameUpper.includes("IVA") && !nameUpper.includes("EXENTO")) {
          taxAmount = Number(((basePrice + baseIeps) * Number(pt.taxType.rate)).toFixed(2));
        } else if (!nameUpper.includes("EXENTO")) {
          taxAmount = Number((basePrice * Number(pt.taxType.rate)).toFixed(2));
        }
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
        total: subtotalNet,
      });

      simulation.subtotal += baseOriginalPrice;
      simulation.totalDiscount += baseDiscount;
      simulation.totalTax += taxTotal;

      for (const [taxName, taxAmount] of Object.entries(taxesBreakdown)) {
        simulation.taxBreakdown[taxName] = (simulation.taxBreakdown[taxName] || 0) + taxAmount;
      }
    }

    const exactTotal = promoCalc.totalFinal;
    simulation.total = Number(exactTotal.toFixed(2));
    simulation.subtotal = Number(simulation.subtotal.toFixed(2));
    simulation.totalDiscount = Number(simulation.totalDiscount.toFixed(2));
    simulation.totalTax = Number(simulation.totalTax.toFixed(2));

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

  const { items, paymentMethod, cardType, cashReceived, changeGiven, customerId, pointsRedeemed, invoiceRequested, cardAmount, payments } = req.body;

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

  if (salePaymentMethod === "MIXTO") {
    if (payments && Array.isArray(payments) && payments.length > 0) {
      // Si recibimos arreglo payments, calcular total recibido
      const totalReceived = payments.reduce((acc, p) => acc + numberOrZero(p.amount), 0);
      if (totalReceived <= 0) {
         res.status(400).json({ message: "En pago mixto, la suma de los pagos debe ser mayor a cero." });
         return;
      }
    } else if (numericCashReceived <= 0 || numericCardAmount <= 0) {
      res.status(400).json({ message: "En pago mixto clásico, el monto en efectivo y tarjeta deben ser mayores a cero." });
      return;
    }
  }

  try {
    if (invoiceRequested) {
      if (!customerId) {
        res.status(400).json({ message: "Debe seleccionar un cliente del directorio para poder facturar en caja." });
        return;
      }
      const customer = await prisma.customer.findUnique({ where: { id: Number(customerId) } });
      if (!customer) {
        res.status(404).json({ message: "El cliente seleccionado no existe." });
        return;
      }
      if (!customer.taxId || !customer.name || !customer.taxRegime || !customer.zipCode || !customer.email || !customer.cfdiUse) {
        res.status(400).json({ message: "El cliente no cuenta con datos fiscales completos para facturación (SAT 4.0)." });
        return;
      }
    }

    const cartData = await calculateSaleCart({
      normalizedItems,
      branchId: req.user.branchId,
      userId: req.user.userId,
      customerId: customerId ? Number(customerId) : null,
      ptsRedeemed,
      salePaymentMethod,
      numericCashReceived,
      numericCardAmount,
      payments: Array.isArray(payments) ? payments : undefined,
    });

    const timestamp = Date.now().toString().slice(-6);
    const randomSuffix = Math.floor(100 + Math.random() * 900);
    const invoiceNumber = `V-${timestamp}${randomSuffix}`;

    const newSale = await processSaleTransaction({
      invoiceNumber,
      branchId: req.user.branchId,
      userId: req.user.userId,
      customerId: customerId ? Number(customerId) : null,
      cashSessionId: cartData.activeSession.id,
      finalPaidAmount: cartData.finalPaidAmount,
      finalTax: cartData.finalTax,
      discount: cartData.discount,
      salePaymentMethod,
      cardType: (salePaymentMethod === "TARJETA" || salePaymentMethod === "MIXTO") ? cardType : null,
      numericCashReceived,
      numericChangeGiven,
      pointsEarned: cartData.pointsEarned,
      ptsRedeemed,
      pointsDiscount: cartData.pointsDiscount,
      itemsWithCosts: cartData.itemsWithCosts,
      activeSessionId: cartData.activeSession.id,
      payments: Array.isArray(payments) ? payments : undefined,
    });

    let customerPoints = 0;
    let customerName = null;
    if (customerId) {
      const updatedCustomer = await prisma.customer.findUnique({ where: { id: Number(customerId) } });
      if (updatedCustomer) {
        customerPoints = updatedCustomer.points;
        customerName = updatedCustomer.name;
      }
    }

    let cfdiUuid = null;
    let pdfUrl = null;
    if (invoiceRequested && customerId) {
      try {
        const customer = await prisma.customer.findUnique({ where: { id: Number(customerId) } });
        if (customer) {
          const billingInfo = await BillingService.createInvoice(newSale.id, {
            rfc: customer.taxId!.toUpperCase(),
            legalName: customer.name.toUpperCase(),
            taxSystem: customer.taxRegime!,
            zip: customer.zipCode!,
            email: customer.email || "facturacion@fmb.com",
            cfdiUse: customer.cfdiUse!,
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
      pointsEarned: cartData.pointsEarned,
      pointsRedeemed: ptsRedeemed,
      pointsDiscount: cartData.pointsDiscount,
      customerPoints,
      customerName,
      cfdiUuid,
      pdfUrl,
    });
  } catch (error: any) {
    if (error.statusCode) {
      res.status(error.statusCode).json({ message: error.message });
      return;
    }
    const responseError = saleProcessingError(error);
    console.error("[SALE_CREATE_ERROR]", {
      user: req.user,
      body: { paymentMethod, cardType, items: normalizedItems, customerId, pointsRedeemed: ptsRedeemed },
      error: { name: error?.name, code: error?.code, message: error?.message },
    });
    res.status(responseError.status).json({ message: responseError.message, error: responseError.detail });
  }
};

/**
 * Obtener listado de las últimas ventas registradas en la sucursal (para el dashboard del cajero)
 */
export const getRecentSales = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: "No autenticado." }); return; }
  try {
    const { search, customer, phone, dateFrom, dateTo } = req.query;
    const sales = await getRecentSalesService(req.user.branchId, {
      search: search as string | undefined,
      customer: customer as string | undefined,
      phone: phone as string | undefined,
      dateFrom: dateFrom as string | undefined,
      dateTo: dateTo as string | undefined,
    });
    res.status(200).json({ sales });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al recuperar ventas recientes." });
  }
};

/**
 * Obtener las últimas ventas realizadas ÚNICAMENTE por el empleado/cajero autenticado.
 */
export const getMyRecentSales = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: "No autenticado." }); return; }
  try {
    const { search, customer, phone, dateFrom, dateTo } = req.query;
    const sales = await getMyRecentSalesService(req.user.userId, req.user.branchId, {
      search: search as string | undefined,
      customer: customer as string | undefined,
      phone: phone as string | undefined,
      dateFrom: dateFrom as string | undefined,
      dateTo: dateTo as string | undefined,
    });
    res.status(200).json({ sales });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al recuperar ventas del empleado." });
  }
};

/**
 * Cancelar una venta requiriendo la autorización por PIN de un Administrador o Gerente
 */
export const authorizeAndCancelSale = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: "No autenticado." }); return; }

  const { invoiceNumber, pinCode, reason } = req.body;
  if (!invoiceNumber || !pinCode || !reason) {
    res.status(400).json({ message: "El folio de la venta, el código PIN del autorizador y el motivo son requeridos." });
    return;
  }
  if (reason && String(reason).length > 100) {
    res.status(400).json({ message: "El motivo de la cancelación no puede exceder los 100 caracteres." });
    return;
  }

  try {
    const managers = await prisma.user.findMany({ where: { role: { in: ["ADMIN", "GERENTE"] }, active: true, branchId: req.user.branchId } });
    let approver = null;
    for (const m of managers) {
      if (m.pinCode) {
        const isMatch = await bcrypt.compare(pinCode, m.pinCode);
        if (isMatch) { approver = m; break; }
      }
    }
    if (!approver) {
      try {
        await prisma.failedPinAttempt.create({
          data: {
            userId: req.user.userId,
            branchId: req.user.branchId,
            action: "CANCEL_SALE",
            ipAddress: clientIp(req),
            deviceId: getRequestDeviceId(req),
          },
        });
        emitSecurityEvent("failed-pin");
      } catch (logErr) {
        console.error("[FailedPinAttempt] Error al registrar intento fallido:", logErr);
      }
      res.status(401).json({ message: "PIN de autorización incorrecto o el usuario no cuenta con privilegios de Administrador/Gerente." });
      return;
    }

    const sale = await prisma.sale.findUnique({ where: { invoiceNumber }, include: { saleDetails: true } });
    if (!sale) { res.status(404).json({ message: "Venta no encontrada." }); return; }
    if (sale.status === "CANCELADA") { res.status(400).json({ message: "Esta venta ya fue cancelada anteriormente." }); return; }

    const hasReturns = await prisma.return.findFirst({ where: { saleId: sale.id } });
    if (hasReturns) {
      res.status(400).json({ message: "No se puede cancelar directamente una venta que ya tiene devoluciones parciales registradas. Utilice el módulo de devoluciones para procesar los artículos restantes." });
      return;
    }

    let refundInfo = null;
    if (sale.paymentMethod === "QR_MERCADOPAGO" && sale.mercadoPagoPaymentId && sale.status === "COMPLETADA") {
      const refundResult = await executeRefund(sale.mercadoPagoPaymentId, Number(sale.totalAmount));
      if (!refundResult.success) {
        res.status(500).json({ message: "La devolución de Mercado Pago falló. No se puede cancelar la venta.", error: refundResult.message });
        return;
      }
      refundInfo = refundResult;
    }

    if (sale.cfdiUuid && !sale.cfdiUuid.startsWith("GLOBAL")) {
      try {
        const parts = sale.cfdiUuid.split(":");
        const facturapiId = parts[1] || parts[0];
        if (facturapiId) await BillingService.cancelInvoice(facturapiId, "02");
      } catch (billingErr: any) {
        console.error("Fallo al cancelar factura en Facturapi:", billingErr);
        res.status(500).json({ message: "No se pudo cancelar la factura en el SAT. La venta no ha sido cancelada.", error: billingErr.message });
        return;
      }
    }

    await cancelSaleTransaction({
      sale,
      userId: req.user.userId,
      branchId: req.user.branchId,
      approverName: approver.name,
      reason,
      invoiceNumber,
      refundInfo,
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
  if (!req.user) { res.status(401).json({ message: "No autenticado." }); return; }
  const { invoiceNumber, paymentId } = req.body;
  if (!invoiceNumber || !paymentId) {
    res.status(400).json({ message: "invoiceNumber y paymentId son requeridos." });
    return;
  }
  try {
    const result = await confirmQrPaymentService(invoiceNumber, paymentId, req.user.userId);
    if (result.alreadyConfirmed) {
      res.status(200).json({ message: "Venta ya estaba confirmada." });
      return;
    }
    res.status(200).json({ message: "Pago confirmado exitosamente.", saleId: result.saleId });
  } catch (error: any) {
    if (error.statusCode) { res.status(error.statusCode).json({ message: error.message }); return; }
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
  if (!req.user) { res.status(401).json({ message: "No autenticado." }); return; }
  const { invoiceNumber, id } = req.query;
  if (!invoiceNumber && !id) {
    res.status(400).json({ message: "Debe proporcionar el ID o el folio de la venta." });
    return;
  }
  try {
    const sale = await getSaleDetailService(req.user.branchId, {
      id: id ? Number(id) : undefined,
      invoiceNumber: invoiceNumber ? String(invoiceNumber).trim() : undefined,
    });
    res.status(200).json({ sale });
  } catch (error: any) {
    if (error.statusCode) { res.status(error.statusCode).json({ message: error.message }); return; }
    console.error(error);
    res.status(500).json({ message: "Error al obtener los detalles de la venta." });
  }
};

/**
 * Regenerar preferencia de Mercado Pago para una venta existente en estado PENDIENTE.
 */
export const retryQrPayment = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: "No autenticado." }); return; }

  const { invoiceNumber } = req.body;
  if (!invoiceNumber) { res.status(400).json({ message: "invoiceNumber es requerido." }); return; }

  try {
    const sale = await prisma.sale.findUnique({ where: { invoiceNumber } });
    if (!sale) { res.status(404).json({ message: "Venta no encontrada." }); return; }
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

    const client = new MercadoPagoConfig({ accessToken: token });
    const preference = new Preference(client);

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const externalReference = sale.invoiceNumber;

    const result = await preference.create({
      body: {
        items: [
          {
            id: externalReference,
            title: `Venta POS ${externalReference}`,
            quantity: 1,
            unit_price: Number(sale.totalAmount),
            currency_id: "MXN",
          },
        ],
        external_reference: externalReference,
        expires: true,
        expiration_date_from: new Date().toISOString(),
        expiration_date_to: expiresAt,
        payment_methods: {
          excluded_payment_types: [{ id: "ticket" }],
          installments: 1,
        },
        notification_url: `${process.env.WEBHOOK_BASE_URL || "https://tuservidor.com"}/api/mercadopago/webhook`,
      },
    });

    const isSandbox = process.env.MERCADOPAGO_SANDBOX === "true" || token.startsWith("TEST-");
    const initPoint = isSandbox ? result.sandbox_init_point : result.init_point;

    await prisma.sale.update({
      where: { id: sale.id },
      data: { mercadoPagoReference: result.id },
    });

    res.json({ success: true, preferenceId: result.id, initPoint, externalReference, expiresAt });
  } catch (error: any) {
    console.error("Error al regenerar preferencia de Mercado Pago:", error);
    res.status(500).json({ message: "Error al regenerar el cobro QR en Mercado Pago", error: error.message });
  }
};

export const getStoreCreditInfo = async (req: Request, res: Response): Promise<void> => {
  const { code } = req.params;
  if (!code) {
    res.status(400).json({ message: "El código de vale es requerido." });
    return;
  }

  try {
    const sc = await prisma.storeCredit.findUnique({
      where: { code: code.trim().toUpperCase() },
      include: { customer: true }
    });

    if (!sc) {
      res.status(404).json({ message: "El vale no existe." });
      return;
    }

    if (!sc.active || Number(sc.remaining) <= 0) {
      res.status(400).json({ message: "El vale ya no está activo o no tiene saldo disponible." });
      return;
    }

    res.json({
      code: sc.code,
      remaining: Number(sc.remaining),
      active: sc.active,
      customerName: sc.customer?.name || "Público General"
    });
  } catch (error: any) {
    res.status(500).json({ message: "Error al consultar el vale.", error: error.message });
  }
};

export const getMyRecentStoreCredits = async (_req: Request, res: Response): Promise<void> => {
  try {
    const storeCredits = await prisma.storeCredit.findMany({
      take: 50,
      orderBy: { createdAt: "desc" },
      include: {
        customer: true,
      },
    });
    res.json({ success: true, storeCredits });
  } catch (error: any) {
    console.error("Error al obtener vales:", error);
    res.status(500).json({ message: "Error al obtener la lista de vales.", error: error.message });
  }
};
