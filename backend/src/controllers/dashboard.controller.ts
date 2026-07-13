import { Request, Response } from "express";
import { prisma } from "../app";

/**
 * Panel Administrativo Central
 * ----------------------------
 * Consolida las métricas empresariales del POS leyendo directamente de SQL Server
 * mediante Prisma. Disponible solo para perfiles ADMIN / GERENTE.
 *
 * Soporta el filtro opcional ?branchId= para acotar las métricas a una sucursal.
 * Las gráficas comparativas (ventas por sucursal) siempre muestran todas las sucursales.
 */
export const getAdminMetrics = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }

  try {
    // -----------------------------------------------------------------------
    // Parámetros y ventanas de tiempo
    // -----------------------------------------------------------------------
    const rawBranch = req.query.branchId as string | undefined;
    const branchId = rawBranch && rawBranch !== "all" ? Number(rawBranch) : undefined;
    const branchFilter = branchId ? { branchId } : {};

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const dayOfWeek = startOfToday.getDay(); // 0 = Dom, 1 = Lun, ..., 6 = Sáb
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const startOfWeekWindow = new Date(startOfToday);
    startOfWeekWindow.setDate(startOfToday.getDate() - daysToMonday); // retrocede al lunes

    const COMPLETADA = "COMPLETADA";

    // -----------------------------------------------------------------------
    // Consultas independientes en paralelo
    // -----------------------------------------------------------------------
    const [
      todayAgg,
      monthAgg,
      monthSales,
      productosActivos,
      clientesNuevos,
      inventories,
      weekSales,
      branches,
      ventasPorSucursalRaw,
      promocionesActivas,
    ] = await Promise.all([
      // Ventas y tickets de hoy
      prisma.sale.aggregate({
        where: { ...branchFilter, status: COMPLETADA, createdAt: { gte: startOfToday } },
        _sum: { totalAmount: true },
        _count: { _all: true },
      }),
      // Ventas del mes
      prisma.sale.aggregate({
        where: { ...branchFilter, status: COMPLETADA, createdAt: { gte: startOfMonth } },
        _sum: { totalAmount: true },
      }),
      // Ventas del mes (solo ids) para utilidad y top productos
      prisma.sale.findMany({
        where: { ...branchFilter, status: COMPLETADA, createdAt: { gte: startOfMonth } },
        select: { id: true },
      }),
      // Productos activos en catálogo
      prisma.product.count({ where: { active: true } }),
      // Clientes nuevos en el mes
      prisma.customer.count({ where: { createdAt: { gte: startOfMonth } } }),
      // Inventarios (para detectar stock bajo comparando dos columnas en JS)
      prisma.inventory.findMany({
        where: { ...branchFilter },
        select: { quantity: true, minStock: true },
      }),
      // Ventas de la semana natural (Lun–Dom) para la gráfica
      prisma.sale.findMany({
        where: { ...branchFilter, status: COMPLETADA, createdAt: { gte: startOfWeekWindow } },
        select: { createdAt: true, totalAmount: true },
      }),
      // Catálogo de sucursales activas (para etiquetas y selector)
      prisma.branch.findMany({
        where: { active: true },
        select: { id: true, name: true },
        orderBy: { id: "asc" },
      }),
      // Ventas del mes agrupadas por sucursal (comparativo, siempre todas)
      prisma.sale.groupBy({
        by: ["branchId"],
        where: { status: COMPLETADA, createdAt: { gte: startOfMonth } },
        _sum: { totalAmount: true },
      }),
      // Promociones vigentes ahora mismo (activas y dentro de su vigencia)
      prisma.promotion.count({
        where: { isActive: true, startDate: { lte: now }, endDate: { gte: now } },
      }),
    ]);

    // -----------------------------------------------------------------------
    // Métricas escalares
    // -----------------------------------------------------------------------
    const ventasHoy = Number(todayAgg._sum.totalAmount ?? 0);
    const ticketsHoy = todayAgg._count._all;
    const ventasMes = Number(monthAgg._sum.totalAmount ?? 0);
    const ticketPromedio = ticketsHoy > 0 ? ventasHoy / ticketsHoy : 0;
    const inventarioBajo = inventories.filter((i) => i.quantity <= i.minStock).length;

    // -----------------------------------------------------------------------
    // Utilidad del mes y productos más vendidos (sobre las ventas del mes)
    // -----------------------------------------------------------------------
    const monthSaleIds = monthSales.map((s) => s.id);

    let utilidadMes = 0;
    let productosMasVendidos: { id: number; name: string; unidades: number }[] = [];

    if (monthSaleIds.length > 0) {
      const [detailsForProfit, topProductsRaw] = await Promise.all([
        prisma.saleDetail.findMany({
          where: { saleId: { in: monthSaleIds } },
          select: { quantity: true, unitPrice: true, costPrice: true },
        }),
        prisma.saleDetail.groupBy({
          by: ["productId"],
          where: { saleId: { in: monthSaleIds } },
          _sum: { quantity: true },
          orderBy: { _sum: { quantity: "desc" } },
          take: 5,
        }),
      ]);

      utilidadMes = detailsForProfit.reduce(
        (acc, d) => acc + (Number(d.unitPrice) - Number(d.costPrice)) * d.quantity,
        0
      );

      const topIds = topProductsRaw.map((t) => t.productId);
      const topProductsInfo = await prisma.product.findMany({
        where: { id: { in: topIds } },
        select: { id: true, name: true },
      });
      const nameById = new Map(topProductsInfo.map((p) => [p.id, p.name]));

      productosMasVendidos = topProductsRaw.map((t) => ({
        id: t.productId,
        name: nameById.get(t.productId) ?? `Producto #${t.productId}`,
        unidades: Number(t._sum.quantity ?? 0),
      }));
    }

    // -----------------------------------------------------------------------
    // Gráfica: semana natural Lun–Dom
    // -----------------------------------------------------------------------
    const dayLabels = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    const week: { label: string; date: string; total: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeekWindow);
      d.setDate(d.getDate() + i);
      week.push({ label: dayLabels[d.getDay()], date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`, total: 0 });
    }
    const indexByDate = new Map(week.map((w, idx) => [w.date, idx]));
    for (const s of weekSales) {
      const dt = new Date(s.createdAt);
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
      const idx = indexByDate.get(key);
      if (idx !== undefined) week[idx].total += Number(s.totalAmount);
    }

    // -----------------------------------------------------------------------
    // Ventas por sucursal (todas las sucursales activas, 0 si no hubo ventas)
    // -----------------------------------------------------------------------
    const totalByBranch = new Map(
      ventasPorSucursalRaw.map((g) => [g.branchId, Number(g._sum.totalAmount ?? 0)])
    );
    const ventasPorSucursal = branches.map((b) => ({
      id: b.id,
      name: b.name,
      total: totalByBranch.get(b.id) ?? 0,
    }));

    // -----------------------------------------------------------------------
    // Respuesta consolidada
    // -----------------------------------------------------------------------
    res.status(200).json({
      metrics: {
        ventasHoy,
        ventasMes,
        utilidadMes,
        ticketsHoy,
        ticketPromedio,
        productosActivos,
        clientesNuevos,
        inventarioBajo,
        promocionesActivas,
      },
      ventas7dias: week,
      ventasPorSucursal,
      productosMasVendidos,
      branches,
    });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al cargar las métricas administrativas." });
  }
};
