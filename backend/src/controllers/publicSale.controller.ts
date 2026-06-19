import { Request, Response } from "express";
import { prisma } from "../app";
import { BillingService } from "../services/billing.service";

// =========================
// REGEX PARA VALIDACIONES
// =========================
const RFC_REGEX = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
const NAME_REGEX = /^[a-zA-ZÀ-ÿÑñ\s]+$/;
const ZIP_REGEX = /^\d{5}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVOICE_ALREADY_MESSAGE = "Esta compra ya fue facturada. Puedes consultar o descargar tu factura buscando el folio del ticket en el apartado de Mis facturas.";
const INVOICE_EXPIRED_MESSAGE = "El periodo para facturar esta compra ha vencido. Solo se puede facturar dentro de los 30 días naturales posteriores a la emisión del ticket.";

const getInvoiceDeadline = (purchaseDate: Date) => {
  const limitDate = new Date(purchaseDate);
  limitDate.setDate(limitDate.getDate() + 30);
  return limitDate;
};

const formatDateOnly = (date: Date) => date.toISOString().split("T")[0];

const isCancelledSale = (status: string) => status.toUpperCase().includes("CANCEL");

/**
 * Validar RFC
 */
const validateRFCBackend = (rfc: string): { valid: boolean; message: string } => {
  const cleaned = rfc.toUpperCase().replace(/\s+/g, "");
  if (!cleaned) {
    return { valid: false, message: "El RFC es obligatorio." };
  }
  if (cleaned.length !== 12 && cleaned.length !== 13) {
    return { valid: false, message: "El RFC debe tener 12 o 13 caracteres." };
  }
  if (!RFC_REGEX.test(cleaned)) {
    return { valid: false, message: "El formato del RFC es inválido. Solo letras y números." };
  }
  return { valid: true, message: "" };
};

/**
 * Validar Nombre/Razón Social
 */
const validateNameBackend = (name: string): { valid: boolean; message: string } => {
  const cleaned = name.trim();
  if (!cleaned) {
    return { valid: false, message: "El nombre o razón social es obligatorio." };
  }
  if (cleaned.length < 3) {
    return { valid: false, message: "El nombre debe tener al menos 3 caracteres." };
  }
  if (!NAME_REGEX.test(cleaned)) {
    return { valid: false, message: "El nombre solo puede contener letras y espacios." };
  }
  return { valid: true, message: "" };
};

/**
 * Validar Código Postal
 */
const validateZipBackend = (zip: string): { valid: boolean; message: string } => {
  const cleaned = zip.trim();
  if (!cleaned) {
    return { valid: false, message: "El código postal es obligatorio." };
  }
  if (!ZIP_REGEX.test(cleaned)) {
    return { valid: false, message: "El código postal debe contener exactamente 5 dígitos." };
  }
  return { valid: true, message: "" };
};

/**
 * Validar Email
 */
const validateEmailBackend = (email: string): { valid: boolean; message: string } => {
  const cleaned = email.trim().toLowerCase();
  if (!cleaned) {
    return { valid: false, message: "El correo electrónico es obligatorio." };
  }
  if (!EMAIL_REGEX.test(cleaned)) {
    return { valid: false, message: "El correo electrónico no es válido." };
  }
  if (/[^\x00-\x7F]/.test(cleaned)) {
    return { valid: false, message: "El correo no debe contener emojis ni caracteres especiales." };
  }
  return { valid: true, message: "" };
};

/**
 * Obtener detalles de un ticket de venta para el cliente
 */
export const getTicketDetails = async (req: Request, res: Response): Promise<void> => {
  const { invoiceNumber } = req.params;

  if (!invoiceNumber) {
    res.status(400).json({ message: "El folio del ticket es requerido." });
    return;
  }

  // Validar formato del folio (solo letras, números y guiones)
  const folioRegex = /^[a-zA-Z0-9-]+$/;
  if (!folioRegex.test(invoiceNumber)) {
    res.status(400).json({ message: "El folio solo puede contener letras, números y guiones." });
    return;
  }

  try {
    const sale = await prisma.sale.findUnique({
      where: { invoiceNumber },
      include: {
        saleDetails: {
          include: {
            product: {
              select: { name: true, sku: true }
            }
          }
        },
        branch: {
          select: { name: true }
        }
      }
    });

    if (!sale) {
      res.status(404).json({ success: false, message: "No se encontró una compra con el folio proporcionado." });
      return;
    }

    if (isCancelledSale(sale.status)) {
      res.status(400).json({ success: false, message: "No se puede facturar una compra cancelada." });
      return;
    }

    if (sale.status !== "COMPLETADA") {
      res.status(400).json({ success: false, message: "Solo se pueden facturar compras completadas." });
      return;
    }

    if (sale.cfdiUuid) {
      const satUuid = sale.cfdiUuid.split(":")[0];
      res.status(400).json({
        success: false,
        message: INVOICE_ALREADY_MESSAGE,
        cfdiUuid: satUuid
      });
      return;
    }

    const invoiceDeadline = getInvoiceDeadline(sale.createdAt);
    if (new Date() > invoiceDeadline) {
      res.status(400).json({ success: false, message: INVOICE_EXPIRED_MESSAGE });
      return;
    }

    res.status(200).json({
      id: sale.id,
      invoiceNumber: sale.invoiceNumber,
      createdAt: sale.createdAt,
      invoiceDeadline: formatDateOnly(invoiceDeadline),
      totalAmount: Number(sale.totalAmount),
      taxAmount: Number(sale.taxAmount),
      branchName: sale.branch.name,
      items: sale.saleDetails.map(d => ({
        name: d.product.name,
        sku: d.product.sku,
        quantity: d.quantity,
        unitPrice: Number(d.unitPrice),
        total: Number(d.unitPrice) * d.quantity
      }))
    });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al recuperar detalles del ticket." });
  }
};

/**
 * Procesar la solicitud de autofacturación del cliente
 */
export const issueTicketInvoice = async (req: Request, res: Response): Promise<void> => {
  const { saleId, rfc, legalName, taxSystem, zip, email, cfdiUse } = req.body;
  const numericSaleId = Number(saleId);

  if (!Number.isInteger(numericSaleId) || numericSaleId <= 0) {
    res.status(404).json({
      success: false,
      message: "No se encontró una compra con el folio proporcionado."
    });
    return;
  }

  try {
    const sale = await prisma.sale.findUnique({
      where: { id: numericSaleId },
      select: {
        id: true,
        status: true,
        cfdiUuid: true,
        createdAt: true,
      }
    });

    if (!sale) {
      res.status(404).json({
        success: false,
        message: "No se encontró una compra con el folio proporcionado."
      });
      return;
    }

    if (isCancelledSale(sale.status)) {
      res.status(400).json({
        success: false,
        message: "No se puede facturar una compra cancelada."
      });
      return;
    }

    if (sale.status !== "COMPLETADA") {
      res.status(400).json({
        success: false,
        message: "Solo se pueden facturar compras completadas."
      });
      return;
    }

    if (sale.cfdiUuid) {
      res.status(400).json({
        success: false,
        message: INVOICE_ALREADY_MESSAGE
      });
      return;
    }

    const invoiceDeadline = getInvoiceDeadline(sale.createdAt);
    if (new Date() > invoiceDeadline) {
      res.status(400).json({
        success: false,
        message: INVOICE_EXPIRED_MESSAGE
      });
      return;
    }

    // Validar que todos los campos estén presentes
    if (!rfc || !legalName || !taxSystem || !zip || !email || !cfdiUse) {
      res.status(400).json({ success: false, message: "Todos los campos de facturación son requeridos." });
      return;
    }

    // Validar RFC
    const rfcValidation = validateRFCBackend(rfc);
    if (!rfcValidation.valid) {
      res.status(400).json({ success: false, message: rfcValidation.message });
      return;
    }

    // Validar Nombre/Razón Social
    const nameValidation = validateNameBackend(legalName);
    if (!nameValidation.valid) {
      res.status(400).json({ success: false, message: nameValidation.message });
      return;
    }

    // Validar Código Postal
    const zipValidation = validateZipBackend(zip);
    if (!zipValidation.valid) {
      res.status(400).json({ success: false, message: zipValidation.message });
      return;
    }

    // Validar Email
    const emailValidation = validateEmailBackend(email);
    if (!emailValidation.valid) {
      res.status(400).json({ success: false, message: emailValidation.message });
      return;
    }

    const result = await BillingService.createInvoice(sale.id, {
      rfc: rfc.trim().toUpperCase(),
      legalName: legalName.trim().toUpperCase(),
      taxSystem,
      zip: zip.trim(),
      email: email.trim().toLowerCase(),
      cfdiUse
    });

    res.status(200).json({
      ...result,
      success: true,
      message: result.mode === "real"
        ? "Factura timbrada exitosamente y enviada al correo del cliente."
        : "Factura simulada exitosamente (Modo Demo). Descarga tus archivos abajo.",
      invoiceDeadline: formatDateOnly(invoiceDeadline),
    });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message || "Error interno del servidor." });
  }
};

/**
 * Proxy para descargar el PDF real desde Facturapi sin exponer la API Key en el frontend
 */
export const getInvoicePdf = async (req: Request, res: Response): Promise<void> => {
  const { uuid } = req.params;

  try {
    const sale = await prisma.sale.findFirst({
      where: {
        cfdiUuid: {
          contains: uuid
        }
      }
    });

    if (!sale || !sale.cfdiUuid) {
      res.status(404).send("Factura no encontrada.");
      return;
    }

    const apiKey = process.env.FACTURAPI_API_KEY;
    if (!apiKey) {
      res.status(500).send("API Key no configurada.");
      return;
    }

    const cleanApiKey = apiKey.replace(/['"]/g, "").trim();
    const authHeader = "Bearer " + cleanApiKey;

    const parts = sale.cfdiUuid.split(":");
    const facturapiId = parts[0] === "GLOBAL" ? parts[2] : (parts[1] || parts[0]);

    const response = await fetch(`https://www.facturapi.io/v2/invoices/${facturapiId}/pdf`, {
      method: "GET",
      headers: {
        "Authorization": authHeader
      }
    });

    if (!response.ok) {
      res.status(response.status).send("Error al descargar el PDF desde Facturapi.");
      return;
    }

    const buffer = await response.arrayBuffer();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=factura-${uuid}.pdf`);
    res.send(Buffer.from(buffer));
  } catch (err: any) {
    res.status(500).send("Error interno al obtener PDF.");
  }
};

/**
 * Proxy para descargar el XML real desde Facturapi sin exponer la API Key en el frontend
 */
export const getInvoiceXml = async (req: Request, res: Response): Promise<void> => {
  const { uuid } = req.params;

  try {
    const sale = await prisma.sale.findFirst({
      where: {
        cfdiUuid: {
          contains: uuid
        }
      }
    });

    if (!sale || !sale.cfdiUuid) {
      res.status(404).send("Factura no encontrada.");
      return;
    }

    const apiKey = process.env.FACTURAPI_API_KEY;
    if (!apiKey) {
      res.status(500).send("API Key no configurada.");
      return;
    }

    const cleanApiKey = apiKey.replace(/['"]/g, "").trim();
    const authHeader = "Bearer " + cleanApiKey;

    const parts = sale.cfdiUuid.split(":");
    const facturapiId = parts[0] === "GLOBAL" ? parts[2] : (parts[1] || parts[0]);

    const response = await fetch(`https://www.facturapi.io/v2/invoices/${facturapiId}/xml`, {
      method: "GET",
      headers: {
        "Authorization": authHeader
      }
    });

    if (!response.ok) {
      res.status(response.status).send("Error al descargar el XML desde Facturapi.");
      return;
    }

    const text = await response.text();
    res.setHeader("Content-Type", "application/xml");
    res.setHeader("Content-Disposition", `attachment; filename=factura-${uuid}.xml`);
    res.send(text);
  } catch (err: any) {
    res.status(500).send("Error interno al obtener XML.");
  }
};
