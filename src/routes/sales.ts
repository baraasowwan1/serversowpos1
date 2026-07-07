/**
 * Sales Routes — مسارات الفواتير
 */
import { Router, Response } from "express";
import { Sale, Product } from "../models/index";
import { authMiddleware, AuthRequest, scopeToStore } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

// جميع فواتير المتجر
router.get("/", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const { from, to, limit = "50" } = req.query as { from?: string; to?: string; limit?: string };
  const filter: Record<string, unknown> = { storeId: scope.storeId };
  if (from || to) {
    const dateFilter: Record<string, Date> = {};
    if (from) dateFilter["$gte"] = new Date(from);
    if (to) dateFilter["$lte"] = new Date(to);
    filter["createdAt"] = dateFilter;
  }
  const sales = await Sale.find(filter).sort({ createdAt: -1 }).limit(Number(limit));
  res.json(sales);
});

// إنشاء فاتورة جديدة + خصم من المخزون
router.post("/", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const { items, subtotal, discountAmt, taxAmt, total, payMethod, cashIn, change } = req.body;
  if (!items?.length || !total) return res.status(400).json({ error: "بيانات الفاتورة ناقصة" });

  const count = await Sale.countDocuments({ storeId: scope.storeId });
  const invoiceNo = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(6, "0")}`;

  const sale = await Sale.create({
    storeId: scope.storeId, invoiceNo, items,
    subtotal, discountAmt, taxAmt, total,
    payMethod, cashIn, change, status: "completed"
  });

  // خصم من المخزون تلقائياً
  for (const item of items) {
    await Product.findOneAndUpdate(
      { _id: item.productId, storeId: scope.storeId },
      { $inc: { stock: -item.qty } }
    );
  }

  res.status(201).json(sale);
});

// إحصائيات المبيعات
router.get("/stats", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const month = new Date(today.getFullYear(), today.getMonth(), 1);

  const [todaySales, monthSales, totalSales] = await Promise.all([
    Sale.aggregate([
      { $match: { storeId: scope.storeId, createdAt: { $gte: today }, status: "completed" } },
      { $group: { _id: null, total: { $sum: "$total" }, count: { $sum: 1 } } }
    ]),
    Sale.aggregate([
      { $match: { storeId: scope.storeId, createdAt: { $gte: month }, status: "completed" } },
      { $group: { _id: null, total: { $sum: "$total" }, count: { $sum: 1 } } }
    ]),
    Sale.countDocuments({ storeId: scope.storeId, status: "completed" }),
  ]);

  res.json({
    today: todaySales[0] || { total: 0, count: 0 },
    month: monthSales[0] || { total: 0, count: 0 },
    totalSales,
  });
});

export default router;
