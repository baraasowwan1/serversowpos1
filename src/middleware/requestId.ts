/**
 * Request ID Middleware — معرّف فريد لكل طلب لتتبع الأخطاء
 */
import { Request, Response, NextFunction } from "express";
import { randomBytes } from "crypto";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const id = randomBytes(8).toString("hex");
  req.requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
}
