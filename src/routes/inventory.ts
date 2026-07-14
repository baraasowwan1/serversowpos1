import { Router, Response } from "express";
import { Product } from "../models/index";
import { authMiddleware, AuthRequest, scopeToStore } from "../middleware/auth";
import { requirePermission } from "../middleware/roleGuard";

const router = Router();
router.use(authMiddleware);

function errRes(res: Response, req: AuthRequest, status: number, code: string, message: string) {
  return res.status(status).json({ success: false, code, message, requestId: req.requestId });
}

// GET /inventory?lowStock=true&limit=N — منتجات منخفضة المخزون
router.get("/", requirePermission("inventory:read"), async (req: AuthRequest, res: Response) => {
  try {
    const scope = scopeToStore(req);
    const lim = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const filter: Record<string, unknown> = { storeId: scope.storeId };
    if (req.query.lowStock === "true") {
      filter.$expr = { $lte: ["$stock", "$minStock"] };
    }
    const products = await Product.find(filter)
      .select("nameAr nameEn sku stock minStock unit")
      .limit(lim)
      .lean();
    res.json({ success: true, data: products });
  } catch {
    return errRes(res, req, 500, "FETCH_ERROR", "خطأ في جلب بيانات المخزون");
  }
});

// جرد المخزون — تحديث كميات متعددة دفعة واحدة
router.post("/count", requirePermission("inventory:update"), async (req: AuthRequest, res: Response) => {
  try {
    const scope = scopeToStore(req);
    const { counts } = req.body as { counts: { productId: string; actualQty: number }[] };
    const results = [];
    for (const { productId, actualQty } of (counts || [])) {
      const p = await Product.findOneAndUpdate(
        { _id: productId, storeId: scope.storeId },
        { stock: actualQty },
        { new: true }
      );
      if (p) results.push(p);
    }
    res.json({ success: true, data: { updated: results.length, products: results } });
  } catch {
    return errRes(res, req, 500, "COUNT_ERROR", "خطأ في تحديث الجرد");
  }
});

export default router;
