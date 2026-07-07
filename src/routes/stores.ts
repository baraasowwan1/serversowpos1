/**
 * Stores Routes — مسارات إدارة المتاجر (للمدير العام فقط)
 */
import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { Store } from "../models/index";
import { authMiddleware, superAdminOnly, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(authMiddleware, superAdminOnly);

// جميع المتاجر
router.get("/", async (_req: Request, res: Response) => {
  const stores = await Store.find().select("-password").sort({ createdAt: -1 });
  res.json(stores);
});

// إنشاء متجر جديد
router.post("/", async (req: Request, res: Response) => {
  const { nameAr, nameEn, category, owner, email, phone, city, plan, taxNo } = req.body;
  if (!nameAr || !email || !owner || !category) return res.status(400).json({ error: "جميع الحقول المطلوبة يجب تعبئتها" });

  const exists = await Store.findOne({ email: email.toLowerCase() });
  if (exists) return res.status(409).json({ error: "هذا البريد الإلكتروني مستخدم بالفعل" });

  // توليد كلمة مرور عشوائية آمنة
  const rawPass = `${nameEn?.split(" ")[0]?.toLowerCase() || "store"}@${Math.floor(Math.random() * 9000) + 1000}!`;
  const hashed = await bcrypt.hash(rawPass, 12);
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 يوم تجريبي

  const store = await Store.create({ nameAr, nameEn, category, owner, email: email.toLowerCase(), password: hashed, phone, city, plan: plan || "مبتدئ", taxNo, status: "trial", expiresAt });

  res.status(201).json({ store: { ...store.toObject(), password: undefined }, generatedPassword: rawPass });
});

// تفاصيل متجر
router.get("/:id", async (req: Request, res: Response) => {
  const store = await Store.findById(req.params["id"]).select("-password");
  if (!store) return res.status(404).json({ error: "المتجر غير موجود" });
  res.json(store);
});

// تعديل متجر
router.put("/:id", async (req: Request, res: Response) => {
  const allowed = ["nameAr","nameEn","owner","phone","city","plan","status","taxNo","expiresAt","vatRate","language"];
  const updates = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
  const store = await Store.findByIdAndUpdate(req.params["id"], updates, { new: true }).select("-password");
  if (!store) return res.status(404).json({ error: "المتجر غير موجود" });
  res.json(store);
});

// إعادة تعيين كلمة المرور
router.post("/:id/reset-password", async (req: Request, res: Response) => {
  const newPass = `Store@${Math.floor(Math.random() * 90000) + 10000}`;
  const hashed = await bcrypt.hash(newPass, 12);
  await Store.findByIdAndUpdate(req.params["id"], { password: hashed });
  res.json({ newPassword: newPass });
});

// حذف متجر
router.delete("/:id", async (req: Request, res: Response) => {
  await Store.findByIdAndDelete(req.params["id"]);
  res.json({ message: "تم حذف المتجر" });
});

export default router;
