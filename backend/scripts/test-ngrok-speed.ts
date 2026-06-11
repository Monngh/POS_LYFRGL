import { PrismaClient } from "@prisma/client";

const ngrokUrl = "sqlserver://0.tcp.ngrok.io:21844;database=POS_FMB_DEV;user=sa;password=TuPassword#2026;trustServerCertificate=true";
const localUrl = "sqlserver://127.0.0.1:1433;database=POS_FMB_DEV;user=sa;password=TuPassword#2026;trustServerCertificate=true";

async function testConnection(url: string) {
  const prisma = new PrismaClient({
    datasources: { db: { url } },
  });

  try {
    // 1. Connection + Handshake
    const t0 = performance.now();
    await prisma.$connect();
    await prisma.branch.count();
    const t1 = performance.now();
    const connTime = t1 - t0;

    // 2. Simple Query
    const t2 = performance.now();
    await prisma.product.findFirst({
      select: { id: true, name: true, sku: true }
    });
    const t3 = performance.now();
    const simpleTime = t3 - t2;

    // 3. Complex Query
    const t4 = performance.now();
    await prisma.product.findMany({
      take: 10,
      include: {
        inventories: true,
        productTaxes: { include: { taxType: true } }
      }
    });
    const t5 = performance.now();
    const complexTime = t5 - t4;

    return {
      success: true,
      connTime,
      simpleTime,
      complexTime
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  console.log("==========================================================");
  console.log("⏱️  INICIANDO COMPARATIVA DE RENDIMIENTO: LOCAL VS NGROK");
  console.log("==========================================================\n");

  console.log("🏃 Ejecutando prueba LOCAL (127.0.0.1)...");
  const localResults = await testConnection(localUrl);

  console.log("🏃 Ejecutando prueba NGROK (0.tcp.ngrok.io)...");
  const ngrokResults = await testConnection(ngrokUrl);

  console.log("\n==========================================================");
  console.log("📈 RESULTADOS COMPARATIVOS:");
  console.log("==========================================================");

  if (localResults.success && ngrokResults.success) {
    console.log(
      String.prototype.concat(
        `1. Latencia/Conexión Inicial (Handshake):\n`,
        `   - Local:  ${localResults.connTime?.toFixed(2)} ms\n`,
        `   - ngrok:  ${ngrokResults.connTime?.toFixed(2)} ms (Overhead: +${(ngrokResults.connTime! - localResults.connTime!).toFixed(2)} ms)\n\n`,
        `2. Búsqueda de Producto Simple:\n`,
        `   - Local:  ${localResults.simpleTime?.toFixed(2)} ms\n`,
        `   - ngrok:  ${ngrokResults.simpleTime?.toFixed(2)} ms (Overhead: +${(ngrokResults.simpleTime! - localResults.simpleTime!).toFixed(2)} ms)\n\n`,
        `3. Carga de Catálogo Complejo (Relaciones):\n`,
        `   - Local:  ${localResults.complexTime?.toFixed(2)} ms\n`,
        `   - ngrok:  ${ngrokResults.complexTime?.toFixed(2)} ms (Overhead: +${(ngrokResults.complexTime! - localResults.complexTime!).toFixed(2)} ms)`
      )
    );
  } else {
    if (!localResults.success) console.log("❌ Error en prueba Local:", localResults.error);
    if (!ngrokResults.success) console.log("❌ Error en prueba ngrok:", ngrokResults.error);
  }
  console.log("==========================================================\n");
}

main();
