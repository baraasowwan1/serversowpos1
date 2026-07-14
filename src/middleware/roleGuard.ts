/**
 * Role Guard Middleware — حماية المسارات حسب دور المستخدم
 * Enforces role-based access on the backend — not just hidden buttons in the frontend.
 */
import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth";

type Role = "owner" | "manager" | "cashier" | "inventory" | "accountant";

// Operations allowed per role
const ROLE_PERMISSIONS: Record<Role, string[]> = {
  owner:     ["*"],
  manager:   [
    "sales:read","sales:create","sales:void",
    "products:read","products:create","products:update",
    "customers:read","customers:create","customers:update",
    "inventory:read","inventory:adjust",
    "reports:read","expenses:read","expenses:create",
    "purchases:read","purchases:create",
    "users:read","settings:read",
    "promotions:read","promotions:create","promotions:update",
    "coupons:read","coupons:create",
    "returns:read","returns:create",
    "branches:read",
  ],
  cashier:   [
    "sales:read","sales:create",
    "products:read",
    "customers:read","customers:create",
    "promotions:read","coupons:read",
    "gift-cards:read","gift-cards:redeem",
  ],
  inventory: [
    "products:read","products:create","products:update",
    "inventory:read","inventory:adjust",
    "suppliers:read","purchases:read","purchases:create",
    "purchase-orders:read","purchase-orders:create","purchase-orders:update",
  ],
  accountant:[
    "sales:read","reports:read","expenses:read","expenses:create",
    "purchases:read","returns:read","customers:read",
  ],
};

function canPerform(role: string, operation: string): boolean {
  const perms = ROLE_PERMISSIONS[role as Role];
  if (!perms) return false;
  if (perms[0] === "*") return true;
  return perms.includes(operation);
}

/**
 * Guard a route with a required operation.
 * Super admins are allowed everything.
 * Owners are allowed everything for their store.
 */
export function requirePermission(operation: string) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    // Super admin can do anything
    if (req.isSuperAdmin) { next(); return; }

    const role = req.userRole || "cashier";
    if (!canPerform(role, operation)) {
      res.status(403).json({
        success: false,
        code: "FORBIDDEN",
        message: `ليس لديك صلاحية لتنفيذ هذه العملية (${operation})`,
        requestId: req.requestId,
      });
      return;
    }
    next();
  };
}

/**
 * Only owners and super admins can access the route.
 */
export function ownerOnly(req: AuthRequest, res: Response, next: NextFunction): void {
  if (req.isSuperAdmin) { next(); return; }
  if (req.userRole === "owner" || req.userRole === "manager") { next(); return; }
  res.status(403).json({
    success: false,
    code: "OWNER_ONLY",
    message: "هذا المسار مخصص لمالك المتجر أو المدير فقط",
    requestId: req.requestId,
  });
}
