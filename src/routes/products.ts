/**
 * Products Routes — مسارات إدارة المنتجات (مقيدة بـ storeId)
 */
import { Router, Response } from "express";
import { Product, Sale } from "../models/index";
import { authMiddleware, AuthRequest, scopeToStore } from "../middleware/auth";
import { requirePermission, ownerOnly } from "../middleware/roleGuard";
import { logAudit } from "./audit";

const router = Router();
router.use(authMiddleware);

function errRes(res: Response, req: AuthRequest, status: number, code: string, message: string) {
  return res.status(status).json({ success: false, code, message, requestId: req.requestId });
}

// ── GET / — جميع منتجات المتجر ────────────────────────────────────────────────
router.get("/", requirePermission("products:read"), async (req: AuthRequest, res: Response) => {
  try {
    const scope = scopeToStore(req);
    const { q, category, limit: limitQ, active } = req.query as { q?: string; category?: string; limit?: string; active?: string };
    const filter: Record<string, unknown> = { storeId: scope.storeId };
    // Default: only active (non-deleted) products
    if (active === "false") {
      filter["isActive"] = false;
    } else {
      filter["isActive"] = { $ne: false }; // includes true and undefined (legacy)
    }
    if (category && category !== "الكل") filter["category"] = category;
    if (q) filter["$or"] = [
      { nameAr: { $regex: q, $options: "i" } },
      { barcode: q },
      { barcodes: q },
      { sku: { $regex: q, $options: "i" } },
    ];
    const limit = Math.min(parseInt(limitQ || "5000"), 5000);
    const products = await Product.find(filter).sort({ category: 1, nameAr: 1 }).limit(limit).lean();
    res.json(products);
  } catch {
    return errRes(res, req, 500, "FETCH_ERROR", "خطأ في جلب المنتجات");
  }
});

// ── POST / — إضافة منتج ────────────────────────────────────────────────────────
router.post("/", requirePermission("products:create"), async (req: AuthRequest, res: Response) => {
  try {
    const scope = scopeToStore(req);
    const { nameAr, sellPrice, barcode } = req.body;
    if (!nameAr || !nameAr.trim()) return errRes(res, req, 400, "MISSING_NAME", "اسم المنتج مطلوب");
    if (sellPrice == null || isNaN(Number(sellPrice))) return errRes(res, req, 400, "INVALID_PRICE", "سعر البيع غير صالح");
    // Barcode uniqueness check
    if (barcode) {
      const conflict = await Product.findOne({ storeId: scope.storeId, $or: [{ barcode }, { barcodes: barcode }], isActive: { $ne: false } });
      if (conflict) return errRes(res, req, 409, "BARCODE_EXISTS", `الباركود مستخدم بالفعل للمنتج: ${conflict.nameAr}`);
    }
    const product = await Product.create({
      ...req.body,
      storeId: scope.storeId,
      isActive: true,
      createdBy: req.userId || undefined,
    });
    logAudit({ req, action: "إضافة منتج", category: "product", target: nameAr });
    res.status(201).json({ success: true, data: product });
  } catch (err: unknown) {
    const e = err as { code?: number; keyPattern?: object };
    if (e.code === 11000) return errRes(res, req, 409, "DUPLICATE", "منتج بهذا الباركود موجود مسبقاً");
    return errRes(res, req, 500, "CREATE_ERROR", "خطأ في إضافة المنتج");
  }
});

// ── PUT /:id — تعديل منتج ──────────────────────────────────────────────────────
router.put("/:id", requirePermission("products:update"), async (req: AuthRequest, res: Response) => {
  try {
    const scope = scopeToStore(req);
    const id = req.params["id"];
    // Barcode uniqueness if changing barcode
    const { barcode } = req.body;
    if (barcode) {
      const conflict = await Product.findOne({
        storeId: scope.storeId, _id: { $ne: id },
        $or: [{ barcode }, { barcodes: barcode }],
        isActive: { $ne: false },
      });
      if (conflict) return errRes(res, req, 409, "BARCODE_EXISTS", `الباركود مستخدم للمنتج: ${conflict.nameAr}`);
    }
    const product = await Product.findOneAndUpdate(
      { _id: id, storeId: scope.storeId },
      { ...req.body, updatedBy: req.userId || undefined },
      { new: true }
    );
    if (!product) return errRes(res, req, 404, "NOT_FOUND", "المنتج غير موجود");
    res.json({ success: true, data: product });
  } catch {
    return errRes(res, req, 500, "UPDATE_ERROR", "خطأ في تعديل المنتج");
  }
});

// ── DELETE /:id — حذف ناعم دائماً (soft delete — لا حذف فعلي لأي منتج) ─────────
router.delete("/:id", ownerOnly, async (req: AuthRequest, res: Response) => {
  try {
    const scope = scopeToStore(req);
    const id = req.params["id"];
    const product = await Product.findOneAndUpdate(
      { _id: id, storeId: scope.storeId, isActive: { $ne: false } },
      { isActive: false, deletedBy: req.userId || "", deletedAt: new Date() },
      { new: true }
    );
    if (!product) return errRes(res, req, 404, "NOT_FOUND", "المنتج غير موجود أو محذوف مسبقاً");
    logAudit({ req, action: "حذف منتج", category: "product", target: product.nameAr });
    res.json({ success: true, message: "تم حذف المنتج" });
  } catch {
    return errRes(res, req, 500, "DELETE_ERROR", "خطأ في حذف المنتج");
  }
});

// ── GET /barcode/:code ─────────────────────────────────────────────────────────
router.get("/barcode/:code", requirePermission("products:read"), async (req: AuthRequest, res: Response) => {
  try {
    const scope = scopeToStore(req);
    const code = req.params["code"];
    const product = await Product.findOne({
      storeId: scope.storeId,
      isActive: { $ne: false },
      $or: [{ barcode: code }, { barcodes: code }],
    });
    if (!product) return errRes(res, req, 404, "NOT_FOUND", "المنتج غير موجود");
    res.json({ success: true, data: product });
  } catch {
    return errRes(res, req, 500, "FETCH_ERROR", "خطأ في البحث بالباركود");
  }
});

// ── POST /:id/barcodes — إضافة باركود مرتبط ──────────────────────────────────
router.post("/:id/barcodes", requirePermission("products:update"), async (req: AuthRequest, res: Response) => {
  try {
    const scope = scopeToStore(req);
    const { barcode } = req.body as { barcode: string };
    if (!barcode) return errRes(res, req, 400, "MISSING_BARCODE", "الباركود مطلوب");
    const conflict = await Product.findOne({
      storeId: scope.storeId,
      _id: { $ne: req.params["id"] },
      $or: [{ barcode }, { barcodes: barcode }],
    });
    if (conflict) return errRes(res, req, 409, "BARCODE_EXISTS", `الباركود مستخدم للمنتج: ${conflict.nameAr}`);
    const product = await Product.findOneAndUpdate(
      { _id: req.params["id"], storeId: scope.storeId },
      { $addToSet: { barcodes: barcode } },
      { new: true }
    );
    if (!product) return errRes(res, req, 404, "NOT_FOUND", "المنتج غير موجود");
    res.json({ success: true, data: product });
  } catch {
    return errRes(res, req, 500, "BARCODE_ERROR", "خطأ في إضافة الباركود");
  }
});

// ── DELETE /:id/barcodes/:barcode — حذف باركود مرتبط ─────────────────────────
router.delete("/:id/barcodes/:barcode", requirePermission("products:update"), async (req: AuthRequest, res: Response) => {
  try {
    const scope = scopeToStore(req);
    const product = await Product.findOneAndUpdate(
      { _id: req.params["id"], storeId: scope.storeId },
      { $pull: { barcodes: req.params["barcode"] } },
      { new: true }
    );
    if (!product) return errRes(res, req, 404, "NOT_FOUND", "المنتج غير موجود");
    res.json({ success: true, data: product });
  } catch {
    return errRes(res, req, 500, "BARCODE_ERROR", "خطأ في حذف الباركود");
  }
});

// ── POST /bulk-import — استيراد جماعي ─────────────────────────────────────────
router.post("/bulk-import", ownerOnly, async (req: AuthRequest, res: Response) => {
  try {
    const scope = scopeToStore(req);
    const storeId = scope.storeId;
    interface ImportRow {
      nameAr?: string; nameEn?: string; barcode?: string; sku?: string;
      category?: string; costPrice?: number; sellPrice?: number;
      stock?: number; minStock?: number; unit?: string;
      taxRate?: number; brand?: string;
    }
    const { products: rows, updateExisting = true } = req.body as { products: ImportRow[]; updateExisting?: boolean };
    if (!Array.isArray(rows) || rows.length === 0) return errRes(res, req, 400, "EMPTY_IMPORT", "لا توجد بيانات للاستيراد");
    if (rows.length > 10000) return errRes(res, req, 400, "TOO_MANY_ROWS", "الحد الأقصى 10,000 منتج في الاستيراد الواحد");

    let added = 0, updated = 0, skipped = 0;
    const errors: string[] = [];

    for (const row of rows) {
      const nameAr = (row.nameAr || "").trim();
      if (!nameAr) { skipped++; continue; }
      try {
        const filter: Record<string, unknown> = { storeId };
        if (row.barcode) filter["barcode"] = row.barcode;
        else if (row.sku) filter["sku"] = row.sku;
        else filter["nameAr"] = nameAr;

        const existing = await Product.findOne(filter);
        if (existing && updateExisting) {
          await Product.findByIdAndUpdate(existing._id, {
            nameAr, nameEn: row.nameEn, sku: row.sku,
            category: row.category, costPrice: Number(row.costPrice) || 0,
            sellPrice: Number(row.sellPrice) || 0,
            stock: Number(row.stock) || 0,
            minStock: Number(row.minStock) || 0,
            unit: row.unit || "قطعة",
            taxRate: Number(row.taxRate) || 0,
            brand: row.brand || "",
          });
          updated++;
        } else if (!existing) {
          await Product.create({
            storeId, nameAr, nameEn: row.nameEn, barcode: row.barcode, sku: row.sku,
            category: row.category || "عام",
            costPrice: Number(row.costPrice) || 0,
            sellPrice: Number(row.sellPrice) || 0,
            stock: Number(row.stock) || 0,
            minStock: Number(row.minStock) || 0,
            unit: row.unit || "قطعة",
            taxRate: Number(row.taxRate) || 0,
            brand: row.brand || "",
            isActive: true,
            createdBy: req.userId || undefined,
          });
          added++;
        } else {
          skipped++;
        }
      } catch (rowErr) {
        errors.push(`${nameAr}: ${(rowErr as Error).message}`);
      }
    }

    logAudit({ req, action: "استيراد منتجات", category: "product", details: { added, updated, skipped } });
    res.json({ success: true, data: { added, updated, skipped, errors: errors.slice(0, 20) } });
  } catch {
    return errRes(res, req, 500, "IMPORT_ERROR", "خطأ في الاستيراد الجماعي");
  }
});

export default router;
