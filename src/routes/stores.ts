/**
 * Stores Routes — إدارة المتاجر (للمدير العام فقط)
 *
 * POST /api/stores                    — إنشاء متجر + مستخدم owner في DB
 * GET  /api/stores                    — جميع المتاجر
 * GET  /api/stores/:id                — تفاصيل متجر
 * PUT  /api/stores/:id                — تعديل متجر
 * POST /api/stores/:id/reset-password — إعادة تعيين كلمة المرور
 * DELETE /api/stores/:id              — حذف متجر + مستخدميه
 *
 * POST /api/super-admin/stores/create — نفس الـ POST /api/stores (alias)
 */
import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { Store, User } from "../models/index";
import { authMiddleware, superAdminOnly } from "../middleware/auth";

const router = Router();
router.use(authMiddleware, superAdminOnly);

// ── GET /api/stores — جميع المتاجر ───────────────────────────────────────────
router.get("/", async (_req: Request, res: Response) => {
  try {
    const stores = await Store.find().sort({ createdAt: -1 });
    // إضافة عدد المستخدمين لكل متجر
    const result = await Promise.all(stores.map(async (s) => {
      const userCount = await User.countDocuments({ storeId: s._id });
      return { ...s.toObject(), id: s._id.toString(), users: userCount };
    }));
    return res.json(result);
  } catch (err) {
    console.error("Get stores error:", err);
    return res.status(500).json({ error: "خطأ في جلب المتاجر" });
  }
});

// ── POST /api/stores — إنشاء متجر + مستخدم owner ─────────────────────────────
// هذا هو الـ endpoint الرئيسي — يحفظ في MongoDB دائماً
router.post("/", async (req: Request, res: Response) => {
  try {
    const { nameAr, nameEn, category, owner, email, phone, city, plan, taxNo } = req.body;

    if (!nameAr || !email || !owner || !category) {
      return res.status(400).json({ error: "اسم المتجر، البريد، اسم المالك، والفئة مطلوبة" });
    }

    // تحقق من عدم تكرار البريد في المتاجر
    const storeExists = await Store.findOne({ email: email.toLowerCase().trim() });
    if (storeExists) {
      return res.status(409).json({ error: "هذا البريد الإلكتروني مستخدم بالفعل لمتجر آخر" });
    }

    // تحقق من عدم تكرار البريد في المستخدمين
    const userExists = await User.findOne({ email: email.toLowerCase().trim() });
    if (userExists) {
      return res.status(409).json({ error: "هذا البريد الإلكتروني مستخدم بالفعل" });
    }

    // توليد كلمة مرور آمنة
    const rawPassword = `Store@${Math.floor(Math.random() * 900000) + 100000}!`;
    const hashedPassword = await bcrypt.hash(rawPassword, 12);

    // 1. إنشاء المتجر في MongoDB
    const store = await Store.create({
      nameAr,
      nameEn: nameEn || nameAr,
      category,
      owner,
      email: email.toLowerCase().trim(),
      phone: phone || "",
      city: city || "",
      plan: plan || "مبتدئ",
      taxNo: taxNo || "",
      status: "trial",
      expiresAt: new Date(Date.now() + 14 * 86400000),
    });

    // 2. إنشاء مستخدم owner مرتبط بالمتجر
    const user = await User.create({
      storeId:  store._id,
      name:     owner,
      email:    email.toLowerCase().trim(),
      username: email.split("@")[0],
      password: hashedPassword,  // bcrypt hash — لا تُخزَّن الكلمة الصريحة
      role:     "owner",
      status:   "active",
    });

    console.log(`✅ Store created: ${store.nameAr} (${store._id})`);
    console.log(`✅ Owner user created: ${user.email} (${user._id})`);

    return res.status(201).json({
      store: { ...store.toObject(), id: store._id.toString() },
      user:  { id: user._id, name: user.name, email: user.email, role: user.role },
      generatedPassword: rawPassword,  // يُعرض مرة واحدة فقط للمدير العام
      loginUrl: "https://pos.sowwanjo.online",
    });
  } catch (err) {
    console.error("Create store error:", err);
    return res.status(500).json({ error: "خطأ في إنشاء المتجر" });
  }
});

// ── GET /api/stores/:id — تفاصيل متجر ────────────────────────────────────────
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const store = await Store.findById(req.params["id"]);
    if (!store) return res.status(404).json({ error: "المتجر غير موجود" });
    const userCount = await User.countDocuments({ storeId: store._id });
    return res.json({ ...store.toObject(), id: store._id.toString(), users: userCount });
  } catch (err) {
    return res.status(500).json({ error: "خطأ في جلب المتجر" });
  }
});

// ── PUT /api/stores/:id — تعديل متجر ─────────────────────────────────────────
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const allowed = ["nameAr","nameEn","owner","phone","city","plan","status","taxNo","expiresAt","vatRate","language"];
    const updates = Object.fromEntries(
      Object.entries(req.body).filter(([k]) => allowed.includes(k))
    );
    const store = await Store.findByIdAndUpdate(req.params["id"], updates, { new: true });
    if (!store) return res.status(404).json({ error: "المتجر غير موجود" });
    return res.json({ ...store.toObject(), id: store._id.toString() });
  } catch (err) {
    return res.status(500).json({ error: "خطأ في تعديل المتجر" });
  }
});

// ── POST /api/stores/:id/reset-password — إعادة تعيين كلمة المرور ────────────
router.post("/:id/reset-password", async (req: Request, res: Response) => {
  try {
    const newRawPass = `Store@${Math.floor(Math.random() * 900000) + 100000}!`;
    const newHash = await bcrypt.hash(newRawPass, 12);

    // تحديث كلمة مرور الـ owner في users collection
    const updated = await User.findOneAndUpdate(
      { storeId: req.params["id"], role: "owner" },
      { password: newHash },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ error: "مستخدم المتجر غير موجود" });
    }

    console.log(`✅ Password reset for store: ${req.params["id"]}`);
    return res.json({ newPassword: newRawPass });
  } catch (err) {
    return res.status(500).json({ error: "خطأ في إعادة تعيين كلمة المرور" });
  }
});

// ── DELETE /api/stores/:id — حذف متجر + مستخدميه ────────────────────────────
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params["id"];
    // حذف جميع مستخدمي المتجر من قاعدة البيانات
    await User.deleteMany({ storeId: id });
    // حذف المتجر
    await Store.findByIdAndDelete(id);
    console.log(`✅ Store deleted: ${id} (and all users)`);
    return res.json({ message: "تم حذف المتجر وجميع مستخدميه" });
  } catch (err) {
    return res.status(500).json({ error: "خطأ في حذف المتجر" });
  }
});

export default router;
