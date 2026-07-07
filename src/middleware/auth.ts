/**
 * JWT Authentication Middleware
 */
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { Store } from "../models/index";

interface JWTPayload { storeId?: string; isSuperAdmin?: boolean; email: string; }

// AuthRequest extends Request fully — fixes body/params/query errors
export interface AuthRequest extends Request {
  store?: { id: string; nameAr: string; plan: string; status: string };
  isSuperAdmin?: boolean;
}

export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "يجب تسجيل الدخول" });

  try {
    const decoded = jwt.verify(token, process.env["JWT_SECRET"] as string) as JWTPayload;

    if (decoded.isSuperAdmin) {
      req.isSuperAdmin = true;
      return next();
    }

    if (!decoded.storeId) return res.status(401).json({ error: "توكن غير صالح" });

    const store = await Store.findById(decoded.storeId).select("nameAr plan status expiresAt");
    if (!store) return res.status(401).json({ error: "المتجر غير موجود" });
    if (store.status === "suspended") return res.status(403).json({ error: "حسابك موقوف، تواصل مع الدعم" });
    if (store.expiresAt && new Date(store.expiresAt) < new Date()) {
      await Store.findByIdAndUpdate(decoded.storeId, { status: "expired" });
      return res.status(403).json({ error: "انتهت صلاحية اشتراكك، جدد للاستمرار" });
    }

    req.store = { id: decoded.storeId, nameAr: store.nameAr, plan: store.plan, status: store.status };
    next();
  } catch {
    res.status(401).json({ error: "توكن غير صالح أو منتهي الصلاحية" });
  }
};

export const superAdminOnly = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.isSuperAdmin) return res.status(403).json({ error: "هذا المسار للمدير العام فقط" });
  next();
};

export const scopeToStore = (req: AuthRequest): { storeId: string } => {
  if (!req.store?.id) throw new Error("Store scope required");
  return { storeId: req.store.id };
};
