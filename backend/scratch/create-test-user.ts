import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env") });

async function main() {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) {
    console.error("MERCADOPAGO_ACCESS_TOKEN no está definido en el archivo .env");
    return;
  }

  console.log("Token a utilizar (parcial):", token.substring(0, 20) + "...");

  try {
    console.log("Enviando petición a Mercado Pago para crear un usuario de pruebas...");
    const response = await fetch("https://api.mercadopago.com/users/test", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        site_id: "MLM" // MLM es para Mercado Pago México
      })
    });

    const data = await response.json() as any;

    if (!response.ok) {
      console.error("Error al crear usuario de pruebas:");
      console.error("Status:", response.status);
      console.error("Detalles:", JSON.stringify(data, null, 2));
      return;
    }

    console.log("\n¡Usuario de pruebas creado con éxito!");
    console.log("=========================================");
    console.log("ID del Usuario:", data.id);
    console.log("Email de Acceso:", data.email);
    console.log("Contraseña de Acceso:", data.password);
    console.log("NUEVO ACCESS TOKEN (SÁNDBOX):", data.access_token);
    console.log("NUEVA PUBLIC KEY (SÁNDBOX):", data.public_key);
    console.log("=========================================");
    console.log("\nGuarda estas credenciales. Para realizar pruebas puras en Sandbox con cobros y reembolsos automáticos sin error:");
    console.log("1. Configura este NUEVO ACCESS TOKEN (que empieza con TEST-) en tu archivo backend/.env en la variable MERCADOPAGO_ACCESS_TOKEN.");
    console.log("2. Usa el Email y Contraseña arriba provistos si necesitas iniciar sesión como comprador o vendedor de pruebas.");

  } catch (error: any) {
    console.error("Error de red:", error.message || error);
  }
}

main();
