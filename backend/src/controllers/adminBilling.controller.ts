import { Request, Response } from "express";
import { BillingService } from "../services/billing.service";

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
    const parsedBranchId = branchId ? parseInt(branchId) : req.user.branchId;
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
