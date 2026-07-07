/**
 * JWT Authentication Middleware
 * يتحقق من token ويُحضر بيانات المتجر من Database
 */
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { Store } from "../models/index";

interface JWTPayload {
  userId?:       string;
  storeId?:      string;
  role?:         string;
  email:         string;
  isSuperAdmin?: boolean;
}

export interface AuthRequest extends Request {
  store?:        { id: string; nameAr: string; plan: string; status: string };
  userId?:       string;
  userRole?:     string;
  isSuperAdmin?: boolean;
}

export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "يجب تسجيل الدخول" });
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ error: "توكن غير موجود" });
  }

  try {
    const decoded = jwt.verify(token, process.env["JWT_SECRET"] as string) as JWTPayload;

    if (decoded.isSuperAdmin) {
      req.isSuperAdmin = true;
      return next();
    }

    if (!decoded.storeId) {
      return res.status(401).json({ error: "توكن غير صالح" });
    }

    // تحقق من المتجر في Database
    const store = await Store.findById(decoded.storeId).select("nameAr plan status expiresAt");
    if (!store) {
      return res.status(401).json({ error: "المتجر غير موجود" });
    }

    if (store.status === "suspended") {
      return res.status(403).json({ error: "هذا المتجر موقوف" });
    }

    if (new Date(store.expiresAt) < new Date()) {
      await Store.findByIdAndUpdate(decoded.storeId, { status: "expired" });
      return res.status(403).json({ error: "انتهت صلاحية اشتراك المتجر" });
    }

    req.store    = { id: decoded.storeId, nameAr: store.nameAr, plan: store.plan, status: store.status };
    req.userId   = decoded.userId;
    req.userRole = decoded.role;

    return next();
  } catch (err) {
    return res.status(401).json({ error: "توكن غير صالح أو منتهي الصلاحية" });
  }
};

export const superAdminOnly = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.isSuperAdmin) {
    return res.status(403).json({ error: "هذا المسار مخصص للمدير العام فقط" });
  }
  return next();
};

// كل query مقيد بـ storeId — Multi-Tenant Safety
export const scopeToStore = (req: AuthRequest): { storeId: string } => {
  if (!req.store?.id) throw new Error("Store scope required — no store in request");
  return { storeId: req.store.id };
};
