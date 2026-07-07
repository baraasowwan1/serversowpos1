/**
 * Auth Routes — مسارات المصادقة
 * POST /api/auth/login  — دخول المتجر
 * POST /api/auth/admin  — دخول المدير العام
 */
import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Store } from "../models/index";

const router = Router();
const JWT_SECRET = process.env["JWT_SECRET"] as string;
const JWT_EXPIRES = process.env["JWT_EXPIRES_IN"] || "7d";

// ── دخول المتجر ───────────────────────────────────────────────────────────────
router.post("/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "البريد وكلمة المرور مطلوبان" });

  const store = await Store.findOne({ email: email.toLowerCase() });
  if (!store) return res.status(401).json({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });

  const match = await bcrypt.compare(password, store.password);
  if (!match) return res.status(401).json({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });

  if (store.status === "suspended") return res.status(403).json({ error: "حسابك موقوف — تواصل مع الدعم" });
  if (new Date(store.expiresAt) < new Date()) return res.status(403).json({ error: "انتهت صلاحية اشتراكك — جدد للاستمرار" });

  const token = jwt.sign({ storeId: store._id, email: store.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES } as object);

  res.json({
    token,
    store: { id: store._id, nameAr: store.nameAr, category: store.category, plan: store.plan, status: store.status, language: store.language, currency: store.currency, vatRate: store.vatRate },
  });
});

// ── دخول المدير العام ─────────────────────────────────────────────────────────
router.post("/admin", async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const adminEmail = process.env["SUPER_ADMIN_EMAIL"];
  const adminPass  = process.env["SUPER_ADMIN_PASSWORD"];

  if (email !== adminEmail || password !== adminPass)
    return res.status(401).json({ error: "بيانات المدير العام غير صحيحة" });

  const token = jwt.sign({ isSuperAdmin: true, email }, JWT_SECRET, { expiresIn: JWT_EXPIRES } as object);
  res.json({ token, role: "superadmin" });
});

export default router;
