/**
 * Products Routes — مسارات إدارة المنتجات (مقيدة بـ storeId)
 */
import { Router, Response } from "express";
import { Product } from "../models/index";
import { authMiddleware, AuthRequest, scopeToStore } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

// جميع منتجات المتجر
router.get("/", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const { q, category } = req.query as { q?: string; category?: string };
  const filter: Record<string, unknown> = { storeId: scope.storeId };
  if (category && category !== "الكل") filter["category"] = category;
  if (q) filter["$or"] = [
    { nameAr: { $regex: q, $options: "i" } },
    { barcode: q },
    { sku: { $regex: q, $options: "i" } },
  ];
  const products = await Product.find(filter).sort({ createdAt: -1 });
  res.json(products);
});

// إضافة منتج
router.post("/", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const { nameAr, sellPrice } = req.body;
  if (!nameAr || !sellPrice) return res.status(400).json({ error: "اسم المنتج وسعر البيع مطلوبان" });
  const product = await Product.create({ ...req.body, storeId: scope.storeId });
  res.status(201).json(product);
});

// تعديل منتج
router.put("/:id", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const id = req.params["id"];
  const product = await Product.findOneAndUpdate(
    { _id: id, storeId: scope.storeId },
    req.body,
    { new: true }
  );
  if (!product) return res.status(404).json({ error: "المنتج غير موجود" });
  res.json(product);
});

// حذف منتج
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const id = req.params["id"];
  await Product.findOneAndDelete({ _id: id, storeId: scope.storeId });
  res.json({ message: "تم حذف المنتج" });
});

// جلب منتج بالباركود
router.get("/barcode/:code", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const product = await Product.findOne({ barcode: req.params["code"], storeId: scope.storeId });
  if (!product) return res.status(404).json({ error: "المنتج غير موجود" });
  res.json(product);
});

// ── POST /products/bulk-import — استيراد جماعي من Excel (لصاحب المتجر) ──────
router.post("/bulk-import", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const storeId = scope.storeId;
  interface ImportRow {
    nameAr?: string; nameEn?: string; barcode?: string; sku?: string;
    category?: string; costPrice?: number; sellPrice?: number;
    stock?: number; minStock?: number; unit?: string;
  }
  const { products: rows, updateExisting = true } = req.body as { products: ImportRow[]; updateExisting?: boolean };
  if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: "لا توجد بيانات للاستيراد" });
  if (rows.length > 10000) return res.status(400).json({ error: "الحد الأقصى 10,000 منتج في الاستيراد الواحد" });

  let added = 0, updated = 0, skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const nameAr = (row.nameAr || "").trim();
    if (!nameAr) { skipped++; continue; }

    try {
      // البحث عن منتج موجود بنفس الباركود أو SKU
      const barcode = (row.barcode || "").replace(/[^0-9a-zA-Z]/g, "").trim();
      const sku = (row.sku || "").trim();
      let existing = null;
      if (barcode) existing = await Product.findOne({ storeId, barcode });
      if (!existing && sku) existing = await Product.findOne({ storeId, sku });
      if (!existing) existing = await Product.findOne({ storeId, nameAr });

      if (existing) {
        if (!updateExisting) { skipped++; continue; }
        existing.nameAr    = nameAr;
        if (row.nameEn)    existing.nameEn    = row.nameEn;
        if (barcode)       existing.barcode   = barcode;
        if (sku)           existing.sku       = sku;
        if (row.category)  existing.category  = row.category;
        if (row.costPrice !== undefined) existing.costPrice = row.costPrice;
        if (row.sellPrice !== undefined) existing.sellPrice = row.sellPrice;
        if (row.stock     !== undefined) existing.stock     = row.stock;
        if (row.minStock  !== undefined) existing.minStock  = row.minStock;
        if (row.unit)      existing.unit      = row.unit;
        await existing.save();
        updated++;
      } else {
        await Product.create({
          storeId,
          nameAr,
          nameEn:    row.nameEn    || nameAr,
          barcode:   barcode       || "",
          sku:       sku           || "",
          category:  row.category  || "عام",
          costPrice: row.costPrice ?? 0,
          sellPrice: row.sellPrice ?? 0,
          stock:     row.stock     ?? 0,
          minStock:  row.minStock  ?? 5,
          unit:      row.unit      || "قطعة",
          image:     "",
        });
        added++;
      }
    } catch (err) {
      errors.push(`${nameAr}: ${err instanceof Error ? err.message : "خطأ غير معروف"}`);
    }
  }

  console.log(`📦 Bulk import for store ${storeId}: +${added} new, ~${updated} updated, ${skipped} skipped, ${errors.length} errors`);
  return res.json({ added, updated, skipped, errors: errors.slice(0, 20) });
});

// تحديث مخزون
router.patch("/:id/stock", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const id = req.params["id"];
  const { qty, type } = req.body as { qty: number; type: "add" | "remove" | "set" };
  const product = await Product.findOne({ _id: id, storeId: scope.storeId });
  if (!product) return res.status(404).json({ error: "المنتج غير موجود" });
  product.stock = type === "add" ? product.stock + qty : type === "remove" ? Math.max(0, product.stock - qty) : qty;
  await product.save();
  res.json(product);
});

export default router;
