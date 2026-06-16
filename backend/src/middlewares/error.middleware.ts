import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/AppError";
import { Prisma } from "@prisma/client";

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (err instanceof AppError) {
    const body: Record<string, unknown> = {
      message: err.message
    };
    if (err.code) body.code = err.code;
    res.status(err.statusCode).json(body);
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2025") {
      res.status(404).json({ message: "Registro no encontrado." });
      return;
    }
    if (err.code === "P2002") {
      res.status(409).json({
        message: "Ya existe un registro con ese valor único."
      });
      return;
    }
    res.status(400).json({
      message: "Error en la operación de base de datos.",
      code: err.code
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    res.status(400).json({
      message: "Datos inválidos enviados al servidor."
    });
    return;
  }

  console.error("[ErrorHandler] Error no controlado:", err);
  res.status(500).json({
    message: "Error interno del servidor."
  });
};
