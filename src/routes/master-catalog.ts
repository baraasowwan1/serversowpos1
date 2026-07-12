/**
 * Master Supermarket Catalog Routes
 * كتالوج السوبرماركت المركزي — إدارة المنتجات الأساسية
 *
 * All routes require Super Admin permissions.
 * Stores are read-only consumers of this catalog.
 */
import { Router, Request, Response } from "express";
import { MasterSupermarketProduct, Product, Store } from "../models/index";
import { authMiddleware, superAdminOnly } from "../middleware/auth";
import mongoose from "mongoose";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyModel = { bulkWrite: (ops: any[]) => Promise<{ modifiedCount: number }> };

const router = Router();
router.use(authMiddleware, superAdminOnly);

// ── Column header aliases (case-insensitive matching) ─────────────────────────
const COL = {
  pid:          ["pid", "legacy product id", "legacy id"],
  sku:          ["product code", "sku", "code", "item code", "كود المنتج"],
  barcode:      ["barcode", "bar code", "upc", "ean", "باركود"],
  product_name: ["product name", "name", "item name", "اسم المنتج"],
  product_name_ar: ["product name (arabic)", "arabic name", "name ar", "الاسم العربي", "اسم المنتج بالعربي"],
  category:     ["category", "categories", "group", "التصنيف", "الفئة"],
  description:  ["description", "desc", "notes", "الوصف"],
  tax_rate:     ["tax commodity", "tax", "tax rate", "vat", "الضريبة"],
  purchase_unit:["purchase unit", "buy unit", "وحدة الشراء"],
  sales_unit:   ["sales unit", "sell unit", "unit", "وحدة البيع", "الوحدة"],
  purchase_price_default: ["purchase cost", "cost", "buy price", "سعر الشراء"],
  selling_price_default:  ["sales cost", "sell price", "price", "retail price", "سعر البيع"],
  reorder_point_default:  ["reorder point", "min stock", "reorder", "نقطة إعادة الطلب"],
  storage_type: ["storage type", "storage", "نوع التخزين"],
  expiry_date:  ["expiry date", "expiry", "تاريخ الانتهاء"],
  manufacturing_date: ["manufacturing date", "mfg date", "تاريخ التصنيع"],
};

function findCol(headers: string[], aliases: string[]): number {
  const lower = headers.map(h => (h || "").toString().toLowerCase().trim());
  for (const alias of aliases) {
    const idx = lower.indexOf(alias.toLowerCase());
    if (idx !== -1) return idx;
  }
  return -1;
}

function mapRow(headers: string[], row: unknown[]): Partial<IMasterRow> | null {
  const g = (aliases: string[]) => {
    const idx = findCol(headers, aliases);
    return idx !== -1 ? (row[idx] ?? "") : "";
  };

  const name = String(g(COL.product_name) || "").trim();
  if (!name) return null;  // skip rows without product name

  const nameAr = String(g(COL.product_name_ar) || "").trim() || name;

  // Parse tax: could be % like "16%" or decimal like "0.16"
  let taxRaw = String(g(COL.tax_rate) || "").trim().replace("%", "");
  let taxRate = parseFloat(taxRaw) || 0;
  if (taxRate > 1) taxRate = taxRate / 100;  // convert 16 → 0.16

  const expiryVal = g(COL.expiry_date);
  const mfgVal    = g(COL.manufacturing_date);

  return {
    pid:                     String(g(COL.pid) || "").trim(),
    sku:                     String(g(COL.sku) || "").trim(),
    barcode:                 String(g(COL.barcode) || "").replace(/[^0-9a-zA-Z]/g, "").trim(),
    product_name:            name,
    product_name_ar:         nameAr,
    description:             String(g(COL.description) || "").trim(),
    category:                String(g(COL.category) || "عام").trim(),
    purchase_price_default:  parseFloat(String(g(COL.purchase_price_default) || "0")) || 0,
    selling_price_default:   parseFloat(String(g(COL.selling_price_default) || "0")) || 0,
    purchase_unit:           String(g(COL.purchase_unit) || "حبة").trim(),
    sales_unit:              String(g(COL.sales_unit) || "حبة").trim(),
    tax_rate:                taxRate,
    reorder_point_default:   parseFloat(String(g(COL.reorder_point_default) || "5")) || 5,
    storage_type:            String(g(COL.storage_type) || "").trim(),
    expiry_supported:        !!expiryVal && String(expiryVal).trim() !== "",
    manufacturing_supported: !!mfgVal && String(mfgVal).trim() !== "",
    image_url:               "",
    open_food_facts_enabled: true,
    active:                  true,
  };
}

interface IMasterRow {
  pid: string; sku: string; barcode: string;
  product_name: string; product_name_ar: string; description: string;
  category: string;
  purchase_price_default: number; selling_price_default: number;
  purchase_unit: string; sales_unit: string; tax_rate: number;
  reorder_point_default: number; storage_type: string;
  expiry_supported: boolean; manufacturing_supported: boolean;
  image_url: string; open_food_facts_enabled: boolean; active: boolean;
}

// ── GET /api/master-catalog — list with pagination/search/filter ──────────────
router.get("/", async (req: Request, res: Response) => {
  try {
    const page     = Math.max(1, parseInt(String(req.query["page"] || "1")));
    const limit    = Math.min(200, parseInt(String(req.query["limit"] || "50")));
    const search   = String(req.query["search"] || "").trim();
    const category = String(req.query["category"] || "").trim();
    const active   = req.query["active"];

    const filter: Record<string, unknown> = {};
    if (active !== undefined) filter["active"] = active !== "false";
    if (category) filter["category"] = category;
    if (search) {
      const re = new RegExp(search, "i");
      filter["$or"] = [
        { product_name: re }, { product_name_ar: re },
        { barcode: re }, { sku: re }, { category: re },
      ];
    }

    const [total, products, categories] = await Promise.all([
      MasterSupermarketProduct.countDocuments(filter),
      MasterSupermarketProduct.find(filter)
        .sort({ row_order: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      MasterSupermarketProduct.distinct("category"),
    ]);

    res.json({
      products,
      total,
      page,
      pages: Math.ceil(total / limit),
      categories: categories.sort(),
    });
  } catch (e) {
    console.error("[master-catalog/get]", e);
    res.status(500).json({ error: "فشل جلب الكتالوج" });
  }
});

// ── GET /api/master-catalog/stats ─────────────────────────────────────────────
router.get("/stats", async (_req: Request, res: Response) => {
  try {
    const [total, active, categories, lastItem] = await Promise.all([
      MasterSupermarketProduct.countDocuments(),
      MasterSupermarketProduct.countDocuments({ active: true }),
      MasterSupermarketProduct.distinct("category"),
      MasterSupermarketProduct.findOne().sort({ updatedAt: -1 }).select("updatedAt").lean(),
    ]);
    res.json({
      total, active, categories: categories.length,
      lastUpdated: lastItem ? (lastItem as { updatedAt: Date }).updatedAt : null,
    });
  } catch (e) {
    res.status(500).json({ error: "فشل جلب الإحصائيات" });
  }
});

// ── GET /api/master-catalog/search ────────────────────────────────────────────
router.get("/search", async (req: Request, res: Response) => {
  try {
    const q = String(req.query["q"] || "").trim();
    if (!q) return res.json([]);
    const re = new RegExp(q, "i");
    const results = await MasterSupermarketProduct.find({
      active: true,
      $or: [{ product_name: re }, { product_name_ar: re }, { barcode: re }, { sku: re }],
    }).sort({ row_order: 1 }).limit(30).lean();
    res.json(results);
  } catch (e) {
    res.status(500).json({ error: "فشل البحث" });
  }
});

// ── GET /api/master-catalog/barcode/:barcode ──────────────────────────────────
router.get("/barcode/:barcode", async (req: Request, res: Response) => {
  try {
    const product = await MasterSupermarketProduct.findOne({
      barcode: req.params["barcode"],
    }).lean();
    if (!product) return res.status(404).json({ error: "المنتج غير موجود" });
    res.json(product);
  } catch (e) {
    res.status(500).json({ error: "فشل البحث بالباركود" });
  }
});

// ── POST /api/master-catalog/preview — parse rows, return analysis (no save) ──
router.post("/preview", async (req: Request, res: Response) => {
  try {
    const { headers, rows } = req.body as { headers: string[]; rows: unknown[][] };
    if (!headers || !rows || !Array.isArray(rows)) {
      return res.status(400).json({ error: "بيانات غير صحيحة — headers و rows مطلوبان" });
    }

    const parsed: IMasterRow[] = [];
    const errors: { row: number; reason: string }[] = [];
    const barcodesSeen = new Set<string>();
    const skusSeen     = new Set<string>();

    // Existing barcodes in DB for conflict detection
    const existingBarcodes = new Set(
      (await MasterSupermarketProduct.find({ barcode: { $ne: "" } }).select("barcode").lean())
        .map((p: { barcode: string }) => p.barcode)
    );

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const mapped = mapRow(headers, row as unknown[]);
      if (!mapped) { errors.push({ row: i + 2, reason: "اسم المنتج مفقود" }); continue; }

      if (mapped.selling_price_default !== undefined && mapped.selling_price_default < 0) {
        errors.push({ row: i + 2, reason: `سعر البيع سالب: ${mapped.selling_price_default}` });
      }
      if (mapped.barcode && barcodesSeen.has(mapped.barcode)) {
        errors.push({ row: i + 2, reason: `باركود مكرر في الملف: ${mapped.barcode}` });
      }
      if (mapped.sku && skusSeen.has(mapped.sku)) {
        errors.push({ row: i + 2, reason: `كود مكرر في الملف: ${mapped.sku}` });
      }

      if (mapped.barcode) barcodesSeen.add(mapped.barcode);
      if (mapped.sku) skusSeen.add(mapped.sku);

      const isExisting = mapped.barcode ? existingBarcodes.has(mapped.barcode) : false;
      parsed.push({ ...mapped as IMasterRow, _isExisting: isExisting } as IMasterRow & { _isExisting: boolean });
    }

    const newProducts      = parsed.filter((p: IMasterRow & { _isExisting?: boolean }) => !p._isExisting);
    const updatedProducts  = parsed.filter((p: IMasterRow & { _isExisting?: boolean }) => p._isExisting);
    const categories       = [...new Set(parsed.map(p => p.category))];

    res.json({
      total:    parsed.length,
      new:      newProducts.length,
      updated:  updatedProducts.length,
      errors:   errors.length,
      errorList: errors.slice(0, 50),
      categories,
      preview:  parsed.slice(0, 20),  // first 20 rows for preview
    });
  } catch (e) {
    console.error("[master-catalog/preview]", e);
    res.status(500).json({ error: "فشل معالجة الملف" });
  }
});

// ── POST /api/master-catalog/import — save rows to DB ─────────────────────────
router.post("/import", async (req: Request, res: Response) => {
  try {
    const { headers, rows, options = {} } = req.body as {
      headers: string[];
      rows: unknown[][];
      options?: {
        updateNames?: boolean;
        updatePrices?: boolean;
        updateCategories?: boolean;
        updateDescriptions?: boolean;
        skipExisting?: boolean;
      };
    };
    if (!headers || !rows) return res.status(400).json({ error: "بيانات غير صحيحة" });

    const opts = {
      updateNames:        options.updateNames        ?? false,
      updatePrices:       options.updatePrices       ?? false,
      updateCategories:   options.updateCategories   ?? false,
      updateDescriptions: options.updateDescriptions ?? false,
      skipExisting:       options.skipExisting       ?? false,
    };

    const toInsert: (IMasterRow & { row_order: number })[] = [];
    const toUpdate: { filter: object; update: object }[] = [];
    const errors: { row: number; reason: string }[] = [];
    let rowOrder = (await MasterSupermarketProduct.countDocuments()) + 1;

    for (let i = 0; i < rows.length; i++) {
      const mapped = mapRow(headers, rows[i] as unknown[]);
      if (!mapped) { errors.push({ row: i + 2, reason: "اسم المنتج مفقود" }); continue; }

      // Check for existing product by barcode or sku
      const existing = mapped.barcode
        ? await MasterSupermarketProduct.findOne({ barcode: mapped.barcode })
        : mapped.sku
          ? await MasterSupermarketProduct.findOne({ sku: mapped.sku })
          : null;

      if (existing) {
        if (opts.skipExisting) continue;
        // Build update object for shared fields only
        const upd: Record<string, unknown> = {};
        if (opts.updateNames)        { upd["product_name"] = mapped.product_name; upd["product_name_ar"] = mapped.product_name_ar; }
        if (opts.updatePrices)       { upd["purchase_price_default"] = mapped.purchase_price_default; upd["selling_price_default"] = mapped.selling_price_default; }
        if (opts.updateCategories)   { upd["category"] = mapped.category; }
        if (opts.updateDescriptions) { upd["description"] = mapped.description; }
        if (Object.keys(upd).length > 0) {
          toUpdate.push({ filter: { _id: existing._id }, update: { $set: upd } });
        }
      } else {
        toInsert.push({ ...mapped as IMasterRow, row_order: rowOrder++ });
      }
    }

    let inserted = 0, updated = 0;

    if (toInsert.length > 0) {
      const result = await MasterSupermarketProduct.insertMany(toInsert, { ordered: false });
      inserted = result.length;
    }

    if (toUpdate.length > 0) {
      const ops = toUpdate.map(op => ({
        updateOne: { filter: op.filter, update: op.update },
      }));
      const result = await (MasterSupermarketProduct as AnyModel).bulkWrite(ops);
      updated = result.modifiedCount;
    }

    res.json({ ok: true, inserted, updated, errors: errors.length, errorList: errors.slice(0, 50) });
  } catch (e) {
    console.error("[master-catalog/import]", e);
    res.status(500).json({ error: "فشل استيراد الكتالوج" });
  }
});

// ── PUT /api/master-catalog/:id ───────────────────────────────────────────────
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const allowed = [
      "product_name", "product_name_ar", "description", "category",
      "purchase_price_default", "selling_price_default", "purchase_unit", "sales_unit",
      "tax_rate", "reorder_point_default", "storage_type", "image_url",
      "open_food_facts_enabled", "active", "barcode", "sku",
    ];
    const upd = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
    const product = await MasterSupermarketProduct.findByIdAndUpdate(
      req.params["id"], { $set: upd }, { new: true }
    );
    if (!product) return res.status(404).json({ error: "المنتج غير موجود" });
    res.json(product);
  } catch (e) {
    res.status(500).json({ error: "فشل التعديل" });
  }
});

// ── DELETE /api/master-catalog/:id ───────────────────────────────────────────
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    await MasterSupermarketProduct.findByIdAndDelete(req.params["id"]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "فشل الحذف" });
  }
});

// ── POST /api/master-catalog/apply-to-store ────────────────────────────────────
// Apply catalog to a single store
router.post("/apply-to-store", async (req: Request, res: Response) => {
  try {
    const { storeId } = req.body as { storeId: string };
    if (!storeId) return res.status(400).json({ error: "storeId مطلوب" });

    let storeObjId: mongoose.Types.ObjectId;
    try { storeObjId = new mongoose.Types.ObjectId(storeId); } catch {
      return res.status(400).json({ error: "معرّف المتجر غير صالح" });
    }

    const store = await Store.findById(storeObjId);
    if (!store) return res.status(404).json({ error: "المتجر غير موجود" });
    if (store.category !== "supermarket") {
      return res.status(400).json({ error: "المتجر ليس سوبرماركت" });
    }

    const added = await initializeStoreFromCatalog(storeObjId);
    res.json({ ok: true, added });
  } catch (e) {
    console.error("[apply-to-store]", e);
    res.status(500).json({ error: "فشل تطبيق الكتالوج" });
  }
});

// ── POST /api/master-catalog/apply-to-all ─────────────────────────────────────
// Apply new catalog products to all existing supermarket stores
router.post("/apply-to-all", async (req: Request, res: Response) => {
  try {
    const supermarkets = await Store.find({ category: "supermarket" }).select("_id nameAr").lean();
    const results: { store: string; added: number }[] = [];

    for (const store of supermarkets) {
      const added = await initializeStoreFromCatalog(store._id as mongoose.Types.ObjectId);
      results.push({ store: (store as { nameAr: string }).nameAr, added });
    }

    res.json({ ok: true, stores: results.length, results });
  } catch (e) {
    console.error("[apply-to-all]", e);
    res.status(500).json({ error: "فشل تطبيق الكتالوج على جميع المتاجر" });
  }
});

// ── Helper: initialize or top-up a store from master catalog ──────────────────
export async function initializeStoreFromCatalog(storeId: mongoose.Types.ObjectId): Promise<number> {
  const catalogProducts = await MasterSupermarketProduct.find({ active: true })
    .sort({ row_order: 1 })
    .lean();

  if (catalogProducts.length === 0) return 0;

  // Find which products this store already has (by masterCatalogRef or barcode)
  const existingRefs = new Set(
    (await Product.find({ storeId }).select("masterCatalogRef barcode").lean())
      .map((p: { masterCatalogRef?: mongoose.Types.ObjectId; barcode?: string }) =>
        p.masterCatalogRef?.toString() || ""
      )
      .filter(Boolean)
  );
  const existingBarcodes = new Set(
    (await Product.find({ storeId, barcode: { $ne: "" } }).select("barcode").lean())
      .map((p: { barcode: string }) => p.barcode)
  );

  const toInsert = catalogProducts
    .filter(cp => {
      if (existingRefs.has(cp._id.toString())) return false;
      if (cp.barcode && existingBarcodes.has(cp.barcode)) return false;
      return true;
    })
    .map(cp => ({
      storeId,
      masterCatalogRef: cp._id,
      nameAr:     cp.product_name_ar || cp.product_name,
      nameEn:     cp.product_name,
      barcode:    cp.barcode,
      sku:        cp.sku,
      category:   cp.category,
      costPrice:  cp.purchase_price_default,
      sellPrice:  cp.selling_price_default,
      stock:      0,
      minStock:   cp.reorder_point_default,
      image:      cp.image_url,
      unit:       cp.sales_unit || "حبة",
      purchaseUnit: cp.purchase_unit,
      salesUnit:  cp.sales_unit,
      storageType: cp.storage_type,
      description: cp.description,
      taxable:    cp.tax_rate > 0,
      active:     true,
    }));

  if (toInsert.length === 0) return 0;

  await Product.insertMany(toInsert, { ordered: false });
  return toInsert.length;
}

export default router;
