/**
 * Reports Routes — مسارات التقارير
 * جميع الاستعلامات مقيدة بـ storeId لعزل البيانات
 */
import { Router, Response } from "express";
import mongoose from "mongoose";
import { Sale, Product, Expense } from "../models/index";
import { authMiddleware, AuthRequest, scopeToStore } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

const toOid = (id: string) => new mongoose.Types.ObjectId(id);

// تقرير المبيعات اليومية (آخر 7 أيام)
router.get("/weekly", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const from = new Date(); from.setDate(from.getDate() - 7);
  const data = await Sale.aggregate([
    { $match: { storeId: toOid(scope.storeId), createdAt: { $gte: from }, status: "completed" } },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, sales: { $sum: "$total" }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  res.json(data);
});

// تقرير المبيعات الشهرية (آخر 6 أشهر)
router.get("/monthly", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const from = new Date(); from.setMonth(from.getMonth() - 6);
  const data = await Sale.aggregate([
    { $match: { storeId: toOid(scope.storeId), createdAt: { $gte: from }, status: "completed" } },
    { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } }, sales: { $sum: "$total" }, tax: { $sum: "$taxAmt" }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  res.json(data);
});

// أكثر المنتجات مبيعاً
router.get("/top-products", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const data = await Sale.aggregate([
    { $match: { storeId: toOid(scope.storeId), status: "completed" } },
    { $unwind: "$items" },
    { $group: { _id: "$items.productId", name: { $first: "$items.nameAr" }, qty: { $sum: "$items.qty" }, revenue: { $sum: "$items.total" } } },
    { $sort: { revenue: -1 } },
    { $limit: 10 },
  ]);
  res.json(data);
});

// تقرير طرق الدفع
router.get("/payment-methods", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const data = await Sale.aggregate([
    { $match: { storeId: toOid(scope.storeId), status: "completed" } },
    { $group: { _id: "$payMethod", total: { $sum: "$total" }, count: { $sum: 1 } } },
  ]);
  res.json(data);
});

// تقرير المخزون
router.get("/inventory", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const products = await Product.find({ storeId: scope.storeId }).select("nameAr sku stock minStock costPrice");
  const totalValue = products.reduce((a, p) => a + p.stock * p.costPrice, 0);
  const lowStock = products.filter(p => p.stock <= p.minStock && p.stock > 0);
  const outOfStock = products.filter(p => p.stock === 0);
  res.json({ totalValue, totalProducts: products.length, lowStock, outOfStock, products });
});

// تقرير الضريبة
router.get("/tax", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const { month } = req.query;
  const from = month ? new Date(`${month}-01`) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const to = new Date(from); to.setMonth(to.getMonth() + 1);

  const data = await Sale.aggregate([
    { $match: { storeId: toOid(scope.storeId), createdAt: { $gte: from, $lt: to }, status: "completed" } },
    { $group: { _id: null, totalSales: { $sum: "$total" }, totalTax: { $sum: "$taxAmt" }, totalDiscount: { $sum: "$discountAmt" }, count: { $sum: 1 } } },
  ]);
  res.json(data[0] || { totalSales: 0, totalTax: 0, totalDiscount: 0, count: 0 });
});

// إحصائيات عامة للمتجر
router.get("/summary", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const oid = toOid(scope.storeId);
  const today = new Date(); today.setHours(0,0,0,0);
  const month = new Date(today.getFullYear(), today.getMonth(), 1);

  const [todayR, monthR, totalR, products, expenses] = await Promise.all([
    Sale.aggregate([{ $match: { storeId: oid, createdAt: { $gte: today }, status: "completed" } }, { $group: { _id: null, total: { $sum: "$total" }, count: { $sum: 1 } } }]),
    Sale.aggregate([{ $match: { storeId: oid, createdAt: { $gte: month }, status: "completed" } }, { $group: { _id: null, total: { $sum: "$total" }, count: { $sum: 1 } } }]),
    Sale.countDocuments({ storeId: oid, status: "completed" }),
    Product.countDocuments({ storeId: scope.storeId }),
    Expense.aggregate([{ $match: { storeId: oid, createdAt: { $gte: month } } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
  ]);

  res.json({
    today: todayR[0] || { total: 0, count: 0 },
    month: monthR[0] || { total: 0, count: 0 },
    totalSales: totalR,
    totalProducts: products,
    monthExpenses: expenses[0]?.total || 0,
  });
});

export default router;
