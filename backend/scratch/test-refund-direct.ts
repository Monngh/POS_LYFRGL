import { executeRefund } from "../src/controllers/mercadopago.controller";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env") });

async function main() {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  console.log("Token a utilizar (parcial):", token ? token.substring(0, 20) + "..." : "Ninguno");

  if (!token) {
    console.error("MERCADOPAGO_ACCESS_TOKEN no está definido en el archivo .env");
    return;
  }

  const paymentId = "162525905700"; // ID del pago real
  console.log(`Intentando reembolsar $1.00 del pago ${paymentId} usando executeRefund...`);

  const result = await executeRefund(paymentId, 1.00);

  console.log("\n=========================================");
  console.log("Resultado de executeRefund:");
  console.log(JSON.stringify(result, null, 2));
  console.log("=========================================");
}

main();
