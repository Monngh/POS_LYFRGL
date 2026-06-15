import { Request, Response } from "express";
import { prisma } from "../app";
import bcrypt from "bcryptjs";
import { executeRefund } from "./mercadopago.controller";
import { BillingService } from "../services/billing.service";
import { PromotionService } from "../services/promotion.service";

/**
 * Consultar la elegibilidad de una venta para devolución (total o parcial)
 */
export const getReturnEligibility = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }

  const { invoiceNumber } = req.params;

  if (!invoiceNumber) {
    res.status(400).json({ message: "El folio de la venta es requerido." });
    return;
  }

  try {
    const sale = await prisma.sale.findUnique({
      where: { invoiceNumber },
      include: {
        customer: true,
        saleDetails: {
          include: {
            product: {
              include: {
                inventories: {
                  where: { branchId: req.user.branchId }
                }
              }
            }
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
      res.status(404).json({ message: "Venta no encontrada." });
      return;
    }

    if (sale.branchId !== req.user.branchId) {
      res.status(400).json({ message: "La venta no pertenece a esta sucursal." });
      return;
    }

    if (sale.status === "CANCELADA") {
      res.status(400).json({ message: "Esta venta ya fue cancelada en su totalidad." });
      return;
    }

    const today = new Date();
    const saleDate = new Date(sale.createdAt);

    // Calcular cuántos días han pasado desde la venta
    const diffTime = Math.abs(today.getTime() - saleDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // Mapear cada detalle para determinar su cantidad elegible y políticas
    const eligibleItems = sale.saleDetails.map((detail) => {
      const product = detail.product;

      // Calcular cantidad devuelta anteriormente para este detalle específico
      let alreadyReturnedQty = 0;
      sale.returns.forEach((ret) => {
        ret.returnDetails.forEach((rd) => {
          if (rd.saleDetailId === detail.id) {
            alreadyReturnedQty += rd.quantity;
          }
        });
      });

      const maxReturnableQty = Math.max(0, detail.quantity - alreadyReturnedQty);

      // Validar si el producto acepta devolución y si está dentro de la ventana
      const isReturnable = product.isReturnable;
      const returnWindowDays = product.returnWindowDays;
      const inWindow = diffDays <= returnWindowDays;
      const isEligible = isReturnable && inWindow && maxReturnableQty > 0;

      // Calcular descuento prorrateado por unidad
      const unitDiscount = Number(detail.discountAmount) / detail.quantity;
      const netUnitPrice = Number(detail.unitPrice) - unitDiscount;

      return {
        saleDetailId: detail.id,
        productId: product.id,
        sku: product.sku,
        name: product.name,
        trackingType: product.trackingType || "NONE",
        originalQuantity: detail.quantity,
        alreadyReturnedQty,
        maxReturnableQty,
        unitPrice: Number(detail.unitPrice),
        unitDiscount,
        netUnitPrice,
        isReturnable,
        returnWindowDays,
        daysSinceSale: diffDays,
        inWindow,
        isEligible,
        stock: product.inventories[0]?.quantity || 0,
      };
    });

    res.status(200).json({
      sale: {
        id: sale.id,
        invoiceNumber: sale.invoiceNumber,
        createdAt: sale.createdAt,
        totalAmount: Number(sale.totalAmount),
        taxAmount: Number(sale.taxAmount),
        discountAmount: Number(sale.discountAmount),
        paymentMethod: sale.paymentMethod,
        customerName: sale.customer?.name || "Público General",
        customerEmail: sale.customer?.email || null,
        cfdiUuid: sale.cfdiUuid,
      },
      items: eligibleItems
    });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al verificar la elegibilidad de la venta." });
  }
};

/**
 * Procesar una devolución (total o parcial, opcionalmente con cambio de producto)
 */
export const processReturn = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }

  const {
    saleId,
    items, // Array de { saleDetailId: number, quantity: number, destination: string, serialNumber?: string, batchNumber?: string }
    paymentMethod, // 'EFECTIVO', 'TARJETA', 'QR_MERCADOPAGO', 'VALE_DEVOLUCION', 'CAMBIO_PRODUCTO'
    reason,
    pinCode,
    exchangeItems, // Opcional: Array de { id: number, quantity: number }
    exchangePaymentMethod, // Opcional: 'EFECTIVO' / 'TARJETA' etc.
    exchangeCashReceived, // Opcional
    exchangeChangeGiven // Opcional
  } = req.body;

  if (!saleId || !items || !Array.isArray(items) || items.length === 0 || !reason || !pinCode || !paymentMethod) {
    res.status(400).json({ message: "Datos de devolución incompletos." });
    return;
  }

  try {
    // 1. Validar PIN del Administrador/Gerente
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
      res.status(401).json({ message: "PIN de autorización incorrecto o el usuario no es Gerente/Admin." });
      return;
    }

    // 2. Verificar sesión de caja abierta para el cajero
    const activeSession = await prisma.cashSession.findFirst({
      where: {
        userId: req.user.userId,
        branchId: req.user.branchId,
        status: "ABIERTA",
        closedAt: null,
      },
    });

    if (!activeSession) {
      res.status(400).json({ message: "Debe tener una sesión de caja abierta para procesar devoluciones." });
      return;
    }

    // 3. Buscar venta original
    const sale = await prisma.sale.findUnique({
      where: { id: Number(saleId) },
      include: {
        saleDetails: {
          include: {
            product: true,
            saleDetailTaxes: true,
          }
        },
        returns: { include: { returnDetails: true } },
      },
    });

    if (!sale) {
      res.status(404).json({ message: "Venta original no encontrada." });
      return;
    }

    if (sale.branchId !== req.user.branchId) {
      res.status(400).json({ message: "La venta original no pertenece a esta sucursal." });
      return;
    }

    if (sale.status === "CANCELADA") {
      res.status(400).json({ message: "Esta venta ya está cancelada." });
      return;
    }

    // 4. Validar reglas de negocio para cada ítem devuelto y calcular montos de reembolso
    let refundSubtotal = 0;
    let refundDiscount = 0;
    const validatedItems: any[] = [];

    for (const item of items) {
      const saleDetail = sale.saleDetails.find((sd) => sd.id === Number(item.saleDetailId));
      if (!saleDetail) {
        res.status(404).json({ message: `Línea de venta con ID ${item.saleDetailId} no encontrada.` });
        return;
      }

      // Validar cantidades
      let alreadyReturnedQty = 0;
      sale.returns.forEach((ret) => {
        ret.returnDetails.forEach((rd) => {
          if (rd.saleDetailId === saleDetail.id) {
            alreadyReturnedQty += rd.quantity;
          }
        });
      });

      const maxReturnableQty = saleDetail.quantity - alreadyReturnedQty;
      const requestedQty = Number(item.quantity);

      if (requestedQty <= 0) {
        res.status(400).json({ message: `La cantidad a devolver debe ser mayor a 0 para el producto: ${saleDetail.product.name}.` });
        return;
      }

      if (requestedQty > maxReturnableQty) {
        res.status(400).json({
          message: `No se puede devolver más cantidad de la comprada para: ${saleDetail.product.name}. Comprado: ${saleDetail.quantity}, Ya devuelto: ${alreadyReturnedQty}, Solicitado: ${requestedQty}.`
        });
        return;
      }

      // Validar si el producto acepta devolución
      if (!saleDetail.product.isReturnable) {
        res.status(400).json({ message: `El producto ${saleDetail.product.name} está marcado como no elegible para devolución.` });
        return;
      }

      // Validar número de serie/lote si el producto lo requiere
      if (saleDetail.product.trackingType === "SERIAL" && !item.serialNumber) {
        res.status(400).json({ message: `El producto ${saleDetail.product.name} requiere número de serie para su devolución.` });
        return;
      }
      if (saleDetail.product.trackingType === "LOT" && !item.batchNumber) {
        res.status(400).json({ message: `El producto ${saleDetail.product.name} requiere número de lote para su devolución.` });
        return;
      }

      // Calcular proporción de descuento a devolver
      const discountRatio = Number(saleDetail.discountAmount) / saleDetail.quantity;
      const lineOriginalTotal = Number(saleDetail.unitPrice) * requestedQty;
      const lineDiscountRefund = discountRatio * requestedQty;
      const lineNetRefund = lineOriginalTotal - lineDiscountRefund;

      // Calcular impuestos a reembolsar usando registros históricos de SaleDetailTax
      let lineTaxRefund = 0;
      if (saleDetail.saleDetailTaxes && saleDetail.saleDetailTaxes.length > 0) {
        // Proratear cada impuesto basado en las unidades devueltas
        for (const sdt of saleDetail.saleDetailTaxes) {
          const perUnitTax = Number(sdt.taxAmount) / saleDetail.quantity;
          lineTaxRefund += Number((perUnitTax * requestedQty).toFixed(2));
        }
      } else {
        // Fallback para ventas antiguas sin SaleDetailTax: usar 16% IVA por defecto
        lineTaxRefund = lineNetRefund * 0.16;
      }

      refundSubtotal += lineOriginalTotal;
      refundDiscount += lineDiscountRefund;

      validatedItems.push({
        saleDetailId: saleDetail.id,
        productId: saleDetail.productId,
        productName: saleDetail.product.name,
        quantity: requestedQty,
        unitPrice: Number(saleDetail.unitPrice),
        discountAmount: lineDiscountRefund,
        taxAmount: lineTaxRefund,
        netRefund: lineNetRefund,
        destination: item.destination,
        serialNumber: item.serialNumber || null,
        batchNumber: item.batchNumber || null
      });
    }

    const refundTax = validatedItems.reduce((acc, item) => acc + item.taxAmount, 0);
    const refundTotal = (refundSubtotal - refundDiscount) + refundTax;

    // 5. Procesar cambio de producto (si aplica)
    let exchangeSale: any = null;
    let exchangeTotal = 0;
    let exchangeTax = 0;
    let promoCalc: any = null;
    let balanceDifference = refundTotal; // RefundTotal es a favor del cliente
    let exchangeItemsWithPrices: any[] = [];

    if (exchangeItems && Array.isArray(exchangeItems) && exchangeItems.length > 0) {
      const cartItems = [];
      for (const item of exchangeItems) {
        const dbProduct = await prisma.product.findUnique({
          where: { id: Number(item.id) },
          include: {
            inventories: {
              where: { branchId: req.user.branchId }
            }
          }
        });

        if (!dbProduct || !dbProduct.active) {
          res.status(404).json({ message: `El producto de cambio ${item.name || `con ID ${item.id}`} no existe o está inactivo.` });
          return;
        }

        // VALIDACIÓN DE STOCK
        const branchInventory = dbProduct.inventories[0];
        const currentStock = branchInventory ? branchInventory.quantity : 0;
        if (currentStock < item.quantity) {
          res.status(400).json({
            message: `Inventario insuficiente para el artículo de cambio: ${dbProduct.name}. Disponible: ${currentStock} pz. Solicitado: ${item.quantity} pz.`
          });
          return;
        }

        cartItems.push({
          id: dbProduct.id,
          productId: dbProduct.id,
          name: dbProduct.name,
          sellPrice: Number(dbProduct.sellPrice),
          quantity: item.quantity,
        });
      }

      // Calcular promociones para los artículos de cambio
      promoCalc = await PromotionService.calculatePromotions(cartItems);

      let calcSubtotal = 0;
      for (let i = 0; i < cartItems.length; i++) {
        const item = cartItems[i];
        const dbProduct = await prisma.product.findUnique({
          where: { id: item.productId },
          include: {
            productTaxes: { include: { taxType: true } }
          }
        });
        const calcLine = promoCalc.lines[i];

        calcSubtotal += Number(dbProduct!.sellPrice) * item.quantity;

        // Calculate taxes for exchange item
        const exchangeLineNet = (Number(dbProduct!.sellPrice) * item.quantity) - calcLine.discountAmount;
        const applicableTaxes = dbProduct!.productTaxes
          ? dbProduct!.productTaxes.map((pt) => pt.taxType).filter((t) => t.active)
          : [];

        let exchangeLineTax = 0;
        const exchangeLineTaxes = applicableTaxes.map((tax) => {
          const rate = Number(tax.rate);
          const amount = Number((exchangeLineNet * rate).toFixed(2));
          exchangeLineTax += amount;
          return {
            taxTypeId: tax.id,
            taxName: tax.name,
            taxRate: tax.rate,
            taxAmount: amount,
          };
        });

        exchangeItemsWithPrices.push({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: Number(dbProduct!.sellPrice),
          costPrice: Number(dbProduct!.costPrice),
          discountAmount: calcLine.discountAmount,
          promotionId: calcLine.appliedPromotion?.promotionId || null,
          promotionLabel: calcLine.appliedPromotion ? calcLine.appliedPromotion.name : null,
          taxAmount: exchangeLineTax,
          taxes: exchangeLineTaxes,
        });
      }

      const exchangeSubtotal = promoCalc.totalFinal;
      exchangeTax = exchangeItemsWithPrices.reduce((acc: number, item: any) => acc + item.taxAmount, 0);
      exchangeTotal = exchangeSubtotal + exchangeTax;

      // Balance = total a favor del cliente - total de nuevos productos
      balanceDifference = refundTotal - exchangeTotal;
    }

    // 6. Transacción Transaccional ACID
    const result = await prisma.$transaction(async (tx) => {
      // a. Generar Folio de Devolución
      const timestamp = Date.now().toString().slice(-6);
      const randomSuffix = Math.floor(100 + Math.random() * 900);
      const returnNumber = `DEV-${timestamp}${randomSuffix}`;

      // b. Crear encabezado de Devolución
      const newReturn = await tx.return.create({
        data: {
          returnNumber,
          saleId: sale.id,
          userId: req.user!.userId,
          authorizedById: approver.id,
          reason,
          type: items.length === sale.saleDetails.length ? "TOTAL" : "PARCIAL",
          totalRefunded: refundTotal,
          paymentMethod: exchangeItems && exchangeItems.length > 0 ? "CAMBIO_PRODUCTO" : paymentMethod,
          cashSessionId: activeSession.id,
        }
      });

      // c. Crear detalles de devolución, ajustar inventario y Kardex
      for (const item of validatedItems) {
        await tx.returnDetail.create({
          data: {
            returnId: newReturn.id,
            productId: item.productId,
            saleDetailId: item.saleDetailId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            taxAmount: item.taxAmount,
            discountAmount: item.discountAmount,
            destination: item.destination,
            serialNumber: item.serialNumber,
            batchNumber: item.batchNumber
          }
        });

        // Ajustar inventario si regresa como VENDIBLE
        if (item.destination === "INVENTARIO_VENDIBLE") {
          const inventory = await tx.inventory.findFirst({
            where: {
              productId: item.productId,
              branchId: req.user!.branchId
            }
          });

          let nextQty = item.quantity;
          if (inventory) {
            nextQty = inventory.quantity + item.quantity;
            await tx.inventory.update({
              where: { id: inventory.id },
              data: { quantity: nextQty }
            });
          } else {
            await tx.inventory.create({
              data: {
                productId: item.productId,
                branchId: req.user!.branchId,
                quantity: nextQty
              }
            });
          }

          // Kardex de Entrada por Devolución Vendible
          await tx.kardex.create({
            data: {
              productId: item.productId,
              branchId: req.user!.branchId,
              userId: req.user!.userId,
              quantityChange: item.quantity,
              balanceAfter: nextQty,
              movementType: "DEVOLUCION",
              reason: `Devolución Vendible Folio: ${returnNumber}. Autorizó: ${approver.name}.`,
            }
          });
        } else {
          // Kardex de Auditoría física para destinos de merma, garantía, reparación, etc.
          // El stock de la sucursal actual no cambia, pero queda registrada la entrada/salida física
          const inventory = await tx.inventory.findFirst({
            where: { productId: item.productId, branchId: req.user!.branchId }
          });
          const currentQty = inventory ? inventory.quantity : 0;

          await tx.kardex.create({
            data: {
              productId: item.productId,
              branchId: req.user!.branchId,
              userId: req.user!.userId,
              quantityChange: item.quantity,
              balanceAfter: currentQty,
              movementType: item.destination,
              reason: `Entrada física a ${item.destination} por devolución Folio: ${returnNumber}. Autorizó: ${approver.name}.`,
            }
          });
        }
      }

      // d. Impacto en la Sesión de Caja Chica
      // Si el método de pago es EFECTIVO y no hay cambio de producto
      if (paymentMethod === "EFECTIVO" && (!exchangeItems || exchangeItems.length === 0)) {
        await tx.cashSession.update({
          where: { id: activeSession.id },
          data: {
            cashIn: { decrement: refundTotal },
            expectedAmount: { decrement: refundTotal },
          }
        });
      }

      // e. Generación de Vale de Devolución (Monedero)
      let storeCreditCode = null;
      if (paymentMethod === "VALE_DEVOLUCION" && (!exchangeItems || exchangeItems.length === 0)) {
        const valSuffix = Math.floor(1000 + Math.random() * 9000);
        storeCreditCode = `VALE-${timestamp}${valSuffix}`;

        await tx.storeCredit.create({
          data: {
            code: storeCreditCode,
            amount: refundTotal,
            remaining: refundTotal,
            customerId: sale.customerId
          }
        });

        // Registrar en caja como expectedAmount decrementado (salió de venta regular para convertirse en vale)
        await tx.cashSession.update({
          where: { id: activeSession.id },
          data: {
            expectedAmount: { decrement: refundTotal }
          }
        });
      }

      // f. Reversión de puntos de lealtad del cliente
      if (sale.customerId) {
        const customer = await tx.customer.findUnique({
          where: { id: sale.customerId }
        });
        if (customer) {
          // 1 punto por cada $10.00 pesos netos devueltos
          const pointsToDeduct = Math.floor(refundTotal / 10);
          const newPoints = Math.max(0, customer.points - pointsToDeduct);
          await tx.customer.update({
            where: { id: sale.customerId },
            data: { points: newPoints }
          });
        }
      }

      // g. Reembolso a Mercado Pago (si aplica y fue método original)
      let mpRefundInfo = null;
      if (paymentMethod === "QR_MERCADOPAGO" && sale.mercadoPagoPaymentId && (!exchangeItems || exchangeItems.length === 0)) {
        const mpRes = await executeRefund(sale.mercadoPagoPaymentId, refundTotal);
        if (!mpRes.success) {
          throw new Error("El reembolso automático a Mercado Pago falló: " + mpRes.message);
        }
        mpRefundInfo = mpRes;
      }

      // h. Procesar cambio de producto e impactar caja/inventarios de intercambio
      if (exchangeItems && exchangeItems.length > 0) {
        const exchangeInvoiceNumber = `V-${timestamp}EX`;

        // Crear registro de Venta del intercambio
        const newSale = await tx.sale.create({
          data: {
            invoiceNumber: exchangeInvoiceNumber,
            branchId: req.user!.branchId,
            userId: req.user!.userId,
            customerId: sale.customerId,
            cashSessionId: activeSession.id,
            totalAmount: exchangeTotal,
            taxAmount: exchangeTax,
            discountAmount: promoCalc.totalDiscount,
            paymentMethod: balanceDifference >= 0 ? (exchangePaymentMethod || "EFECTIVO") : "VALE_DEVOLUCION",
            cashReceived: exchangeCashReceived ? Number(exchangeCashReceived) : null,
            changeGiven: exchangeChangeGiven ? Number(exchangeChangeGiven) : null,
            status: "COMPLETADA",
          }
        });

        // Guardar detalles del intercambio e inventario
        for (const item of exchangeItemsWithPrices) {
          const exchangeDetail = await tx.saleDetail.create({
            data: {
              saleId: newSale.id,
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              costPrice: item.costPrice,
              taxAmount: item.taxAmount,
              discountAmount: item.discountAmount,
              promotionId: item.promotionId,
              promotionLabel: item.promotionLabel
            }
          });

          // Save tax breakdown for the exchange sale detail
          if (item.taxes && item.taxes.length > 0) {
            for (const sdt of item.taxes) {
              await tx.saleDetailTax.create({
                data: {
                  saleDetailId: exchangeDetail.id,
                  taxTypeId: sdt.taxTypeId,
                  taxName: sdt.taxName,
                  taxRate: sdt.taxRate,
                  taxAmount: sdt.taxAmount,
                },
              });
            }
          }

          // Decrementar inventario del producto de intercambio
          const inv = await tx.inventory.findFirst({
            where: { productId: item.productId, branchId: req.user!.branchId }
          });

          if (inv) {
            const nextQty = inv.quantity - item.quantity;
            await tx.inventory.update({
              where: { id: inv.id },
              data: { quantity: nextQty }
            });

            // Kardex Venta por Intercambio
            await tx.kardex.create({
              data: {
                productId: item.productId,
                branchId: req.user!.branchId,
                userId: req.user!.userId,
                quantityChange: -item.quantity,
                balanceAfter: nextQty,
                movementType: "VENTA",
                reason: `Venta por Cambio de Producto Folio: ${exchangeInvoiceNumber}`,
              }
            });
          }
        }

        // Si la diferencia del balance es > 0, el cliente pagó la diferencia
        if (balanceDifference < 0) {
          // El cliente tiene saldo a favor restante. Generar un vale de reembolso o pagar la diferencia
          const absDiff = Math.abs(balanceDifference);
          if (paymentMethod === "VALE_DEVOLUCION") {
            const valSuffix = Math.floor(1000 + Math.random() * 9000);
            storeCreditCode = `VALE-${timestamp}${valSuffix}`;

            await tx.storeCredit.create({
              data: {
                code: storeCreditCode,
                amount: absDiff,
                remaining: absDiff,
                customerId: sale.customerId
              }
            });
          }

          // Ajustar sesión de caja chica: devolvemos la diferencia al cliente
          const refundDiffCash = paymentMethod === "EFECTIVO" ? absDiff : 0;
          await tx.cashSession.update({
            where: { id: activeSession.id },
            data: {
              cashIn: { decrement: refundDiffCash },
              expectedAmount: { decrement: absDiff }
            }
          });
        } else if (balanceDifference > 0) {
          // El cliente pagó la diferencia
          const cashToAdd = exchangePaymentMethod === "EFECTIVO" ? balanceDifference : 0;
          await tx.cashSession.update({
            where: { id: activeSession.id },
            data: {
              cashIn: { increment: cashToAdd },
              expectedAmount: { increment: balanceDifference }
            }
          });
        }

        // Ligar la devolución con la venta del intercambio
        await tx.return.update({
          where: { id: newReturn.id },
          data: { exchangeSaleId: newSale.id }
        });

        exchangeSale = newSale;
      }

      // i. Verificar si la devolución cubre TODOS los productos del ticket original
      //    Si todas las unidades de cada línea han sido devueltas, marcar la venta como CANCELADA
      const updatedSale = await tx.sale.findUnique({
        where: { id: sale.id },
        include: {
          saleDetails: true,
          returns: { include: { returnDetails: true } },
        },
      });

      if (updatedSale) {
        const allItemsFullyReturned = updatedSale.saleDetails.every((detail) => {
          let totalReturnedForDetail = 0;
          updatedSale.returns.forEach((ret) => {
            ret.returnDetails.forEach((rd) => {
              if (rd.saleDetailId === detail.id) {
                totalReturnedForDetail += rd.quantity;
              }
            });
          });
          return totalReturnedForDetail >= detail.quantity;
        });

        if (allItemsFullyReturned) {
          await tx.sale.update({
            where: { id: sale.id },
            data: { status: "CANCELADA" },
          });
        }
      }

      return {
        returnId: newReturn.id,
        returnNumber: newReturn.returnNumber,
        totalRefunded: refundTotal,
        storeCreditCode,
        mpRefundInfo,
        exchangeSaleInvoice: exchangeSale?.invoiceNumber || null,
        balanceDifference
      };
    });

    // 7. Facturación SAT de Devolución (Nota de Crédito)
    let billingInfo = null;
    let exchangeBillingInfo = null;
    if (sale.cfdiUuid) {
      try {
        const returnedItemsPayload = validatedItems.map((item) => ({
          name: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountAmount: item.discountAmount
        }));

        billingInfo = await BillingService.createCreditNote(sale.id, returnedItemsPayload, result.returnId);
      } catch (billingErr: any) {
        console.error("Fallo al timbrar nota de crédito en Facturapi:", billingErr);
      }

      // Facturar automáticamente la venta de intercambio si existió cambio
      if (result.exchangeSaleInvoice) {
        try {
          const exSale = await prisma.sale.findUnique({
            where: { invoiceNumber: result.exchangeSaleInvoice },
            include: { customer: true }
          });
          if (exSale && exSale.customer && exSale.customer.taxId) {
            exchangeBillingInfo = await BillingService.createInvoice(exSale.id, {
              rfc: exSale.customer.taxId.toUpperCase(),
              legalName: exSale.customer.name.toUpperCase(),
              taxSystem: exSale.customer.taxRegime || "616",
              zip: exSale.customer.zipCode || "42080",
              email: exSale.cfdiEmail || exSale.customer.email || "facturacion@fmb.com",
              cfdiUse: exSale.customer.cfdiUse || "G03"
            });
          }
        } catch (exBillingErr) {
          console.error("Fallo al timbrar factura de intercambio:", exBillingErr);
        }
      }
    }

    res.status(201).json({
      message: "Devolución procesada exitosamente.",
      returnNumber: result.returnNumber,
      totalRefunded: result.totalRefunded,
      storeCreditCode: result.storeCreditCode,
      exchangeSaleInvoice: result.exchangeSaleInvoice,
      balanceDifference: result.balanceDifference,
      cfdiUuid: billingInfo?.uuid || null,
      pdfUrl: billingInfo?.pdfUrl || null,
      exchangeCfdiUuid: exchangeBillingInfo?.uuid || null,
      exchangePdfUrl: exchangeBillingInfo?.pdfUrl || null,
    });
  } catch (error: any) {
    console.error("Error al procesar devolución:", error);
    res.status(500).json({ message: "Error al procesar la devolución." });
  }
};

/**
 * [ADMIN] Listado paginado de devoluciones con filtros opcionales
 */
export const getAdminReturns = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }

  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const { startDate, endDate, branchId, paymentMethod } = req.query;

    const where: any = {};

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(`${startDate}T00:00:00`);
      if (endDate) where.createdAt.lte = new Date(`${endDate}T23:59:59.999`);
    }

    if (req.user && req.user.role === "GERENTE") {
      where.sale = { branchId: req.user.branchId };
    } else if (branchId && branchId !== "all") {
      where.sale = { branchId: parseInt(branchId as string) };
    }

    if (paymentMethod) {
      where.paymentMethod = paymentMethod as string;
    }

    const [returns, total] = await Promise.all([
      prisma.return.findMany({
        where,
        include: {
          sale: {
            select: {
              invoiceNumber: true,
              customer: { select: { name: true, id: true } },
              branchId: true,
              branch: { select: { name: true } },
            },
          },
          authorizedBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.return.count({ where }),
    ]);

    const data = returns.map((r) => ({
      id: r.id,
      returnNumber: r.returnNumber,
      saleId: r.saleId,
      saleNumber: r.sale.invoiceNumber,
      clientName: r.sale.customer?.name || "Público General",
      date: r.createdAt,
      totalRefunded: Number(r.totalRefunded),
      paymentMethod: r.paymentMethod,
      branchId: r.sale.branchId,
      branchName: r.sale.branch.name,
      authorizedBy: r.authorizedBy ? { id: r.authorizedBy.id, name: r.authorizedBy.name } : null,
      status: "COMPLETED",
    }));

    res.status(200).json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error al obtener las devoluciones." });
  }
};

/**
 * [ADMIN] Detalle completo de una devolución por ID
 */
export const getAdminReturnDetail = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }

  try {
    const returnId = parseInt(req.params.id);
    if (isNaN(returnId)) {
      res.status(400).json({ message: "ID de devolución inválido." });
      return;
    }

    const returnData = await prisma.return.findUnique({
      where: { id: returnId },
      include: {
        sale: {
          include: {
            customer: { select: { id: true, name: true, taxId: true } },
            branch: { select: { id: true, name: true } },
          },
        },
        returnDetails: {
          include: {
            product: { select: { id: true, name: true, sku: true } },
            saleDetail: { select: { taxAmount: true } },
          },
        },
        authorizedBy: { select: { id: true, name: true } },
      },
    });

    if (!returnData) {
      res.status(404).json({ message: "Devolución no encontrada." });
      return;
    }

    if (req.user && req.user.role === "GERENTE" && returnData.sale.branchId !== req.user.branchId) {
      res.status(403).json({ message: "Acceso denegado. Esta devolución pertenece a otra sucursal." });
      return;
    }

    let exchangeSaleData = null;
    if (returnData.exchangeSaleId) {
      exchangeSaleData = await prisma.sale.findUnique({
        where: { id: returnData.exchangeSaleId },
        include: {
          saleDetails: {
            include: { product: { select: { name: true } } },
          },
        },
      });
    }

    res.status(200).json({
      success: true,
      data: {
        id: returnData.id,
        returnNumber: returnData.returnNumber,
        saleId: returnData.saleId,
        saleNumber: returnData.sale.invoiceNumber,
        date: returnData.createdAt,
        reason: returnData.reason,
        type: returnData.type,
        clientId: returnData.sale.customer?.id || null,
        clientName: returnData.sale.customer?.name || "Público General",
        clientRFC: returnData.sale.customer?.taxId || null,
        totalRefunded: Number(returnData.totalRefunded),
        paymentMethod: returnData.paymentMethod,
        authorizedById: returnData.authorizedBy?.id || null,
        authorizedByName: returnData.authorizedBy?.name || null,
        cashSessionId: returnData.cashSessionId,
        cfdiUuid: returnData.cfdiUuid,
        status: "COMPLETED",
        createdAt: returnData.createdAt,
        updatedAt: returnData.updatedAt,
        details: returnData.returnDetails.map((d) => ({
          id: d.id,
          productId: d.productId,
          productName: d.product.name,
          sku: d.product.sku,
          quantity: d.quantity,
          unitPrice: Number(d.unitPrice),
          taxAmount: Number(d.taxAmount),
          discountAmount: Number(d.discountAmount),
          destination: d.destination,
          serialNumber: d.serialNumber,
          batchNumber: d.batchNumber,
        })),
        exchangeSale: exchangeSaleData
          ? {
            id: exchangeSaleData.id,
            saleNumber: exchangeSaleData.invoiceNumber,
            date: exchangeSaleData.createdAt,
            total: Number(exchangeSaleData.totalAmount),
            items: exchangeSaleData.saleDetails.map((sd) => ({
              productName: sd.product.name,
              quantity: sd.quantity,
              unitPrice: Number(sd.unitPrice),
            })),
          }
          : null,
      },
    });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error al obtener el detalle." });
  }
};

/**
 * [ADMIN] Reintentar reembolso a Mercado Pago de una devolución
 */
export const retryReturnRefund = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }

  try {
    const returnId = parseInt(req.params.id);
    if (isNaN(returnId)) {
      res.status(400).json({ message: "ID inválido." });
      return;
    }

    const returnData = await prisma.return.findUnique({
      where: { id: returnId },
      include: { sale: { select: { mercadoPagoPaymentId: true, branchId: true } } },
    });

    if (!returnData) {
      res.status(404).json({ message: "Devolución no encontrada." });
      return;
    }

    if (req.user && req.user.role === "GERENTE" && returnData.sale.branchId !== req.user.branchId) {
      res.status(403).json({ message: "Acceso denegado. Esta devolución pertenece a otra sucursal." });
      return;
    }

    if (returnData.paymentMethod !== "QR_MERCADOPAGO") {
      res.status(400).json({ message: "Esta devolución no usa Mercado Pago." });
      return;
    }

    if (!returnData.sale.mercadoPagoPaymentId) {
      res.status(400).json({ message: "La venta original no tiene ID de pago de Mercado Pago." });
      return;
    }

    const result = await executeRefund(returnData.sale.mercadoPagoPaymentId, Number(returnData.totalRefunded));

    if (!result.success) {
      res.status(400).json({ message: "El reembolso falló: " + result.message });
      return;
    }

    res.status(200).json({ success: true, message: "Reembolso procesado exitosamente." });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al reintentar el reembolso." });
  }
};

/**
 * [ADMIN] Timbrar nota de crédito CFDI para una devolución
 */
export const createReturnCfdi = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }

  try {
    const returnId = parseInt(req.params.id);
    if (isNaN(returnId)) {
      res.status(400).json({ message: "ID inválido." });
      return;
    }

    const returnData = await prisma.return.findUnique({
      where: { id: returnId },
      include: {
        returnDetails: {
          include: { product: { select: { name: true } } },
        },
        sale: { select: { branchId: true } },
      },
    });

    if (!returnData) {
      res.status(404).json({ message: "Devolución no encontrada." });
      return;
    }

    if (req.user && req.user.role === "GERENTE" && returnData.sale.branchId !== req.user.branchId) {
      res.status(403).json({ message: "Acceso denegado. Esta devolución pertenece a otra sucursal." });
      return;
    }

    if (returnData.cfdiUuid) {
      res.status(400).json({ message: "Esta devolución ya tiene un CFDI timbrado." });
      return;
    }

    const returnedItems = returnData.returnDetails.map((d) => ({
      name: d.product.name,
      quantity: d.quantity,
      unitPrice: Number(d.unitPrice),
      discountAmount: Number(d.discountAmount),
    }));

    const billingInfo = await BillingService.createCreditNote(returnData.saleId, returnedItems, returnData.id);

    res.status(200).json({
      success: true,
      message: "CFDI timbrado exitosamente.",
      cfdiUuid: billingInfo?.uuid || null,
      pdfUrl: billingInfo?.pdfUrl || null,
    });
  } catch (error) {
    console.error('❌ Error al timbrar CFDI:', error);
    res.status(500).json({
      success: false,
      message: "Error al timbrar el CFDI.",
      error: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
};
