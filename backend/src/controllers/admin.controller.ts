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
        name: p.name,
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
      createdAt: c.createdAt,
    }));

    res.status(200).json({ customers: mapped });
  } catch (error: any) {
    res.status(500).json({ message: "Error al listar clientes.", error: error.message });
  }
};

export const createCustomer = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, phone, taxId, address, creditLimit } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ message: "El nombre del cliente es obligatorio." });
      return;
    }
    if (creditLimit !== undefined && creditLimit !== "" && isNaN(Number(creditLimit))) {
      res.status(400).json({ message: "El límite de crédito debe ser numérico." });
      return;
    }

    const customer = await prisma.customer.create({
      data: {
        name: name.trim(),
        email: trimQuery(email) ?? null,
        phone: trimQuery(phone) ?? null,
        taxId: trimQuery(taxId) ?? null,
        address: trimQuery(address) ?? null,
        creditLimit: creditLimit ? Number(creditLimit) : 0,
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
        createdAt: customer.createdAt,
      },
    });
  } catch (error: any) {
    res.status(500).json({ message: "Error al registrar el cliente.", error: error.message });
  }
};

// ===========================================================================
// CAJAS (sesiones de caja)
// ===========================================================================
export const listCashSessions = async (req: Request, res: Response): Promise<void> => {
  try {
    const branchId = parseBranch(req);
    const status = req.query.status as string | undefined;

    const where: any = {};
    if (branchId) where.branchId = branchId;
    if (status && status !== "all") where.status = status;

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
        createdAt: true,
        branch: { select: { name: true } },
      },
    });

    const mapped = users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      active: u.active,
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

    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ message: "El nombre de la sucursal es obligatorio." });
      return;
    }

    const branch = await prisma.branch.create({
      data: {
        name: name.trim(),
        address: trimQuery(address) ?? null,
        phone: trimQuery(phone) ?? null,
        active: typeof active === "boolean" ? active : true,
      },
    });

    res.status(201).json({ message: "Sucursal registrada exitosamente.", branch });
  } catch (error: any) {
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
    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ message: "El nombre de la sucursal es obligatorio." });
      return;
    }

    const branch = await prisma.branch.update({
      where: { id },
      data: {
        name: name.trim(),
        address: trimQuery(address) ?? null,
        phone: trimQuery(phone) ?? null,
        active: typeof active === "boolean" ? active : true,
      },
    });

    res.status(200).json({ message: "Sucursal actualizada exitosamente.", branch });
  } catch (error: any) {
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
    ]);

    const saleIds = completedSales.map((s) => s.id);

    let utilidad = 0;
    let topProducts: { id: number; name: string; unidades: number; importe: number }[] = [];

    if (saleIds.length > 0) {
      const [detailsForProfit, topRaw] = await Promise.all([
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
    }

    const ventasNetas = Number(totalsAgg._sum.totalAmount ?? 0);
    const ticketCount = totalsAgg._count._all;

    const branchNameById = new Map(branches.map((b) => [b.id, b.name]));

    res.status(200).json({
      range: { from: from.toISOString(), to: to.toISOString() },
      totals: {
        ventasNetas,
        impuestos: Number(totalsAgg._sum.taxAmount ?? 0),
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
    });
  } catch (error: any) {
    res.status(500).json({ message: "Error al generar los reportes.", error: error.message });
  }
};

// ===========================================================================
// ALTA DE EMPLEADO (reutiliza la tabla User; cifra password y PIN)
// ===========================================================================
export const createEmployee = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password, role, branchId, pinCode } = req.body;

    if (!name?.trim() || !email?.trim() || !password || !role || !branchId) {
      res.status(400).json({ message: "Nombre, correo, contraseña, rol y sucursal son obligatorios." });
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
        email: email.trim(),
        passwordHash,
        pinCode: pinHash,
        role,
        active: true,
        branchId: Number(branchId),
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
      select: { id: true, name: true, email: true, role: true, active: true, branch: { select: { name: true } } },
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

    res.status(200).json({
      employee: { id: user.id, name: user.name, email: user.email, role: user.role, active: user.active, branch: user.branch.name },
      summary: {
        salesCount: salesAgg._count._all,
        salesTotal: Number(salesAgg._sum.totalAmount ?? 0),
        cancelledCount,
        sessionsCount: sessions.length,
        openSessions,
        depositsCount: depositsAgg._count._all,
        depositsTotal: Number(depositsAgg._sum.amount ?? 0),
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

    const where: any = {};
    if (branchId) where.branchId = branchId;
    if (movementType && movementType !== "all") where.movementType = movementType;
    if (search) where.product = { OR: [{ name: { contains: search } }, { sku: { contains: search } }] };

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
    const where: any = {};
    if (branchId) where.branchId = branchId;

    const deposits = await prisma.bankDeposit.findMany({
      where,
      take: 100,
      orderBy: { createdAt: "desc" },
      include: { branch: { select: { name: true } } },
    });

    res.status(200).json({
      deposits: deposits.map((d) => ({
        id: d.id,
        accountMasked: `**** **** **** ${d.accountNumber.slice(-4)}`,
        targetName: d.targetName,
        amount: Number(d.amount),
        paymentType: d.paymentType,
        comments: d.comments,
        branch: d.branch.name,
        sessionId: d.cashSessionId,
        createdAt: d.createdAt,
      })),
    });
  } catch (error: any) {
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
