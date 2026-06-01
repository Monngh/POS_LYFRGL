import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import { PrismaClient } from "@prisma/client";
import authRouter from "./routes/auth.routes";

// Inicializar cliente de Prisma como Singleton
export const prisma = new PrismaClient();

const app = express();

// Middlewares globales de seguridad y utilidades
app.use(helmet());
app.use(cors({
  origin: "*", // En producción configurar para los dominios permitidos
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());

// Registro de rutas de API
app.use("/api/auth", authRouter);

// Ruta de healthcheck
app.get("/health", async (_req: Request, res: Response) => {
  try {
    // Probar conexión a la base de datos SQL Server mediante Prisma
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      status: "OK",
      timestamp: new Date(),
      services: {
        api: "healthy",
        database: "connected"
      }
    });
  } catch (error: any) {
    res.status(500).json({
      status: "ERROR",
      timestamp: new Date(),
      services: {
        api: "healthy",
        database: "disconnected"
      },
      error: error.message
    });
  }
});

// Manejo global de rutas no encontradas (404)
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    message: `Ruta ${_req.originalUrl} no encontrada.`
  });
});

export default app;
