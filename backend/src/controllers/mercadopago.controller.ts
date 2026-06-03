import { Request, Response } from "express";
import { MercadoPagoConfig, Preference, Payment, PaymentRefund } from "mercadopago";
//import { PrismaClient } from "@prisma/client";

//const prisma = new PrismaClient();

// Inicializar Mercado Pago
// Asegúrate de tener MERCADOPAGO_ACCESS_TOKEN en tu archivo .env
const getMercadoPagoClient = () => {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN || 'TEST-0000000000000000-000000-00000000000000000000000000000000-000000000';
  return new MercadoPagoConfig({ accessToken: token });
};

/**
 * Genera una preferencia de pago que será convertida en QR en el frontend
 */
export const createQRPreference = async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, totalAmount, externalReference } = req.body;

    const token = process.env.MERCADOPAGO_ACCESS_TOKEN || 'TEST-0000000000000000-000000-00000000000000000000000000000000-000000000';
    
    // MOCK MODE: Si no hay token configurado, simulamos la respuesta para poder probar el frontend
    if (token === 'TEST-0000000000000000-000000-00000000000000000000000000000000-000000000') {
      console.log("Mocking Mercado Pago Preference Creation (No Token provided)");
      res.json({
        success: true,
        preferenceId: `mock-pref-${externalReference}`,
        initPoint: "https://www.mercadopago.com.mx/sandbox/mock-payment?ref=" + externalReference,
        externalReference
      });
      return;
    }

    const client = getMercadoPagoClient();
    const preference = new Preference(client);

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
        // Configuración para que el pago se apruebe o rechace de inmediato
        payment_methods: {
          excluded_payment_types: [
            { id: 'ticket' }, // Excluir OXXO/Efectivo para que sea pago inmediato (tarjeta/dinero en cuenta MP)
          ],
          installments: 1
        },
        notification_url: `${process.env.WEBHOOK_BASE_URL || 'https://tuservidor.com'}/api/mercadopago/webhook`,
      }
    });

    const initPoint = process.env.NODE_ENV === 'production' ? result.init_point : result.sandbox_init_point;

    res.json({
      success: true,
      preferenceId: result.id,
      initPoint: initPoint, // Se usará para generar el QR visual
      externalReference
    });
  } catch (error: any) {
    console.error("Error al crear preferencia de Mercado Pago:", error);
    res.status(500).json({ success: false, message: "Error al generar cobro QR", error: error.message });
  }
};

/**
 * Consulta manual del estado del pago de una preferencia (para polling)
 */
export const checkPaymentStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { externalReference } = req.params;

    const token = process.env.MERCADOPAGO_ACCESS_TOKEN || 'TEST-0000000000000000-000000-00000000000000000000000000000000-000000000';
    
    // MOCK MODE: Si no hay token configurado, simulamos el pago aprobado
    if (token === 'TEST-0000000000000000-000000-00000000000000000000000000000000-000000000') {
      console.log("Mocking Mercado Pago Payment Status (Always Approved)");
      res.json({
        success: true,
        status: "approved",
        paymentId: `mock-pay-${externalReference}`,
        externalReference
      });
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
        message: 'Aún no se registra pago para esta referencia'
      });
    }
  } catch (error: any) {
    console.error("Error al verificar estado de pago:", error);
    res.status(500).json({ success: false, message: "Error al verificar pago" });
  }
};

/**
 * Webhook para recibir notificaciones de MP (Preparación)
 */
export const webhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const { action, data } = req.body;
    
    // Aquí implementaremos la actualización en base de datos si el webhook es de tipo "payment.created" o "payment.updated"
    if (action === 'payment.created' || action === 'payment.updated') {
      const paymentId = data.id;
      // const paymentInfo = await new Payment(getMercadoPagoClient()).get({ id: paymentId });
      // Luego actualizamos la tabla Sale o BankDeposit con paymentInfo.status
      console.log("Webhook MP recibido para pago:", paymentId);
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
    const token = process.env.MERCADOPAGO_ACCESS_TOKEN || 'TEST-0000000000000000-000000-00000000000000000000000000000000-000000000';
    
    // MOCK MODE
    if (token === 'TEST-0000000000000000-000000-00000000000000000000000000000000-000000000' || paymentId.startsWith('mock-')) {
      console.log("Mocking Mercado Pago Refund (Always Approved) for amount:", amount);
      return {
        success: true,
        refundId: `mock-ref-${Date.now()}`,
        status: 'approved'
      };
    }

    const client = getMercadoPagoClient();
    const refundClient = new PaymentRefund(client);

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
  } catch (error: any) {
    console.error("Error executing Mercado Pago Refund:", error);
    return {
      success: false,
      message: error.message
    };
  }
};
