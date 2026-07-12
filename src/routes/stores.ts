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
import mongoose from "mongoose";
import { Store, User } from "../models/index";
import { authMiddleware, superAdminOnly, AuthRequest } from "../middleware/auth";
import { logAudit } from "./audit";
import { initializeStoreFromCatalog } from "./master-catalog";

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
    logAudit({ req: req as AuthRequest, action: "إنشاء متجر", category: "store", target: store.nameAr, newValues: { plan, city } });

    // Auto-initialize supermarket stores from Master Catalog
    let catalogProductsAdded = 0;
    if ((category || "").toLowerCase() === "supermarket") {
      try {
        catalogProductsAdded = await initializeStoreFromCatalog(store._id as mongoose.Types.ObjectId);
        console.log(`✅ Catalog initialized: ${catalogProductsAdded} products added to store ${store._id}`);
      } catch (catalogErr) {
        console.error("⚠️  Catalog init failed (non-fatal):", catalogErr);
      }
    }

    return res.status(201).json({
      store: { ...store.toObject(), id: store._id.toString() },
      user:  { id: user._id, name: user.name, email: user.email, role: user.role },
      generatedPassword: rawPassword,  // يُعرض مرة واحدة فقط للمدير العام
      loginUrl: "https://pos.sowwanjo.online",
      catalogProductsAdded,
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
    const { newPassword } = req.body as { newPassword?: string };
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
    }
    const newHash = await bcrypt.hash(newPassword, 12);

    const updated = await User.findOneAndUpdate(
      { storeId: req.params["id"], role: "owner" },
      { password: newHash },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ error: "مستخدم المتجر غير موجود" });
    }

    console.log(`✅ Password reset for store: ${req.params["id"]}`);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "خطأ في إعادة تعيين كلمة المرور" });
  }
});

// ── GET /api/stores/:id/users — SA يجلب موظفي متجر محدد ──────────────────────
router.get("/:id/users", async (req: Request, res: Response) => {
  try {
    const users = await User.find({ storeId: req.params["id"] }).select("-password");
    res.json(users.map(u => ({
      id: u._id,
      name: (u as { name: string }).name,
      email: (u as { email: string }).email,
      role: (u as { role: string }).role,
      phone: (u as { phone?: string }).phone || "",
    })));
  } catch {
    res.status(500).json({ error: "خطأ في جلب الموظفين" });
  }
});

// ── POST /api/stores/:id/users/:uid/reset-password — SA يغير كلمة مرور موظف ──
router.post("/:id/users/:uid/reset-password", async (req: Request, res: Response) => {
  try {
    const { newPassword } = req.body as { newPassword?: string };
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
    }
    const newHash = await bcrypt.hash(newPassword, 12);
    const updated = await User.findOneAndUpdate(
      { _id: req.params["uid"], storeId: req.params["id"] },
      { password: newHash },
      { new: true }
    ).select("-password");
    if (!updated) return res.status(404).json({ error: "الموظف غير موجود" });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "خطأ في تغيير كلمة المرور" });
  }
});

// ── PATCH /api/stores/:id/assign-plan — تعيين أو تجديد خطة اشتراك ────────────
router.patch("/:id/assign-plan", async (req: Request, res: Response) => {
  try {
    const id = req.params["id"];
    const { plan, months } = req.body;
    const store = await Store.findById(id);
    if (!store) return res.status(404).json({ error: "المتجر غير موجود" });

    if (plan) store.plan = plan;
    const base = store.expiresAt && new Date(store.expiresAt) > new Date() ? new Date(store.expiresAt) : new Date();
    const m = parseInt(months) || 1;
    base.setMonth(base.getMonth() + m);
    store.expiresAt = base;
    store.status = "active";
    await store.save();
    return res.json({ ok: true, store: { ...store.toObject(), id: store._id.toString() } });
  } catch (err) {
    return res.status(500).json({ error: "خطأ في تعيين الخطة" });
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
