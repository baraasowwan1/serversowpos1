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
  const { from, to, limit = 50 } = req.query;
  const filter: Record<string,unknown> = scopeToStore(req);
  if (from || to) {
    const dateFilter: Record<string,Date> = {};
    if (from) dateFilter["$gte"] = new Date(from as string);
    if (to) dateFilter["$lte"] = new Date(to as string);
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

  // Generate invoice number
  const count = await Sale.countDocuments(scope);
  const invoiceNo = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(6, "0")}`;

  const sale = await Sale.create({ ...scope, invoiceNo, items, subtotal, discountAmt, taxAmt, total, payMethod, cashIn, change, status: "completed" });

  // خصم من المخزون تلقائياً
  for (const item of items) {
    await Product.findOneAndUpdate(
      { _id: item.productId, ...scope },
      { $inc: { stock: -item.qty } }
    );
  }

  res.status(201).json(sale);
});

// إحصائيات المبيعات
router.get("/stats", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const today = new Date(); today.setHours(0,0,0,0);
  const month = new Date(today.getFullYear(), today.getMonth(), 1);

  const [todaySales, monthSales, totalSales] = await Promise.all([
    Sale.aggregate([{ $match: { ...scope, createdAt: { $gte: today }, status: "completed" } }, { $group: { _id: null, total: { $sum: "$total" }, count: { $sum: 1 } } }]),
    Sale.aggregate([{ $match: { ...scope, createdAt: { $gte: month }, status: "completed" } }, { $group: { _id: null, total: { $sum: "$total" }, count: { $sum: 1 } } }]),
    Sale.countDocuments({ ...scope, status: "completed" }),
  ]);

  res.json({
    today: todaySales[0] || { total: 0, count: 0 },
    month: monthSales[0] || { total: 0, count: 0 },
    totalSales,
  });
});

export default router;
