/**
 * Sales Routes — مسارات الفواتير
 */
import { Router, Response } from "express";
import mongoose from "mongoose";
import { Sale, Product, Customer } from "../models/index";
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
  const {
    items, subtotal, discountAmt, taxAmt, total, payMethod, cashIn, change,
    customerId, customerName, customerPhone,
    loyaltyPointsEarned, loyaltyPointsRedeemed,
  } = req.body;
  if (!items?.length || !total) return res.status(400).json({ error: "بيانات الفاتورة ناقصة" });

  const count = await Sale.countDocuments({ storeId: scope.storeId });
  const invoiceNo = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(6, "0")}`;

  const sale = await Sale.create({
    storeId: scope.storeId, invoiceNo, items,
    subtotal, discountAmt, taxAmt, total,
    payMethod, cashIn, change, status: "completed",
    customerId, customerName, customerPhone,
  });

  // خصم من المخزون تلقائياً
  for (const item of items) {
    await Product.findOneAndUpdate(
      { _id: item.productId, storeId: scope.storeId },
      { $inc: { stock: -item.qty } }
    );
  }

  // ذمم: أضف الدين على العميل عند الدفع بالذمة
  if (payMethod === "credit" && customerId) {
    await Customer.findOneAndUpdate(
      { _id: customerId, storeId: scope.storeId },
      { $inc: { debt: total, totalPurchases: total } }
    );
  } else if (customerId) {
    await Customer.findOneAndUpdate(
      { _id: customerId, storeId: scope.storeId },
      { $inc: { totalPurchases: total } }
    );
  }

  // نقاط الولاء: منح أو خصم نقاط
  if (customerId && (loyaltyPointsEarned || loyaltyPointsRedeemed)) {
    const delta = (loyaltyPointsEarned || 0) - (loyaltyPointsRedeemed || 0);
    if (delta !== 0) {
      await Customer.findOneAndUpdate(
        { _id: customerId, storeId: scope.storeId },
        { $inc: { loyaltyPoints: delta } }
      );
    }
  }

  res.status(201).json(sale);
});

// إلغاء فاتورة (Void)
router.patch("/:id/void", async (req: AuthRequest, res: Response) => {
  try {
    const scope = scopeToStore(req);
    const sale = await Sale.findOne({ _id: req.params.id, storeId: scope.storeId });
    if (!sale) return res.status(404).json({ error: "الفاتورة غير موجودة" });
    if (sale.status === "voided") return res.status(400).json({ error: "الفاتورة ملغاة مسبقاً" });

    sale.status = "voided";
    await sale.save();

    // إعادة المخزون
    for (const item of sale.items) {
      await Product.findOneAndUpdate(
        { _id: item.productId, storeId: scope.storeId },
        { $inc: { stock: item.qty } }
      );
    }

    // إلغاء الدين عند الذمة
    if (sale.payMethod === "credit" && sale.customerId) {
      await Customer.findOneAndUpdate(
        { _id: sale.customerId, storeId: scope.storeId },
        { $inc: { debt: -sale.total, totalPurchases: -sale.total } }
      );
    } else if (sale.customerId) {
      await Customer.findOneAndUpdate(
        { _id: sale.customerId, storeId: scope.storeId },
        { $inc: { totalPurchases: -sale.total } }
      );
    }

    res.json({ success: true, sale });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message || "خطأ في إلغاء الفاتورة" });
  }
});

// إحصائيات المبيعات
router.get("/stats", async (req: AuthRequest, res: Response) => {
  try {
    const scope = scopeToStore(req);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const month = new Date(today.getFullYear(), today.getMonth(), 1);
    // aggregate() bypasses Mongoose type-casting — must use ObjectId explicitly
    const storeOid = new mongoose.Types.ObjectId(scope.storeId);

    const [todaySales, monthSales, totalSales] = await Promise.all([
      Sale.aggregate([
        { $match: { storeId: storeOid, createdAt: { $gte: today }, status: "completed" } },
        { $group: { _id: null, total: { $sum: "$total" }, count: { $sum: 1 } } }
      ]),
      Sale.aggregate([
        { $match: { storeId: storeOid, createdAt: { $gte: month }, status: "completed" } },
        { $group: { _id: null, total: { $sum: "$total" }, count: { $sum: 1 } } }
      ]),
      Sale.countDocuments({ storeId: scope.storeId, status: "completed" }),
    ]);

    res.json({
      today: todaySales[0] || { total: 0, count: 0 },
      month: monthSales[0] || { total: 0, count: 0 },
      totalSales,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message || "خطأ في جلب الإحصائيات" });
  }
});

export default router;
