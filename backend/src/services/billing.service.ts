import { prisma } from "../app";

interface InvoiceCustomerData {
  rfc: string;
  legalName: string;
  taxSystem: string;
  zip: string;
  email: string;
  cfdiUse: string;
}

export class BillingService {
  /**
   * Generar y timbrar factura de un ticket (siempre usando API real)
   */
  static async createInvoice(saleId: number, customer: InvoiceCustomerData) {
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        saleDetails: {
          include: { product: true }
        },
        branch: true
      }
    });

    if (!sale) {
      throw new Error("La venta especificada no existe.");
    }

    if (sale.cfdiUuid) {
      throw new Error("Este ticket ya cuenta con una factura activa.");
    }

    const rawApiKey = process.env.FACTURAPI_API_KEY;
    const apiKey = rawApiKey ? rawApiKey.replace(/['"]/g, "").trim() : "";

    if (!apiKey || apiKey === "") {
      throw new Error("API Key de Facturapi no configurada en las variables de entorno (.env). El sistema está configurado en modo estrictamente real.");
    }

    // --- MODO REAL: Facturapi REST API ---
    try {
      const paymentFormMap: Record<string, string> = {
        "EFECTIVO": "01", // Efectivo
        "TARJETA": "04",  // Tarjeta de crédito o 28 (Tarjeta de débito)
        "CREDITO": "99",  // Por definir
        "MIXTO": "01"     // Efectivo por defecto
      };

      const facturapiItems = sale.saleDetails.map((detail) => {
        const unitPrice = Number(detail.unitPrice);
        const basePrice = unitPrice / 1.16;

        return {
          quantity: detail.quantity,
          product: {
            description: detail.product.name,
            price: Number(basePrice.toFixed(2)),
            product_key: "01010101", // Clave del SAT genérica
            taxes: [
              {
                rate: 0.16,
                type: "IVA",
                withholding: false
              }
            ]
          }
        };
      });

      const requestBody = {
        customer: {
          legal_name: customer.legalName.toUpperCase(),
          tax_id: customer.rfc.toUpperCase(),
          tax_system: customer.taxSystem,
          email: customer.email,
          address: {
            zip: customer.zip
          }
        },
        items: facturapiItems,
        payment_form: paymentFormMap[sale.paymentMethod] || "01",
        use: customer.cfdiUse
      };

      const authHeader = "Bearer " + apiKey;
      
      const response = await fetch("https://www.facturapi.io/v2/invoices", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader
        },
        body: JSON.stringify(requestBody)
      });

      const resData = await response.json() as any;

      if (!response.ok) {
        throw new Error(resData.message || "Error al comunicarse con Facturapi.");
      }

      // Enviar por correo electrónico usando el endpoint de Facturapi
      try {
        await fetch(`https://www.facturapi.io/v2/invoices/${resData.id}/email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": authHeader
          },
          body: JSON.stringify({ email: customer.email })
        });
      } catch (emailErr) {
        console.error("Error al enviar correo por Facturapi:", emailErr);
      }

      // Actualizar la venta con los datos del CFDI real
      await prisma.sale.update({
        where: { id: sale.id },
        data: {
          cfdiUuid: `${resData.uuid}:${resData.id}`,
          cfdiEmail: customer.email
        }
      });

      return {
        success: true,
        uuid: resData.uuid,
        pdfUrl: `https://www.facturapi.io/v2/invoices/${resData.uuid}/pdf`,
        xmlUrl: `https://www.facturapi.io/v2/invoices/${resData.uuid}/xml`,
        mode: "real"
      };
    } catch (err: any) {
      console.error("Facturapi Error:", err);
      throw new Error(`Error de Facturación SAT (API Real): ${err.message}`);
    }
  }
}
