import { MercadoPagoConfig, Payment } from "mercadopago";
import * as dotenv from "dotenv";
import * as path from "path";

// Cargar variables de entorno del archivo .env
dotenv.config({ path: path.join(__dirname, "..", ".env") });

async function main() {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  console.log("Token a utilizar (parcial):", token ? token.substring(0, 20) + "..." : "Ninguno");

  if (!token) {
    console.error("MERCADOPAGO_ACCESS_TOKEN no está definido en el archivo .env");
    return;
  }

  try {
    const client = new MercadoPagoConfig({ accessToken: token });
    const paymentClient = new Payment(client);

    // Obtener detalles del pago
    const paymentId = "162525905700"; // ID real del pago anterior
    console.log(`Obteniendo detalles del pago ${paymentId}...`);
    const payment = await paymentClient.get({ id: paymentId });

    console.log("Detalles del pago recibidos con éxito:");
    console.log(JSON.stringify(payment, null, 2));

  } catch (error: any) {
    console.error("Error al obtener el pago:", error.message || error);
    if (error.cause) {
      console.error("Causa del error:", JSON.stringify(error.cause, null, 2));
    }
  }
}

main();
