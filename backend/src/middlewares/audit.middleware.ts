import { Request, Response, NextFunction } from "express";
import { prisma } from "../app";

export const auditReport = (reportName: string, reportType: string) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    next();

    if (!req.user) return;

    const ip =
      (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
      req.ip ||
      "unknown";
    const filters = JSON.stringify(req.query);

    prisma.reportAuditLog
      .create({
        data: {
          userId: req.user.userId,
          branchId: req.user.branchId || null,
          reportName,
          reportType,
          filters,
          ipAddress: ip,
        },
      })
      .catch((err: unknown) => {
        console.error("[AuditMiddleware] Error guardando log:", err);
      });
  };
};
