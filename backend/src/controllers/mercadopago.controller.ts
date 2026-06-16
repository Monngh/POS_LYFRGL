import { Request, Response } from "express";
import { MercadoPagoConfig, Preference, Payment } from "mercadopago";
import { logger } from "../utils/logger";
import { syncMercadoPagoDepositStatus } from "../services/mercadopago.service";

export { executeRefund, createMercadoPagoCashPayment } from "../services/mercadopago.service";

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
            title: title || "Venta POS",
            quantity: 1,
            unit_price: Number(totalAmount),
            currency_id: "MXN",
          },
        ],
        external_reference: externalReference,
        expires: true,
        expiration_date_from: new Date().toISOString(),
        expiration_date_to: expiresAt,
        payment_methods: {
          excluded_payment_types: [{ id: "ticket" }],
          installments: 1,
        },
        notification_url: `${process.env.WEBHOOK_BASE_URL || "https://tuservidor.com"}/api/mercadopago/webhook`,
      },
    });

    const isSandbox = process.env.MERCADOPAGO_SANDBOX === "true" || token.startsWith("TEST-");
    const initPoint = isSandbox ? result.sandbox_init_point : result.init_point;

    res.json({
      success: true,
      preferenceId: result.id,
      initPoint: initPoint,
      externalReference,
      expiresAt: expiresAt,
    });
  } catch (error: any) {
    console.error("Error al crear preferencia de Mercado Pago:", error);
    res.status(500).json({
      success: false,
      message: "Error al generar cobro QR en Mercado Pago",
      error: error.message,
      detail: error.cause || error,
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

    const searchResult = await paymentClient.search({
      options: { external_reference: externalReference },
    });

    if (searchResult.results && searchResult.results.length > 0) {
      const payment = searchResult.results[0];
      res.json({
        success: true,
        status: payment.status,
        paymentId: payment.id,
        externalReference: payment.external_reference,
      });
    } else {
      res.json({
        success: true,
        status: "pending",
        message: "Aún no se registra pago para esta referencia en los servidores de Mercado Pago.",
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

    if (action === "payment.created" || action === "payment.updated") {
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
 * Sincronizar estado de depósito bancario pendiente con Mercado Pago
 */
export const syncDepositStatus = async (req: Request, res: Response): Promise<void> => {
  if (!(req as any).user) { res.status(401).json({ message: "No autenticado." }); return; }
  const { id } = req.params;
  const depositId = parseInt(id, 10);
  if (isNaN(depositId)) { res.status(400).json({ message: "ID de depósito inválido." }); return; }
  try {
    const result = await syncMercadoPagoDepositStatus(depositId);
    res.status(200).json(result);
  } catch (error: any) {
    if (error.statusCode) { res.status(error.statusCode).json({ message: error.message }); return; }
    console.error("Error al sincronizar estado de depósito:", error);
    res.status(500).json({ message: "Error al sincronizar el estado con Mercado Pago." });
  }
};
