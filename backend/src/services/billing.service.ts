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
            product: true,
            saleDetailTaxes: true
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
    let customerId = sale.customerId;
    const isGenericRfc = customer.rfc.toUpperCase() === "XAXX010101000" || customer.rfc.toUpperCase() === "XEXX010101000";

    if (!customerId && !isGenericRfc) {
      // Ya no intentamos asociar la venta a un cliente al azar solo por coincidir el RFC.
      // Si la venta se hizo al "Público general" (customerId = null), se queda así.
      // Esto evita que si dos clientes tienen el mismo RFC (ej. XAXX010101000), se asigne al incorrecto.
    }

    if (customerId) {
      try {
        await prisma.customer.update({
          where: { id: customerId },
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
      // DEBUG: dump raw sale details from DB to inspect stored prices/discounts
      try {
        const rawDetails = sale.saleDetails.map(d => ({
          id: d.id,
          productName: d.product?.name,
          unitPrice: Number(d.unitPrice),
          discountAmount: Number(d.discountAmount || 0),
          quantity: d.quantity,
        }));
        console.debug("[BillingService] Raw sale details:", JSON.stringify(rawDetails, null, 2));
      } catch (dbgErr) {
        console.error("[BillingService] Error logging raw sale details:", dbgErr);
      }
      const paymentFormMap: Record<string, string> = {
        "EFECTIVO": "01", // Efectivo
        "TARJETA": "04",  // Tarjeta de crédito o débito
        "CREDITO": "99",  // Por definir
        "MIXTO": "01"     // Efectivo por defecto
      };

      const saleNetBeforePoints = sale.saleDetails.reduce((acc, d) => {
        const itemGross = Number(d.unitPrice) * d.quantity;
        const itemDiscount = Number(d.discountAmount || 0);
        return acc + (itemGross - itemDiscount);
      }, 0);

      const facturapiItems = sale.saleDetails.map((detail) => {
        const unitPrice = Number(detail.unitPrice);
        const quantity = detail.quantity;

        let ivaRate = 0;
        let iepsRate = 0;
        for (const sdt of detail.saleDetailTaxes) {
          const nameUpper = sdt.taxName.toUpperCase();
          if (nameUpper.includes("IVA") && !nameUpper.includes("EXENTO")) ivaRate += Number(sdt.taxRate);
          if (nameUpper.includes("IEPS") && !nameUpper.includes("EXENTO")) iepsRate += Number(sdt.taxRate);
        }

        // unitPrice in DB is stored as gross (incl. taxes). We need to send
        // Facturapi the net unit price (without taxes) and the per-unit
        // discount also net of taxes. To avoid mismatches caused by
        // sending line-level values or rounding incorrectly, compute per-unit
        // gross discount and apply tax division per unit.
        const baseUnitGross = unitPrice; // gross unit price (includes taxes)

        // Proportional share of the global points discount applied to this line
        const lineGrossBeforePoints = (unitPrice * quantity) - Number(detail.discountAmount || 0);
        const pointsDiscountShare = (saleNetBeforePoints > 0 && Number(sale.pointsDiscount) > 0)
          ? (Number(sale.pointsDiscount) * lineGrossBeforePoints) / saleNetBeforePoints
          : 0;

        const totalLineDiscountGross = Number(detail.discountAmount || 0) + pointsDiscountShare;
        const perUnitDiscountGross = quantity > 0 ? (totalLineDiscountGross / quantity) : 0;

        // IMPORTANT: `detail.unitPrice` in DB is stored as the sale price WITHOUT taxes.
        // Treat `unitPrice` as net price (already excluding taxes). Do not divide
        // by tax multipliers. Compute per-unit discount as stored (also net).
        const baseUnitPriceBeforeDiscount = baseUnitGross; // already net
        const basePerUnitDiscount = perUnitDiscountGross; // already net

        const mappedTaxes = detail.saleDetailTaxes.map((sdt) => {
          const rateVal = Number(sdt.taxRate);
          const nameUpper = sdt.taxName.toUpperCase();

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

        const facturapiItem: any = {
          quantity: detail.quantity,
          product: {
            description: detail.product.name,
              // unit price net of taxes BEFORE discounts (so invoice shows original unit price)
              price: Number(baseUnitPriceBeforeDiscount.toFixed(6)),
            product_key: detail.product.satProductKey || "01010101",
            unit_key: detail.product.satUnitKey || "H87",
            taxes: mappedTaxes
          }
        };

        // Send discount as the total line discount (net of taxes). Some PACs
        // / Facturapi interpretations expect the discount to be a line total
        // rather than a per-unit amount. Provide the line-level net discount
        // to avoid ambiguity.
        const baseDiscountTotal = Number((basePerUnitDiscount * quantity).toFixed(6));
        if (baseDiscountTotal > 0) {
          facturapiItem.discount = baseDiscountTotal;
        }

        // DEBUG: log original gross/unit values so we can cross-check with DB/ticket
        try {
          console.debug("[BillingService] Line debug:", JSON.stringify({
            productId: detail.product.id,
            productName: detail.product.name,
            unitPriceGross: baseUnitGross,
            unitPriceNetBeforeDiscount: baseUnitPriceBeforeDiscount,
            perUnitDiscountGross,
            perUnitDiscountNet: basePerUnitDiscount,
            lineDiscountNet: baseDiscountTotal,
            quantity
          }, null, 2));
        } catch (ld) {
          /* ignore */
        }

        return facturapiItem;
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

      // DEBUG: log computed values and payload to help investigate mismatches
      try {
        console.debug("[BillingService] Preparing Facturapi request for sale:", sale.id);
        // Log per-item computed pricing for easier inspection
        const computedLines = facturapiItems.map((it: any, idx: number) => ({
          index: idx,
          quantity: it.quantity,
          price: it.product?.price,
          discount: it.discount ?? 0,
          taxes: it.product?.taxes
        }));
        console.debug("[BillingService] Computed lines:", JSON.stringify(computedLines, null, 2));
        console.debug("[BillingService] Facturapi request body:", JSON.stringify(requestBody, null, 2));
      } catch (logErr) {
        console.error("[BillingService] Error logging Facturapi payload:", logErr);
      }

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
      let friendlyMessage = err.message || "Error al comunicarse con el proveedor de facturación.";
      if (
        friendlyMessage.includes("tax_id") ||
        friendlyMessage.includes("RFC") ||
        friendlyMessage.toLowerCase().includes("rfc") ||
        friendlyMessage.includes("inválido") ||
        friendlyMessage.toLowerCase().includes("invalid")
      ) {
        friendlyMessage = "Por favor, verifique que su RFC, Razón Social, Régimen Fiscal y Código Postal Fiscal coincidan exactamente con su Constancia de Situación Fiscal del SAT.";
      }
      throw new Error(`Error de Facturación SAT (API Real): ${friendlyMessage}`);
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

        let applicableTaxes = detail.product.productTaxes.filter((pt) => pt.taxType.active);
        if (Number(detail.taxAmount) <= 0) {
          applicableTaxes = [];
        }

        let ivaRate = 0;
        let iepsRate = 0;
        for (const pt of applicableTaxes) {
          const nameUpper = pt.taxType.name.toUpperCase();
          if (nameUpper.includes("IVA") && !nameUpper.includes("EXENTO")) ivaRate += Number(pt.taxType.rate);
          if (nameUpper.includes("IEPS") && !nameUpper.includes("EXENTO")) iepsRate += Number(pt.taxType.rate);
        }

        const basePrice = netUnitPrice / ((1 + iepsRate) * (1 + ivaRate));

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

        // Fallback a IVA 16% si no hay impuestos pero la devolución tiene un monto de impuesto
        if (mappedTaxes.length === 0 && Number(detail.taxAmount) > 0) {
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
      let rfc = sale.customer?.taxId?.toUpperCase() || "XAXX010101000";
      let legal_name = rfc === "XAXX010101000" ? "PÚBLICO GENERAL" : (sale.customer?.name.toUpperCase() || "PÚBLICO GENERAL");
      let tax_system = rfc === "XAXX010101000" ? "616" : (sale.customer?.taxRegime || "616");
      let zip = rfc === "XAXX010101000" ? defaultZip : (sale.customer?.zipCode || defaultZip);
      let email = sale.cfdiEmail || sale.customer?.email || "clientes@fmb.com";
      let cfdiUse = rfc === "XAXX010101000" ? "S01" : (sale.customer?.cfdiUse || "G02");

      const cleanUuid = sale.cfdiUuid ? (sale.cfdiUuid.startsWith("GLOBAL:") ? sale.cfdiUuid.split(":")[1] : sale.cfdiUuid.split(":")[0]) : null;
      
      const parts = sale.cfdiUuid ? sale.cfdiUuid.split(":") : [];
      let facturapiId = null;
      if (parts.length > 0) {
        if (parts[0] === "GLOBAL") {
           facturapiId = parts.length > 2 ? parts[2] : null;
        } else {
           facturapiId = parts.length > 1 ? parts[1] : parts[0];
        }
      }

      const authHeader = "Bearer " + apiKey;

      if (facturapiId && !sale.cfdiUuid?.startsWith("GLOBAL:")) {
        try {
          const invRes = await fetch(`https://www.facturapi.io/v2/invoices/${facturapiId}`, {
            headers: { "Authorization": authHeader }
          });
          if (invRes.ok) {
            const invData = await invRes.json() as any;
            if (invData && invData.customer) {
              rfc = invData.customer.tax_id || rfc;
              legal_name = invData.customer.legal_name || legal_name;
              tax_system = invData.customer.tax_system || tax_system;
              zip = invData.customer.address?.zip || zip;
              email = invData.customer.email || email;
            }
          }
        } catch (fetchErr) {
          console.warn("No se pudo obtener la factura original de Facturapi para la Nota de Crédito. Se usarán datos locales.", fetchErr);
        }
      }

      const requestBody: any = {
        type: "E",
        customer: {
          legal_name,
          tax_id: rfc,
          tax_system,
          email,
          address: { zip }
        },
        items: facturapiItems,
        payment_form: paymentFormMap[sale.paymentMethod] || "01",
        use: rfc === "XAXX010101000" ? "S01" : cfdiUse
      };

      if (cleanUuid) {
        requestBody.related_documents = [
          {
            relationship: "01",
            documents: [cleanUuid]
          }
        ];
      }


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

  /**
   * Generar nota de crédito (CFDI de Egreso) para una venta cancelada que formaba parte de una factura global.
   */
  static async createCreditNoteForSale(saleId: number) {
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        customer: true,
        branch: true,
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
            },
            saleDetailTaxes: true
          }
        }
      }
    });

    if (!sale) {
      throw new Error("La venta especificada no existe.");
    }

    if (!sale.cfdiUuid) {
      throw new Error("La venta original no cuenta con una factura timbrada.");
    }

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

      const facturapiItems = sale.saleDetails.map((detail) => {
        const unitPrice = Number(detail.unitPrice);
        const quantity = detail.quantity;
        const discountPerUnit = Number(detail.discountAmount) / quantity;
        const netUnitPrice = unitPrice - discountPerUnit;

        const applicableTaxes = detail.product.productTaxes.filter((pt) => pt.taxType.active);

        let ivaRate = 0;
        let iepsRate = 0;
        for (const pt of applicableTaxes) {
          const nameUpper = pt.taxType.name.toUpperCase();
          if (nameUpper.includes("IVA") && !nameUpper.includes("EXENTO")) ivaRate += Number(pt.taxType.rate);
          if (nameUpper.includes("IEPS") && !nameUpper.includes("EXENTO")) iepsRate += Number(pt.taxType.rate);
        }

        const basePrice = netUnitPrice / ((1 + iepsRate) * (1 + ivaRate));

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
            description: `Devolución/Cancelación de: ${detail.product.name}`,
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
      const cleanUuid = sale.cfdiUuid.startsWith("GLOBAL:") ? sale.cfdiUuid.split(":")[1] : sale.cfdiUuid.split(":")[0];

      const requestBody: any = {
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
        related_documents: [
          {
            relationship: "01",
            documents: [cleanUuid]
          }
        ]
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

      return {
        success: true,
        uuid: resData.uuid,
        pdfUrl: `https://www.facturapi.io/v2/invoices/${resData.uuid}/pdf`,
        xmlUrl: `https://www.facturapi.io/v2/invoices/${resData.uuid}/xml`
      };
    } catch (err: any) {
      console.error("Facturapi Credit Note Error:", err);
      throw new Error(`Error de Timbrado SAT (Nota de Crédito por cancelación de venta global): ${err.message}`);
    }
  }

  /**
   * Cancelar factura en Facturapi (SAT)
   */
  static async cancelInvoice(invoiceId: string, motive: string = "02") {
    const rawApiKey = process.env.FACTURAPI_API_KEY;
    const apiKey = rawApiKey ? rawApiKey.replace(/['"]/g, "").trim() : "";

    if (!apiKey || apiKey === "") {
      throw new Error("API Key de Facturapi no configurada en las variables de entorno (.env).");
    }

    try {
      const authHeader = "Bearer " + apiKey;
      const response = await fetch(`https://www.facturapi.io/v2/invoices/${invoiceId}?motive=${motive}`, {
        method: "DELETE",
        headers: {
          "Authorization": authHeader
        }
      });

      const resData = await response.json() as any;

      if (!response.ok) {
        throw new Error(resData.message || "Error al cancelar la factura en Facturapi.");
      }

      return {
        success: true,
        status: resData.status,
        uuid: resData.uuid
      };
    } catch (err: any) {
      console.error("Facturapi Cancel Invoice Error:", err);
      throw new Error(`Error al cancelar factura (API Real): ${err.message}`);
    }
  }

  /**
   * Generar y timbrar Factura Global (Facturapi)
   */
  static async createGlobalInvoice(
    branchId: number | undefined,
    startDate: Date,
    endDate: Date,
    periodicity: string,
    month: string,
    year: string
  ) {
    const rawApiKey = process.env.FACTURAPI_API_KEY;
    const apiKey = rawApiKey ? rawApiKey.replace(/['"]/g, "").trim() : "";

    if (!apiKey || apiKey === "") {
      throw new Error("API Key de Facturapi no configurada en las variables de entorno (.env).");
    }

    const whereClause: any = {
      cfdiUuid: null,
      status: "COMPLETADA",
      OR: [
        { customerId: null },
        { customer: { name: "Público General" } },
        { customer: { taxId: "XAXX010101000" } }
      ],
      createdAt: {
        gte: startDate,
        lte: endDate
      }
    };

    if (branchId) {
      whereClause.branchId = branchId;
    }

    // Buscar ventas elegibles
    const sales = await prisma.sale.findMany({
      where: whereClause,
      include: {
        saleDetails: {
          include: {
            product: true,
            saleDetailTaxes: true
          }
        }
      }
    });

    if (sales.length === 0) {
      throw new Error("No hay ventas pendientes de facturar en el rango especificado.");
    }

    try {
      const facturapiItems: any[] = [];

      for (const sale of sales) {
        const saleNetBeforePoints = sale.saleDetails.reduce((acc, d) => {
          const itemGross = Number(d.unitPrice) * d.quantity;
          const itemDiscount = Number(d.discountAmount || 0);
          return acc + (itemGross - itemDiscount);
        }, 0);

        for (const detail of sale.saleDetails) {
          const unitPrice = Number(detail.unitPrice);
          const quantity = detail.quantity;

          // Proportional share of the global points discount
          const lineNetBeforePoints = (unitPrice * quantity) - Number(detail.discountAmount || 0);
          const pointsDiscountShare = (saleNetBeforePoints > 0 && Number(sale.pointsDiscount) > 0)
            ? (Number(sale.pointsDiscount) * lineNetBeforePoints) / saleNetBeforePoints
            : 0;

          const totalLineDiscount = Number(detail.discountAmount || 0) + pointsDiscountShare;
          const netUnitPrice = Math.max(0, ((unitPrice * quantity) - totalLineDiscount) / quantity);

          let ivaRate = 0;
          let iepsRate = 0;
          for (const sdt of detail.saleDetailTaxes) {
            const nameUpper = sdt.taxName.toUpperCase();
            if (nameUpper.includes("IVA") && !nameUpper.includes("EXENTO")) ivaRate += Number(sdt.taxRate);
            if (nameUpper.includes("IEPS") && !nameUpper.includes("EXENTO")) iepsRate += Number(sdt.taxRate);
          }

          const basePrice = netUnitPrice / ((1 + iepsRate) * (1 + ivaRate));

          const mappedTaxes = detail.saleDetailTaxes.map((sdt) => {
            const rateVal = Number(sdt.taxRate);
            const nameUpper = sdt.taxName.toUpperCase();

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

          facturapiItems.push({
            quantity,
            product: {
              description: `Venta Ticket ${sale.invoiceNumber} - ${detail.product.name}`,
              price: Number(basePrice.toFixed(2)),
              product_key: "01010101", // Clave SAT obligatoria para Factura Global
              unit_key: "ACT", // Unidad SAT obligatoria para Factura Global
              taxes: mappedTaxes
            }
          });
        }
      }

      const defaultZip = (process.env.CORPORATE_ZIP || "42080").trim();
      const requestBody = {
        type: "I",
        customer: {
          legal_name: "PÚBLICO GENERAL",
          tax_id: "XAXX010101000",
          tax_system: "616",
          address: {
            zip: defaultZip
          }
        },
        items: facturapiItems,
        payment_form: "01", // Por defecto "Efectivo" para público general
        use: "S01",
        global: {
          periodicity,
          months: month,
          year: parseInt(year)
        }
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
        throw new Error(resData.message || "Error al comunicarse con Facturapi para Factura Global.");
      }

      // Actualizar todas las ventas procesadas con la referencia de la Factura Global
      const saleIds = sales.map((s) => s.id);
      await prisma.sale.updateMany({
        where: { id: { in: saleIds } },
        data: {
          cfdiUuid: `GLOBAL:${resData.uuid}:${resData.id}`
        }
      });

      return {
        success: true,
        uuid: resData.uuid,
        pdfUrl: `https://www.facturapi.io/v2/invoices/${resData.uuid}/pdf`,
        xmlUrl: `https://www.facturapi.io/v2/invoices/${resData.uuid}/xml`
      };
    } catch (err: any) {
      console.error("Facturapi Global Invoice Error:", err);
      throw new Error(`Error de Facturación SAT (Factura Global): ${err.message}`);
    }
  }
}


