import { Request, Response } from "express";
import { prisma } from "../app";
import bcrypt from "bcryptjs";
import { executeRefund, createMercadoPagoCashPayment, syncDepositStatus as mpSyncDepositStatus } from "./mercadopago.controller";
import { PromotionService } from "../services/promotion.service";

/**
 * Registrar una nueva venta en el sistema (Corte Transaccional ACID)
 */
export const createSale = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }

  const { items, paymentMethod, cardType, cashReceived, changeGiven, customerId, pointsRedeemed } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({ message: "El carrito de ventas no puede estar vacío." });
    return;
  }

  try {
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
    
    for (const item of items) {
      const dbProduct = await prisma.product.findUnique({
        where: { id: Number(item.id) },
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
        res.status(404).json({ message: `El producto ${item.name || `con ID ${item.id}`} no existe o está inactivo.` });
        return;
      }

      const branchInventory = dbProduct.inventories[0];
      const currentStock = branchInventory ? branchInventory.quantity : 0;

      if (currentStock < item.quantity) {
        res.status(400).json({
          message: `Inventario insuficiente para: ${dbProduct.name}. Disponible: ${currentStock} pz. Solicitado: ${item.quantity} pz.`,
        });
        return;
      }

      dbProducts.push({
        product: dbProduct,
        inventoryId: branchInventory ? branchInventory.id : 0,
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
    const finalTotal = finalSubtotal + finalTax;

    // Lógica de Lealtad (Puntos FMB)
    let pointsDiscount = 0;
    let pointsEarned = 0;
    const ptsRedeemed = pointsRedeemed ? Number(pointsRedeemed) : 0;

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
    const timestamp = Date.now().toString().slice(-6);
    const randomSuffix = Math.floor(100 + Math.random() * 900);
    const invoiceNumber = `V-${timestamp}${randomSuffix}`;

    // 3. Bloque de Transacción Transaccional ACID en Prisma
    const newSale = await prisma.$transaction(async (tx) => {
      const finalPaidAmount = finalTotal - pointsDiscount;

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
          paymentMethod,
          cardType: cardType || null,
          cashReceived: cashReceived ? Number(cashReceived) : null,
          changeGiven: changeGiven ? Number(changeGiven) : null,
          status: paymentMethod === "QR_MERCADOPAGO" ? "PENDIENTE" : "COMPLETADA",
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
      if (paymentMethod !== "QR_MERCADOPAGO") {
        const cashToAdd = paymentMethod === "EFECTIVO" ? finalPaidAmount : paymentMethod === "MIXTO" ? (cashReceived ? Number(cashReceived) - (changeGiven ? Number(changeGiven) : 0) : finalPaidAmount) : 0;
        
        await tx.cashSession.update({
          where: { id: activeSession.id },
          data: {
            cashIn: { increment: cashToAdd },
            expectedAmount: { increment: finalPaidAmount },
          },
        });
      }

      return sale;
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

    res.status(201).json({
      message: "Venta registrada exitosamente.",
      invoiceNumber: newSale.invoiceNumber,
      saleId: newSale.id,
      pointsEarned,
      pointsRedeemed: ptsRedeemed,
      pointsDiscount,
      customerPoints,
      customerName,
    });
  } catch (error: any) {
    res.status(500).json({ message: "Error al procesar la venta.", error: error.message });
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
    res.status(500).json({ message: "Error al recuperar ventas recientes.", error: error.message });
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
    });

    res.status(200).json({
      message: "Venta cancelada exitosamente. El inventario y los saldos de caja han sido actualizados.",
      approver: approver.name,
    });
  } catch (error: any) {
    res.status(500).json({ message: "Error al cancelar la venta.", error: error.message });
  }
};

/**
 * Registrar depósitos bancarios (resguardos de efectivo) en SQL Server
 */
export const createBankDeposit = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }

  const { accountNumber, targetName, amount, paymentType, comments } = req.body;

  if (!amount || !paymentType) {
    res.status(400).json({ message: "El monto y el tipo de depósito son requeridos para procesar el resguardo." });
    return;
  }

  const isMercadoPago = paymentType.startsWith("MERCADOPAGO_");

  if (!isMercadoPago && (!accountNumber || !targetName)) {
    res.status(400).json({ message: "La cuenta de destino y el beneficiario son obligatorios para depósitos manuales." });
    return;
  }

  try {
    const activeSession = await prisma.cashSession.findFirst({
      where: {
        userId: req.user.userId,
        branchId: req.user.branchId,
        status: "ABIERTA",
        closedAt: null,
      },
    });

    if (!activeSession) {
      res.status(400).json({ message: "Debe tener una caja abierta para procesar depósitos." });
      return;
    }

    const decAmount = Number(amount);
    const inBox = Number(activeSession.initialAmount) + Number(activeSession.cashIn) - Number(activeSession.cashOut);

    if (inBox < decAmount) {
      res.status(400).json({ message: `Efectivo insuficiente en caja chica. Disponible: $${inBox.toFixed(2)}. Requerido: $${decAmount.toFixed(2)}.` });
      return;
    }

    // Resolver método de pago y nombre de proveedor para Mercado Pago
    let mpPaymentMethodId = "";
    let mpProviderName = "";
    if (isMercadoPago) {
      if (paymentType === "MERCADOPAGO_OXXO") {
        mpPaymentMethodId = "oxxo";
        mpProviderName = "OXXO";
      } else if (paymentType === "MERCADOPAGO_BBVA") {
        mpPaymentMethodId = "bancomer";
        mpProviderName = "BBVA Bancomer";
      } else if (paymentType === "MERCADOPAGO_SANTANDER") {
        mpPaymentMethodId = "serfin";
        mpProviderName = "Santander";
      } else if (paymentType === "MERCADOPAGO_CITIBANAMEX") {
        mpPaymentMethodId = "banamex";
        mpProviderName = "Citibanamex";
      } else if (paymentType === "MERCADOPAGO_7ELEVEN") {
        mpPaymentMethodId = "paycash";
        mpProviderName = "7-Eleven";
      } else {
        res.status(400).json({ message: `Método de pago de Mercado Pago no soportado: ${paymentType}` });
        return;
      }
    }

    // Generar referencia local con formato DEP-YYYYMMDD-XXXX
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    const dateString = `${year}${month}${day}`;

    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
    const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

    const todayCount = await prisma.bankDeposit.count({
      where: {
        createdAt: {
          gte: startOfToday,
          lte: endOfToday,
        },
      },
    });

    const nextSequence = String(todayCount + 1).padStart(4, "0");
    const reference = `DEP-${dateString}-${nextSequence}`;

    // Crear pago en Mercado Pago si aplica
    let mpResult = null;
    let finalAccountNumber = accountNumber || "";
    let finalTargetName = targetName || "";
    let finalStatus = "COMPLETED"; // Por defecto manual es COMPLETED
    let finalComments = comments || "Sin comentarios";

    if (isMercadoPago) {
      const description = `Depósito de resguardo POS a ${mpProviderName}`;
      const mpResponse = await createMercadoPagoCashPayment(decAmount, mpPaymentMethodId, description);
      
      if (!mpResponse.success) {
        res.status(400).json({ message: mpResponse.message || "Error al generar la referencia en Mercado Pago." });
        return;
      }
      
      mpResult = mpResponse;
      finalAccountNumber = mpResponse.reference || "PENDIENTE";
      finalTargetName = mpProviderName;
      finalStatus = "PENDING"; // Mercado Pago cash payments start PENDING

      const meta = {
        convenio: mpResponse.convenio,
        barcode: mpResponse.barcode,
        expirationDate: mpResponse.expirationDate,
        ticketUrl: mpResponse.ticketUrl,
        userComments: comments || ""
      };
      finalComments = JSON.stringify(meta);
    }

    // Usar transacción ACID para asegurar consistencia
    const result = await prisma.$transaction(async (tx) => {
      // 1. Registrar el depósito en la tabla BankDeposit
      const deposit = await tx.bankDeposit.create({
        data: {
          accountNumber: finalAccountNumber,
          targetName: finalTargetName,
          amount: decAmount,
          paymentType,
          comments: finalComments,
          cashSessionId: activeSession.id,
          userId: req.user!.userId,
          branchId: req.user!.branchId,
          reference: reference,
          status: finalStatus,
          mercadoPagoPaymentId: mpResult?.paymentId || null,
          mercadoPagoStatus: mpResult?.status || null,
          ticketUrl: mpResult?.ticketUrl || null,
        },
        include: {
          user: {
            select: {
              name: true,
            },
          },
        },
      });

      // 2. Registrar la salida de caja chica ("cashOut") inmediatamente
      await tx.cashSession.update({
        where: { id: activeSession.id },
        data: {
          cashOut: { increment: decAmount },
        },
      });

      return deposit;
    });

    res.status(201).json({
      message: isMercadoPago 
        ? "Referencia de depósito de Mercado Pago generada exitosamente. Dinero retirado de caja." 
        : "Depósito de resguardo registrado en SQL Server exitosamente.",
      deposit: {
        id: result.id,
        accountNumber: result.accountNumber,
        targetName: result.targetName,
        amount: Number(result.amount),
        paymentType: result.paymentType,
        comments: result.comments,
        reference: result.reference,
        status: result.status,
        createdAt: result.createdAt,
        sessionId: result.cashSessionId,
        userName: result.user.name,
        ticketUrl: result.ticketUrl,
        mercadoPagoPaymentId: result.mercadoPagoPaymentId,
        mercadoPagoStatus: result.mercadoPagoStatus,
      },
    });
  } catch (error: any) {
    res.status(500).json({ message: "Error al procesar el depósito bancario.", error: error.message });
  }
};

/**
 * Obtener historial de depósitos bancarios de la sucursal actual desde SQL Server
 */
export const getRecentDeposits = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }

  try {
    const deposits = await prisma.bankDeposit.findMany({
      where: {
        branchId: req.user.branchId,
      },
      include: {
        user: {
          select: {
            name: true,
          },
        },
      },
      take: 10,
      orderBy: { createdAt: "desc" },
    });

    const mappedDeposits = deposits.map((d) => ({
      id: d.id,
      accountNumber: d.accountNumber,
      targetName: d.targetName,
      amount: Number(d.amount),
      paymentType: d.paymentType,
      comments: d.comments,
      reference: d.reference,
      status: d.status,
      createdAt: d.createdAt,
      confirmedAt: d.confirmedAt,
      cancelledAt: d.cancelledAt,
      cancelReason: d.cancelReason,
      sessionId: d.cashSessionId,
      userName: d.user?.name || "Desconocido",
    }));

    res.status(200).json({ deposits: mappedDeposits });
  } catch (error: any) {
    res.status(500).json({ message: "Error al obtener depósitos recientes.", error: error.message });
  }
};

/**
 * Buscar depósitos con filtros
 */
export const searchDeposits = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }

  const { reference, userId, status, dateFrom, dateTo } = req.query;

  try {
    const whereClause: any = {
      branchId: req.user.branchId,
    };

    if (reference) {
      whereClause.reference = {
        contains: String(reference),
      };
    }

    if (userId) {
      const uId = parseInt(String(userId), 10);
      if (!isNaN(uId)) {
        whereClause.userId = uId;
      }
    }

    if (status && status !== "ALL") {
      whereClause.status = String(status);
    }

    if (dateFrom || dateTo) {
      whereClause.createdAt = {};
      if (dateFrom) {
        whereClause.createdAt.gte = new Date(String(dateFrom));
      }
      if (dateTo) {
        const dateToParsed = new Date(String(dateTo));
        if (String(dateTo).length <= 10) {
          dateToParsed.setHours(23, 59, 59, 999);
        }
        whereClause.createdAt.lte = dateToParsed;
      }
    }

    const deposits = await prisma.bankDeposit.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const mappedDeposits = deposits.map((d) => ({
      id: d.id,
      accountNumber: d.accountNumber,
      targetName: d.targetName,
      amount: Number(d.amount),
      paymentType: d.paymentType,
      comments: d.comments,
      reference: d.reference,
      status: d.status,
      createdAt: d.createdAt,
      confirmedAt: d.confirmedAt,
      cancelledAt: d.cancelledAt,
      cancelReason: d.cancelReason,
      sessionId: d.cashSessionId,
      userName: d.user?.name || "Desconocido",
    }));

    res.status(200).json({ deposits: mappedDeposits });
  } catch (error: any) {
    res.status(500).json({ message: "Error al buscar depósitos.", error: error.message });
  }
};

/**
 * Obtener detalle de un depósito individual
 */
export const getDepositById = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }

  const { id } = req.params;

  try {
    const depositId = parseInt(id, 10);
    if (isNaN(depositId)) {
      res.status(400).json({ message: "ID de depósito inválido." });
      return;
    }

    const deposit = await prisma.bankDeposit.findUnique({
      where: { id: depositId },
      include: {
        user: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!deposit) {
      res.status(404).json({ message: "Depósito no encontrado." });
      return;
    }

    res.status(200).json({
      deposit: {
        id: deposit.id,
        accountNumber: deposit.accountNumber,
        targetName: deposit.targetName,
        amount: Number(deposit.amount),
        paymentType: deposit.paymentType,
        comments: deposit.comments,
        reference: deposit.reference,
        status: deposit.status,
        createdAt: deposit.createdAt,
        confirmedAt: deposit.confirmedAt,
        cancelledAt: deposit.cancelledAt,
        cancelReason: deposit.cancelReason,
        sessionId: deposit.cashSessionId,
        userName: deposit.user?.name || "Desconocido",
      },
    });
  } catch (error: any) {
    res.status(500).json({ message: "Error al obtener el depósito.", error: error.message });
  }
};

/**
 * Confirmar depósito (pasar de PENDING a COMPLETED)
 */
export const confirmDeposit = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }

  const { id } = req.params;

  try {
    const depositId = parseInt(id, 10);
    if (isNaN(depositId)) {
      res.status(400).json({ message: "ID de depósito inválido." });
      return;
    }

    const deposit = await prisma.bankDeposit.findUnique({
      where: { id: depositId },
    });

    if (!deposit) {
      res.status(404).json({ message: "Depósito no encontrado." });
      return;
    }

    if (deposit.status !== "PENDING") {
      res.status(400).json({ message: `El depósito no se puede confirmar porque está en estado: ${deposit.status}` });
      return;
    }

    const updated = await prisma.bankDeposit.update({
      where: { id: depositId },
      data: {
        status: "COMPLETED",
        confirmedAt: new Date(),
      },
    });

    res.status(200).json({
      message: "Depósito confirmado exitosamente.",
      deposit: updated,
    });
  } catch (error: any) {
    res.status(500).json({ message: "Error al confirmar el depósito.", error: error.message });
  }
};

/**
 * Cancelar un depósito (Resguardo de Efectivo) con PIN de Administrador/Gerente
 */
export const cancelDeposit = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }

  const { id } = req.params;
  const { pinCode, reason } = req.body;

  if (!id || !pinCode || !reason) {
    res.status(400).json({ message: "El ID del depósito, el código PIN de autorización y el motivo de cancelación son requeridos." });
    return;
  }

  try {
    // 1. Validar que el PIN corresponda a un Administrador o Gerente
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

    // 2. Buscar el depósito
    const depositId = parseInt(id, 10);
    if (isNaN(depositId)) {
      res.status(400).json({ message: "ID de depósito inválido." });
      return;
    }

    const deposit = await prisma.bankDeposit.findUnique({
      where: { id: depositId },
    });

    if (!deposit) {
      res.status(404).json({ message: "Depósito no encontrado." });
      return;
    }

    if (deposit.status === "CANCELLED") {
      res.status(400).json({ message: "Este depósito ya fue cancelado anteriormente." });
      return;
    }

    // 3. Bloque transaccional para revertir el depósito y restar de cashOut
    const updatedDeposit = await prisma.$transaction(async (tx) => {
      // a. Actualizar estado del depósito
      const updated = await tx.bankDeposit.update({
        where: { id: depositId },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelReason: `Autorizó: ${approver.name}. Motivo: ${reason}`,
        },
      });

      // b. Revertir cashOut de la caja (el dinero vuelve a estar físicamente/operativamente disponible en caja chica)
      if (deposit.status === "COMPLETED" || deposit.status === "PENDING") {
        await tx.cashSession.update({
          where: { id: deposit.cashSessionId },
          data: {
            cashOut: { decrement: Number(deposit.amount) },
          },
        });
      }

      return updated;
    });

    res.status(200).json({
      message: "Depósito cancelado exitosamente. Los saldos de caja han sido actualizados.",
      deposit: updatedDeposit,
    });
  } catch (error: any) {
    res.status(500).json({ message: "Error al cancelar el depósito.", error: error.message });
  }
};

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
      
      // 2. Sumar el total a expectedAmount de la sesión
      if (sale.cashSessionId) {
        await tx.cashSession.update({
          where: { id: sale.cashSessionId },
          data: { expectedAmount: { increment: Number(sale.totalAmount) } }
        });
      }
      return updated;
    });

    res.status(200).json({ message: "Pago confirmado exitosamente.", saleId: updatedSale.id });
  } catch (error: any) {
    console.error("Error al confirmar pago QR:", error);
    res.status(500).json({ message: "Error al confirmar el pago QR.", error: error.message });
  }
};

/**
 * Buscar clientes por nombre o teléfono (acceso para cajero)
 */
export const searchCustomers = async (req: Request, res: Response): Promise<void> => {
  try {
    const query = typeof req.query.query === "string" ? req.query.query.trim() : "";
    if (!query) {
      res.status(200).json({ customers: [] });
      return;
    }

    const customers = await prisma.customer.findMany({
      where: {
        OR: [
          { name: { contains: query } },
          { phone: { contains: query } }
        ]
      },
      orderBy: { name: "asc" },
      take: 10,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        points: true,
      }
    });

    res.status(200).json({ customers });
  } catch (error: any) {
    res.status(500).json({ message: "Error al buscar clientes.", error: error.message });
  }
};

/**
 * Registro rápido de cliente desde la caja
 */
export const registerCustomer = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }

  try {
    const { name, phone, email } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ message: "El nombre del cliente es obligatorio." });
      return;
    }
    if (!phone || typeof phone !== "string" || !phone.trim()) {
      res.status(400).json({ message: "El teléfono del cliente es obligatorio." });
      return;
    }

    // Verificar si ya existe un cliente con ese teléfono
    const existing = await prisma.customer.findFirst({
      where: { phone: phone.trim() }
    });

    if (existing) {
      res.status(400).json({ message: "Ya existe un cliente registrado con ese número de teléfono." });
      return;
    }

    const customer = await prisma.customer.create({
      data: {
        name: name.trim(),
        phone: phone.trim(),
        email: email && typeof email === "string" && email.trim() ? email.trim() : null,
        points: 0,
        creditLimit: 0,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        points: true,
      }
    });

    res.status(201).json({
      message: "Cliente registrado exitosamente.",
      customer,
    });
  } catch (error: any) {
    res.status(500).json({ message: "Error al registrar el cliente.", error: error.message });
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
        customer: { select: { name: true, phone: true, points: true } },
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
    res.status(500).json({ message: "Error al obtener los detalles de la venta.", error: error.message });
  }
};

/**
 * Wrapper para sincronizar el estado del depósito bancario con Mercado Pago
 */
export const syncDepositStatus = async (req: Request, res: Response): Promise<void> => {
  return mpSyncDepositStatus(req, res);
};
