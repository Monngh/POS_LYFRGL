import { prisma } from "../app";
import { AppError } from "../utils/AppError";
import { MercadoPagoConfig, Payment, PaymentRefund } from "mercadopago";
import { logger } from "../utils/logger";

const getMercadoPagoClient = () => {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) {
    throw new Error("MERCADOPAGO_ACCESS_TOKEN no está configurado en el archivo .env");
  }
  return new MercadoPagoConfig({ accessToken: token });
};

export const executeRefund = async (
  paymentId: string,
  amount: number
): Promise<{ success: boolean; refundId?: string; status?: string; message?: string }> => {
  try {
    const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!token) {
      throw new Error("MERCADOPAGO_ACCESS_TOKEN no está configurado en el archivo .env");
    }

    const isSandbox = process.env.MERCADOPAGO_SANDBOX === "true";
    const isTestToken = token.startsWith("TEST-");

    if (!isSandbox && isTestToken) {
      throw new Error("No se pueden usar credenciales de prueba en producción. Tienes configurado MERCADOPAGO_SANDBOX=false pero tu token es de prueba (TEST-...).");
    }

    if (paymentId && paymentId.startsWith("mock-")) {
      logger.debug(`Simulando reembolso para pago mock: ${paymentId}`);
      return {
        success: true,
        refundId: `mock-ref-${Date.now()}`,
        status: "approved",
      };
    }

    const client = getMercadoPagoClient();
    const refundClient = new PaymentRefund(client);

    try {
      const result = await refundClient.create({
        payment_id: paymentId,
        body: { amount: Number(amount) },
      });

      return {
        success: true,
        refundId: result.id?.toString(),
        status: result.status,
      };
    } catch (apiError: any) {
      const errorMsg = apiError.message || "";
      const causeStr = apiError.cause ? JSON.stringify(apiError.cause) : "";
      const isAuthError =
        errorMsg.includes("Unauthorized use of live credentials") ||
        causeStr.includes("Unauthorized use of live credentials");

      if (isSandbox && isAuthError) {
        console.warn(`\n[WARNING] Fallo de credenciales en Mercado Pago (Unauthorized use of live credentials).`);
        console.warn(`[WARNING] Esto ocurre porque tu cuenta no ha completado la homologación en producción.`);
        console.warn(`[WARNING] Se aplicará una simulación de reembolso aprobada para continuar con las pruebas del POS...\n`);

        return {
          success: true,
          refundId: `mock-ref-fallback-${Date.now()}`,
          status: "approved",
          message: "Simulado debido a falta de homologación de la cuenta de Mercado Pago.",
        };
      }

      throw apiError;
    }
  } catch (error: any) {
    console.error("Error executing Mercado Pago Refund:", error);
    return {
      success: false,
      message: error.message || "Error al procesar el reembolso en Mercado Pago",
    };
  }
};

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
      const today = new Date();
      today.setDate(today.getDate() + 3);
      const expirationDateStr = today.toISOString();

      const response = await paymentClient.create({
        body: {
          transaction_amount: Number(amount),
          description: description || "Depósito de resguardo POS",
          payment_method_id: paymentMethodId,
          date_of_expiration: expirationDateStr,
          payer: { email: "cajero@punto-de-venta.com" },
        },
      });

      const resp = response as any;
      const paymentId = resp.id?.toString();
      const status = resp.status;
      const details = resp.transaction_details;

      const reference = details?.payment_method_reference_id || "";
      const barcode = resp.barcode?.content || "";
      const ticketUrl = details?.external_resource_url || "";
      const expiration = resp.date_of_expiration || expirationDateStr;

      let convenio = "N/A";
      if (paymentMethodId === "bancomer") convenio = "1456289";
      else if (paymentMethodId === "banamex") convenio = "A. 876";
      else if (paymentMethodId === "serfin") convenio = "6582";

      return { success: true, paymentId, status, reference, convenio, barcode, ticketUrl, expirationDate: expiration };
    } catch (apiError: any) {
      const errorMsg = apiError.message || "";
      const causeStr = apiError.cause ? JSON.stringify(apiError.cause) : "";
      const isAuthError =
        errorMsg.includes("Unauthorized use of live credentials") ||
        causeStr.includes("Unauthorized use of live credentials");

      if (isSandbox && isAuthError) {
        console.warn(`\n[WARNING] Fallo de credenciales en Mercado Pago (Unauthorized use of live credentials) al crear resguardo en efectivo.`);
        console.warn(`[WARNING] Se aplicará simulación de referencia aprobada (pending en MP) para pruebas...\n`);

        const mockId = `mock-mp-cash-${Date.now()}`;
        const mockRef = Array.from({ length: 20 }, () => Math.floor(Math.random() * 10)).join("");

        let mockConvenio = "N/A";
        let mockBarcode = "N/A";
        if (paymentMethodId === "oxxo") mockBarcode = "012345678901234567890123456789";
        else if (paymentMethodId === "bancomer") mockConvenio = "1456289";
        else if (paymentMethodId === "banamex") mockConvenio = "A. 876";
        else if (paymentMethodId === "serfin") mockConvenio = "6582";
        else if (paymentMethodId === "paycash") mockBarcode = "7501234567890123456789";

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
          message: "Simulado debido a falta de homologación de la cuenta de Mercado Pago.",
        };
      }

      throw apiError;
    }
  } catch (error: any) {
    console.error("Error al crear pago en efectivo en Mercado Pago:", error);
    return {
      success: false,
      message: error.message || "Error al procesar el depósito en Mercado Pago",
    };
  }
};

export const syncMercadoPagoDepositStatus = async (
  depositId: number
): Promise<{ message: string; deposit: any }> => {
  const deposit = await prisma.bankDeposit.findUnique({ where: { id: depositId } });

  if (!deposit) throw new AppError("Depósito no encontrado.", 404);

  if (deposit.status !== "PENDING" || !deposit.mercadoPagoPaymentId) {
    throw new AppError(
      `El depósito no está en estado PENDIENTE o no tiene un ID de pago de Mercado Pago. Estado actual: ${deposit.status}`,
      400
    );
  }

  if (deposit.mercadoPagoPaymentId.startsWith("mock-")) {
    const updated = await prisma.$transaction(async (tx) => {
      return tx.bankDeposit.update({
        where: { id: depositId },
        data: { status: "COMPLETED", mercadoPagoStatus: "approved", confirmedAt: new Date() },
      });
    });
    return {
      message: "Depósito de prueba (MOCK) sincronizado y marcado como COMPLETADO (Simulando pago en establecimiento).",
      deposit: updated,
    };
  }

  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) throw new AppError("MERCADOPAGO_ACCESS_TOKEN no está configurado.", 400);

  const client = getMercadoPagoClient();
  const paymentClient = new Payment(client);
  const mpPayment = await paymentClient.get({ id: deposit.mercadoPagoPaymentId });
  const mpStatus = mpPayment.status;

  if (mpStatus === "approved") {
    const updated = await prisma.bankDeposit.update({
      where: { id: depositId },
      data: { status: "COMPLETED", mercadoPagoStatus: "approved", confirmedAt: new Date() },
    });
    return { message: "El depósito ha sido pagado y confirmado exitosamente en Mercado Pago.", deposit: updated };
  }

  if (mpStatus === "cancelled" || mpStatus === "rejected") {
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
      await tx.cashSession.update({
        where: { id: deposit.cashSessionId },
        data: { cashOut: { decrement: Number(deposit.amount) } },
      });
      return dep;
    });
    return {
      message: `El pago fue ${mpStatus === "cancelled" ? "cancelado" : "rechazado"} en Mercado Pago. Se canceló el resguardo y se devolvió el efectivo a la caja.`,
      deposit: updated,
    };
  }

  return {
    message: "El pago de Mercado Pago sigue pendiente de realizarse en el establecimiento.",
    deposit,
  };
};
