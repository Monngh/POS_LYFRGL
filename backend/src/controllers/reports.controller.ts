import { Request, Response } from "express";
import { parseReportDateRange, type ValidatedDateRange } from "../utils/dateRange.util";
import {
  getSalesReport,
  getProductsSoldReport,
  getSellerReport,
  getReceivablesReport,
} from "../services/reports.service";
import { getExecutiveSummary, getReportFilterOptions } from "../services/executiveSummary.service";
import { getSalesReport as getSalesReportDocument } from "../services/salesReport.service";
import { getProductsReport } from "../services/productsReport.service";
import { getInventoryReport } from "../services/inventoryReport.service";
import { getKardexReport } from "../services/kardexReport.service";
import { getPurchaseReport } from "../services/purchaseReport.service";
import { getPersonnelReport } from "../services/personnelReport.service";
import { renderHtmlToPdf } from "../services/pdf.service";

const parseBranchId = (req: Request): number | undefined => {
  if (req.user && req.user.role === "GERENTE") {
    return req.user.branchId;
  }
  const b = req.query.branchId as string | undefined;
  return b && b !== "all" && !isNaN(Number(b)) ? Number(b) : undefined;
};

export const parseAndValidateRange = (req: Request): ValidatedDateRange => {
  const startDateParam = req.query.startDate || req.query.from;
  const endDateParam = req.query.endDate || req.query.to;

  if (startDateParam !== undefined) {
    if (typeof startDateParam !== "string" || !startDateParam || isNaN(Date.parse(startDateParam))) {
      return { from: new Date(), to: new Date(), errorStatus: 400, errorMessage: "Fecha inicial o fecha final inválida." };
    }
  }

  if (endDateParam !== undefined) {
    if (typeof endDateParam !== "string" || !endDateParam || isNaN(Date.parse(endDateParam))) {
      return { from: new Date(), to: new Date(), errorStatus: 400, errorMessage: "Fecha inicial o fecha final inválida." };
    }
  }

  const now = new Date();
  const fromStr = typeof startDateParam === "string" && startDateParam ? startDateParam : null;
  const toStr = typeof endDateParam === "string" && endDateParam ? endDateParam : null;

  const from = fromStr
    ? new Date(`${fromStr}T00:00:00`)
    : new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
  const to = toStr ? new Date(`${toStr}T23:59:59`) : now;

  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return { from, to, errorStatus: 400, errorMessage: "Fecha inicial o fecha final inválida." };
  }

  if (from.getTime() > to.getTime()) {
    return { from, to, errorStatus: 400, errorMessage: "La fecha inicial no puede ser mayor que la fecha final." };
  }

  return { from, to };
};

export const reportSales = async (req: Request, res: Response): Promise<void> => {
  const branchId = parseBranchId(req);
  const range = parseReportDateRange(req.query);
  if (range.errorStatus) {
    res.status(range.errorStatus).json({ success: false, message: range.errorMessage });
    return;
  }
  const { from, to } = range;
  const status = req.query.status as string | undefined;

  let page = 1;
  let pageSize = 50;

  if (req.query.page !== undefined) {
    const parsedPage = Number(req.query.page);
    if (isNaN(parsedPage) || !Number.isInteger(parsedPage) || parsedPage < 1) {
      res.status(400).json({ success: false, message: "El parámetro page debe ser un número entero mayor o igual a 1." });
      return;
    }
    page = parsedPage;
  }

  if (req.query.pageSize !== undefined) {
    const parsedPageSize = Number(req.query.pageSize);
    if (isNaN(parsedPageSize) || !Number.isInteger(parsedPageSize) || parsedPageSize < 1) {
      res.status(400).json({ success: false, message: "El parámetro pageSize debe ser un número entero mayor o igual a 1." });
      return;
    }
    pageSize = parsedPageSize;
  }

  const safePageSize = Math.min(100, pageSize);

  try {
    const result = await getSalesReport({ from, to, branchId, page, pageSize: safePageSize, status });
    res.status(200).json({ rows: result.rows, data: result.rows, totals: result.totals, pagination: result.pagination });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al generar el reporte de ventas." });
  }
};

export const reportProductsSold = async (req: Request, res: Response): Promise<void> => {
  const branchId = parseBranchId(req);
  const range = parseReportDateRange(req.query);
  if (range.errorStatus) {
    res.status(range.errorStatus).json({ success: false, message: range.errorMessage });
    return;
  }
  const { from, to } = range;

  try {
    const result = await getProductsSoldReport({ from, to, branchId });
    res.status(200).json(result);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al generar el reporte de artículos vendidos." });
  }
};

export const reportBySeller = async (req: Request, res: Response): Promise<void> => {
  const branchId = parseBranchId(req);
  const range = parseReportDateRange(req.query);
  if (range.errorStatus) {
    res.status(range.errorStatus).json({ success: false, message: range.errorMessage });
    return;
  }
  const { from, to } = range;

  try {
    const result = await getSellerReport({ from, to, branchId });
    res.status(200).json(result);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al generar el reporte por vendedor." });
  }
};

const parseOptionalInt = (v: unknown): number | undefined => {
  if (typeof v !== "string" || !v || v === "all") return undefined;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

const parseOptionalText = (v: unknown, max = 120): string | undefined => {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t && t.length <= max ? t : undefined;
};

export const reportExecutiveSummary = async (req: Request, res: Response): Promise<void> => {
  const branchId = parseBranchId(req);
  const range = parseReportDateRange(req.query);
  if (range.errorStatus) {
    res.status(range.errorStatus).json({ success: false, message: range.errorMessage });
    return;
  }
  try {
    const result = await getExecutiveSummary({
      from: range.from,
      to: range.to,
      branchId,
      sellerId: parseOptionalInt(req.query.sellerId),
      categoryId: parseOptionalInt(req.query.categoryId),
      cashSessionId: parseOptionalInt(req.query.cashSessionId),
      paymentMethod: parseOptionalText(req.query.paymentMethod, 40),
      status: parseOptionalText(req.query.status, 20),
      customerSearch: parseOptionalText(req.query.customer),
      productSearch: parseOptionalText(req.query.product),
      search: parseOptionalText(req.query.search),
    });
    res.status(200).json(result);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al generar el resumen ejecutivo." });
  }
};

export const reportSalesDocument = async (req: Request, res: Response): Promise<void> => {
  const branchId = parseBranchId(req);
  const range = parseReportDateRange(req.query);
  if (range.errorStatus) {
    res.status(range.errorStatus).json({ success: false, message: range.errorMessage });
    return;
  }
  try {
    const result = await getSalesReportDocument({
      from: range.from,
      to: range.to,
      branchId,
      sellerId: parseOptionalInt(req.query.sellerId),
      categoryId: parseOptionalInt(req.query.categoryId),
      cashSessionId: parseOptionalInt(req.query.cashSessionId),
      paymentMethod: parseOptionalText(req.query.paymentMethod, 40),
      status: parseOptionalText(req.query.status, 20),
      customerSearch: parseOptionalText(req.query.customer),
      productSearch: parseOptionalText(req.query.product),
      search: parseOptionalText(req.query.search),
    });
    res.status(200).json(result);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al generar el reporte de ventas." });
  }
};

export const reportProductsDocument = async (req: Request, res: Response): Promise<void> => {
  const branchId = parseBranchId(req);
  const range = parseReportDateRange(req.query);
  if (range.errorStatus) {
    res.status(range.errorStatus).json({ success: false, message: range.errorMessage });
    return;
  }
  try {
    const result = await getProductsReport({
      from: range.from,
      to: range.to,
      branchId,
      sellerId: parseOptionalInt(req.query.sellerId),
      categoryId: parseOptionalInt(req.query.categoryId),
      cashSessionId: parseOptionalInt(req.query.cashSessionId),
      paymentMethod: parseOptionalText(req.query.paymentMethod, 40),
      customerSearch: parseOptionalText(req.query.customer),
      productSearch: parseOptionalText(req.query.product),
      search: parseOptionalText(req.query.search),
    });
    res.status(200).json(result);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al generar el reporte de artículos vendidos." });
  }
};

export const reportInventoryDocument = async (req: Request, res: Response): Promise<void> => {
  const branchId = parseBranchId(req);
  try {
    const result = await getInventoryReport({
      branchId,
      categoryId: parseOptionalInt(req.query.categoryId),
      search: parseOptionalText(req.query.search),
    });
    res.status(200).json(result);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al generar el reporte de existencias." });
  }
};

export const reportKardexDocument = async (req: Request, res: Response): Promise<void> => {
  const branchId = parseBranchId(req);
  const range = parseReportDateRange(req.query);
  if (range.errorStatus) {
    res.status(range.errorStatus).json({ success: false, message: range.errorMessage });
    return;
  }
  try {
    const result = await getKardexReport({
      from: range.from,
      to: range.to,
      branchId,
      movementType: parseOptionalText(req.query.movementType, 30),
      search: parseOptionalText(req.query.search),
    });
    res.status(200).json(result);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al generar el reporte de kardex." });
  }
};

export const reportPurchaseDocument = async (req: Request, res: Response): Promise<void> => {
  const branchId = parseBranchId(req);
  const range = parseReportDateRange(req.query);
  if (range.errorStatus) {
    res.status(range.errorStatus).json({ success: false, message: range.errorMessage });
    return;
  }
  try {
    const result = await getPurchaseReport({
      from: range.from,
      to: range.to,
      branchId,
      status: parseOptionalText(req.query.status, 20),
      search: parseOptionalText(req.query.search),
    });
    res.status(200).json(result);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al generar el reporte de compras." });
  }
};

export const reportPersonnelDocument = async (req: Request, res: Response): Promise<void> => {
  const branchId = parseBranchId(req);
  const range = parseReportDateRange(req.query);
  if (range.errorStatus) {
    res.status(range.errorStatus).json({ success: false, message: range.errorMessage });
    return;
  }
  try {
    const result = await getPersonnelReport({ from: range.from, to: range.to, branchId });
    res.status(200).json(result);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al generar el reporte de personal." });
  }
};

export const reportPdf = async (req: Request, res: Response): Promise<void> => {
  const { html, filename } = req.body ?? {};
  if (typeof html !== "string" || html.length < 40 || html.length > 14_000_000) {
    res.status(400).json({ message: "HTML del reporte inválido." });
    return;
  }
  try {
    const pdf = await renderHtmlToPdf(html);
    const safeName = (typeof filename === "string" ? filename : "Reporte").replace(/[^\w.-]/g, "_").slice(0, 120);
    const finalName = safeName.toLowerCase().endsWith(".pdf") ? safeName : `${safeName}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${finalName}"`);
    res.setHeader("Content-Length", pdf.length);
    res.status(200).end(pdf);
  } catch (error: any) {
    console.error("Error al generar PDF del reporte:", error?.message ?? error);
    res.status(500).json({ message: "No se pudo generar el PDF en el servidor." });
  }
};

export const reportFilterOptions = async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await getReportFilterOptions();
    res.status(200).json(result);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al cargar las opciones de filtros." });
  }
};

export const reportReceivables = async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await getReceivablesReport();
    res.status(200).json(result);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al generar el reporte de cobranza." });
  }
};
