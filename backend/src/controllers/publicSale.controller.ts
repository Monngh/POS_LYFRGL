import { Request, Response } from "express";
import { prisma } from "../app";
import { BillingService } from "../services/billing.service";

/**
 * Obtener detalles de un ticket de venta para el cliente
 */
export const getTicketDetails = async (req: Request, res: Response): Promise<void> => {
  const { invoiceNumber } = req.params;

  if (!invoiceNumber) {
    res.status(400).json({ message: "El folio del ticket es requerido." });
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
      res.status(404).json({ message: "No se encontró ningún ticket de venta con ese folio." });
      return;
    }

    if (sale.status === "CANCELADA") {
      res.status(400).json({ message: "Este ticket de venta fue cancelado y no puede ser facturado." });
      return;
    }

    if (sale.cfdiUuid) {
      const satUuid = sale.cfdiUuid.split(":")[0];
      res.status(400).json({
        message: "Este ticket ya ha sido facturado anteriormente.",
        cfdiUuid: satUuid,
        cfdiEmail: sale.cfdiEmail
      });
      return;
    }

    // Validar antigüedad del ticket (máximo 30 días)
    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() - 30);
    if (sale.createdAt < limitDate) {
      res.status(400).json({ message: "El periodo de facturación para este ticket ha vencido (máximo 30 días desde la compra)." });
      return;
    }

    res.status(200).json({
      id: sale.id,
      invoiceNumber: sale.invoiceNumber,
      createdAt: sale.createdAt,
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
    res.status(500).json({ message: "Error al recuperar detalles del ticket.", error: error.message });
  }
};

/**
 * Procesar la solicitud de autofacturación del cliente
 */
export const issueTicketInvoice = async (req: Request, res: Response): Promise<void> => {
  const { saleId, rfc, legalName, taxSystem, zip, email, cfdiUse } = req.body;

  if (!saleId || !rfc || !legalName || !taxSystem || !zip || !email || !cfdiUse) {
    res.status(400).json({ message: "Todos los campos de facturación son requeridos." });
    return;
  }

  // Validación básica de RFC
  const rfcRegex = /^[A-Z&Ñ]{3,4}[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[A-Z0-9]{3}$/i;
  if (!rfcRegex.test(rfc)) {
    res.status(400).json({ message: "El RFC ingresado no tiene un formato válido para México." });
    return;
  }

  try {
    const result = await BillingService.createInvoice(Number(saleId), {
      rfc,
      legalName,
      taxSystem,
      zip,
      email,
      cfdiUse
    });

    res.status(200).json({
      message: result.mode === "real" 
        ? "Factura timbrada exitosamente y enviada al correo del cliente."
        : "Factura simulada exitosamente (Modo Demo). Descarga tus archivos abajo.",
      ...result
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
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
