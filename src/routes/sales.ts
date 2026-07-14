/**
 * Sales Routes — مسارات الفواتير
 *
 * Critical: Uses MongoDB sessions for atomic operations.
 * All stock deductions, customer updates, and sale creation happen in one transaction.
 */
import { Router, Response } from "express";
import mongoose from "mongoose";
import { Sale, Product, Customer } from "../models/index";
import { authMiddleware, AuthRequest, scopeToStore } from "../middleware/auth";
import { requirePermission } from "../middleware/roleGuard";
import {
  validateStock, deductStock, restoreStock,
  generateInvoiceNo, assertStoreActive,
} from "../services/businessRules";
import { logAudit } from "./audit";

const router = Router();
router.use(authMiddleware);

// ── Helper: standard error response ─────────────────────────────────────────
function errRes(res: Response, req: AuthRequest, status: number, code: string, message: string, details?: unknown) {
  return res.status(status).json({
    success: false,
    code,
    message,
    details: details || undefined,
    requestId: req.requestId,
  });
}

// ── GET / — جميع فواتير المتجر ────────────────────────────────────────────────
router.get("/", requirePermission("sales:read"), async (req: AuthRequest, res: Response) => {
  try {
    const scope = scopeToStore(req);
    const {
      from, to,
      limit = "50",
      cashierId: qCashierId,
      status: qStatus,
    } = req.query as { from?: string; to?: string; limit?: string; cashierId?: string; status?: string };

    const filter: Record<string, unknown> = { storeId: scope.storeId };
    if (from || to) {
      const dateFilter: Record<string, Date> = {};
      if (from) dateFilter["$gte"] = new Date(from);
      if (to)   dateFilter["$lte"] = new Date(to);
      filter["createdAt"] = dateFilter;
    }
    if (qCashierId) filter["cashierId"] = qCashierId;
    if (qStatus)    filter["status"]    = qStatus;

    const sales = await Sale.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(limit), 1000))
      .lean();

    res.json(sales);
  } catch (err: unknown) {
    return errRes(res, req, 500, "FETCH_ERROR", "خطأ في جلب الفواتير");
  }
});

// ── POST / — إنشاء فاتورة + خصم مخزون (transactional) ───────────────────────
router.post("/", requirePermission("sales:create"), async (req: AuthRequest, res: Response) => {
  const session = await mongoose.startSession();
  try {
    const scope = scopeToStore(req);

    // 1. Assert store is active
    await assertStoreActive(scope.storeId);

    const {
      items, invoiceDiscountPct = 0,
      payMethod, cashIn, change,
      cliqRef, cliqSender, cardRef,
      splitPayments,
      customerId, customerName, customerPhone,
      loyaltyPointsEarned, loyaltyPointsRedeemed,
      cashierName, cashierId,
      giftCardCode, giftCardDiscount, couponCode, couponDiscount,
    } = req.body as {
      items: Array<{ productId: string; nameAr: string; qty: number; unitPrice: number; discount: number; taxRate?: number; taxAmt?: number; total: number }>;
      invoiceDiscountPct?: number;
      payMethod: string;
      cashIn?: number; change?: number;
      cliqRef?: string; cliqSender?: string; cardRef?: string;
      splitPayments?: Array<{ method: string; amount: number }>;
      customerId?: string; customerName?: string; customerPhone?: string;
      loyaltyPointsEarned?: number; loyaltyPointsRedeemed?: number;
      cashierName?: string; cashierId?: string;
      giftCardCode?: string; giftCardDiscount?: number;
      couponCode?: string; couponDiscount?: number;
    };

    // 2. Basic input validation
    if (!items?.length) return errRes(res, req, 400, "MISSING_ITEMS", "لا توجد منتجات في الفاتورة");
    if (!payMethod)     return errRes(res, req, 400, "MISSING_PAYMENT", "طريقة الدفع مطلوبة");

    for (const item of items) {
      if (!item.productId) return errRes(res, req, 400, "INVALID_ITEM", "معرّف المنتج مطلوب لكل عنصر");
      if (!item.qty || item.qty <= 0) return errRes(res, req, 400, "INVALID_QTY", `الكمية غير صالحة للمنتج: ${item.nameAr}`);
      if (item.unitPrice == null || item.unitPrice < 0) return errRes(res, req, 400, "INVALID_PRICE", `السعر غير صالح: ${item.nameAr}`);
    }

    let result!: InstanceType<typeof Sale>;

    await session.withTransaction(async () => {
      // 3. Validate stock (inside transaction for consistency)
      const stockErrors = await validateStock(scope.storeId, items.map(i => ({
        productId: i.productId, qty: i.qty, nameAr: i.nameAr,
      })), session);
      if (stockErrors.length > 0) {
        throw Object.assign(new Error(stockErrors[0].message), { code: stockErrors[0].code, details: stockErrors[0].details, statusCode: 422 });
      }

      // 4. Generate collision-safe invoice number
      const invoiceNo = await generateInvoiceNo(scope.storeId, session);

      // 5. Build server-side totals (recalculate — do not trust frontend numbers blindly)
      const subtotal        = items.reduce((a, i) => a + i.unitPrice * i.qty, 0);
      const itemDiscAmt     = items.reduce((a, i) => a + i.unitPrice * i.qty * (i.discount / 100), 0);
      const afterItemDisc   = subtotal - itemDiscAmt;
      const invoiceDiscAmt  = afterItemDisc * (invoiceDiscountPct / 100);
      const afterAllDisc    = afterItemDisc - invoiceDiscAmt;
      const taxAmt          = items.reduce((a, i) => {
        const lineNet = i.unitPrice * i.qty * (1 - i.discount / 100) * (1 - invoiceDiscountPct / 100);
        return a + lineNet * ((i.taxRate ?? 0) / 100);
      }, 0);
      const total = round3(afterAllDisc + taxAmt - (giftCardDiscount || 0) - (couponDiscount || 0));

      if (total < 0) throw Object.assign(new Error("الإجمالي لا يمكن أن يكون سالباً"), { code: "NEGATIVE_TOTAL", statusCode: 422 });

      const resolvedCashier = cashierName || req.userId || "";

      // 6. Create sale document
      result = await Sale.create([{
        storeId: scope.storeId,
        invoiceNo,
        items: items.map(i => ({
          productId: i.productId, nameAr: i.nameAr, qty: i.qty,
          unitPrice: i.unitPrice, discount: i.discount,
          taxRate: i.taxRate ?? 0, taxAmt: i.taxAmt ?? 0,
          total: round3(i.unitPrice * i.qty * (1 - i.discount / 100)),
        })),
        subtotal: round3(subtotal),
        discountAmt: round3(itemDiscAmt + invoiceDiscAmt + (giftCardDiscount || 0) + (couponDiscount || 0)),
        taxAmt: round3(taxAmt),
        total,
        payMethod,
        cashIn:     cashIn     ?? undefined,
        change:     change     ?? undefined,
        cliqRef:    cliqRef    ?? undefined,
        cliqSender: cliqSender ?? undefined,
        cardRef:    cardRef    ?? undefined,
        customerId:   customerId   ?? undefined,
        customerName: customerName ?? "عميل نقدي",
        customerPhone: customerPhone ?? undefined,
        loyaltyPointsEarned:   loyaltyPointsEarned   ?? undefined,
        loyaltyPointsRedeemed: loyaltyPointsRedeemed ?? undefined,
        cashier:   resolvedCashier,
        cashierId: cashierId || req.userId || undefined,
        status: "completed",
      }], { session });

      // Sale.create with session returns an array
      result = Array.isArray(result) ? result[0] : result;

      // 7. Deduct stock atomically
      await deductStock(scope.storeId, items.map(i => ({
        productId: i.productId, qty: i.qty, nameAr: i.nameAr,
      })), session);

      // 8. Update customer records
      if (customerId) {
        const customerUpdate: Record<string, unknown> = { $inc: { totalPurchases: total } };
        if (payMethod === "credit") (customerUpdate["$inc"] as Record<string, number>)["debt"] = total;
        await Customer.findOneAndUpdate(
          { _id: customerId, storeId: scope.storeId },
          customerUpdate,
          { session }
        );
        // Loyalty points delta
        const pointsDelta = (loyaltyPointsEarned || 0) - (loyaltyPointsRedeemed || 0);
        if (pointsDelta !== 0) {
          await Customer.findOneAndUpdate(
            { _id: customerId, storeId: scope.storeId },
            { $inc: { loyaltyPoints: pointsDelta } },
            { session }
          );
        }
      }
    });

    // 9. Audit log (outside transaction — non-critical)
    try {
      logAudit({
        req,
        action:   "إنشاء فاتورة",
        category: "sale",
        target:   result.invoiceNo,
        details:  { total: result.total, items: items.length, payMethod },
      });
    } catch { /* non-critical */ }

    res.status(201).json({ success: true, data: result });
  } catch (err: unknown) {
    const e = err as Error & { code?: string; details?: unknown; statusCode?: number };
    const status = e.statusCode || 500;
    const code   = e.code       || "SALE_ERROR";
    return errRes(res, req, status, code, e.message || "خطأ في إنشاء الفاتورة", e.details);
  } finally {
    await session.endSession();
  }
});

// ── PATCH /:id/void — إلغاء فاتورة (owner/manager only) ──────────────────────
router.patch("/:id/void", requirePermission("sales:void"), async (req: AuthRequest, res: Response) => {
  const session = await mongoose.startSession();
  try {
    const scope  = scopeToStore(req);
    const saleId = req.params["id"];

    let voided!: InstanceType<typeof Sale>;

    await session.withTransaction(async () => {
      const sale = await Sale.findOne({ _id: saleId, storeId: scope.storeId }, null, { session });
      if (!sale) throw Object.assign(new Error("الفاتورة غير موجودة"), { code: "NOT_FOUND", statusCode: 404 });
      if (sale.status === "voided") throw Object.assign(new Error("الفاتورة ملغاة مسبقاً"), { code: "ALREADY_VOIDED", statusCode: 400 });

      sale.status = "voided";
      await sale.save({ session });

      // Restore stock
      await restoreStock(scope.storeId, sale.items.map(i => ({
        productId: String(i.productId), qty: i.qty,
      })), session);

      // Reverse customer updates
      if (sale.customerId) {
        const reversal: Record<string, unknown> = { $inc: { totalPurchases: -sale.total } };
        if (sale.payMethod === "credit") (reversal["$inc"] as Record<string, number>)["debt"] = -sale.total;
        await Customer.findOneAndUpdate(
          { _id: sale.customerId, storeId: scope.storeId },
          reversal,
          { session }
        );
      }
      voided = sale;
    });

    logAudit({ req, action: "إلغاء فاتورة", category: "sale", target: voided?.invoiceNo });
    res.json({ success: true, data: voided });
  } catch (err: unknown) {
    const e = err as Error & { code?: string; statusCode?: number };
    return errRes(res, req, e.statusCode || 500, e.code || "VOID_ERROR", e.message || "خطأ في إلغاء الفاتورة");
  } finally {
    await session.endSession();
  }
});

// ── GET /stats — إحصائيات المبيعات ────────────────────────────────────────────
router.get("/stats", requirePermission("sales:read"), async (req: AuthRequest, res: Response) => {
  try {
    const scope = scopeToStore(req);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const month = new Date(today.getFullYear(), today.getMonth(), 1);
    const storeOid = new mongoose.Types.ObjectId(scope.storeId);

    const [todaySales, monthSales, totalSales] = await Promise.all([
      Sale.aggregate([
        { $match: { storeId: storeOid, createdAt: { $gte: today }, status: "completed" } },
        { $group: { _id: null, total: { $sum: "$total" }, count: { $sum: 1 } } },
      ]),
      Sale.aggregate([
        { $match: { storeId: storeOid, createdAt: { $gte: month }, status: "completed" } },
        { $group: { _id: null, total: { $sum: "$total" }, count: { $sum: 1 } } },
      ]),
      Sale.countDocuments({ storeId: scope.storeId, status: "completed" }),
    ]);

    res.json({
      success: true,
      data: {
        today: todaySales[0]  || { total: 0, count: 0 },
        month: monthSales[0]  || { total: 0, count: 0 },
        totalSales,
      },
    });
  } catch (err: unknown) {
    return errRes(res, req, 500, "STATS_ERROR", "خطأ في جلب الإحصائيات");
  }
});

// ── Helpers ────────────────────────────────────────────────────────────────────
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export default router;
