import { createMercadoPagoCashPayment } from "../src/controllers/mercadopago.controller";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env") });

async function test() {
  console.log("=== INICIANDO PRUEBA DE DEPÓSITO MERCADO PAGO CASH ===");

  // 1. Probar OXXO
  console.log("\n1. Generando ficha de OXXO de $100.00 MXN...");
  const oxxoRes = await createMercadoPagoCashPayment(100.00, "oxxo", "Resguardo de prueba - Oxxo");
  console.log("Resultado OXXO:");
  console.log(JSON.stringify(oxxoRes, null, 2));

  // 2. Probar BBVA
  console.log("\n2. Generando ficha de BBVA Bancomer de $250.00 MXN...");
  const bbvaRes = await createMercadoPagoCashPayment(250.00, "bancomer", "Resguardo de prueba - BBVA");
  console.log("Resultado BBVA:");
  console.log(JSON.stringify(bbvaRes, null, 2));

  console.log("\n=== PRUEBA FINALIZADA CON ÉXITO ===");
}

test();
