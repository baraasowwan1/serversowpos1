/**
 * Reports Routes — مسارات التقارير
 * جميع الاستعلامات مقيدة بـ storeId لعزل البيانات
 */
import { Router, Response } from "express";
import mongoose from "mongoose";
import { Sale, Product, Expense, Customer } from "../models/index";
import { authMiddleware, AuthRequest, scopeToStore } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

const toOid = (id: string) => new mongoose.Types.ObjectId(id);

// تقرير المبيعات اليومية (آخر 7 أيام) — returns Arabic day names for charts
router.get("/weekly", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const from = new Date(); from.setDate(from.getDate() - 7);
  const raw = await Sale.aggregate([
    { $match: { storeId: toOid(scope.storeId), createdAt: { $gte: from }, status: "completed" } },
    { $group: { _id: { $dayOfWeek: "$createdAt" }, مبيعات: { $sum: "$total" }, أرباح: { $sum: { $subtract: ["$total", { $ifNull: ["$costTotal", 0] }] } } } },
    { $sort: { _id: 1 } },
  ]);
  const DAYS: Record<number, string> = { 1: "الأحد", 2: "الاثنين", 3: "الثلاثاء", 4: "الأربعاء", 5: "الخميس", 6: "الجمعة", 7: "السبت" };
  const allDays = [7,1,2,3,4,5,6].map(d => {
    const found = raw.find((r: { _id: number; مبيعات: number; أرباح: number }) => r._id === d);
    return { day: DAYS[d], مبيعات: found ? Math.round(found.مبيعات * 1000) / 1000 : 0, أرباح: found ? Math.round(found.أرباح * 1000) / 1000 : 0 };
  });
  res.json(allDays);
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
  const limit = Math.min(20, parseInt(String(req.query["limit"] || 10)));
  const data = await Sale.aggregate([
    { $match: { storeId: toOid(scope.storeId), status: "completed" } },
    { $unwind: "$items" },
    { $group: { _id: "$items.productId", nameAr: { $first: "$items.nameAr" }, qty: { $sum: "$items.qty" }, total: { $sum: "$items.total" } } },
    { $sort: { total: -1 } },
    { $limit: limit },
    { $project: { _id: 0, nameAr: 1, qty: 1, total: 1 } },
  ]);
  res.json(data);
});

// تقرير طرق الدفع
router.get("/payment-methods", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const raw = await Sale.aggregate([
    { $match: { storeId: toOid(scope.storeId), status: "completed" } },
    { $group: { _id: "$payMethod", total: { $sum: "$total" }, count: { $sum: 1 } } },
  ]);
  const grandTotal = raw.reduce((a: number, r: { total: number }) => a + r.total, 0) || 1;
  const data = raw.map((r: { _id: string; total: number; count: number }) => ({
    method: r._id || "نقدي",
    total: r.total,
    count: r.count,
    pct: Math.round((r.total / grandTotal) * 100),
  }));
  res.json(data);
});

// تقرير المبيعات بالساعة (اليوم)
router.get("/hourly", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const today = new Date(); today.setHours(0,0,0,0);
  const raw = await Sale.aggregate([
    { $match: { storeId: toOid(scope.storeId), createdAt: { $gte: today }, status: "completed" } },
    { $group: { _id: { $hour: "$createdAt" }, v: { $sum: "$total" } } },
    { $sort: { _id: 1 } },
  ]);
  const HOURS = [
    { h: "8ص", hr: 8 }, { h: "9ص", hr: 9 }, { h: "10ص", hr: 10 }, { h: "11ص", hr: 11 },
    { h: "12م", hr: 12 }, { h: "1م", hr: 13 }, { h: "2م", hr: 14 }, { h: "3م", hr: 15 },
    { h: "4م", hr: 16 }, { h: "5م", hr: 17 }, { h: "6م", hr: 18 }, { h: "7م", hr: 19 },
  ];
  const data = HOURS.map(({ h, hr }) => {
    const found = raw.find((r: { _id: number; v: number }) => r._id === hr);
    return { h, v: found ? Math.round(found.v * 1000) / 1000 : 0 };
  });
  res.json(data);
});

// ملخص الفترة (أسبوع/شهر/سنة)
router.get("/period", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const range = String(req.query["range"] || "week");
  const now = new Date();
  let from: Date;
  if (range === "week") { from = new Date(now); from.setDate(now.getDate() - 7); }
  else if (range === "month") { from = new Date(now.getFullYear(), now.getMonth(), 1); }
  else { from = new Date(now.getFullYear(), 0, 1); }

  const data = await Sale.aggregate([
    { $match: { storeId: toOid(scope.storeId), createdAt: { $gte: from }, status: "completed" } },
    { $group: { _id: null, total: { $sum: "$total" }, count: { $sum: 1 }, discounts: { $sum: { $ifNull: ["$discountAmt", 0] } }, profit: { $sum: { $subtract: ["$total", { $ifNull: ["$costTotal", 0] }] } } } },
  ]);
  const returns = await Sale.aggregate([
    { $match: { storeId: toOid(scope.storeId), createdAt: { $gte: from }, status: "returned" } },
    { $group: { _id: null, total: { $sum: "$total" } } },
  ]);
  const r = data[0] || { total: 0, count: 0, discounts: 0, profit: 0 };
  res.json({ total: r.total, count: r.count, profit: r.profit, discounts: r.discounts, returns: returns[0]?.total || 0 });
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
  const { month } = req.query as { month?: string };
  const from = month ? new Date(`${month}-01`) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const to = new Date(from); to.setMonth(to.getMonth() + 1);

  const data = await Sale.aggregate([
    { $match: { storeId: toOid(scope.storeId), createdAt: { $gte: from, $lt: to }, status: "completed" } },
    { $group: { _id: null, totalSales: { $sum: "$total" }, totalTax: { $sum: "$taxAmt" }, totalDiscount: { $sum: "$discountAmt" }, count: { $sum: 1 } } },
  ]);
  const r = data[0] || { totalSales: 0, totalTax: 0, totalDiscount: 0, count: 0 };
  res.json({
    taxableSales: r.totalSales - (r.totalTax || 0),
    taxAmount:    r.totalTax || 0,
    exemptSales:  0,
    totalSales:   r.totalSales,
    totalDiscount: r.totalDiscount,
    count:        r.count,
  });
});

// إحصائيات عامة للمتجر
router.get("/summary", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const oid = toOid(scope.storeId);
  const today = new Date(); today.setHours(0,0,0,0);
  const month = new Date(today.getFullYear(), today.getMonth(), 1);

  const [todayR, monthR, totalR, products, expenses, customers, lowStockCount] = await Promise.all([
    Sale.aggregate([{ $match: { storeId: oid, createdAt: { $gte: today }, status: "completed" } }, { $group: { _id: null, total: { $sum: "$total" }, count: { $sum: 1 } } }]),
    Sale.aggregate([{ $match: { storeId: oid, createdAt: { $gte: month }, status: "completed" } }, { $group: { _id: null, total: { $sum: "$total" }, count: { $sum: 1 } } }]),
    Sale.countDocuments({ storeId: oid, status: "completed" }),
    Product.countDocuments({ storeId: scope.storeId }),
    Expense.aggregate([{ $match: { storeId: oid, createdAt: { $gte: month } } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
    Customer.countDocuments({ storeId: scope.storeId }),
    Product.countDocuments({ storeId: scope.storeId, $expr: { $lte: ["$stock", "$minStock"] } }),
  ]);

  res.json({
    today:          todayR[0] || { total: 0, count: 0 },
    month:          monthR[0] || { total: 0, count: 0 },
    totalSales:     totalR,
    totalProducts:  products,
    monthExpenses:  expenses[0]?.total || 0,
    totalCustomers: customers,
    lowStock:       lowStockCount,
  });
});

export default router;
