import { Request, Response } from "express";
import { MercadoPagoConfig, Preference, Payment, PaymentRefund } from "mercadopago";
import { PrismaClient } from "@prisma/client";
import { logger } from "../utils/logger";

const prisma = new PrismaClient();

// Inicializar Mercado Pago
// Asegúrate de tener MERCADOPAGO_ACCESS_TOKEN en tu archivo .env
const getMercadoPagoClient = () => {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) {
    throw new Error("MERCADOPAGO_ACCESS_TOKEN no está configurado en el archivo .env");
  }
  return new MercadoPagoConfig({ accessToken: token });
};

/**
 * Genera una preferencia de pago que será convertida en QR en el frontend
 */
export const createQRPreference = async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, totalAmount, externalReference } = req.body;

    const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!token) {
      res.status(400).json({ success: false, message: "MERCADOPAGO_ACCESS_TOKEN no está configurado en el archivo .env" });
      return;
    }

    const client = getMercadoPagoClient();
    const preference = new Preference(client);

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const result = await preference.create({
      body: {
        items: [
          {
            id: externalReference,
            title: title || 'Venta POS',
            quantity: 1,
            unit_price: Number(totalAmount),
            currency_id: 'MXN'
          }
        ],
        external_reference: externalReference,
        expires: true,
        expiration_date_from: new Date().toISOString(),
        expiration_date_to: expiresAt,
        payment_methods: {
          excluded_payment_types: [
            { id: 'ticket' },
          ],
          installments: 1
        },
        notification_url: `${process.env.WEBHOOK_BASE_URL || 'https://tuservidor.com'}/api/mercadopago/webhook`,
      }
    });

    // Seleccionar automáticamente sandbox o producción según la configuración o el tipo de token
    const isSandbox = process.env.MERCADOPAGO_SANDBOX === "true" || token.startsWith("TEST-");
    const initPoint = isSandbox ? result.sandbox_init_point : result.init_point;

    res.json({
      success: true,
      preferenceId: result.id,
      initPoint: initPoint,
      externalReference,
      expiresAt: expiresAt
    });
  } catch (error: any) {
    console.error("Error al crear preferencia de Mercado Pago:", error);
    res.status(500).json({ 
      success: false, 
      message: "Error al generar cobro QR en Mercado Pago", 
      error: error.message,
      detail: error.cause || error 
    });
  }
};

/**
 * Consulta manual del estado del pago de una preferencia (para polling)
 */
export const checkPaymentStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { externalReference } = req.params;

    const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!token) {
      res.status(400).json({ success: false, message: "MERCADOPAGO_ACCESS_TOKEN no está configurado en el archivo .env" });
      return;
    }

    const client = getMercadoPagoClient();
    const paymentClient = new Payment(client);
    
    // Buscar el pago por external_reference
    const searchResult = await paymentClient.search({
      options: {
        external_reference: externalReference
      }
    });

    if (searchResult.results && searchResult.results.length > 0) {
      // Tomamos el último intento de pago
      const payment = searchResult.results[0];
      res.json({
        success: true,
        status: payment.status, // 'pending', 'approved', 'rejected', 'cancelled'
        paymentId: payment.id,
        externalReference: payment.external_reference
      });
    } else {
      res.json({
        success: true,
        status: 'pending',
        message: 'Aún no se registra pago para esta referencia en los servidores de Mercado Pago.'
      });
    }
  } catch (error: any) {
    console.error("Error al verificar estado de pago:", error);
    res.status(500).json({ success: false, message: "Error al verificar el estado de pago en Mercado Pago." });
  }
};

/**
 * Webhook para recibir notificaciones de MP (Preparación)
 */
export const webhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const { action, data } = req.body;
    
    if (action === 'payment.created' || action === 'payment.updated') {
      const paymentId = data.id;
      logger.info("Webhook MP recibido para pago:", paymentId);
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("Error en webhook de Mercado Pago", error);
    res.status(500).send("Error");
  }
};

/**
 * Servicio interno para ejecutar devoluciones (Refunds) desde el Controlador de Ventas
 */
export const executeRefund = async (paymentId: string, amount: number): Promise<{ success: boolean; refundId?: string; status?: string; message?: string }> => {
  try {
    const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!token) {
      throw new Error("MERCADOPAGO_ACCESS_TOKEN no está configurado en el archivo .env");
    }

    // Detectar inconsistencias de entorno/credenciales
    const isSandbox = process.env.MERCADOPAGO_SANDBOX === "true";
    const isTestToken = token.startsWith("TEST-");

    if (!isSandbox && isTestToken) {
      throw new Error("No se pueden usar credenciales de prueba en producción. Tienes configurado MERCADOPAGO_SANDBOX=false pero tu token es de prueba (TEST-...).");
    }

    // Si el ID de pago es simulado, responder con éxito directamente
    if (paymentId && paymentId.startsWith("mock-")) {
      logger.debug(`Simulando reembolso para pago mock: ${paymentId}`);
      return {
        success: true,
        refundId: `mock-ref-${Date.now()}`,
        status: "approved"
      };
    }

    const client = getMercadoPagoClient();
    const refundClient = new PaymentRefund(client);

    try {
      const result = await refundClient.create({
        payment_id: paymentId,
        body: {
          amount: Number(amount)
        }
      });

      return {
        success: true,
        refundId: result.id?.toString(),
        status: result.status // 'approved', 'pending'
      };
    } catch (apiError: any) {
      // Interceptar error de credenciales no homologadas/autorizadas en Sandbox
      const errorMsg = apiError.message || "";
      const causeStr = apiError.cause ? JSON.stringify(apiError.cause) : "";
      const isAuthError = errorMsg.includes("Unauthorized use of live credentials") || 
                          causeStr.includes("Unauthorized use of live credentials");

      if (isSandbox && isAuthError) {
        console.warn(`\n[WARNING] Fallo de credenciales en Mercado Pago (Unauthorized use of live credentials).`);
        console.warn(`[WARNING] Esto ocurre porque tu cuenta no ha completado la homologación en producción.`);
        console.warn(`[WARNING] Se aplicará una simulación de reembolso aprobada para continuar con las pruebas del POS...\n`);

        return {
          success: true,
          refundId: `mock-ref-fallback-${Date.now()}`,
          status: "approved",
          message: "Simulado debido a falta de homologación de la cuenta de Mercado Pago."
        };
      }

      // Si es otro error o no es Sandbox, propagamos la falla
      throw apiError;
    }
  } catch (error: any) {
    console.error("Error executing Mercado Pago Refund:", error);
    return {
      success: false,
      message: error.message || "Error al procesar el reembolso en Mercado Pago"
    };
  }
};

/**
 * Generar un pago en efectivo (Cash Payment) en Mercado Pago (OXXO, SPEI/Paycash, bancos)
 */
export const createMercadoPagoCashPayment = async (
  amount: number,
  paymentMethodId: string,
  description: string
): Promise<{
  success: boolean;
  paymentId?: string;
  status?: string;
  reference?: string;
  convenio?: string;
  barcode?: string;
  ticketUrl?: string;
  expirationDate?: string;
  message?: string;
}> => {
  try {
    const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!token) {
      throw new Error("MERCADOPAGO_ACCESS_TOKEN no está configurado en el archivo .env");
    }

    const isSandbox = process.env.MERCADOPAGO_SANDBOX === "true" || token.startsWith("TEST-");

    const client = getMercadoPagoClient();
    const paymentClient = new Payment(client);

    try {
      // Expiración en 3 días para dar tiempo al cajero de depositar
      const today = new Date();
      today.setDate(today.getDate() + 3);
      const expirationDateStr = today.toISOString();

      const response = await paymentClient.create({
        body: {
          transaction_amount: Number(amount),
          description: description || "Depósito de resguardo POS",
          payment_method_id: paymentMethodId,
          date_of_expiration: expirationDateStr,
          payer: {
            email: "cajero@punto-de-venta.com"
          }
        }
      });

      const resp = response as any;
      const paymentId = resp.id?.toString();
      const status = resp.status;
      const details = resp.transaction_details;
      
      const reference = details?.payment_method_reference_id || "";
      const barcode = resp.barcode?.content || "";
      const ticketUrl = details?.external_resource_url || "";
      const expiration = resp.date_of_expiration || expirationDateStr;

      // Convenios por default para bancos en México en Mercado Pago
      let convenio = "N/A";
      if (paymentMethodId === "bancomer") {
        convenio = "1456289";
      } else if (paymentMethodId === "banamex") {
        convenio = "A. 876";
      } else if (paymentMethodId === "serfin") {
        convenio = "6582";
      }

      return {
        success: true,
        paymentId,
        status,
        reference,
        convenio,
        barcode,
        ticketUrl,
        expirationDate: expiration
      };
    } catch (apiError: any) {
      const errorMsg = apiError.message || "";
      const causeStr = apiError.cause ? JSON.stringify(apiError.cause) : "";
      const isAuthError = errorMsg.includes("Unauthorized use of live credentials") || 
                          causeStr.includes("Unauthorized use of live credentials");

      if (isSandbox && isAuthError) {
        console.warn(`\n[WARNING] Fallo de credenciales en Mercado Pago (Unauthorized use of live credentials) al crear resguardo en efectivo.`);
        console.warn(`[WARNING] Se aplicará simulación de referencia aprobada (pending en MP) para pruebas...\n`);

        const mockId = `mock-mp-cash-${Date.now()}`;
        const mockRef = Array.from({ length: 20 }, () => Math.floor(Math.random() * 10)).join("");
        
        let mockConvenio = "N/A";
        let mockBarcode = "N/A";
        if (paymentMethodId === "oxxo") {
          mockBarcode = "012345678901234567890123456789";
        } else if (paymentMethodId === "bancomer") {
          mockConvenio = "1456289";
        } else if (paymentMethodId === "banamex") {
          mockConvenio = "A. 876";
        } else if (paymentMethodId === "serfin") {
          mockConvenio = "6582";
        } else if (paymentMethodId === "paycash") {
          mockBarcode = "7501234567890123456789";
        }

        const expDate = new Date();
        expDate.setDate(expDate.getDate() + 3);

        return {
          success: true,
          paymentId: mockId,
          status: "pending",
          reference: mockRef,
          convenio: mockConvenio,
          barcode: mockBarcode,
          ticketUrl: `https://www.mercadopago.com.mx/payments/${mockId}/ticket?sender=pos`,
          expirationDate: expDate.toISOString(),
          message: "Simulado debido a falta de homologación de la cuenta de Mercado Pago."
        };
      }

      throw apiError;
    }
  } catch (error: any) {
    console.error("Error al crear pago en efectivo en Mercado Pago:", error);
    return {
      success: false,
      message: error.message || "Error al procesar el depósito en Mercado Pago"
    };
  }
};

/**
 * Sincronizar estado de depósito bancario pendiente con Mercado Pago
 */
export const syncDepositStatus = async (req: Request, res: Response): Promise<void> => {
  if (!(req as any).user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }

  const { id } = req.params;

  try {
    const depositId = parseInt(id, 10);
    if (isNaN(depositId)) {
      res.status(400).json({ message: "ID de depósito inválido." });
      return;
    }

    const deposit = await prisma.bankDeposit.findUnique({
      where: { id: depositId },
    });

    if (!deposit) {
      res.status(404).json({ message: "Depósito no encontrado." });
      return;
    }

    if (deposit.status !== "PENDING" || !deposit.mercadoPagoPaymentId) {
      res.status(400).json({ 
        message: `El depósito no está en estado PENDIENTE o no tiene un ID de pago de Mercado Pago. Estado actual: ${deposit.status}` 
      });
      return;
    }

    // Caso de simulación de pruebas (MOCK)
    if (deposit.mercadoPagoPaymentId.startsWith("mock-")) {
      const updated = await prisma.$transaction(async (tx) => {
        const dep = await tx.bankDeposit.update({
          where: { id: depositId },
          data: {
            status: "COMPLETED",
            mercadoPagoStatus: "approved",
            confirmedAt: new Date(),
          },
        });
        return dep;
      });

      res.status(200).json({
        message: "Depósito de prueba (MOCK) sincronizado y marcado como COMPLETADO (Simulando pago en establecimiento).",
        deposit: updated,
      });
      return;
    }

    // Caso de pago real
    const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!token) {
      res.status(400).json({ message: "MERCADOPAGO_ACCESS_TOKEN no está configurado." });
      return;
    }

    const client = getMercadoPagoClient();
    const paymentClient = new Payment(client);

    const mpPayment = await paymentClient.get({ id: deposit.mercadoPagoPaymentId });
    const mpStatus = mpPayment.status;

    if (mpStatus === "approved") {
      const updated = await prisma.bankDeposit.update({
        where: { id: depositId },
        data: {
          status: "COMPLETED",
          mercadoPagoStatus: "approved",
          confirmedAt: new Date(),
        },
      });

      res.status(200).json({
        message: "El depósito ha sido pagado y confirmado exitosamente en Mercado Pago.",
        deposit: updated,
      });
    } else if (mpStatus === "cancelled" || mpStatus === "rejected") {
      const updated = await prisma.$transaction(async (tx) => {
        const dep = await tx.bankDeposit.update({
          where: { id: depositId },
          data: {
            status: "CANCELLED",
            mercadoPagoStatus: mpStatus,
            cancelledAt: new Date(),
            cancelReason: `Sincronización automática de Mercado Pago: Pago ${mpStatus}.`,
          },
        });

        // Revertir cashOut
        await tx.cashSession.update({
          where: { id: deposit.cashSessionId },
          data: {
            cashOut: { decrement: Number(deposit.amount) },
          },
        });

        return dep;
      });

      res.status(200).json({
        message: `El pago fue ${mpStatus === "cancelled" ? "cancelado" : "rechazado"} en Mercado Pago. Se canceló el resguardo y se devolvió el efectivo a la caja.`,
        deposit: updated,
      });
    } else {
      res.status(200).json({
        message: "El pago de Mercado Pago sigue pendiente de realizarse en el establecimiento.",
        deposit,
      });
    }

  } catch (error: any) {
    console.error("Error al sincronizar estado de depósito:", error);
    res.status(500).json({ message: "Error al sincronizar el estado con Mercado Pago." });
  }
};
