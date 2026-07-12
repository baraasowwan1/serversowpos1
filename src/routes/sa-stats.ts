import { Router, Request, Response } from "express";
import mongoose, { Model } from "mongoose";
import { authMiddleware, superAdminOnly } from "../middleware/auth";
import { Sale } from "../models";

type AnyModel = Model<any>;

const router = Router();
router.use(authMiddleware, superAdminOnly);

// GET /api/super-admin/stats/monthly
// Returns last 6 months of revenue + expenses across all stores
router.get("/monthly", async (_req: Request, res: Response) => {
  try {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const result = await Sale.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo }, status: { $ne: "voided" } } },
      {
        $group: {
          _id: {
            year:  { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          إيرادات: { $sum: "$total" },
          أرباح:   { $sum: { $subtract: ["$total", { $ifNull: ["$cost", 0] }] } },
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    const AR_MONTHS = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

    // Build a 6-month skeleton then fill
    const months: { month: string; إيرادات: number; مصروفات: number; أرباح: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      months.push({ month: AR_MONTHS[d.getMonth()], إيرادات: 0, مصروفات: 0, أرباح: 0 });
    }

    result.forEach((r: { _id: { year: number; month: number }; إيرادات: number; أرباح: number }) => {
      const d = new Date(r._id.year, r._id.month - 1, 1);
      const label = AR_MONTHS[d.getMonth()];
      const entry = months.find(m => m.month === label);
      if (entry) {
        entry.إيرادات = Math.round(r.إيرادات * 1000) / 1000;
        entry.أرباح   = Math.round(r.أرباح * 1000) / 1000;
      }
    });

    res.json(months);
  } catch (e) {
    console.error("[sa-stats/monthly]", e);
    res.status(500).json({ error: "فشل جلب الإحصائيات" });
  }
});

// GET /api/super-admin/stats/kpi
// Total stores, revenue this month, active subscriptions
router.get("/kpi", async (_req: Request, res: Response) => {
  try {
    const Store = mongoose.model("Store") as AnyModel;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalStores, activeStores, monthRevenue, totalRevenue] = await Promise.all([
      Store.countDocuments(),
      Store.countDocuments({ status: "active" }),
      Sale.aggregate([
        { $match: { createdAt: { $gte: monthStart }, status: { $ne: "voided" } } },
        { $group: { _id: null, total: { $sum: "$total" } } },
      ]).then((r: { total: number }[]) => r[0]?.total || 0),
      Sale.aggregate([
        { $match: { status: { $ne: "voided" } } },
        { $group: { _id: null, total: { $sum: "$total" } } },
      ]).then((r: { total: number }[]) => r[0]?.total || 0),
    ]);

    res.json({ totalStores, activeStores, monthRevenue, totalRevenue });
  } catch (e) {
    res.status(500).json({ error: "فشل جلب KPIs" });
  }
});

// GET /api/super-admin/stats/export
// Full data export as JSON (for backup download)
router.get("/export", async (_req: Request, res: Response) => {
  try {
    const Store   = mongoose.model("Store") as AnyModel;
    const User    = mongoose.model("User") as AnyModel;
    const Product = mongoose.model("Product") as AnyModel;

    const [stores, users, sales, products] = await Promise.all([
      Store.find().select("-__v").lean(),
      User.find().select("-password -__v").lean(),
      Sale.find().select("-__v").lean(),
      Product.find().select("-__v").lean(),
    ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      version: "1.0",
      stores,
      users,
      sales,
      products,
    };

    res.setHeader("Content-Disposition", `attachment; filename="sowwanjo-backup-${new Date().toISOString().split("T")[0]}.json"`);
    res.setHeader("Content-Type", "application/json");
    res.json(exportData);
  } catch (e) {
    res.status(500).json({ error: "فشل تصدير البيانات" });
  }
});

export default router;
