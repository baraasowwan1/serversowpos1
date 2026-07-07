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
