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
          include: {
            product: {
              include: {
                productTaxes: {
                  include: {
                    taxType: true
                  }
                }
              }
            }
          }
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

    // Registrar o actualizar los datos fiscales del cliente en la DB si corresponde
    if (sale.customerId) {
      try {
        await prisma.customer.update({
          where: { id: sale.customerId },
          data: {
            taxId: customer.rfc.toUpperCase(),
            zipCode: customer.zip,
            taxRegime: customer.taxSystem,
            cfdiUse: customer.cfdiUse
          }
        });
      } catch (custErr) {
        console.error("Error al actualizar datos fiscales del cliente:", custErr);
      }
    }

    // --- MODO REAL: Facturapi REST API ---
    try {
      const paymentFormMap: Record<string, string> = {
        "EFECTIVO": "01", // Efectivo
        "TARJETA": "04",  // Tarjeta de crédito o débito
        "CREDITO": "99",  // Por definir
        "MIXTO": "01"     // Efectivo por defecto
      };

      const facturapiItems = sale.saleDetails.map((detail) => {
        const unitPrice = Number(detail.unitPrice);
        const applicableTaxes = detail.product.productTaxes.filter((pt) => pt.taxType.active);

        let totalTaxRate = 0;
        for (const pt of applicableTaxes) {
          totalTaxRate += Number(pt.taxType.rate);
        }

        const basePrice = totalTaxRate > 0 ? (unitPrice / (1 + totalTaxRate)) : unitPrice;

        const mappedTaxes = applicableTaxes.map((pt) => {
          const rateVal = Number(pt.taxType.rate);
          const nameUpper = pt.taxType.name.toUpperCase();

          if (nameUpper.includes("EXENTO")) {
            return {
              rate: 0,
              type: "IVA",
              exento: true,
              withholding: false
            };
          }

          let taxType = "IVA";
          if (nameUpper.includes("IEPS")) {
            taxType = "IEPS";
          } else if (nameUpper.includes("ISR")) {
            taxType = "ISR";
          }

          return {
            rate: rateVal,
            type: taxType,
            withholding: false
          };
        });

        // Fallback a IVA 16% si no hay impuestos asignados
        if (mappedTaxes.length === 0) {
          mappedTaxes.push({
            rate: 0.16,
            type: "IVA",
            withholding: false
          });
        }

        return {
          quantity: detail.quantity,
          product: {
            description: detail.product.name,
            price: Number(basePrice.toFixed(2)),
            product_key: detail.product.satProductKey || "01010101",
            unit_key: detail.product.satUnitKey || "H87",
            taxes: mappedTaxes
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

  /**
   * Generar y timbrar nota de crédito (CFDI de Egreso) de un ticket (Facturapi)
   */
  static async createCreditNote(saleId: number, _returnedItems: { name: string; quantity: number; unitPrice: number; discountAmount: number }[], returnId: number) {
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        customer: true,
        branch: true
      }
    });

    if (!sale) {
      throw new Error("La venta especificada no existe.");
    }

    if (!sale.cfdiUuid) {
      throw new Error("La venta original no cuenta con una factura timbrada. No es necesario emitir Nota de Crédito.");
    }

    const uuidParts = sale.cfdiUuid.split(":");
    const originalInvoiceId = uuidParts[1] || uuidParts[0];

    const rawApiKey = process.env.FACTURAPI_API_KEY;
    const apiKey = rawApiKey ? rawApiKey.replace(/['"]/g, "").trim() : "";

    if (!apiKey || apiKey === "") {
      throw new Error("API Key de Facturapi no configurada en las variables de entorno (.env).");
    }

    try {
      const paymentFormMap: Record<string, string> = {
        "EFECTIVO": "01",
        "TARJETA": "04",
        "CREDITO": "99",
        "MIXTO": "01"
      };

      const returnRecord = await prisma.return.findUnique({
        where: { id: returnId },
        include: {
          returnDetails: {
            include: {
              product: {
                include: {
                  productTaxes: {
                    include: {
                      taxType: true
                    }
                  }
                }
              }
            }
          }
        }
      });

      if (!returnRecord) {
        throw new Error("No se encontró el registro de devolución especificado.");
      }

      const facturapiItems = returnRecord.returnDetails.map((detail) => {
        const unitPrice = Number(detail.unitPrice);
        const quantity = detail.quantity;
        const discountPerUnit = Number(detail.discountAmount) / quantity;
        const netUnitPrice = unitPrice - discountPerUnit;

        const applicableTaxes = detail.product.productTaxes.filter((pt) => pt.taxType.active);

        let totalTaxRate = 0;
        for (const pt of applicableTaxes) {
          totalTaxRate += Number(pt.taxType.rate);
        }

        const basePrice = totalTaxRate > 0 ? (netUnitPrice / (1 + totalTaxRate)) : netUnitPrice;

        const mappedTaxes = applicableTaxes.map((pt) => {
          const rateVal = Number(pt.taxType.rate);
          const nameUpper = pt.taxType.name.toUpperCase();

          if (nameUpper.includes("EXENTO")) {
            return {
              rate: 0,
              type: "IVA",
              exento: true,
              withholding: false
            };
          }

          let taxType = "IVA";
          if (nameUpper.includes("IEPS")) {
            taxType = "IEPS";
          } else if (nameUpper.includes("ISR")) {
            taxType = "ISR";
          }

          return {
            rate: rateVal,
            type: taxType,
            withholding: false
          };
        });

        // Fallback a IVA 16% si no hay impuestos
        if (mappedTaxes.length === 0) {
          mappedTaxes.push({
            rate: 0.16,
            type: "IVA",
            withholding: false
          });
        }

        return {
          quantity,
          product: {
            description: `Devolución de: ${detail.product.name}`,
            price: Number(basePrice.toFixed(2)),
            product_key: detail.product.satProductKey || "01010101",
            unit_key: detail.product.satUnitKey || "H87",
            taxes: mappedTaxes
          }
        };
      });

      const defaultZip = (process.env.CORPORATE_ZIP || "42080").trim();
      const rfc = sale.customer?.taxId?.toUpperCase() || "XAXX010101000";
      const isGeneric = rfc === "XAXX010101000";

      const requestBody = {
        type: "E",
        customer: {
          legal_name: isGeneric ? "PÚBLICO GENERAL" : (sale.customer?.name.toUpperCase() || "PÚBLICO GENERAL"),
          tax_id: rfc,
          tax_system: isGeneric ? "616" : (sale.customer?.taxRegime || "616"),
          email: sale.cfdiEmail || sale.customer?.email || "clientes@fmb.com",
          address: {
            zip: isGeneric ? defaultZip : (sale.customer?.zipCode || defaultZip)
          }
        },
        items: facturapiItems,
        payment_form: paymentFormMap[sale.paymentMethod] || "01",
        use: isGeneric ? "S01" : (sale.customer?.cfdiUse || "G02"),
        relation: "01",
        related_documents: [originalInvoiceId]
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
        throw new Error(resData.message || "Error al comunicarse con Facturapi para Nota de Crédito.");
      }

      try {
        await fetch(`https://www.facturapi.io/v2/invoices/${resData.id}/email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": authHeader
          },
          body: JSON.stringify({ email: requestBody.customer.email })
        });
      } catch (emailErr) {
        console.error("Error al enviar correo de Nota de Crédito por Facturapi:", emailErr);
      }

      await prisma.return.update({
        where: { id: returnId },
        data: {
          cfdiUuid: `${resData.uuid}:${resData.id}`
        }
      });

      return {
        success: true,
        uuid: resData.uuid,
        pdfUrl: `https://www.facturapi.io/v2/invoices/${resData.uuid}/pdf`,
        xmlUrl: `https://www.facturapi.io/v2/invoices/${resData.uuid}/xml`
      };
    } catch (err: any) {
      console.error("Facturapi Credit Note Error:", err);
      throw new Error(`Error de Timbrado SAT (Nota de Crédito): ${err.message}`);
    }
  }
}

