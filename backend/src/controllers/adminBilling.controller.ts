import { Request, Response } from "express";
import { BillingService } from "../services/billing.service";
import { prisma } from "../app";

/**
 * [ADMIN] Timbrar Factura Global para un rango de fechas y sucursal
 */
export const createGlobalInvoiceController = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }

  const { startDate, endDate, periodicity, month, year, branchId } = req.body;

  if (!startDate || !endDate || !periodicity || !month || !year) {
    res.status(400).json({ message: "Todos los campos (fecha inicio, fin, periodicidad, mes, año) son obligatorios." });
    return;
  }

  try {
    const parsedBranchId = branchId ? parseInt(branchId) : undefined;
    
    // Usar la misma lógica de zona horaria local que listSales
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T23:59:59.999`);

    const result = await BillingService.createGlobalInvoice(
      parsedBranchId,
      start,
      end,
      periodicity,
      month,
      year
    );

    res.status(200).json({
      success: true,
      message: "Factura Global timbrada exitosamente.",
      cfdiUuid: result.uuid,
      pdfUrl: result.pdfUrl,
      xmlUrl: result.xmlUrl
    });
  } catch (error: any) {
    console.error("Error al procesar Factura Global:", error);
    res.status(500).json({ message: error.message || "Error al generar Factura Global.", error: error.message });
  }
};

/**
 * [ADMIN] Obtener historial de facturación (Agrupado por UUID)
 */
export const getBillingHistoryController = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }

  try {
    // Buscar todas las ventas que tienen factura generada, ordenadas por fecha de actualización descendente
    const billedSales = await prisma.sale.findMany({
      where: {
        cfdiUuid: { not: null }
      },
      include: {
        customer: true
      },
      orderBy: {
        updatedAt: 'desc'
      },
      take: 500 // Límite por rendimiento
    });

    // Agrupar por cfdiUuid
    const historyMap = new Map<string, any>();

    for (const sale of billedSales) {
      const uuidStr = sale.cfdiUuid as string;
      
      let invoiceType = "Individual";
      let actualUuid = uuidStr;
      
      // Manejar formato de facturas globales ("GLOBAL:{uuid}:{id}")
      if (uuidStr.startsWith("GLOBAL:")) {
        invoiceType = "Global";
        const parts = uuidStr.split(":");
        actualUuid = parts[1];
      } else {
        const parts = uuidStr.split(":");
        actualUuid = parts[0];
      }

      if (!historyMap.has(uuidStr)) {
        historyMap.set(uuidStr, {
          uuid: actualUuid,
          type: invoiceType,
          date: sale.updatedAt, // Fecha en que se timbró (aprox)
          customer: invoiceType === "Global" ? "Público General" : (sale.customer?.name || "Público General"),
          totalAmount: Number(sale.totalAmount),
          taxAmount: Number(sale.taxAmount),
          ticketsCount: 1,
          ticketsInvolved: [sale.invoiceNumber]
        });
      } else {
        const existing = historyMap.get(uuidStr);
        existing.totalAmount += Number(sale.totalAmount);
        existing.taxAmount += Number(sale.taxAmount);
        existing.ticketsCount += 1;
        existing.ticketsInvolved.push(sale.invoiceNumber);
        // Usar la fecha más reciente
        if (sale.updatedAt > existing.date) {
          existing.date = sale.updatedAt;
        }
      }
    }

    // Convertir a array y ordenar por fecha descendente
    const historyArray = Array.from(historyMap.values()).sort((a, b) => b.date.getTime() - a.date.getTime());

    res.status(200).json({
      success: true,
      data: historyArray
    });

  } catch (error: any) {
    console.error("Error al obtener historial de facturación:", error);
    res.status(500).json({ message: "Error al obtener historial de facturación." });
  }
};
