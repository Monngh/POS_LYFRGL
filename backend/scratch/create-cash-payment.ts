import { MercadoPagoConfig, Payment } from "mercadopago";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env") });

async function main() {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) {
    console.error("MERCADOPAGO_ACCESS_TOKEN no está definido en el archivo .env");
    return;
  }

  const client = new MercadoPagoConfig({ accessToken: token });
  const paymentClient = new Payment(client);

  try {
    console.log("Creando pago en efectivo de prueba (OXXO)...");
    const response = await paymentClient.create({
      body: {
        transaction_amount: 150.00,
        description: "Depósito de prueba POS - OXXO",
        payment_method_id: "oxxo",
        payer: {
          email: "test_user_123@testuser.com"
        }
      }
    });

    console.log("Pago OXXO creado exitosamente:");
    console.log(JSON.stringify(response, null, 2));

  } catch (error: any) {
    console.error("Error al crear el pago:", error.message || error);
    if (error.cause) {
      console.error("Causa del error:", JSON.stringify(error.cause, null, 2));
    }
  }
}

main();
