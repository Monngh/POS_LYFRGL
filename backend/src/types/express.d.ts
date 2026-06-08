import { Request } from "express";

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: number;
        customerId?: number;
        email: string | null;
        role: string;
        branchId: number;
      };
    }
  }
}
