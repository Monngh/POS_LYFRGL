import dotenv from "dotenv";
import path from "path";
// Cargar variables de entorno al inicio.
// Se resuelve la ruta del .env de forma absoluta (relativa a este archivo) para que
// funcione sin importar el directorio desde el que se lance el proceso (raíz del repo,
// botón "Run" de VS Code, etc.) y no solo cuando cwd === carpeta backend/.
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import app from "./app";

const PORT = process.env.PORT || 4000;

const server = app.listen(PORT, () => {
  console.log(`=============================================`);
  console.log(`🚀 POS Backend ejecutándose exitosamente`);
  console.log(`🔌 Puerto local de escucha: http://localhost:${PORT}`);
  console.log(`⚙️ Entorno de ejecución: ${process.env.NODE_ENV || "development"}`);
  console.log(`=============================================`);
});

// Manejo de apagado correcto (Graceful shutdown)
const gracefulShutdown = () => {
  console.log("\nCerrando servidor HTTP y conexiones de base de datos...");
  server.close(async () => {
    console.log("Servidor HTTP cerrado.");
    process.exit(0);
  });
};

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);
