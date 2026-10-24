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
import { logAudit } from "./audit";

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

    // 1. ابحث عن المستخدم بالبريد أو رقم الهاتف أو اسم المستخدم
    const identifier = email.trim();
    const identifierLower = identifier.toLowerCase();
    const user = await User.findOne({
      $or: [
        { email: identifierLower },
        { phone: identifier },
        { phone: identifier.replace(/\D/g, "") },
        { username: identifier },
        { username: identifierLower },
      ],
    });
    if (!user) {
      return res.status(401).json({ error: "بيانات تسجيل الدخول غير صحيحة" });
    }

    // 2. تحقق من كلمة المرور (bcrypt)
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: "بيانات تسجيل الدخول غير صحيحة" });
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
      return res.status(403).json({ error: "انتهى اشتراك هذا المتجر ولم يتم تجديده بنجاح. يرجى التواصل مع صاحب المتجر أو الإدارة لتجديد الاشتراك." , code: "SUBSCRIPTION_EXPIRED", storeName: store.nameAr || "" });
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

    // 7. Log audit event
    const augReq = req as AuthRequest;
    augReq.store = { id: store._id.toString(), nameAr: store.nameAr, plan: store.plan, status: store.status };
    augReq.userId = user._id.toString();
    logAudit({ req: augReq, action: "تسجيل دخول", category: "login", target: user.email });

    // 8. إرجاع token + بيانات المتجر
    const storeId = store._id.toString();
    return res.json({
      token,
      storeId,
      user: {
        id:    user._id.toString(), name: user.name,
        email: user.email, role: user.role,
      },
      store: {
        id:             storeId,
        nameAr:         store.nameAr,
        nameEn:         store.nameEn,
        category:       store.category,
        plan:           store.plan,
        status:         store.status,
        vatRate:        store.vatRate,
        currency:       store.currency,
        language:       store.language,
        phone:          store.phone,
        city:           store.city,
        expiresAt:      store.expiresAt,
        sidebarFeatures: store.sidebarFeatures || {},
        // White-label branding
        appName:        store.appName || "",
        primaryColor:   store.primaryColor || "",
        logoUrl:        store.logoUrl || "",
        iconUrl:        store.iconUrl || "",
        splashLogoUrl:  store.splashLogoUrl || "",
        receiptLogoUrl: store.receiptLogoUrl || "",
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
    const { username, email, password } = req.body as { username?: string; email?: string; password: string };
    const adminEmail = process.env["SUPER_ADMIN_EMAIL"] || "superadmin@sowwanjo.online";
    const adminPass  = process.env["SUPER_ADMIN_PASSWORD"];

    // نقبل: الإيميل الكامل أو "superadmin" فقط أو username
    const adminUsername = adminEmail.split("@")[0]; // "superadmin"
    const inputCredential = username || email || "";
    const emailMatch = inputCredential === adminEmail || inputCredential === adminUsername;
    const passMatch  = password === adminPass;

    if (!inputCredential || !password || !emailMatch || !passMatch) {
      return res.status(401).json({ error: "بيانات المدير العام غير صحيحة" });
    }

    const token = jwt.sign(
      { isSuperAdmin: true, email: adminEmail },
      secret(),
      { expiresIn: expires() } as object
    );

    const augReq = req as AuthRequest;
    augReq.isSuperAdmin = true;
    logAudit({ req: augReq, action: "تسجيل دخول مدير عام", category: "login", target: adminEmail });

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
        sidebarFeatures: store.sidebarFeatures || {},
        appName: store.appName || "", primaryColor: store.primaryColor || "",
        logoUrl: store.logoUrl || "", iconUrl: store.iconUrl || "",
      } : null,
    });
  } catch (err) {
    console.error("Me error:", err);
    return res.status(500).json({ error: "خطأ في الخادم" });
  }
});

export default router;
