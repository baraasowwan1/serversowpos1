/**
 * Auth Routes — مسارات المصادقة
 */
import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Store } from "../models/index";

const router = Router();

const JWT_SECRET = (): string => process.env["JWT_SECRET"] || "fallback-secret";
const JWT_EXPIRES = (): string => process.env["JWT_EXPIRES_IN"] || "7d";

// ── دخول المتجر ───────────────────────────────────────────────────────────────
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as { email: string; password: string };
    if (!email || !password) return res.status(400).json({ error: "البريد وكلمة المرور مطلوبان" });

    const store = await Store.findOne({ email: email.toLowerCase() });
    if (!store) return res.status(401).json({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });

    const match = await bcrypt.compare(password, store.password);
    if (!match) return res.status(401).json({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });

    if (store.status === "suspended") return res.status(403).json({ error: "حسابك موقوف — تواصل مع الدعم" });
    if (store.expiresAt && new Date(store.expiresAt) < new Date()) return res.status(403).json({ error: "انتهت صلاحية اشتراكك — جدد للاستمرار" });

    const token = jwt.sign(
      { storeId: store._id, email: store.email },
      JWT_SECRET(),
      { expiresIn: JWT_EXPIRES() } as object
    );

    res.json({
      token,
      store: {
        id: store._id, nameAr: store.nameAr, category: store.category,
        plan: store.plan, status: store.status,
        language: store.language, currency: store.currency, vatRate: store.vatRate,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// ── دخول المدير العام ─────────────────────────────────────────────────────────
router.post("/admin", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as { email: string; password: string };
    const adminEmail = process.env["SUPER_ADMIN_EMAIL"];
    const adminPass = process.env["SUPER_ADMIN_PASSWORD"];

    if (!email || !password || email !== adminEmail || password !== adminPass) {
      return res.status(401).json({ error: "بيانات المدير العام غير صحيحة" });
    }

    const token = jwt.sign(
      { isSuperAdmin: true, email },
      JWT_SECRET(),
      { expiresIn: JWT_EXPIRES() } as object
    );

    res.json({ token, role: "superadmin" });
  } catch (err) {
    console.error("Admin login error:", err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

export default router;
