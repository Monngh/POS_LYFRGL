import express, { Request, Response } from "express";
import path from "path";
import cors from "cors";
import helmet from "helmet";
import { PrismaClient } from "@prisma/client";
import { logger } from "./utils/logger";
import { errorHandler } from "./middlewares/error.middleware";
import authRouter from "./routes/auth.routes";
import cashSessionRouter from "./routes/cashSession.routes";
import productRouter from "./routes/product.routes";
import saleRouter from "./routes/sale.routes";
import publicSaleRouter from "./routes/publicSale.routes";
import mercadopagoRouter from "./routes/mercadopago.routes";
import promotionRouter from "./routes/promotion.routes";
import dashboardRouter from "./routes/dashboard.routes";
import adminRouter from "./routes/admin.routes";
import returnRouter from "./routes/return.routes";
import adminTaxRouter from "./routes/adminTax.routes";
import adminPromotionRouter from "./routes/adminPromotion.routes";
import adminCategoryRouter from "./routes/adminCategory.routes";
import customerRouter from "./routes/customer.routes";
import parkedSaleRouter from "./routes/parkedSale.routes";
import adminPriceAdjustmentRoutes from "./routes/adminPriceAdjustment.routes";

// Inicializar cliente de Prisma como Singleton
export const prisma = new PrismaClient();

const app = express();

// Detrás de Nginx (VPS): confiar en el primer proxy para que req.ip y el
// rate-limit usen la IP real del cliente (X-Forwarded-For), no la del proxy.
app.set("trust proxy", 1);

// Middlewares globales de seguridad y utilidades
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.http(`${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms`);
  });
  next();
});

app.use(helmet());
app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://pos-fmb.vercel.app",
    "https://pos-lyfrgl.vercel.app"
  ],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Device-Id"]
}));
app.use(express.json({ limit: "15mb" }));

// Registro de rutas de API
app.use("/api/auth", authRouter);
app.use("/api/cash-session", cashSessionRouter);
app.use("/api/products", productRouter);
app.use("/api/sales", saleRouter);
app.use("/api/public/sales", publicSaleRouter);
app.use("/api/mercadopago", mercadopagoRouter);
app.use("/api/promotions", promotionRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/admin", adminRouter);
app.use("/api/returns", returnRouter);
app.use("/api/admin-tax", adminTaxRouter);
app.use("/api/admin-promotions", adminPromotionRouter);
app.use("/api/admin-categories", adminCategoryRouter);
app.use("/api/customers", customerRouter);
app.use("/api/parked-sales", parkedSaleRouter);
app.use("/api/admin-price-adjustments", adminPriceAdjustmentRoutes);

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

// Manejo global de rutas no encontradas (404) para la API
app.use("/api/*", (_req: Request, res: Response) => {
  res.status(404).json({
    message: `Ruta ${_req.originalUrl} no encontrada.`
  });
});

// Middleware global de manejo de errores (debe ir después de todas las rutas)
app.use(errorHandler);

// Servir frontend estático solo si la carpeta dist existe
import fs from "fs";
const frontendDistPath = path.join(__dirname, "../../frontend/dist");
if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));
  app.get("*", (_req: Request, res: Response) => {
    res.sendFile(path.join(frontendDistPath, "index.html"));
  });
}

export default app;
