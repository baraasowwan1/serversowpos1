import { Router, Response } from "express";
import { Product } from "../models/index";
import { authMiddleware, AuthRequest, scopeToStore } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

// GET /inventory?lowStock=true&limit=N — منتجات منخفضة المخزون
router.get("/", async (req: AuthRequest, res: Response) => {
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
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: "خطأ في جلب بيانات المخزون" });
  }
});

// جرد المخزون — تحديث كميات متعددة دفعة واحدة
router.post("/count", async (req: AuthRequest, res: Response) => {
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
  res.json({ updated: results.length, products: results });
});

export default router;
