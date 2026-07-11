/**
 * Store Users/Employees Routes — مستخدمو المتجر (الموظفون)
 */
import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import { User } from "../models/index";
import { authMiddleware, AuthRequest, scopeToStore } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

// جميع موظفي المتجر
router.get("/", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const users = await User.find({ storeId: scope.storeId }).select("-password");
  res.json(users.map(u => ({
    id: u._id, name: (u as { name: string }).name,
    email: (u as { email: string }).email,
    role: (u as { role: string }).role,
    status: (u as { status: string }).status,
    phone: (u as { phone?: string }).phone || "",
    branch: "",
    sales: 0,
  })));
});

// إضافة موظف جديد
router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const scope = scopeToStore(req);
    const { name, email, phone, role, password } = req.body;
    if (!name || !email) return res.status(400).json({ error: "الاسم والبريد مطلوبان" });

    // Validate role against schema enum to give a clear error instead of crashing
    const validRoles = ["owner", "manager", "cashier", "inventory", "accountant"];
    const safeRole = validRoles.includes(role) ? role : "cashier";

    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(409).json({ error: "هذا البريد مستخدم بالفعل" });

    const rawPass = password || `Emp@${Math.floor(Math.random() * 90000) + 10000}!`;
    const hashed = await bcrypt.hash(rawPass, 10);

    const user = await User.create({
      storeId: scope.storeId,
      name, email: email.toLowerCase(), phone: phone || "",
      password: hashed,
      role: safeRole, status: "active",
    });

    return res.status(201).json({
      id: user._id, name: (user as { name: string }).name,
      email: (user as { email: string }).email,
      role: (user as { role: string }).role,
      generatedPassword: rawPass,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "خطأ في إضافة الموظف";
    return res.status(500).json({ error: msg });
  }
});

// تعديل موظف
router.put("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const scope = scopeToStore(req);
    const { name, phone, role, status } = req.body;
    const validRoles = ["owner", "manager", "cashier", "inventory", "accountant"];
    const validStatuses = ["active", "suspended"];
    const update: Record<string, unknown> = { name, phone };
    if (role) update["role"] = validRoles.includes(role) ? role : "cashier";
    if (status) update["status"] = validStatuses.includes(status) ? status : "active";
    const user = await User.findOneAndUpdate(
      { _id: req.params["id"], storeId: scope.storeId },
      update,
      { new: true }
    ).select("-password");
    if (!user) return res.status(404).json({ error: "المستخدم غير موجود" });
    return res.json(user);
  } catch (err: unknown) {
    return res.status(500).json({ error: (err as Error).message || "خطأ في تعديل الموظف" });
  }
});

// حذف موظف
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const scope = scopeToStore(req);
    await User.findOneAndDelete({ _id: req.params["id"], storeId: scope.storeId });
    return res.json({ ok: true });
  } catch (err: unknown) {
    return res.status(500).json({ error: (err as Error).message || "خطأ في حذف الموظف" });
  }
});

export default router;
