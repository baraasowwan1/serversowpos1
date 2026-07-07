import { Router, Response } from "express";
import { Product } from "../models/index";
import { authMiddleware, AuthRequest, scopeToStore } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

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
