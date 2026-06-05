const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/controllers/admin.controller.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Normalize line endings to \n
content = content.replace(/\r\n/g, '\n');

// Find the first conflict marker
const firstConflictMarker = content.indexOf('<<<<<<<');
if (firstConflictMarker === -1) {
  console.error("Conflict markers not found in admin.controller.ts!");
  process.exit(1);
}

// Slice the clean top part of the file
const topPart = content.substring(0, firstConflictMarker);

// Find the last comment line or divider right before the conflict marker
const dividerIndex = topPart.lastIndexOf('// ===========================================================================');
const cleanTop = dividerIndex !== -1 ? topPart.substring(0, dividerIndex) : topPart;

// Construct the 19 resolved methods
const resolvedMethods = `// ===========================================================================
// PROVEEDORES (Suppliers)
// ===========================================================================

export const listSuppliers = async (_req: Request, res: Response): Promise<void> => {
  try {
    const suppliers = await prisma.supplier.findMany({
      orderBy: { name: "asc" },
    });
    res.json(suppliers);
  } catch (error: any) {
    res.status(500).json({ message: "Error al listar proveedores.", error: error.message });
  }
};

export const createSupplier = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, rfc, email, phone, address, city, state, zipCode, contactName } = req.body;
    if (!name || String(name).trim() === "") {
      res.status(400).json({ message: "El nombre del proveedor es requerido." });
      return;
    }
    const supplier = await prisma.supplier.create({
      data: {
        name: String(name).trim(),
        rfc: rfc ? String(rfc).trim() : undefined,
        email: email ? String(email).trim() : undefined,
        phone: phone ? String(phone).trim() : undefined,
        address: address ? String(address).trim() : undefined,
        city: city ? String(city).trim() : undefined,
        state: state ? String(state).trim() : undefined,
        zipCode: zipCode ? String(zipCode).trim() : undefined,
        contactName: contactName ? String(contactName).trim() : undefined,
      },
    });
    res.status(201).json(supplier);
  } catch (error: any) {
    if (error.code === "P2002") {
      res.status(400).json({ message: "Ya existe un proveedor con ese nombre." });
      return;
    }
    res.status(500).json({ message: "Error al crear proveedor.", error: error.message });
  }
};

export const updateSupplier = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!id || isNaN(id)) {
      res.status(400).json({ message: "ID de proveedor inválido." });
      return;
    }
    const { name, rfc, email, phone, address, city, state, zipCode, contactName, active } = req.body;
    const supplier = await prisma.supplier.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: String(name).trim() }),
        ...(rfc !== undefined && { rfc: String(rfc).trim() || null }),
        ...(email !== undefined && { email: String(email).trim() || null }),
        ...(phone !== undefined && { phone: String(phone).trim() || null }),
        ...(address !== undefined && { address: String(address).trim() || null }),
        ...(city !== undefined && { city: String(city).trim() || null }),
        ...(state !== undefined && { state: String(state).trim() || null }),
        ...(zipCode !== undefined && { zipCode: String(zipCode).trim() || null }),
        ...(contactName !== undefined && { contactName: String(contactName).trim() || null }),
        ...(active !== undefined && { active: Boolean(active) }),
      },
    });
    res.json(supplier);
  } catch (error: any) {
    if (error.code === "P2025") {
      res.status(404).json({ message: "Proveedor no encontrado." });
      return;
    }
    res.status(500).json({ message: "Error al actualizar proveedor.", error: error.message });
  }
};

// ===========================================================================
// ÓRDENES DE COMPRA (Purchase Orders)
// ===========================================================================

export const listPurchases = async (req: Request, res: Response): Promise<void> => {
  try {
    const { branchId, status, supplierId, from, to } = req.query;
    const where: any = {};
    if (branchId && branchId !== "all") where.branchId = Number(branchId);
    if (status && status !== "all") where.status = String(status);
    if (supplierId) where.supplierId = Number(supplierId);
    if (from && to) {
      where.purchaseDate = {
        gte: new Date(String(from)),
        lte: new Date(String(to)),
      };
    }
    const purchases = await prisma.purchaseOrder.findMany({
      where,
      include: {
        supplier: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
        details: {
          include: { product: { select: { id: true, sku: true, name: true } } },
        },
        createdByUser: { select: { id: true, name: true } },
      },
      orderBy: { purchaseDate: "desc" },
      take: 100,
    });
    res.json(purchases);
  } catch (error: any) {
    res.status(500).json({ message: "Error al listar compras.", error: error.message });
  }
};

export const createPurchase = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }
  try {
    const { supplierId, branchId, reference, details, notes } = req.body;
    const userId = req.user.userId;

    if (!supplierId || !branchId || !reference || !Array.isArray(details) || details.length === 0) {
      res.status(400).json({ message: "Faltan campos requeridos: supplierId, branchId, reference, details." });
      return;
    }

    const validDetails = details.filter((d: any) => d.productId && Number(d.quantity) > 0);
    if (validDetails.length === 0) {
      res.status(400).json({ message: "Agregue al menos un producto con cantidad mayor a 0." });
      return;
    }

    const productIds = [...new Set(validDetails.map((d: any) => Number(d.productId)))] as number[];
    const foundProducts = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true },
    });
    if (foundProducts.length !== productIds.length) {
      res.status(404).json({ message: "Uno o más productos no existen en el catálogo." });
      return;
    }

    const supplier = await prisma.supplier.findUnique({ where: { id: Number(supplierId) } });
    if (!supplier) {
      res.status(404).json({ message: "Proveedor no encontrado." });
      return;
    }
    const branch = await prisma.branch.findUnique({ where: { id: Number(branchId) } });
    if (!branch) {
      res.status(404).json({ message: "Sucursal no encontrada." });
      return;
    }

    const subtotalNum = validDetails.reduce(
      (sum: number, d: any) => sum + Number(d.quantity) * Number(d.unitCost || 0),
      0
    );
    const taxNum = Math.round(subtotalNum * 0.16 * 100) / 100;
    const totalNum = Math.round((subtotalNum + taxNum) * 100) / 100;

    const purchase = await prisma.purchaseOrder.create({
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

    res.status(201).json(purchase);
  } catch (error: any) {
    res.status(500).json({ message: "Error al crear la orden de compra.", error: error.message });
  }
};

export const receivePurchase = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }
  try {
    const id = Number(req.params.id);
    const userId = req.user.userId;

    const purchase = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: { details: true, supplier: true },
    });

    if (!purchase) {
      res.status(404).json({ message: "Orden de compra no encontrada." });
      return;
    }
    if (purchase.status === "RECIBIDA") {
      res.status(400).json({ message: "La orden de compra ya fue recibida." });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      for (const detail of purchase.details) {
        const existing = await tx.inventory.findUnique({
          where: {
            productId_branchId: { productId: detail.productId, branchId: purchase.branchId },
          },
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
          data: { costPrice: detail.unitCost }
        });

        await tx.kardex.create({
          data: {
            productId: detail.productId,
            branchId: purchase.branchId,
            userId,
            quantityChange: detail.quantity,
            balanceAfter: newQty,
            movementType: "COMPRA",
            reason: \`Compra \${purchase.reference} de \${purchase.supplier.name}. Costo unit: $\${Number(detail.unitCost).toFixed(2)}\`,
            purchaseOrderId: purchase.id,
          },
        });
      }

      return await tx.purchaseOrder.update({
        where: { id: purchase.id },
        data: { status: "RECIBIDA", receivedBy: userId, receivedDate: new Date() },
        include: {
          supplier: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } },
          details: { include: { product: { select: { id: true, sku: true, name: true } } } },
        },
      });
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ message: "Error al recibir la orden de compra.", error: error.message });
  }
};

// ===========================================================================
// CAJAS — detalle individual + cierre forzado (admin)
// ===========================================================================

export const getCashSessionDetail = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ message: "Identificador de sesión inválido." });
      return;
    }

    const session = await prisma.cashSession.findUnique({
      where: { id },
      include: {
        branch: { select: { name: true } },
        user: { select: { name: true } },
        sales: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            invoiceNumber: true,
            createdAt: true,
            totalAmount: true,
            paymentMethod: true,
            cardType: true,
            cashReceived: true,
            changeGiven: true,
            status: true,
          },
        },
        bankDeposits: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            createdAt: true,
            amount: true,
            targetName: true,
            status: true,
          },
        },
      },
    });

    if (!session) {
      res.status(404).json({ message: "Sesión de caja no encontrada." });
      return;
    }

    // Desglose por método de pago (solo ventas COMPLETADAS)
    let efectivo = 0;
    let tarjetaCredito = 0;
    let tarjetaDebito = 0;
    let mercadoPago = 0;
    let totalVentas = 0;

    for (const sale of session.sales) {
      if (sale.status !== "COMPLETADA") continue;
      const amount = Number(sale.totalAmount);
      totalVentas += amount;
      if (sale.paymentMethod === "EFECTIVO") {
        efectivo += amount;
      } else if (sale.paymentMethod === "TARJETA") {
        if (sale.cardType === "CREDITO") tarjetaCredito += amount;
        else tarjetaDebito += amount;
      } else if (sale.paymentMethod === "QR_MERCADOPAGO") {
        mercadoPago += amount;
      } else if (sale.paymentMethod === "MIXTO") {
        const cashPortion = Number(sale.cashReceived || 0) - Number(sale.changeGiven || 0);
        const cardPortion = amount - cashPortion;
        efectivo += Math.max(0, cashPortion);
        if (sale.cardType === "CREDITO") tarjetaCredito += Math.max(0, cardPortion);
        else tarjetaDebito += Math.max(0, cardPortion);
      }
    }

    // Construir lista de movimientos con saldo corrido (últimos 20)
    type RawMov = { date: Date; type: string; description: string; amount: number };
    const rawMovements: RawMov[] = [];

    for (const sale of session.sales) {
      const amount = Number(sale.totalAmount);
      rawMovements.push({
        date: sale.createdAt,
        type: sale.status === "CANCELADA" ? "CANCELACIÓN" : "VENTA",
        description: sale.invoiceNumber,
        amount: sale.status === "CANCELADA" ? -amount : amount,
      });
    }

    for (const dep of session.bankDeposits) {
      rawMovements.push({
        date: dep.createdAt,
        type: "DEPÓSITO",
        description: dep.targetName,
        amount: -Number(dep.amount),
      });
    }

    rawMovements.sort((a, b) => a.date.getTime() - b.date.getTime());

    let runningBalance = Number(session.initialAmount);
    const allWithBalance = rawMovements.map((m) => {
      runningBalance += m.amount;
      return { ...m, balance: runningBalance };
    });

    const movements = allWithBalance.slice(-20).map((m, i) => ({
      id: i,
      date: m.date.toISOString(),
      type: m.type,
      description: m.description,
      amount: m.amount,
      balance: m.balance,
    }));

    const expected =
      Number(session.initialAmount) + Number(session.cashIn) - Number(session.cashOut);

    const s = session as any;
    res.status(200).json({
      session: {
        id: session.id,
        branch: session.branch.name,
        cajero: session.user.name,
        openedAt: session.openedAt,
        closedAt: session.closedAt,
        initialAmount: Number(session.initialAmount),
        cashIn: Number(session.cashIn),
        cashOut: Number(session.cashOut),
        expectedAmount: session.status === "CERRADA" ? Number(session.expectedAmount) : expected,
        declaredAmount: session.declaredAmount !== null ? Number(session.declaredAmount) : null,
        difference: session.difference !== null ? Number(session.difference) : null,
        salesCount: session.sales.filter((sale) => sale.status === "COMPLETADA").length,
        status: session.status,
        forceCloseReason: s.forceCloseReason ?? null,
      },
      payBreakdown: { efectivo, tarjetaCredito, tarjetaDebito, mercadoPago, totalVentas },
      movements,
    });
  } catch (error: any) {
    res.status(500).json({ message: "Error al cargar el detalle de la sesión.", error: error.message });
  }
};

export const forceCloseCashSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ message: "Identificador de sesión inválido." });
      return;
    }

    const { reason, forcedBy } = req.body;
    if (!reason || typeof reason !== "string" || !reason.trim()) {
      res.status(400).json({ message: "El motivo de cierre es requerido." });
      return;
    }

    const session = await prisma.cashSession.findUnique({ where: { id } });
    if (!session) {
      res.status(404).json({ message: "Sesión de caja no encontrada." });
      return;
    }
    if (session.status !== "ABIERTA") {
      res.status(400).json({ message: "La sesión ya se encuentra cerrada." });
      return;
    }

    const expected =
      Number(session.initialAmount) + Number(session.cashIn) - Number(session.cashOut);

    const updateData = {
      status: "CERRADA",
      closedAt: new Date(),
      expectedAmount: expected,
      forceCloseReason: reason.trim(),
      forcedByUserId: forcedBy ? Number(forcedBy) : null,
    };

    const updated = await prisma.cashSession.update({
      where: { id },
      data: updateData,
    });

    res.status(200).json({
      message: "Caja cerrada forzadamente.",
      session: updated,
    });
  } catch (error: any) {
    res.status(500).json({ message: "Error al cerrar la caja forzadamente.", error: error.message });
  }
};

// ===========================================================================
// PRODUCTOS — CRUD completo (admin)
// ===========================================================================

export const createProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const { sku, barcode, name, description, costPrice, sellPrice, trackingType, isReturnable, returnWindowDays } = req.body;

    if (!sku || typeof sku !== "string" || !sku.trim()) {
      res.status(400).json({ message: "El SKU del producto es obligatorio." });
      return;
    }
    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ message: "El nombre del producto es obligatorio." });
      return;
    }

    const cost = Number(costPrice);
    const sell = Number(sellPrice);

    if (isNaN(cost) || cost < 0) {
      res.status(400).json({ message: "El precio de costo debe ser un número no negativo." });
      return;
    }
    if (isNaN(sell) || sell < 0) {
      res.status(400).json({ message: "El precio de venta debe ser un número no negativo." });
      return;
    }

    const skuClean = sku.trim();
    const barcodeClean = barcode && typeof barcode === "string" && barcode.trim() ? barcode.trim() : null;

    // Usar una transacción para verificar unicidad y crear producto + inventarios
    const newProduct = await prisma.$transaction(async (tx) => {
      // Validar SKU único
      const existingSku = await tx.product.findUnique({
        where: { sku: skuClean }
      });
      if (existingSku) {
        throw new Error("EXISTS_SKU");
      }

      // Validar barcode único si existe
      if (barcodeClean) {
        const existingBarcode = await tx.product.findUnique({
          where: { barcode: barcodeClean }
        });
        if (existingBarcode) {
          throw new Error("EXISTS_BARCODE");
        }
      }

      // Crear producto
      const product = await tx.product.create({
        data: {
          sku: skuClean,
          barcode: barcodeClean,
          name: name.trim(),
          description: description && typeof description === "string" ? description.trim() : null,
          costPrice: cost,
          sellPrice: sell,
          active: true,
          isReturnable: isReturnable !== undefined ? Boolean(isReturnable) : true,
          returnWindowDays: returnWindowDays !== undefined ? Number(returnWindowDays) : 30,
          trackingType: trackingType && String(trackingType).trim() ? String(trackingType).trim() : "NONE",
        }
      });

      // Obtener todas las sucursales
      const branches = await tx.branch.findMany({ select: { id: true } });

      // Crear registro de inventario con stock 0 para cada sucursal
      for (const branch of branches) {
        await tx.inventory.create({
          data: {
            productId: product.id,
            branchId: branch.id,
            quantity: 0,
            minStock: 10,
            maxStock: 400
          }
        });
      }

      return product;
    });

    res.status(201).json({
      message: "Producto registrado exitosamente.",
      product: {
        id: newProduct.id,
        sku: newProduct.sku,
        barcode: newProduct.barcode,
        name: newProduct.name,
        description: newProduct.description,
        costPrice: Number(newProduct.costPrice),
        sellPrice: Number(newProduct.sellPrice),
        active: newProduct.active,
        isReturnable: newProduct.isReturnable,
        returnWindowDays: newProduct.returnWindowDays,
        trackingType: newProduct.trackingType,
      }
    });

  } catch (error: any) {
    if (error.message === "EXISTS_SKU") {
      res.status(409).json({ message: "El SKU ingresado ya está registrado." });
      return;
    }
    if (error.message === "EXISTS_BARCODE") {
      res.status(409).json({ message: "El código de barras ingresado ya está registrado." });
      return;
    }
    res.status(500).json({ message: "Error al registrar el producto.", error: error.message });
  }
};

export const listProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const search = trimQuery(req.query.search);
    const includeInactive = req.query.includeInactive === "true";

    const where: any = {};
    if (!includeInactive) where.active = true;
    if (search) {
      where.OR = [
        { sku: { contains: search } },
        { name: { contains: search } },
        { barcode: { contains: search } },
      ];
    }

    const products = await prisma.product.findMany({
      where,
      orderBy: { name: "asc" },
      select: {
        id: true,
        sku: true,
        barcode: true,
        name: true,
        description: true,
        costPrice: true,
        sellPrice: true,
        active: true,
        trackingType: true,
        isReturnable: true,
        createdAt: true,
      },
    });

    const mapped = products.map((p) => ({
      ...p,
      costPrice: Number(p.costPrice),
      sellPrice: Number(p.sellPrice),
    }));

    res.status(200).json({ products: mapped });
  } catch (error: any) {
    res.status(500).json({ message: "Error al listar productos.", error: error.message });
  }
};

export const getProductDetail = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ message: "Identificador de producto inválido." });
      return;
    }

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        inventories: {
          include: { branch: { select: { id: true, name: true } } },
        },
        kardexEntries: {
          take: 20,
          orderBy: { createdAt: "desc" },
          include: { branch: { select: { name: true } }, user: { select: { name: true } } },
        },
      },
    });

    if (!product) {
      res.status(404).json({ message: "Producto no encontrado." });
      return;
    }

    res.status(200).json({
      product: {
        id: product.id,
        sku: product.sku,
        barcode: product.barcode,
        name: product.name,
        description: product.description,
        costPrice: Number(product.costPrice),
        sellPrice: Number(product.sellPrice),
        active: product.active,
        trackingType: product.trackingType,
        isReturnable: product.isReturnable,
        returnWindowDays: product.returnWindowDays,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
        inventories: product.inventories.map((inv) => ({
          id: inv.id,
          branch: inv.branch.name,
          branchId: inv.branchId,
          quantity: inv.quantity,
          minStock: inv.minStock,
          maxStock: inv.maxStock,
        })),
        recentKardex: product.kardexEntries.map((k) => ({
          id: k.id,
          date: k.createdAt,
          branch: k.branch.name,
          user: k.user.name,
          movementType: k.movementType,
          quantityChange: k.quantityChange,
          balanceAfter: k.balanceAfter,
          reason: k.reason,
        })),
      },
    });
  } catch (error: any) {
    res.status(500).json({ message: "Error al obtener el detalle del producto.", error: error.message });
  }
};

export const updateProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ message: "Identificador de producto inválido." });
      return;
    }

    const { name, description, barcode, costPrice, sellPrice, active, isReturnable, returnWindowDays, trackingType } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ message: "El nombre del producto es obligatorio." });
      return;
    }

    const cost = Number(costPrice);
    const sell = Number(sellPrice);

    if (isNaN(cost) || cost < 0) {
      res.status(400).json({ message: "El precio de costo debe ser un número no negativo." });
      return;
    }
    if (isNaN(sell) || sell < 0) {
      res.status(400).json({ message: "El precio de venta debe ser un número no negativo." });
      return;
    }

    const barcodeClean = barcode && typeof barcode === "string" && barcode.trim() ? barcode.trim() : null;

    const existingProduct = await prisma.product.findUnique({
      where: { id }
    });

    if (!existingProduct) {
      res.status(404).json({ message: "Producto no encontrado." });
      return;
    }

    if (barcodeClean) {
      const duplicateBarcode = await prisma.product.findFirst({
        where: {
          barcode: barcodeClean,
          id: { not: id }
        }
      });
      if (duplicateBarcode) {
        res.status(409).json({ message: "El código de barras ingresado ya está asignado a otro producto." });
        return;
      }
    }

    const updated = await prisma.product.update({
      where: { id },
      data: {
        name: name.trim(),
        description: description && typeof description === "string" ? description.trim() : null,
        barcode: barcodeClean,
        costPrice: cost,
        sellPrice: sell,
        active: typeof active === "boolean" ? active : existingProduct.active,
        isReturnable: isReturnable !== undefined ? Boolean(isReturnable) : existingProduct.isReturnable,
        returnWindowDays: returnWindowDays !== undefined ? Number(returnWindowDays) : existingProduct.returnWindowDays,
        trackingType: trackingType !== undefined ? String(trackingType).trim() : existingProduct.trackingType,
      }
    });

    res.status(200).json({
      message: "Producto actualizado exitosamente.",
      product: {
        id: updated.id,
        sku: updated.sku,
        barcode: updated.barcode,
        name: updated.name,
        description: updated.description,
        costPrice: Number(updated.costPrice),
        sellPrice: Number(updated.sellPrice),
        active: updated.active,
        isReturnable: updated.isReturnable,
        returnWindowDays: updated.returnWindowDays,
        trackingType: updated.trackingType,
      }
    });
  } catch (error: any) {
    res.status(500).json({ message: "Error al actualizar el producto.", error: error.message });
  }
};

// ===========================================================================
// AJUSTE MANUAL DE INVENTARIO
// ===========================================================================
export const adjustInventory = async (req: Request, res: Response): Promise<void> => {
  try {
    const productId = Number(req.body.productId);
    const branchId = Number(req.body.branchId);
    const quantityChange = Number(req.body.quantityChange);
    const movementType = String(req.body.movementType || "").trim();
    const reason = String(req.body.reason || "").trim();
    const userId = req.user!.userId;

    if (!productId || !branchId || quantityChange === 0 || !movementType || !reason) {
      res.status(400).json({ message: "Campos requeridos incompletos." });
      return;
    }

    const inventory = await prisma.inventory.findUnique({
      where: { productId_branchId: { productId, branchId } },
    });

    if (!inventory) {
      res.status(404).json({ message: "Inventario no encontrado para este producto y sucursal." });
      return;
    }

    const newQuantity = inventory.quantity + quantityChange;
    if (newQuantity < 0) {
      res.status(400).json({ message: "El ajuste resultaría en stock negativo." });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.inventory.update({
        where: { id: inventory.id },
        data: { quantity: newQuantity },
      });
      await tx.kardex.create({
        data: { productId, branchId, userId, quantityChange, balanceAfter: newQuantity, movementType, reason },
      });
    });

    res.status(200).json({ message: "Ajuste aplicado exitosamente.", newQuantity });
  } catch (error: any) {
    res.status(500).json({ message: "Error al aplicar ajuste de inventario.", error: error.message });
  }
};

// ===========================================================================
// TRASLADO ENTRE SUCURSALES
// ===========================================================================
export const transferInventory = async (req: Request, res: Response): Promise<void> => {
  try {
    const productId = Number(req.body.productId);
    const fromBranch = Number(req.body.fromBranch);
    const toBranch = Number(req.body.toBranch);
    const quantity = Number(req.body.quantity);
    const userId = req.user!.userId;

    if (!productId || !fromBranch || !toBranch || !quantity) {
      res.status(400).json({ message: "Campos requeridos incompletos." });
      return;
    }
    if (fromBranch === toBranch) {
      res.status(400).json({ message: "El origen y destino deben ser diferentes." });
      return;
    }
    if (quantity <= 0) {
      res.status(400).json({ message: "La cantidad debe ser mayor a cero." });
      return;
    }

    const fromInv = await prisma.inventory.findUnique({
      where: { productId_branchId: { productId, branchId: fromBranch } },
    });

    if (!fromInv || fromInv.quantity < quantity) {
      res.status(400).json({ message: "Stock insuficiente en la sucursal de origen." });
      return;
    }

    // Fetch branch names for kardex reason
    const [branchFrom, branchTo] = await Promise.all([
      prisma.branch.findUnique({ where: { id: fromBranch }, select: { name: true } }),
      prisma.branch.findUnique({ where: { id: toBranch }, select: { name: true } }),
    ]);

    await prisma.$transaction(async (tx) => {
      const fromBalance = fromInv.quantity - quantity;
      await tx.inventory.update({ where: { id: fromInv.id }, data: { quantity: fromBalance } });
      await tx.kardex.create({
        data: {
          productId, branchId: fromBranch, userId,
          quantityChange: -quantity, balanceAfter: fromBalance,
          movementType: "TRASPASO_SALIDA",
          reason: \`Traslado a \${branchTo?.name ?? \`sucursal \${toBranch}\`}\`,
        },
      });

      const existingTo = await tx.inventory.findUnique({
        where: { productId_branchId: { productId, branchId: toBranch } },
      });
      const toBalance = (existingTo?.quantity ?? 0) + quantity;

      if (existingTo) {
        await tx.inventory.update({ where: { id: existingTo.id }, data: { quantity: toBalance } });
      } else {
        await tx.inventory.create({
          data: { productId, branchId: toBranch, quantity: toBalance, minStock: 0, maxStock: 100 },
        });
      }

      await tx.kardex.create({
        data: {
          productId, branchId: toBranch, userId,
          quantityChange: quantity, balanceAfter: toBalance,
          movementType: "TRASPASO_ENTRADA",
          reason: \`Traslado desde \${branchFrom?.name ?? \`sucursal \${fromBranch}\`}\`,
        },
      });
    });

    res.status(200).json({ message: "Traslado aplicado exitosamente." });
  } catch (error: any) {
    res.status(500).json({ message: "Error al aplicar traslado.", error: error.message });
  }
};

// ===========================================================================
// RELACIÓN PROVEEDOR ↔ PRODUCTOS
// ===========================================================================
export const getSupplierProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const supplierId = Number(req.params.supplierId);
    if (isNaN(supplierId)) {
      res.status(400).json({ message: "Identificador de proveedor inválido." });
      return;
    }

    const records = await prisma.supplierProduct.findMany({
      where: { supplierId },
      include: {
        product: { select: { id: true, sku: true, name: true, costPrice: true, sellPrice: true, active: true } },
      },
    });

    res.status(200).json(
      records.map((sp) => ({
        id: sp.product.id,
        sku: sp.product.sku,
        name: sp.product.name,
        costPrice: Number(sp.product.costPrice),
        sellPrice: Number(sp.product.sellPrice),
        active: sp.product.active,
      }))
    );
  } catch (error: any) {
    res.status(500).json({ message: "Error al obtener productos del proveedor.", error: error.message });
  }
};

export const assignProductToSupplier = async (req: Request, res: Response): Promise<void> => {
  try {
    const supplierId = Number(req.body.supplierId);
    const productId = Number(req.body.productId);

    if (!supplierId || !productId) {
      res.status(400).json({ message: "supplierId y productId son requeridos." });
      return;
    }

    const existing = await prisma.supplierProduct.findUnique({
      where: { supplierId_productId: { supplierId, productId } },
    });
    if (existing) {
      res.status(400).json({ message: "Este producto ya está asignado a este proveedor." });
      return;
    }

    const record = await prisma.supplierProduct.create({
      data: { supplierId, productId },
      include: { product: { select: { id: true, sku: true, name: true } }, supplier: { select: { id: true, name: true } } },
    });

    res.status(201).json({ message: "Producto asignado al proveedor exitosamente.", record });
  } catch (error: any) {
    res.status(500).json({ message: "Error al asignar producto al proveedor.", error: error.message });
  }
};

export const removeProductFromSupplier = async (req: Request, res: Response): Promise<void> => {
  try {
    const supplierId = Number(req.body.supplierId);
    const productId = Number(req.body.productId);

    if (!supplierId || !productId) {
      res.status(400).json({ message: "supplierId y productId son requeridos." });
      return;
    }

    await prisma.supplierProduct.delete({
      where: { supplierId_productId: { supplierId, productId } },
    });

    res.status(200).json({ message: "Producto removido del proveedor exitosamente." });
  } catch (error: any) {
    res.status(500).json({ message: "Error al remover producto del proveedor.", error: error.message });
  }
};

export const getProductSuppliers = async (req: Request, res: Response): Promise<void> => {
  try {
    const productId = Number(req.params.productId);
    if (isNaN(productId)) {
      res.status(400).json({ message: "Identificador de producto inválido." });
      return;
    }

    const records = await prisma.supplierProduct.findMany({
      where: { productId },
      include: { supplier: { select: { id: true, name: true, rfc: true, email: true } } },
    });

    res.status(200).json(records.map((sp) => sp.supplier));
  } catch (error: any) {
    res.status(500).json({ message: "Error al obtener proveedores del producto.", error: error.message });
  }
};

// ===========================================================================
// DESACTIVACIÓN DE PRODUCTO (Soft Delete)
// ===========================================================================
export const deleteProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ message: "Identificador de producto inválido." });
      return;
    }

    const existingProduct = await prisma.product.findUnique({
      where: { id }
    });

    if (!existingProduct) {
      res.status(404).json({ message: "Producto no encontrado." });
      return;
    }

    const updated = await prisma.product.update({
      where: { id },
      data: { active: false }
    });

    res.status(200).json({
      message: "Producto desactivado exitosamente.",
      product: {
        id: updated.id,
        sku: updated.sku,
        active: updated.active
      }
    });

  } catch (error: any) {
    res.status(500).json({ message: "Error al desactivar el producto.", error: error.message });
  }
};
`;

const finalContent = cleanTop.trim() + '\n\n' + resolvedMethods;

// Convert line endings to CRLF for consistency
const finalCRLFContent = finalContent.replace(/\n/g, '\r\n');

fs.writeFileSync(filePath, finalCRLFContent, 'utf8');
console.log("Successfully resolved all conflicts in admin.controller.ts using slice-replace strategy with TS fixes");
