import { Request, Response } from "express";
import { prisma } from "../app";
import bcrypt from "bcryptjs";

/**
 * Controlador del Panel Administrativo Central (módulos de gestión).
 * Todas las rutas están protegidas por JWT + rol ADMIN/GERENTE (ver admin.routes.ts).
 *
 * NOTA Prisma/SQL Server:
 *  - El conector de SQL Server NO admite `mode: "insensitive"`; se omite a propósito.
 *  - No se comparan dos columnas dentro de `where`; los cálculos columna-vs-columna
 *    (p. ej. stock <= minStock) se resuelven en memoria sobre conjuntos pequeños.
 *  - Los valores Decimal se normalizan con Number() antes de enviarse al cliente.
 */

// Lee el filtro de sucursal de la query (?branchId=). "all"/vacío => todas.
const parseBranch = (req: Request): number | undefined => {
  const b = req.query.branchId as string | undefined;
  return b && b !== "all" && !isNaN(Number(b)) ? Number(b) : undefined;
};

const trimQuery = (v: unknown): string | undefined => {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length > 0 ? s : undefined;
};

// ===========================================================================
// VENTAS
// ===========================================================================
export const listSales = async (req: Request, res: Response): Promise<void> => {
  try {
    const branchId = parseBranch(req);
    const status = req.query.status as string | undefined;
    const search = trimQuery(req.query.search);
    const from = trimQuery(req.query.from);
    const to = trimQuery(req.query.to);

    const where: any = {};
    if (branchId) where.branchId = branchId;
    if (status && status !== "all") where.status = status;
    if (search) where.invoiceNumber = { contains: search };
    if (from && to) {
      const fromDate = new Date(from);
      const toDate = new Date(to);
      toDate.setDate(toDate.getDate() + 1);
      where.createdAt = { gte: fromDate, lt: toDate };
    }

    const sales = await prisma.sale.findMany({
      where,
      take: 100,
      orderBy: { createdAt: "desc" },
      include: {
        branch: { select: { name: true } },
        user: { select: { name: true } },
        customer: { select: { name: true } },
        _count: { select: { saleDetails: true } },
      },
    });

    const mapped = sales.map((s) => ({
      id: s.id,
      invoiceNumber: s.invoiceNumber,
      createdAt: s.createdAt,
      branch: s.branch.name,
      cajero: s.user.name,
      customer: s.customer?.name ?? "Público General",
      items: s._count.saleDetails,
      totalAmount: Number(s.totalAmount),
      taxAmount: Number(s.taxAmount),
      paymentMethod: s.paymentMethod,
      status: s.status,
    }));

    res.status(200).json({ sales: mapped });
  } catch (error: any) {
    res.status(500).json({ message: "Error al listar ventas.", error: error.message });
  }
};

export const getSaleDetail = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ message: "Identificador de venta inválido." });
      return;
    }

    const sale = await prisma.sale.findUnique({
      where: { id },
      include: {
        branch: { select: { name: true } },
        user: { select: { name: true } },
        customer: { select: { name: true } },
        saleDetails: { include: { product: { select: { name: true, sku: true } } } },
      },
    });

    if (!sale) {
      res.status(404).json({ message: "Venta no encontrada." });
      return;
    }

    res.status(200).json({
      sale: {
        id: sale.id,
        invoiceNumber: sale.invoiceNumber,
        createdAt: sale.createdAt,
        branch: sale.branch.name,
        cajero: sale.user.name,
        customer: sale.customer?.name ?? "Público General",
        paymentMethod: sale.paymentMethod,
        status: sale.status,
        subtotal: Number(sale.totalAmount) - Number(sale.taxAmount),
        taxAmount: Number(sale.taxAmount),
        discountAmount: Number(sale.discountAmount),
        totalAmount: Number(sale.totalAmount),
        items: sale.saleDetails.map((d) => ({
          sku: d.product.sku,
          name: d.product.name,
          quantity: d.quantity,
          unitPrice: Number(d.unitPrice),
          importe: Number(d.unitPrice) * d.quantity,
        })),
      },
    });
  } catch (error: any) {
    res.status(500).json({ message: "Error al obtener el detalle de la venta.", error: error.message });
  }
};

// ===========================================================================
// INVENTARIO
// ===========================================================================
export const listInventory = async (req: Request, res: Response): Promise<void> => {
  try {
    const branchId = parseBranch(req);
    const search = trimQuery(req.query.search);

    const where: any = {};
    if (search) where.OR = [{ name: { contains: search } }, { sku: { contains: search } }];

    const products = await prisma.product.findMany({
      where,
      orderBy: { name: "asc" },
      include: {
        inventories: branchId ? { where: { branchId } } : true,
      },
    });

    const mapped = products.map((p) => {
      const invs = p.inventories;
      const stock = invs.reduce((acc, i) => acc + i.quantity, 0);
      const minStock = invs.reduce((acc, i) => acc + i.minStock, 0);
      const low = invs.some((i) => i.quantity <= i.minStock);
      return {
        id: p.id,
        sku: p.sku,
        barcode: p.barcode,
        name: p.name,
        description: p.description,
        active: p.active,
        sellPrice: Number(p.sellPrice),
        costPrice: Number(p.costPrice),
        stock,
        minStock,
        low,
        branchCount: invs.length,
      };
    });

    res.status(200).json({ products: mapped });
  } catch (error: any) {
    res.status(500).json({ message: "Error al listar inventario.", error: error.message });
  }
};

// ===========================================================================
// CLIENTES
// ===========================================================================
// ---------------------------------------------------------------------------
// RFC helpers
// ---------------------------------------------------------------------------
const validateRFC = (rfc: string): { valid: boolean; message: string } => {
  const cleaned = rfc.toUpperCase().replace(/\s+/g, "");
  const rfcRegex = /^([A-ZÑ&]{3,4})\d{6}([A-Z\d]{3})$/;
  if (!rfcRegex.test(cleaned)) {
    return { valid: false, message: "RFC debe tener 12 (moral) o 13 (física) caracteres alfanuméricos, sin espacios." };
  }
  return { valid: true, message: "" };
};

const checkRFCUnique = async (rfc: string, excludeId?: number): Promise<boolean> => {
  const cleaned = rfc.toUpperCase().replace(/\s+/g, "");
  const existing = await prisma.customer.findFirst({
    where: {
      taxId: cleaned,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
  });
  return !existing;
};

export const listCustomers = async (req: Request, res: Response): Promise<void> => {
  try {
    const search = trimQuery(req.query.search);

    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { taxId: { contains: search } },
        { phone: { contains: search } },
      ];
    }

    const customers = await prisma.customer.findMany({
      where,
      orderBy: { name: "asc" },
      take: 200,
      include: { _count: { select: { sales: true } } },
    });

    const mapped = customers.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      taxId: c.taxId,
      address: c.address,
      creditLimit: Number(c.creditLimit),
      balance: Number(c.balance),
      salesCount: c._count.sales,
      zipCode: c.zipCode,
      taxRegime: c.taxRegime,
      cfdiUse: c.cfdiUse,
      createdAt: c.createdAt,
    }));

    res.status(200).json({ customers: mapped });
  } catch (error: any) {
    res.status(500).json({ message: "Error al listar clientes.", error: error.message });
  }
};

export const createCustomer = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, phone, taxId, address, creditLimit, zipCode, taxRegime, cfdiUse } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ message: "El nombre del cliente es obligatorio." });
      return;
    }
    if (creditLimit !== undefined && creditLimit !== "" && isNaN(Number(creditLimit))) {
      res.status(400).json({ message: "El límite de crédito debe ser numérico." });
      return;
    }

    const cleanRFC = taxId ? String(taxId).toUpperCase().replace(/\s+/g, "") : null;
    if (cleanRFC) {
      const rfcCheck = validateRFC(cleanRFC);
      if (!rfcCheck.valid) {
        res.status(400).json({ message: rfcCheck.message });
        return;
      }
      const isUnique = await checkRFCUnique(cleanRFC);
      if (!isUnique) {
        res.status(409).json({ message: "El RFC ya existe en el catálogo de clientes." });
        return;
      }
    }

    if (zipCode && !/^\d{5}$/.test(String(zipCode).trim())) {
      res.status(400).json({ message: "El Código Postal debe ser exactamente 5 dígitos." });
      return;
    }

    const customer = await prisma.customer.create({
      data: {
        name: name.trim(),
        email: trimQuery(email) ?? null,
        phone: trimQuery(phone) ?? null,
        taxId: cleanRFC,
        address: trimQuery(address) ?? null,
        creditLimit: creditLimit ? Number(creditLimit) : 0,
        zipCode: zipCode ? String(zipCode).trim() : null,
        taxRegime: taxRegime ? String(taxRegime).trim() : null,
        cfdiUse: cfdiUse ? String(cfdiUse).trim() : null,
      },
    });

    res.status(201).json({
      message: "Cliente registrado exitosamente.",
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        taxId: customer.taxId,
        address: customer.address,
        creditLimit: Number(customer.creditLimit),
        balance: Number(customer.balance),
        salesCount: 0,
        zipCode: customer.zipCode,
        taxRegime: customer.taxRegime,
        cfdiUse: customer.cfdiUse,
        createdAt: customer.createdAt,
      },
    });
  } catch (error: any) {
    res.status(500).json({ message: "Error al registrar el cliente.", error: error.message });
  }
};

export const updateCustomer = async (req: Request, res: Response): Promise<void> => {
  try {
    const customerId = Number(req.params.id);
    if (isNaN(customerId)) {
      res.status(400).json({ message: "ID de cliente inválido." });
      return;
    }

    const { name, email, phone, taxId, address, creditLimit, zipCode, taxRegime, cfdiUse } = req.body;

    const existing = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!existing) {
      res.status(404).json({ message: "Cliente no encontrado." });
      return;
    }

    const cleanRFC = taxId ? String(taxId).toUpperCase().replace(/\s+/g, "") : null;
    if (cleanRFC && cleanRFC !== existing.taxId) {
      const rfcCheck = validateRFC(cleanRFC);
      if (!rfcCheck.valid) {
        res.status(400).json({ message: rfcCheck.message });
        return;
      }
      const isUnique = await checkRFCUnique(cleanRFC, customerId);
      if (!isUnique) {
        res.status(409).json({ message: "El RFC ya está registrado en otro cliente." });
        return;
      }
    }

    if (zipCode && !/^\d{5}$/.test(String(zipCode).trim())) {
      res.status(400).json({ message: "El Código Postal debe ser exactamente 5 dígitos." });
      return;
    }

    const customer = await prisma.customer.update({
      where: { id: customerId },
      data: {
        ...(name && { name: name.trim() }),
        ...(email !== undefined && { email: trimQuery(email) ?? null }),
        ...(phone !== undefined && { phone: trimQuery(phone) ?? null }),
        ...(taxId !== undefined && { taxId: cleanRFC }),
        ...(address !== undefined && { address: trimQuery(address) ?? null }),
        ...(creditLimit !== undefined && creditLimit !== "" && { creditLimit: Number(creditLimit) }),
        ...(zipCode !== undefined && { zipCode: zipCode ? String(zipCode).trim() : null }),
        ...(taxRegime !== undefined && { taxRegime: taxRegime ? String(taxRegime).trim() : null }),
        ...(cfdiUse !== undefined && { cfdiUse: cfdiUse ? String(cfdiUse).trim() : null }),
      },
      include: { _count: { select: { sales: true } } },
    });

    res.status(200).json({
      message: "Cliente actualizado exitosamente.",
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        taxId: customer.taxId,
        address: customer.address,
        creditLimit: Number(customer.creditLimit),
        balance: Number(customer.balance),
        salesCount: customer._count.sales,
        zipCode: customer.zipCode,
        taxRegime: customer.taxRegime,
        cfdiUse: customer.cfdiUse,
        createdAt: customer.createdAt,
      },
    });
  } catch (error: any) {
    res.status(500).json({ message: "Error al actualizar el cliente.", error: error.message });
  }
};

// ===========================================================================
// CAJAS (sesiones de caja)
// ===========================================================================
export const listCashSessions = async (req: Request, res: Response): Promise<void> => {
  try {
    const branchId = parseBranch(req);
    const status = req.query.status as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const userId = req.query.userId as string | undefined;

    const where: any = {};
    if (branchId) where.branchId = branchId;
    if (status && status !== "all") where.status = status;
    if (userId && !isNaN(Number(userId))) where.userId = Number(userId);
    if (from && to) {
      where.openedAt = {
        gte: new Date(from),
        lte: new Date(to + "T23:59:59"),
      };
    }

    const sessions = await prisma.cashSession.findMany({
      where,
      take: 100,
      orderBy: { openedAt: "desc" },
      include: {
        branch: { select: { name: true } },
        user: { select: { name: true } },
        _count: { select: { sales: true } },
      },
    });

    const mapped = sessions.map((s) => {
      const expected =
        Number(s.initialAmount) + Number(s.cashIn) - Number(s.cashOut);
      return {
        id: s.id,
        branch: s.branch.name,
        cajero: s.user.name,
        openedAt: s.openedAt,
        closedAt: s.closedAt,
        initialAmount: Number(s.initialAmount),
        cashIn: Number(s.cashIn),
        cashOut: Number(s.cashOut),
        expectedAmount: s.status === "CERRADA" ? Number(s.expectedAmount) : expected,
        declaredAmount: s.declaredAmount !== null ? Number(s.declaredAmount) : null,
        difference: s.difference !== null ? Number(s.difference) : null,
        salesCount: s._count.sales,
        status: s.status,
      };
    });

    res.status(200).json({ sessions: mapped });
  } catch (error: any) {
    res.status(500).json({ message: "Error al listar las sesiones de caja.", error: error.message });
  }
};

// ===========================================================================
// EMPLEADOS (usuarios) — nunca se exponen passwordHash ni pinCode
// ===========================================================================
export const listEmployees = async (req: Request, res: Response): Promise<void> => {
  try {
    const branchId = parseBranch(req);
    const role = req.query.role as string | undefined;
    const search = trimQuery(req.query.search);

    const where: any = {};
    if (branchId) where.branchId = branchId;
    if (role && role !== "all") where.role = role;
    if (search) where.OR = [{ name: { contains: search } }, { email: { contains: search } }];

    const users = await prisma.user.findMany({
      where,
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        phone: true,
        baseSalary: true,
        commissionRate: true,
        createdAt: true,
        branchId: true,
        branch: { select: { name: true } },
      },
    });

    const mapped = users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      active: u.active,
      phone: u.phone,
      baseSalary: u.baseSalary !== null ? Number(u.baseSalary) : null,
      commissionRate: u.commissionRate !== null ? Number(u.commissionRate) : null,
      branchId: u.branchId,
      branch: u.branch.name,
      createdAt: u.createdAt,
    }));

    res.status(200).json({ employees: mapped });
  } catch (error: any) {
    res.status(500).json({ message: "Error al listar empleados.", error: error.message });
  }
};

// ===========================================================================
// SUCURSALES
// ===========================================================================
export const listBranches = async (req: Request, res: Response): Promise<void> => {
  try {
    const search = trimQuery(req.query.search);

    const where: any = {};
    if (search) where.OR = [{ name: { contains: search } }, { address: { contains: search } }];

    const branches = await prisma.branch.findMany({
      where,
      orderBy: { id: "asc" },
      include: { _count: { select: { users: true, sales: true } } },
    });

    const mapped = branches.map((b) => ({
      id: b.id,
      name: b.name,
      address: b.address,
      phone: b.phone,
      active: b.active,
      employees: b._count.users,
      sales: b._count.sales,
      createdAt: b.createdAt,
    }));

    res.status(200).json({ branches: mapped });
  } catch (error: any) {
    res.status(500).json({ message: "Error al listar sucursales.", error: error.message });
  }
};

export const createBranch = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, address, phone, active } = req.body;

    // ---- Nombre: obligatorio, 3–80 caracteres, solo letras/nums/acentos/puntos/guiones ----
    const cleanName = typeof name === "string" ? name.trim() : "";
    if (!cleanName) {
      res.status(400).json({ message: "El nombre de la sucursal es obligatorio." });
      return;
    }
    if (cleanName.length < 3) {
      res.status(400).json({ message: "El nombre debe tener al menos 3 caracteres." });
      return;
    }
    if (cleanName.length > 80) {
      res.status(400).json({ message: "El nombre no puede exceder 80 caracteres." });
      return;
    }
    if (!/^[a-zA-ZÀ-ÿ0-9 .\-]+$/.test(cleanName)) {
      res.status(400).json({ message: "El nombre solo permite letras, números, espacios, acentos, puntos y guiones." });
      return;
    }

    // ---- Dirección: obligatoria, máximo 150 caracteres ----
    const cleanAddress = typeof address === "string" ? address.trim() : "";
    if (!cleanAddress) {
      res.status(400).json({ message: "La dirección es obligatoria." });
      return;
    }
    if (cleanAddress.length > 150) {
      res.status(400).json({ message: "La dirección no puede exceder 150 caracteres." });
      return;
    }

    // ---- Teléfono: obligatorio, exactamente 10 dígitos ----
    const cleanPhone = typeof phone === "string" ? phone.trim() : "";
    if (!/^\d{10}$/.test(cleanPhone)) {
      res.status(400).json({ message: "El teléfono debe contener exactamente 10 dígitos." });
      return;
    }

    const branch = await prisma.branch.create({
      data: {
        name: cleanName,
        address: cleanAddress,
        phone: cleanPhone,
        active: typeof active === "boolean" ? active : true,
      },
    });

    res.status(201).json({ message: "Sucursal registrada exitosamente.", branch });
  } catch (error: any) {
    if (error.code === "P2002") {
      res.status(409).json({ message: "Ya existe una sucursal con ese nombre." });
      return;
    }
    res.status(500).json({ message: "Error al registrar la sucursal.", error: error.message });
  }
};

export const updateBranch = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ message: "Identificador de sucursal inválido." });
      return;
    }

    const { name, address, phone, active } = req.body;

    // ---- Nombre: obligatorio, 3–80 caracteres, solo letras/nums/acentos/puntos/guiones ----
    const cleanName = typeof name === "string" ? name.trim() : "";
    if (!cleanName) {
      res.status(400).json({ message: "El nombre de la sucursal es obligatorio." });
      return;
    }
    if (cleanName.length < 3) {
      res.status(400).json({ message: "El nombre debe tener al menos 3 caracteres." });
      return;
    }
    if (cleanName.length > 80) {
      res.status(400).json({ message: "El nombre no puede exceder 80 caracteres." });
      return;
    }
    if (!/^[a-zA-ZÀ-ÿ0-9 .\-]+$/.test(cleanName)) {
      res.status(400).json({ message: "El nombre solo permite letras, números, espacios, acentos, puntos y guiones." });
      return;
    }

    // ---- Dirección: obligatoria, máximo 150 caracteres ----
    const cleanAddress = typeof address === "string" ? address.trim() : "";
    if (!cleanAddress) {
      res.status(400).json({ message: "La dirección es obligatoria." });
      return;
    }
    if (cleanAddress.length > 150) {
      res.status(400).json({ message: "La dirección no puede exceder 150 caracteres." });
      return;
    }

    // ---- Teléfono: obligatorio, exactamente 10 dígitos ----
    const cleanPhone = typeof phone === "string" ? phone.trim() : "";
    if (!/^\d{10}$/.test(cleanPhone)) {
      res.status(400).json({ message: "El teléfono debe contener exactamente 10 dígitos." });
      return;
    }

    // ---- No desactivar sucursal con empleados activos ----
    if (active === false) {
      const existing = await prisma.branch.findUnique({ where: { id }, select: { active: true } });
      if (existing?.active === true) {
        const activeUsers = await prisma.user.count({ where: { branchId: id, active: true } });
        if (activeUsers > 0) {
          res.status(400).json({
            message: `No se puede desactivar la sucursal. Hay ${activeUsers} empleado(s) activo(s) asignado(s). Reasígnalos o desactívalos primero.`,
          });
          return;
        }
      }
    }

    const branch = await prisma.branch.update({
      where: { id },
      data: {
        name: cleanName,
        address: cleanAddress,
        phone: cleanPhone,
        active: typeof active === "boolean" ? active : true,
      },
    });

    res.status(200).json({ message: "Sucursal actualizada exitosamente.", branch });
  } catch (error: any) {
    if (error.code === "P2002") {
      res.status(409).json({ message: "Ya existe otra sucursal con ese nombre." });
      return;
    }
    // P2025: registro no encontrado para actualizar
    if (error.code === "P2025") {
      res.status(404).json({ message: "Sucursal no encontrada." });
      return;
    }
    res.status(500).json({ message: "Error al actualizar la sucursal.", error: error.message });
  }
};

// ===========================================================================
// REPORTES (resumen por rango de fechas)
// ===========================================================================
export const getReports = async (req: Request, res: Response): Promise<void> => {
  try {
    const branchId = parseBranch(req);
    const fromStr = trimQuery(req.query.from);
    const toStr = trimQuery(req.query.to);

    const now = new Date();
    const from = fromStr
      ? new Date(`${fromStr}T00:00:00`)
      : new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
    const to = toStr ? new Date(`${toStr}T23:59:59`) : now;

    const rangeFilter = { createdAt: { gte: from, lte: to } };
    const branchFilter = branchId ? { branchId } : {};
    const completedWhere = { ...branchFilter, ...rangeFilter, status: "COMPLETADA" };

    const [
      totalsAgg,
      cancelledCount,
      byPaymentRaw,
      byBranchRaw,
      completedSales,
      branches,
      salesListRaw,
    ] = await Promise.all([
      prisma.sale.aggregate({
        where: completedWhere,
        _sum: { totalAmount: true, taxAmount: true, discountAmount: true },
        _count: { _all: true },
      }),
      prisma.sale.count({ where: { ...branchFilter, ...rangeFilter, status: "CANCELADA" } }),
      prisma.sale.groupBy({
        by: ["paymentMethod"],
        where: completedWhere,
        _sum: { totalAmount: true },
        _count: { _all: true },
      }),
      prisma.sale.groupBy({
        by: ["branchId"],
        where: { ...rangeFilter, status: "COMPLETADA" },
        _sum: { totalAmount: true },
        _count: { _all: true },
      }),
      prisma.sale.findMany({ where: completedWhere, select: { id: true } }),
      prisma.branch.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { id: "asc" } }),
      prisma.sale.findMany({
        where: { ...branchFilter, ...rangeFilter },
        select: {
          id: true,
          invoiceNumber: true,
          createdAt: true,
          totalAmount: true,
          taxAmount: true,
          discountAmount: true,
          status: true,
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const saleIds = completedSales.map((s) => s.id);

    let utilidad = 0;
    let topProducts: { id: number; name: string; unidades: number; importe: number }[] = [];
    let taxBreakdown: { taxName: string; taxRate: number; total: number }[] = [];
    let taxByProduct: { productId: number; name: string; sku: string; totalTax: number }[] = [];
    let ivaAmount = 0;
    let iepsAmount = 0;
    let otherTaxesAmount = 0;

    if (saleIds.length > 0) {
      const [detailsForProfit, topRaw, saleDetailTaxes] = await Promise.all([
        prisma.saleDetail.findMany({
          where: { saleId: { in: saleIds } },
          select: { quantity: true, unitPrice: true, costPrice: true },
        }),
        prisma.saleDetail.groupBy({
          by: ["productId"],
          where: { saleId: { in: saleIds } },
          _sum: { quantity: true },
          orderBy: { _sum: { quantity: "desc" } },
          take: 8,
        }),
        prisma.saleDetailTax.findMany({
          where: {
            saleDetail: {
              saleId: { in: saleIds }
            }
          },
          include: {
            saleDetail: {
              select: {
                productId: true,
                product: {
                  select: {
                    name: true,
                    sku: true
                  }
                }
              }
            }
          }
        })
      ]);

      utilidad = detailsForProfit.reduce(
        (acc, d) => acc + (Number(d.unitPrice) - Number(d.costPrice)) * d.quantity,
        0
      );

      const topIds = topRaw.map((t) => t.productId);
      const info = await prisma.product.findMany({
        where: { id: { in: topIds } },
        select: { id: true, name: true, sellPrice: true },
      });
      const byId = new Map(info.map((p) => [p.id, p]));
      topProducts = topRaw.map((t) => {
        const prod = byId.get(t.productId);
        const unidades = Number(t._sum.quantity ?? 0);
        return {
          id: t.productId,
          name: prod?.name ?? `Producto #${t.productId}`,
          unidades,
          importe: unidades * Number(prod?.sellPrice ?? 0),
        };
      });

      // Calcular desgloses de impuestos detallados
      const taxBreakdownMap = new Map<string, { taxName: string; taxRate: number; total: number }>();
      const taxByProductMap = new Map<number, { productId: number; name: string; sku: string; totalTax: number }>();

      for (const sdt of saleDetailTaxes) {
        const amount = Number(sdt.taxAmount);
        const name = sdt.taxName;
        const rate = Number(sdt.taxRate);

        if (!taxBreakdownMap.has(name)) {
          taxBreakdownMap.set(name, { taxName: name, taxRate: rate, total: 0 });
        }
        taxBreakdownMap.get(name)!.total += amount;

        const nameUpper = name.toUpperCase();
        if (nameUpper.includes("IVA")) {
          ivaAmount += amount;
        } else if (nameUpper.includes("IEPS")) {
          iepsAmount += amount;
        } else {
          otherTaxesAmount += amount;
        }

        const prodId = sdt.saleDetail.productId;
        const prodName = sdt.saleDetail.product.name;
        const prodSku = sdt.saleDetail.product.sku;

        if (!taxByProductMap.has(prodId)) {
          taxByProductMap.set(prodId, { productId: prodId, name: prodName, sku: prodSku, totalTax: 0 });
        }
        taxByProductMap.get(prodId)!.totalTax += amount;
      }

      // Manejar el fallback de impuestos de ventas legacy
      const sumNewTaxes = saleDetailTaxes.reduce((acc, sdt) => acc + Number(sdt.taxAmount), 0);
      const totalTaxSum = Number(totalsAgg._sum.taxAmount ?? 0);
      const legacyTaxAmount = totalTaxSum - sumNewTaxes;

      if (legacyTaxAmount > 0.05) {
        ivaAmount += legacyTaxAmount;
        const legacyKey = "IVA 16% (Legacy)";
        if (!taxBreakdownMap.has(legacyKey)) {
          taxBreakdownMap.set(legacyKey, { taxName: legacyKey, taxRate: 0.16, total: 0 });
        }
        taxBreakdownMap.get(legacyKey)!.total += legacyTaxAmount;
      }

      taxBreakdown = Array.from(taxBreakdownMap.values()).map((tb) => ({
        ...tb,
        total: Number(tb.total.toFixed(2)),
      }));
      taxByProduct = Array.from(taxByProductMap.values()).map((tbp) => ({
        ...tbp,
        totalTax: Number(tbp.totalTax.toFixed(2)),
      })).sort((a, b) => b.totalTax - a.totalTax);
    }

    const ventasNetas = Number(totalsAgg._sum.totalAmount ?? 0);
    const ticketCount = totalsAgg._count._all;

    const branchNameById = new Map(branches.map((b) => [b.id, b.name]));

    const salesList = salesListRaw.map((s) => ({
      id: s.id,
      invoiceNumber: s.invoiceNumber,
      createdAt: s.createdAt,
      subtotal: Number(s.totalAmount) - Number(s.taxAmount),
      taxAmount: Number(s.taxAmount),
      totalAmount: Number(s.totalAmount),
      status: s.status,
    }));

    res.status(200).json({
      range: { from: from.toISOString(), to: to.toISOString() },
      totals: {
        ventasNetas,
        impuestos: Number(totalsAgg._sum.taxAmount ?? 0),
        ivaAmount: Number(ivaAmount.toFixed(2)),
        iepsAmount: Number(iepsAmount.toFixed(2)),
        otherTaxesAmount: Number(otherTaxesAmount.toFixed(2)),
        descuentos: Number(totalsAgg._sum.discountAmount ?? 0),
        utilidad,
        ticketCount,
        ticketPromedio: ticketCount > 0 ? ventasNetas / ticketCount : 0,
        canceladas: cancelledCount,
      },
      byPaymentMethod: byPaymentRaw.map((p) => ({
        method: p.paymentMethod,
        total: Number(p._sum.totalAmount ?? 0),
        count: p._count._all,
      })),
      byBranch: byBranchRaw
        .map((b) => ({
          id: b.branchId,
          name: branchNameById.get(b.branchId) ?? `Sucursal #${b.branchId}`,
          total: Number(b._sum.totalAmount ?? 0),
          count: b._count._all,
        }))
        .sort((a, b) => b.total - a.total),
      topProducts,
      taxBreakdown,
      taxByProduct,
      salesList,
    });
  } catch (error: any) {
    res.status(500).json({ message: "Error al generar los reportes.", error: error.message });
  }
};
// ===========================================================================
// ALTA DE EMPLEADO (reutiliza la tabla User; cifra password y PIN)
// ===========================================================================

const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
};

export const createEmployee = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password, role, branchId, pinCode, phone, baseSalary, commissionRate } = req.body;

    if (!name?.trim() || !email?.trim() || !password || !role || !branchId) {
      res.status(400).json({ message: "Nombre, correo, contraseña, rol y sucursal son obligatorios." });
      return;
    }
    if (!validateEmail(String(email))) {
      res.status(400).json({ message: "Formato de correo electrónico inválido (ej: usuario@empresa.com)." });
      return;
    }
    if (String(password).length < 6) {
      res.status(400).json({ message: "La contraseña debe tener al menos 6 caracteres." });
      return;
    }
    const validRoles = ["ADMIN", "GERENTE", "CAJERO"];
    if (!validRoles.includes(role)) {
      res.status(400).json({ message: "Rol inválido. Use ADMIN, GERENTE o CAJERO." });
      return;
    }
    // Los cajeros se autentican con PIN de 4 dígitos
    if (role === "CAJERO" && (!pinCode || !/^\d{4}$/.test(String(pinCode)))) {
      res.status(400).json({ message: "Los cajeros requieren un PIN numérico de 4 dígitos." });
      return;
    }
    if (pinCode && !/^\d{4}$/.test(String(pinCode))) {
      res.status(400).json({ message: "El PIN debe ser numérico de 4 dígitos." });
      return;
    }

    const branch = await prisma.branch.findUnique({ where: { id: Number(branchId) } });
    if (!branch) {
      res.status(404).json({ message: "La sucursal seleccionada no existe." });
      return;
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const pinHash = pinCode ? await bcrypt.hash(String(pinCode), 10) : null;

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        passwordHash,
        pinCode: pinHash,
        role: role.toUpperCase(),
        active: true,
        branchId: Number(branchId),
        phone: phone ? String(phone).trim() : null,
        baseSalary: baseSalary ? parseFloat(String(baseSalary)) : null,
        commissionRate: commissionRate ? parseFloat(String(commissionRate)) : null,
      },
    });

    res.status(201).json({
      message: "Empleado registrado exitosamente.",
      employee: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        active: user.active,
        branch: branch.name,
        createdAt: user.createdAt,
      },
    });
  } catch (error: any) {
    if (error.code === "P2002") {
      res.status(409).json({ message: "Ya existe un usuario registrado con ese correo electrónico." });
      return;
    }
    res.status(500).json({ message: "Error al registrar el empleado.", error: error.message });
  }
};

export const updateEmployee = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = Number(req.params.id);
    if (isNaN(userId)) {
      res.status(400).json({ message: "Identificador de empleado inválido." });
      return;
    }

    const { name, email, phone, baseSalary, commissionRate, role, branchId, active, newPin } = req.body;

    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      res.status(404).json({ message: "Empleado no encontrado." });
      return;
    }

    if (email && String(email).trim() !== "" && String(email).trim().toLowerCase() !== existing.email) {
      if (!validateEmail(String(email))) {
        res.status(400).json({ message: "Formato de correo electrónico inválido." });
        return;
      }
      const emailExists = await prisma.user.findUnique({ where: { email: String(email).trim().toLowerCase() } });
      if (emailExists) {
        res.status(409).json({ message: "El correo ya está registrado en otro empleado." });
        return;
      }
    }

    if (role && role.trim() !== "") {
      const validRoles = ["ADMIN", "GERENTE", "CAJERO"];
      if (!validRoles.includes(String(role).toUpperCase())) {
        res.status(400).json({ message: "Rol inválido. Use ADMIN, GERENTE o CAJERO." });
        return;
      }
    }

    const updateData: any = {};
    if (name && String(name).trim() !== "") updateData.name = String(name).trim();
    if (email && String(email).trim() !== "") updateData.email = String(email).trim().toLowerCase();
    if (phone !== undefined) updateData.phone = phone ? String(phone).trim() : null;
    if (baseSalary !== undefined) updateData.baseSalary = baseSalary !== "" && baseSalary !== null ? parseFloat(String(baseSalary)) : null;
    if (commissionRate !== undefined) updateData.commissionRate = commissionRate !== "" && commissionRate !== null ? parseFloat(String(commissionRate)) : null;
    if (role && String(role).trim() !== "") updateData.role = String(role).toUpperCase();
    if (branchId) updateData.branchId = Number(branchId);
    if (active !== undefined) updateData.active = Boolean(active);

    if (newPin && String(newPin).trim() !== "") {
      if (!/^\d{4}$/.test(String(newPin))) {
        res.status(400).json({ message: "El PIN debe ser exactamente 4 dígitos numéricos." });
        return;
      }
      updateData.pinCode = await bcrypt.hash(String(newPin), 10);
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      include: { branch: { select: { name: true } } },
    });

    const { passwordHash, pinCode, ...userSafe } = updated as any;
    res.status(200).json({
      message: "Empleado actualizado exitosamente.",
      employee: {
        id: userSafe.id,
        name: userSafe.name,
        email: userSafe.email,
        phone: userSafe.phone,
        role: userSafe.role,
        active: userSafe.active,
        baseSalary: userSafe.baseSalary !== null ? Number(userSafe.baseSalary) : null,
        commissionRate: userSafe.commissionRate !== null ? Number(userSafe.commissionRate) : null,
        branch: userSafe.branch.name,
        createdAt: userSafe.createdAt,
      },
    });
  } catch (error: any) {
    if (error.code === "P2025") {
      res.status(404).json({ message: "Empleado no encontrado." });
      return;
    }
    res.status(500).json({ message: "Error al actualizar el empleado.", error: error.message });
  }
};
// ===========================================================================
// OPERACIONES DEL VENDEDOR (actividad consolidada de un empleado)
// ===========================================================================
export const getEmployeeOperations = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ message: "Identificador de empleado inválido." });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, role: true, active: true, commissionRate: true, branch: { select: { name: true } } },
    });
    if (!user) {
      res.status(404).json({ message: "Empleado no encontrado." });
      return;
    }

    const [salesAgg, cancelledCount, recentSales, sessions] = await Promise.all([
      prisma.sale.aggregate({ where: { userId: id, status: "COMPLETADA" }, _sum: { totalAmount: true }, _count: { _all: true } }),
      prisma.sale.count({ where: { userId: id, status: "CANCELADA" } }),
      prisma.sale.findMany({
        where: { userId: id },
        take: 10,
        orderBy: { createdAt: "desc" },
        select: { id: true, invoiceNumber: true, createdAt: true, totalAmount: true, paymentMethod: true, status: true },
      }),
      prisma.cashSession.findMany({
        where: { userId: id },
        take: 10,
        orderBy: { openedAt: "desc" },
        select: { id: true, openedAt: true, closedAt: true, initialAmount: true, difference: true, status: true },
      }),
    ]);

    // Depósitos realizados durante las sesiones de caja de este empleado
    const sessionIds = (await prisma.cashSession.findMany({ where: { userId: id }, select: { id: true } })).map((s) => s.id);
    const depositsAgg =
      sessionIds.length > 0
        ? await prisma.bankDeposit.aggregate({ where: { cashSessionId: { in: sessionIds } }, _sum: { amount: true }, _count: { _all: true } })
        : { _sum: { amount: null }, _count: { _all: 0 } };

    const openSessions = sessions.filter((s) => s.status === "ABIERTA").length;
    const totalSales = salesAgg._count._all;
    const totalSalesAmount = Number(salesAgg._sum.totalAmount ?? 0);
    const avgPerTicket = totalSales > 0 ? Math.round((totalSalesAmount / totalSales) * 100) / 100 : 0;
    const estimatedCommission = user.commissionRate
      ? Math.round(totalSalesAmount * Number(user.commissionRate) / 100 * 100) / 100
      : 0;

    res.status(200).json({
      employee: { id: user.id, name: user.name, email: user.email, role: user.role, active: user.active, branch: user.branch.name },
      summary: {
        salesCount: totalSales,
        salesTotal: totalSalesAmount,
        cancelledCount,
        sessionsCount: sessions.length,
        openSessions,
        depositsCount: depositsAgg._count._all,
        depositsTotal: Number(depositsAgg._sum.amount ?? 0),
        avgPerTicket,
        estimatedCommission,
      },
      recentSales: recentSales.map((s) => ({
        id: s.id,
        invoiceNumber: s.invoiceNumber,
        createdAt: s.createdAt,
        totalAmount: Number(s.totalAmount),
        paymentMethod: s.paymentMethod,
        status: s.status,
      })),
      recentSessions: sessions.map((s) => ({
        id: s.id,
        openedAt: s.openedAt,
        closedAt: s.closedAt,
        initialAmount: Number(s.initialAmount),
        difference: s.difference !== null ? Number(s.difference) : null,
        status: s.status,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ message: "Error al obtener las operaciones del empleado.", error: error.message });
  }
};

// ===========================================================================
// KARDEX (movimientos de inventario) — solo lectura
// ===========================================================================
export const listKardex = async (req: Request, res: Response): Promise<void> => {
  try {
    const branchId = parseBranch(req);
    const movementType = req.query.movementType as string | undefined;
    const search = trimQuery(req.query.search);

    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    const where: any = {};
    if (branchId) where.branchId = branchId;
    if (movementType && movementType !== "all") where.movementType = movementType;
    if (search) where.product = { OR: [{ name: { contains: search } }, { sku: { contains: search } }] };
    if (from && to) {
      where.createdAt = {
        gte: new Date(from),
        lte: new Date(to + "T23:59:59"),
      };
    }

    const entries = await prisma.kardex.findMany({
      where,
      take: 150,
      orderBy: { createdAt: "desc" },
      include: {
        product: { select: { name: true, sku: true } },
        branch: { select: { name: true } },
        user: { select: { name: true } },
      },
    });

    res.status(200).json({
      entries: entries.map((k) => ({
        id: k.id,
        createdAt: k.createdAt,
        product: k.product.name,
        sku: k.product.sku,
        branch: k.branch.name,
        user: k.user.name,
        movementType: k.movementType,
        quantityChange: k.quantityChange,
        balanceAfter: k.balanceAfter,
        reason: k.reason,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ message: "Error al listar el kardex.", error: error.message });
  }
};

// ===========================================================================
// DEPÓSITOS BANCARIOS — solo lectura (número de cuenta enmascarado)
// ===========================================================================
export const listBankDeposits = async (req: Request, res: Response): Promise<void> => {
  try {
    const branchId = parseBranch(req);
    const { from, to, account } = req.query;

    const where: any = {};

    if (branchId) where.branchId = branchId;
    if (account) where.accountNumber = String(account);

    // 🔧 CORRECCIÓN IMPORTANTE: Manejo de fechas con rangos
    if (from || to) {
      where.createdAt = {};

      if (from) {
        // Crear fecha desde el inicio del día (00:00:00)
        const fromDate = new Date(String(from));
        fromDate.setHours(0, 0, 0, 0);
        where.createdAt.gte = fromDate;
        console.log("Desde (UTC):", fromDate.toISOString()); // Debug
      }

      if (to) {
        // Crear fecha hasta el final del día (23:59:59)
        const toDate = new Date(String(to));
        toDate.setHours(23, 59, 59, 999);
        where.createdAt.lte = toDate;
        console.log("Hasta (UTC):", toDate.toISOString()); // Debug
      }
    }

    console.log("Filtro where:", JSON.stringify(where, null, 2)); // Debug

    const deposits = await prisma.bankDeposit.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { branch: { select: { name: true } } },
    });

    console.log(`Encontrados ${deposits.length} depósitos`); // Debug

    res.status(200).json({
      deposits: deposits.map((d) => ({
        id: d.id,
        accountMasked: `**** **** **** ${d.accountNumber.slice(-4)}`,
        accountNumber: d.accountNumber,
        targetName: d.targetName,
        amount: Number(d.amount),
        paymentType: d.paymentType,
        comments: d.comments,
        branch: d.branch.name,
        sessionId: d.cashSessionId,
        createdAt: d.createdAt,
        status: d.status,
      })),
    });
  } catch (error: any) {
    console.error("Error en listBankDeposits:", error);
    res.status(500).json({ message: "Error al listar los depósitos bancarios.", error: error.message });
  }
};

// ===========================================================================
// COMPRAS — entrada de mercancía (transacción ACID: +Inventory y Kardex COMPRA)
// ===========================================================================
export const registerPurchase = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }

  try {
    const { branchId, items, supplier, reference } = req.body;
    const bId = Number(branchId);

    if (!bId || isNaN(bId)) {
      res.status(400).json({ message: "Debe seleccionar una sucursal de destino." });
      return;
    }
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ message: "Agregue al menos un producto a la compra." });
      return;
    }

    // Validar líneas
    const normalized = items.map((it: any) => ({
      productId: Number(it.productId),
      quantity: Number(it.quantity),
      unitCost: it.unitCost !== undefined && it.unitCost !== "" ? Number(it.unitCost) : null,
    }));
    for (const it of normalized) {
      if (!it.productId || isNaN(it.productId) || !it.quantity || isNaN(it.quantity) || it.quantity <= 0) {
        res.status(400).json({ message: "Cada renglón requiere un producto válido y una cantidad mayor a 0." });
        return;
      }
    }

    const branch = await prisma.branch.findUnique({ where: { id: bId } });
    if (!branch) {
      res.status(404).json({ message: "La sucursal seleccionada no existe." });
      return;
    }

    // Verificar que todos los productos existan
    const productIds = [...new Set(normalized.map((n) => n.productId))];
    const products = await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } });
    if (products.length !== productIds.length) {
      res.status(404).json({ message: "Uno o más productos no existen en el catálogo." });
      return;
    }

    const userId = req.user.userId;

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

    res.status(201).json({
      message: "Compra registrada. El inventario y el kardex fueron actualizados.",
      branch: branch.name,
      ...result,
    });
  } catch (error: any) {
    res.status(500).json({ message: "Error al registrar la compra.", error: error.message });
  }
};

// ===========================================================================
// PROVEEDORES (Suppliers)
// ===========================================================================
// =========================
// REGEX
// =========================
const NAME_REGEX = /^[a-zA-ZÀ-ÿÑñ\s]+$/;
const COMPANY_NAME_REGEX = /^[a-zA-ZÀ-ÿ0-9\s.-]+$/;
const RFC_REGEX = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\d{10}$/;
const ZIP_REGEX = /^\d{5}$/;
const CITY_STATE_REGEX = /^[a-zA-ZÀ-ÿÑñ\s]+$/;

// =========================
// INTERFACE
// =========================
interface SupplierValidationData {
  name?: string;
  rfc?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  contactName?: string;
}

// =========================
// VALIDADOR CENTRALIZADO
// =========================
const validateSupplierData = (
  data: SupplierValidationData,
  isUpdate = false
): string[] => {
  const errors: string[] = [];

  // =========================
  // Nombre
  // =========================
  if (!isUpdate || data.name !== undefined) {
    const name = data.name?.trim();

    if (!name) {
      errors.push("El nombre del proveedor es requerido.");
    } else if (name.length < 3) {
      errors.push("El nombre debe tener al menos 3 caracteres.");
    } else if (name.length > 100) {
      errors.push("El nombre no puede exceder 100 caracteres.");
    } else if (!COMPANY_NAME_REGEX.test(name)) {
      errors.push(
        "El nombre solo puede contener letras, números, espacios, puntos y guiones."
      );
    }
  }

  // =========================
  // RFC
  // =========================
  if (!isUpdate || data.rfc !== undefined) {
    const rfc = data.rfc?.trim().toUpperCase();

    if (!rfc) {
      errors.push("El RFC es requerido.");
    } else if (rfc.length !== 12 && rfc.length !== 13) {
      errors.push("El RFC debe tener 12 o 13 caracteres.");
    } else if (!RFC_REGEX.test(rfc)) {
      errors.push("El formato del RFC es inválido.");
    }
  }

  // =========================
  // Email
  // =========================
  if (!isUpdate || data.email !== undefined) {
    const email = data.email?.trim();

    if (!email) {
      errors.push("El correo electrónico es requerido.");
    } else if (email.length > 100) {
      errors.push("El correo no puede exceder 100 caracteres.");
    } else if (!EMAIL_REGEX.test(email)) {
      errors.push("El correo electrónico no es válido.");
    }
  }

  // =========================
  // Teléfono
  // =========================
  if (!isUpdate || data.phone !== undefined) {
    const phone = data.phone?.trim();

    if (!phone) {
      errors.push("El teléfono es requerido.");
    } else if (!PHONE_REGEX.test(phone)) {
      errors.push("El teléfono debe contener exactamente 10 dígitos.");
    }
  }

  // =========================
  // Dirección
  // =========================
  if (!isUpdate || data.address !== undefined) {
    const address = data.address?.trim();

    if (!address) {
      errors.push("La dirección es requerida.");
    } else if (address.length < 5) {
      errors.push("La dirección es muy corta.");
    } else if (address.length > 200) {
      errors.push("La dirección no puede exceder 200 caracteres.");
    }
  }

  // =========================
  // Ciudad
  // =========================
  if (!isUpdate || data.city !== undefined) {
    const city = data.city?.trim();

    if (!city) {
      errors.push("La ciudad es requerida.");
    } else if (city.length < 2) {
      errors.push("La ciudad es muy corta.");
    } else if (!CITY_STATE_REGEX.test(city)) {
      errors.push("La ciudad solo puede contener letras y espacios.");
    }
  }

  // =========================
  // Estado
  // =========================
  if (!isUpdate || data.state !== undefined) {
    const state = data.state?.trim();

    if (!state) {
      errors.push("El estado es requerido.");
    } else if (state.length < 2) {
      errors.push("El estado es muy corto.");
    } else if (!CITY_STATE_REGEX.test(state)) {
      errors.push("El estado solo puede contener letras y espacios.");
    }
  }

  // =========================
  // Código Postal
  // =========================
  if (!isUpdate || data.zipCode !== undefined) {
    const zipCode = data.zipCode?.trim();

    if (!zipCode) {
      errors.push("El código postal es requerido.");
    } else if (!ZIP_REGEX.test(zipCode)) {
      errors.push("El código postal debe contener exactamente 5 dígitos.");
    }
  }

  // =========================
  // Contacto
  // =========================
  if (!isUpdate || data.contactName !== undefined) {
    const contact = data.contactName?.trim();

    if (!contact) {
      errors.push("El nombre del contacto es requerido.");
    } else if (contact.length < 3) {
      errors.push("El nombre del contacto debe tener al menos 3 caracteres.");
    } else if (!NAME_REGEX.test(contact)) {
      errors.push("El nombre del contacto solo puede contener letras y espacios.");
    }
  }

  return errors;
};

// ===========================================================================
// LISTAR PROVEEDORES
// ===========================================================================

export const listSuppliers = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    const suppliers = await prisma.supplier.findMany({
      orderBy: {
        name: "asc",
      },
    });

    res.json(suppliers);
  } catch (error: any) {
    console.error(error);

    res.status(500).json({
      message: "Error al listar proveedores.",
      error: error.message,
    });
  }
};
// ===========================================================================
// CREAR PROVEEDOR
// ===========================================================================

export const createSupplier = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      name,
      rfc,
      email,
      phone,
      address,
      city,
      state,
      zipCode,
      contactName,
      active,
    } = req.body;

    // =========================
    // VALIDAR DATOS
    // =========================
    const validationErrors = validateSupplierData({
      name,
      rfc,
      email,
      phone,
      address,
      city,
      state,
      zipCode,
      contactName,
    });

    if (validationErrors.length > 0) {
      res.status(400).json({
        message: validationErrors[0],
        errors: validationErrors,
      });
      return;
    }

    // =========================
    // VALIDAR NOMBRE DUPLICADO
    // =========================
    const supplierByName = await prisma.supplier.findFirst({
      where: {
        name: String(name).trim(),
      },
    });

    if (supplierByName) {
      res.status(400).json({
        message: "Ya existe un proveedor con ese nombre.",
      });
      return;
    }

    // =========================
    // VALIDAR RFC DUPLICADO
    // =========================
    const supplierByRFC = await prisma.supplier.findFirst({
      where: {
        rfc: String(rfc).trim().toUpperCase(),
      },
    });

    if (supplierByRFC) {
      res.status(400).json({
        message: "Ya existe un proveedor con ese RFC.",
      });
      return;
    }

    // =========================
    // PREPARAR DATOS
    // =========================
    const supplierData = {
      name: String(name).trim(),
      rfc: String(rfc).trim().toUpperCase(),
      email: String(email).trim().toLowerCase(),
      phone: String(phone).trim(),
      address: String(address).trim(),
      city: String(city).trim(),
      state: String(state).trim(),
      zipCode: String(zipCode).trim(),
      contactName: String(contactName).trim(),
      active: active !== undefined ? Boolean(active) : true,
    };

    // =========================
    // CREAR
    // =========================
    const supplier = await prisma.supplier.create({
      data: supplierData,
    });

    res.status(201).json(supplier);
  } catch (error: any) {
    console.error(error);

    if (error.code === "P2002") {
      res.status(400).json({
        message: "Ya existe un proveedor registrado con esos datos.",
      });
      return;
    }

    res.status(500).json({
      message: "Error al crear proveedor.",
      error: error.message,
    });
  }
};
// ===========================================================================
// ACTUALIZAR PROVEEDOR
// ===========================================================================

export const updateSupplier = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = Number(req.params.id);

    if (isNaN(id)) {
      res.status(400).json({
        message: "ID de proveedor inválido.",
      });
      return;
    }

    const {
      name,
      rfc,
      email,
      phone,
      address,
      city,
      state,
      zipCode,
      contactName,
      active,
    } = req.body;

    // =========================
    // VALIDAR QUE HAYA DATOS
    // =========================
    const hasData = [
      name,
      rfc,
      email,
      phone,
      address,
      city,
      state,
      zipCode,
      contactName,
      active,
    ].some((value) => value !== undefined);

    if (!hasData) {
      res.status(400).json({
        message: "No se enviaron datos para actualizar.",
      });
      return;
    }

    // =========================
    // OBJETO PARA VALIDAR
    // =========================
    const updateValidation: SupplierValidationData = {};

    if (name !== undefined) updateValidation.name = name;
    if (rfc !== undefined) updateValidation.rfc = rfc;
    if (email !== undefined) updateValidation.email = email;
    if (phone !== undefined) updateValidation.phone = phone;
    if (address !== undefined) updateValidation.address = address;
    if (city !== undefined) updateValidation.city = city;
    if (state !== undefined) updateValidation.state = state;
    if (zipCode !== undefined) updateValidation.zipCode = zipCode;
    if (contactName !== undefined)
      updateValidation.contactName = contactName;

    const validationErrors = validateSupplierData(
      updateValidation,
      true
    );

    if (validationErrors.length > 0) {
      res.status(400).json({
        message: validationErrors[0],
        errors: validationErrors,
      });
      return;
    }

    // =========================
    // VALIDAR NOMBRE DUPLICADO
    // =========================
    if (name !== undefined) {
      const supplierByName = await prisma.supplier.findFirst({
        where: {
          name: String(name).trim(),
          NOT: {
            id,
          },
        },
      });

      if (supplierByName) {
        res.status(400).json({
          message: "Ya existe otro proveedor con ese nombre.",
        });
        return;
      }
    }

    // =========================
    // VALIDAR RFC DUPLICADO
    // =========================
    if (rfc !== undefined) {
      const supplierByRFC = await prisma.supplier.findFirst({
        where: {
          rfc: String(rfc).trim().toUpperCase(),
          NOT: {
            id,
          },
        },
      });

      if (supplierByRFC) {
        res.status(400).json({
          message: "Ya existe otro proveedor con ese RFC.",
        });
        return;
      }
    }

    // =========================
    // ARMAR UPDATE DATA
    // =========================
    const updateData: any = {};

    if (name !== undefined)
      updateData.name = String(name).trim();

    if (rfc !== undefined)
      updateData.rfc = String(rfc).trim().toUpperCase();

    if (email !== undefined)
      updateData.email = String(email).trim().toLowerCase();

    if (phone !== undefined)
      updateData.phone = String(phone).trim();

    if (address !== undefined)
      updateData.address = String(address).trim();

    if (city !== undefined)
      updateData.city = String(city).trim();

    if (state !== undefined)
      updateData.state = String(state).trim();

    if (zipCode !== undefined)
      updateData.zipCode = String(zipCode).trim();

    if (contactName !== undefined)
      updateData.contactName = String(contactName).trim();

    if (active !== undefined)
      updateData.active = Boolean(active);

    // =========================
    // ACTUALIZAR
    // =========================
    const supplier = await prisma.supplier.update({
      where: {
        id,
      },
      data: updateData,
    });

    res.json(supplier);
  } catch (error: any) {
    console.error(error);

    if (error.code === "P2025") {
      res.status(404).json({
        message: "Proveedor no encontrado.",
      });
      return;
    }

    if (error.code === "P2002") {
      res.status(400).json({
        message: "Ya existe un proveedor con esos datos.",
      });
      return;
    }

    res.status(500).json({
      message: "Error al actualizar proveedor.",
      error: error.message,
    });
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
            reason: `Compra ${purchase.reference} de ${purchase.supplier.name}. Costo unit: $${Number(detail.unitCost).toFixed(2)}`,
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
    const { sku, barcode, name, description, costPrice, sellPrice, trackingType, isReturnable, returnWindowDays, satProductKey, satUnitKey } = req.body;

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
          satProductKey: satProductKey && String(satProductKey).trim() ? String(satProductKey).trim() : "01010101",
          satUnitKey: satUnitKey && String(satUnitKey).trim() ? String(satUnitKey).trim() : "H87",
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
        satProductKey: newProduct.satProductKey,
        satUnitKey: newProduct.satUnitKey,
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
        satProductKey: product.satProductKey,
        satUnitKey: product.satUnitKey,
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

    const { name, description, barcode, costPrice, sellPrice, active, isReturnable, returnWindowDays, trackingType, satProductKey, satUnitKey } = req.body;

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
        satProductKey: satProductKey !== undefined ? String(satProductKey).trim() : existingProduct.satProductKey,
        satUnitKey: satUnitKey !== undefined ? String(satUnitKey).trim() : existingProduct.satUnitKey,
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
        satProductKey: updated.satProductKey,
        satUnitKey: updated.satUnitKey,
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
          reason: `Traslado a ${branchTo?.name ?? `sucursal ${toBranch}`}`,
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
          reason: `Traslado desde ${branchFrom?.name ?? `sucursal ${fromBranch}`}`,
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
