/**
 * Auth Routes — المصادقة الكاملة
 *
 * POST /api/auth/login  — دخول المتجر (يتحقق من users collection)
 * POST /api/auth/admin  — دخول المدير العام
 * GET  /api/auth/me     — بيانات المستخدم الحالي من Database
 */
import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User, Store } from "../models/index";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();
const secret = (): string => process.env["JWT_SECRET"] || "fallback-secret";
const expires = (): string => process.env["JWT_EXPIRES_IN"] || "7d";

// ── POST /api/auth/login — دخول المتجر ───────────────────────────────────────
// يتحقق من users collection في MongoDB — يعمل من أي متصفح/جهاز
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as { email: string; password: string };
    if (!email || !password) {
      return res.status(400).json({ error: "البريد الإلكتروني وكلمة المرور مطلوبان" });
    }

    // 1. ابحث عن المستخدم في قاعدة البيانات
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(401).json({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
    }

    // 2. تحقق من كلمة المرور (bcrypt)
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
    }

    // 3. تحقق من حالة المستخدم
    if (user.status === "suspended") {
      return res.status(403).json({ error: "حسابك موقوف — تواصل مع مدير المتجر" });
    }

    // 4. جلب بيانات المتجر المرتبط
    const store = await Store.findById(user.storeId);
    if (!store) {
      return res.status(401).json({ error: "المتجر غير موجود أو تم حذفه" });
    }

    // 5. تحقق من حالة المتجر
    if (store.status === "suspended") {
      return res.status(403).json({ error: "هذا المتجر موقوف — تواصل مع مزود الخدمة" });
    }
    if (new Date(store.expiresAt) < new Date()) {
      await Store.findByIdAndUpdate(store._id, { status: "expired" });
      return res.status(403).json({ error: "انتهت صلاحية اشتراك المتجر — يجب التجديد" });
    }

    // 6. إنشاء JWT token
    const token = jwt.sign(
      {
        userId:  user._id.toString(),
        storeId: user.storeId.toString(),
        role:    user.role,
        email:   user.email,
      },
      secret(),
      { expiresIn: expires() } as object
    );

    // 7. إرجاع token + بيانات المتجر
    return res.json({
      token,
      user: {
        id:    user._id, name: user.name,
        email: user.email, role: user.role,
      },
      store: {
        id:       store._id,
        nameAr:   store.nameAr,
        nameEn:   store.nameEn,
        category: store.category,
        plan:     store.plan,
        status:   store.status,
        vatRate:  store.vatRate,
        currency: store.currency,
        language: store.language,
        phone:    store.phone,
        city:     store.city,
        expiresAt:store.expiresAt,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "خطأ في الخادم — حاول مرة أخرى" });
  }
});

// ── POST /api/auth/admin — دخول المدير العام ─────────────────────────────────
router.post("/admin", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as { email: string; password: string };
    const adminEmail = process.env["SUPER_ADMIN_EMAIL"] || "superadmin@sowwanjo.online";
    const adminPass  = process.env["SUPER_ADMIN_PASSWORD"];

    // نقبل: الإيميل الكامل أو "superadmin" فقط
    const adminUsername = adminEmail.split("@")[0]; // "superadmin"
    const emailMatch = email === adminEmail || email === adminUsername;
    const passMatch  = password === adminPass;

    if (!email || !password || !emailMatch || !passMatch) {
      return res.status(401).json({ error: "بيانات المدير العام غير صحيحة" });
    }

    const token = jwt.sign(
      { isSuperAdmin: true, email },
      secret(),
      { expiresIn: expires() } as object
    );

    return res.json({ token, role: "superadmin" });
  } catch (err) {
    console.error("Admin login error:", err);
    return res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// ── GET /api/auth/me — بيانات المستخدم الحالي من Database ────────────────────
router.get("/me", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (req.isSuperAdmin) {
      return res.json({ role: "superadmin", name: "المدير العام" });
    }

    if (!req.store) {
      return res.status(401).json({ error: "غير مصرح" });
    }

    // جلب المستخدم من DB
    const user = await User.findOne({ storeId: req.store.id, status: "active" }).select("-password");
    const store = await Store.findById(req.store.id).select("-__v");

    return res.json({
      user: user ? { id: user._id, name: user.name, email: user.email, role: user.role } : null,
      store: store ? {
        id: store._id, nameAr: store.nameAr, nameEn: store.nameEn,
        category: store.category, plan: store.plan, status: store.status,
        vatRate: store.vatRate, currency: store.currency, language: store.language,
        phone: store.phone, city: store.city, expiresAt: store.expiresAt,
      } : null,
    });
  } catch (err) {
    console.error("Me error:", err);
    return res.status(500).json({ error: "خطأ في الخادم" });
  }
});

export default router;
