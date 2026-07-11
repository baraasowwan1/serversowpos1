/**
 * Sowwanjo POS — Offline Sync API Routes
 * مسارات API للمزامنة مع الأجهزة العاملة بدون إنترنت
 */
import { Router, Response } from "express";
import mongoose from "mongoose";
import { Sale, Product, Customer, Store } from "../models/index";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();

// ── Auth middleware on all sync routes ────────────────────────────────────────
router.use(authMiddleware);

// ────────────────────────────────────────────────────────────────────────────
// POST /api/sync/sales
// Creates a sale that was completed offline. Idempotent by operationId.
// ────────────────────────────────────────────────────────────────────────────
router.post("/sales", async (req: AuthRequest, res: Response) => {
  const { operationId, sale } = req.body as {
    operationId: string;
    sale: {
      invoiceNo: string;
      items: Array<{ productId: string; nameAr: string; qty: number; unitPrice: number; discount: number; total: number }>;
      subtotal: number;
      discountAmt: number;
      taxAmt: number;
      total: number;
      payMethod: string;
      cashIn?: number;
      change?: number;
      cliqRef?: string;
      cliqSender?: string;
      cardRef?: string;
      customerId?: string;
      customerName?: string;
      customerPhone?: string;
      status?: string;
      branchId?: string;
      terminalId?: string;
      isOffline?: boolean;
      offlineCreatedAt?: string;
    };
  };

  const storeId = req.store?.id;
  if (!storeId) return res.status(401).json({ error: "غير مصرح" });
  if (!operationId || !sale) return res.status(400).json({ error: "بيانات ناقصة" });

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Idempotency check — return existing sale if already synced
    const existing = await Sale.findOne({
      storeId: new mongoose.Types.ObjectId(storeId),
      $or: [{ offlineOperationId: operationId }, { invoiceNo: sale.invoiceNo }],
    }).session(session);

    if (existing) {
      await session.commitTransaction();
      return res.status(200).json({ sale: existing, alreadySynced: true });
    }

    // Create the sale
    const newSale = await Sale.create([{
      storeId:            new mongoose.Types.ObjectId(storeId),
      invoiceNo:          sale.invoiceNo,
      offlineOperationId: operationId,
      items:              sale.items,
      subtotal:           sale.subtotal,
      discountAmt:        sale.discountAmt,
      taxAmt:             sale.taxAmt,
      total:              sale.total,
      payMethod:          sale.payMethod,
      cashIn:             sale.cashIn,
      change:             sale.change,
      cliqRef:            sale.cliqRef,
      cliqSender:         sale.cliqSender,
      cardRef:            sale.cardRef,
      customerId:         sale.customerId || null,
      customerName:       sale.customerName || "عميل نقدي",
      customerPhone:      sale.customerPhone || "",
      status:             sale.status || "completed",
      branchId:           sale.branchId || null,
      terminalId:         sale.terminalId || null,
      isOffline:          sale.isOffline || false,
      offlineCreatedAt:   sale.offlineCreatedAt ? new Date(sale.offlineCreatedAt) : new Date(),
    }], { session });

    // Decrement inventory for each item
    for (const item of sale.items) {
      if (!item.productId || !mongoose.Types.ObjectId.isValid(item.productId)) continue;
      await Product.findOneAndUpdate(
        {
          _id:     new mongoose.Types.ObjectId(item.productId),
          storeId: new mongoose.Types.ObjectId(storeId),
        },
        { $inc: { quantity: -item.qty } },
        { session }
      );
    }

    await session.commitTransaction();
    return res.status(201).json({ sale: newSale[0] });
  } catch (err: unknown) {
    await session.abortTransaction();
    const msg = err instanceof Error ? err.message : "خطأ في الخادم";
    console.error("[sync/sales]", msg);
    return res.status(500).json({ error: msg });
  } finally {
    session.endSession();
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/sync/bootstrap
// Returns everything a device needs to work offline for one store.
// ────────────────────────────────────────────────────────────────────────────
router.get("/bootstrap", async (req: AuthRequest, res: Response) => {
  const storeId = req.store?.id;
  if (!storeId) return res.status(401).json({ error: "غير مصرح" });

  try {
    const [products, customers, store] = await Promise.all([
      Product.find({
        storeId: new mongoose.Types.ObjectId(storeId),
        isActive: { $ne: false },
      }).limit(3000).lean(),
      Customer.find({
        storeId: new mongoose.Types.ObjectId(storeId),
      }).limit(1000).lean(),
      Store.findById(storeId).lean(),
    ]);

    return res.json({
      products,
      customers,
      store,
      bootstrappedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "خطأ في الخادم";
    return res.status(500).json({ error: msg });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/sync/status
// Returns pending sync counts from the server's perspective.
// ────────────────────────────────────────────────────────────────────────────
router.get("/status", async (req: AuthRequest, res: Response) => {
  const storeId = req.store?.id;
  if (!storeId) return res.status(401).json({ error: "غير مصرح" });

  try {
    const offlineSalesCount = await Sale.countDocuments({
      storeId: new mongoose.Types.ObjectId(storeId),
      isOffline: true,
    });
    return res.json({ offlineSales: offlineSalesCount, ok: true });
  } catch (err: unknown) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/sync/device
// Register/update a device for offline use (fire-and-forget from client)
// ────────────────────────────────────────────────────────────────────────────
router.post("/device", async (req: AuthRequest, res: Response) => {
  // Minimal: just log the device registration — no Device model required
  const { deviceId, storeId: devStoreId, platform } = req.body as { deviceId?: string; storeId?: string; platform?: string };
  if (!deviceId) return res.status(400).json({ error: "deviceId required" });
  // In a full implementation, upsert a Device document here
  console.log(`[sync/device] registered device=${deviceId} store=${devStoreId} platform=${(platform || "").slice(0, 80)}`);
  return res.status(200).json({ ok: true });
});

export default router;
