import { Request, Response } from "express";
import { prisma } from "../app";
import bcrypt from "bcryptjs";
import { executeRefund } from "./mercadopago.controller";

/**
 * Registrar una nueva venta en el sistema (Corte Transaccional ACID)
 */
export const createSale = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }

  const { items, paymentMethod, cashReceived, changeGiven, discountAmount, customerId } = req.body;

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

    // 2. Calcular importes y validar stock de productos
    let calculatedSubtotal = 0;
    const itemsWithCosts: any[] = [];

    for (const item of items) {
      const dbProduct = await prisma.product.findUnique({
        where: { id: item.id },
        include: {
          inventories: {
            where: { branchId: req.user.branchId },
          },
        },
      });

      if (!dbProduct || !dbProduct.active) {
        res.status(404).json({ message: `El producto ${item.name} no existe o está inactivo.` });
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

      calculatedSubtotal += Number(dbProduct.sellPrice) * item.quantity;
      itemsWithCosts.push({
        productId: dbProduct.id,
        quantity: item.quantity,
        unitPrice: Number(dbProduct.sellPrice),
        costPrice: Number(dbProduct.costPrice),
        currentStock,
        inventoryId: branchInventory.id,
      });
    }

    // Calcular IVA y Total
    const discount = discountAmount ? Number(discountAmount) : 0;
    const finalSubtotal = calculatedSubtotal - discount;
    const finalTax = finalSubtotal * 0.16; // 16% IVA
    const finalTotal = finalSubtotal + finalTax;

    // Generar Folio Único correlativo temporal
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
          totalAmount: finalTotal,
          taxAmount: finalTax,
          discountAmount: discount,
          paymentMethod,
          cashReceived: cashReceived ? Number(cashReceived) : null,
          changeGiven: changeGiven ? Number(changeGiven) : null,
          status: paymentMethod === "QR_MERCADOPAGO" ? "PENDIENTE" : "COMPLETADA",
        },
      });

      // b. Procesar cada detalle del carrito, ajustar inventario y registrar Kardex
      for (const item of itemsWithCosts) {
        // Guardar detalles de la venta
        await tx.saleDetail.create({
          data: {
            saleId: sale.id,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            costPrice: item.costPrice,
            taxAmount: item.unitPrice * item.quantity * 0.16,
            discountAmount: 0,
          },
        });

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

      // c. Actualizar montos en la sesión de caja activa solo si no está PENDIENTE
      if (paymentMethod !== "QR_MERCADOPAGO") {
        const cashToAdd = paymentMethod === "EFECTIVO" ? finalTotal : paymentMethod === "MIXTO" ? (cashReceived ? Number(cashReceived) - (changeGiven ? Number(changeGiven) : 0) : finalTotal) : 0;
        
        await tx.cashSession.update({
          where: { id: activeSession.id },
          data: {
            cashIn: { increment: cashToAdd },
            expectedAmount: { increment: finalTotal },
          },
        });
      }

      return sale;
    });

    res.status(201).json({
      message: "Venta registrada exitosamente.",
      invoiceNumber: newSale.invoiceNumber,
      saleId: newSale.id,
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

  try {
    const recentSales = await prisma.sale.findMany({
      where: {
        branchId: req.user.branchId,
      },
      take: 10,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { name: true } },
      },
    });

    const mappedSales = recentSales.map((s) => ({
      id: s.id,
      invoiceNumber: s.invoiceNumber,
      createdAt: s.createdAt,
      totalAmount: Number(s.totalAmount),
      paymentMethod: s.paymentMethod,
      status: s.status,
      refundStatus: s.refundStatus,
      cajero: s.user.name,
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

      // c. Revertir impacto de caja en la sesión correspondiente
      if (sale.cashSessionId && sale.status === "COMPLETADA") {
        const cashToSubtract = sale.paymentMethod === "EFECTIVO" ? Number(sale.totalAmount) : 0;
        await tx.cashSession.update({
          where: { id: sale.cashSessionId },
          data: {
            cashIn: { decrement: cashToSubtract },
            expectedAmount: { decrement: Number(sale.totalAmount) },
          },
        });
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
 * Registrar depósitos bancarios reduciendo efectivo de la sesión activa en SQL Server
 */
export const createBankDeposit = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }

  const { accountNumber, targetName, amount, paymentType, comments } = req.body;

  if (!accountNumber || !targetName || !amount || !paymentType) {
    res.status(400).json({ message: "Todos los campos son requeridos para procesar el depósito." });
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

    if (paymentType === "EFECTIVO" && inBox < decAmount) {
      res.status(400).json({ message: `Efectivo insuficiente en caja chica. Disponible: $${inBox.toFixed(2)}. Requerido: $${decAmount.toFixed(2)}.` });
      return;
    }

    // Generar referencia única para el resguardo
    const timestampRef = Date.now().toString().slice(-6);
    const reference = `RESG-${timestampRef}`;

    // Usar transacción ACID para asegurar consistencia
    const result = await prisma.$transaction(async (tx) => {
      // 1. Registrar el depósito en la tabla BankDeposit
      const deposit = await tx.bankDeposit.create({
        data: {
          accountNumber,
          targetName,
          amount: decAmount,
          paymentType,
          comments: comments || "Sin comentarios",
          cashSessionId: activeSession.id,
          branchId: req.user!.branchId,
          reference: reference,
          status: "PENDING"
        },
      });

      // 2. Registrar la salida de caja chica ("cashOut")
      await tx.cashSession.update({
        where: { id: activeSession.id },
        data: {
          cashOut: { increment: decAmount },
        },
      });

      return deposit;
    });

    res.status(201).json({
      message: "Depósito bancario registrado en SQL Server exitosamente.",
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
      sessionId: d.cashSessionId,
    }));

    res.status(200).json({ deposits: mappedDeposits });
  } catch (error: any) {
    res.status(500).json({ message: "Error al obtener depósitos recientes.", error: error.message });
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
          mercadoPagoPaymentId: paymentId,
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
    res.status(500).json({ message: "Error al confirmar el pago QR.", error: error.message });
  }
};
