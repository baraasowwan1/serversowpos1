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

// ── GET /api/stores/all-users — SA يجلب جميع مستخدمي كل المتاجر ─────────────
router.get("/all-users", async (req: Request, res: Response) => {
  try {
    const { q, storeId, role, page: pageQ, limit: limitQ } = req.query as { q?: string; storeId?: string; role?: string; page?: string; limit?: string };
    const filter: Record<string, unknown> = {};
    if (storeId) filter["storeId"] = storeId;
    if (role)    filter["role"]    = role;
    if (q)       filter["$or"] = [
      { name:  { $regex: q, $options: "i" } },
      { email: { $regex: q, $options: "i" } },
      { phone: { $regex: q, $options: "i" } },
    ];

    const page  = Math.max(1, parseInt(pageQ  || "1"));
    const limit = Math.min(100, parseInt(limitQ || "50"));
    const skip  = (page - 1) * limit;
    const total = await User.countDocuments(filter);
    const users = await User.find(filter).select("-password").sort({ createdAt: -1 }).skip(skip).limit(limit).lean();

    // Attach store name to each user
    const storeIds = [...new Set(users.map(u => String(u.storeId)))];
    const stores   = await Store.find({ _id: { $in: storeIds } }).select("nameAr _id").lean();
    const storeMap = Object.fromEntries(stores.map(s => [String(s._id), (s as { nameAr: string }).nameAr]));

    const result = users.map(u => ({
      id:        String(u._id),
      name:      (u as { name: string }).name,
      email:     (u as { email: string }).email,
      role:      (u as { role: string }).role,
      phone:     (u as { phone?: string }).phone || "",
      storeId:   String(u.storeId),
      storeName: storeMap[String(u.storeId)] || "—",
      status:    (u as { status?: string }).status || "active",
      createdAt: (u as { createdAt?: Date }).createdAt?.toISOString().split("T")[0] || "",
    }));

    return res.json({ users: result, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error("all-users error:", err);
    return res.status(500).json({ error: "خطأ في جلب المستخدمين" });
  }
});

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
    const allowed = ["nameAr","nameEn","owner","phone","city","plan","status","taxNo","expiresAt","vatRate","language","sidebarFeatures"];
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

    const rawId = req.params["id"];
    let storeObjId: mongoose.Types.ObjectId | null = null;
    try { storeObjId = new mongoose.Types.ObjectId(rawId); } catch { /* invalid id format */ }

    const query = storeObjId
      ? { $or: [{ storeId: storeObjId }, { storeId: rawId }], role: "owner" }
      : { storeId: rawId, role: "owner" };

    const updated = await User.findOneAndUpdate(query, { password: newHash }, { new: true });

    if (!updated) {
      // Debug: check if any user exists for this store (not just owner)
      const anyUser = await User.findOne(storeObjId ? { $or: [{ storeId: storeObjId }, { storeId: rawId }] } : { storeId: rawId });
      console.error(`[reset-password] storeId=${rawId} — anyUser found? ${anyUser ? `yes (role=${(anyUser as { role: string }).role})` : "no"}`);
      return res.status(404).json({ error: "مستخدم المتجر غير موجود — تأكد من أن المتجر يملك مستخدم بدور owner" });
    }

    console.log(`✅ Password reset for store: ${rawId} (user: ${updated.email})`);
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

// ── POST /api/stores/:id/users — SA يضيف مستخدم جديد للمتجر ──────────────────
router.post("/:id/users", async (req: Request, res: Response) => {
  try {
    const storeId = req.params["id"];
    const store = await Store.findById(storeId);
    if (!store) return res.status(404).json({ error: "المتجر غير موجود" });

    const { name, email, password, role, phone } = req.body as { name?: string; email?: string; password?: string; role?: string; phone?: string };
    if (!name || !email || !password) return res.status(400).json({ error: "الاسم والبريد وكلمة المرور مطلوبة" });
    if (password.length < 6) return res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });

    const normalEmail = email.toLowerCase().trim();
    const exists = await User.findOne({ email: normalEmail });
    if (exists) return res.status(409).json({ error: "هذا البريد الإلكتروني مستخدم بالفعل" });

    const hashed = await bcrypt.hash(password, 12);
    const user = await User.create({
      storeId, name, email: normalEmail,
      username: normalEmail.split("@")[0],
      password: hashed,
      role: role || "cashier",
      phone: phone || "",
      status: "active",
    });
    console.log(`✅ SA added user: ${normalEmail} (role=${role}) to store ${storeId}`);
    return res.status(201).json({ id: user._id, name: (user as { name: string }).name, email: normalEmail, role: role || "cashier", phone: phone || "" });
  } catch (err) {
    return res.status(500).json({ error: "خطأ في إضافة المستخدم" });
  }
});

// ── PUT /api/stores/:id/users/:uid — SA يعدّل بيانات مستخدم ──────────────────
router.put("/:id/users/:uid", async (req: Request, res: Response) => {
  try {
    const { name, email, role, phone } = req.body as { name?: string; email?: string; role?: string; phone?: string };
    const updates: Record<string, unknown> = {};
    if (name)  updates["name"]  = name;
    if (email) updates["email"] = email.toLowerCase().trim();
    if (role)  updates["role"]  = role;
    if (phone !== undefined) updates["phone"] = phone;

    const updated = await User.findOneAndUpdate(
      { _id: req.params["uid"], storeId: req.params["id"] },
      updates, { new: true }
    ).select("-password");
    if (!updated) return res.status(404).json({ error: "المستخدم غير موجود" });
    return res.json({ id: updated._id, name: (updated as { name: string }).name, email: (updated as { email: string }).email, role: (updated as { role: string }).role, phone: (updated as { phone?: string }).phone || "" });
  } catch (err) {
    return res.status(500).json({ error: "خطأ في تعديل المستخدم" });
  }
});

// ── DELETE /api/stores/:id/users/:uid — SA يحذف مستخدم من المتجر ─────────────
router.delete("/:id/users/:uid", async (req: Request, res: Response) => {
  try {
    const deleted = await User.findOneAndDelete({ _id: req.params["uid"], storeId: req.params["id"] });
    if (!deleted) return res.status(404).json({ error: "المستخدم غير موجود" });
    console.log(`✅ SA deleted user ${req.params["uid"]} from store ${req.params["id"]}`);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "خطأ في حذف المستخدم" });
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
