

async function main() {
  try {
    const res = await fetch("http://127.0.0.1:4040/api/tunnels");
    if (!res.ok) {
      throw new Error(`ngrok API returned status: ${res.status}`);
    }
    const data = await res.json() as any;
    const tcpTunnel = data.tunnels?.find((t: any) => t.proto === "tcp");
    if (!tcpTunnel) {
      console.log("❌ No se encontró ningún túnel TCP activo en ngrok.");
      console.log("Asegúrate de haber iniciado ngrok con un comando como: ngrok tcp 1433");
      return;
    }

    const publicUrl = tcpTunnel.public_url; // e.g. "tcp://0.tcp.ngrok.io:21844"
    const hostPort = publicUrl.replace("tcp://", ""); // e.g. "0.tcp.ngrok.io:21844"

    console.log("\n==================================================================================");
    console.log("🔗 ¡Túnel TCP de ngrok detectado con éxito!");
    console.log(`📡 Dirección pública actual: ${hostPort}`);
    console.log("==================================================================================");
    console.log("\nComparte la siguiente línea con tus compañeros de equipo para su archivo backend/.env:\n");
    console.log(`DATABASE_URL="sqlserver://${hostPort};database=POS_FMB_DEV;user=sa;password=TuPassword#2026;trustServerCertificate=true"`);
    console.log("\n==================================================================================\n");
  } catch (err: any) {
    console.error("❌ Error al obtener la URL de ngrok.");
    console.error("Asegúrate de que ngrok está ejecutándose localmente en tu computadora.");
    console.error("Detalle del error:", err.message);
  }
}

main();
