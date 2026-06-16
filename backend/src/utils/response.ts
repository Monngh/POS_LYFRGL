import { Response } from "express";

export const sendSuccess = (
  res: Response,
  data: unknown,
  statusCode: number = 200
) => {
  return res.status(statusCode).json(data);
};

export const sendError = (
  res: Response,
  message: string,
  statusCode: number = 500,
  code?: string
) => {
  const body: Record<string, unknown> = { message };
  if (code) body.code = code;
  return res.status(statusCode).json(body);
};
